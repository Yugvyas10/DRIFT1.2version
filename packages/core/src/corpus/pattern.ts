/**
 * Strings that match a schema's `pattern`, built from the regular expression itself instead of guessed. Without
 * this, a request whose body has a commit hash (`^[0-9a-f]{40}$`) or an id (`^run_[0-9a-z]{20,32}$`) could not
 * be generated at all, and no change in that request could ever be proven (found by the M4 dogfood contract).
 *
 * Deterministic: the first branch of an alternation, a fixed character from each class, and quantifiers at their
 * minimum, then grown left to right until `minLength` is reached. The supported subset is what API patterns use
 * in practice: literals, escapes, character classes, `.`, groups (capturing, non-capturing, named), alternation,
 * quantifiers and anchors, with ECMAScript semantics without the `u` flag (as Ajv is configured). Lookarounds and
 * back-references give up (undefined). The caller still tests the result against the pattern and the bounds.
 */

type Ranges = [number, number][];
type Node =
  | { kind: "seq"; items: Node[] }
  | { kind: "alt"; options: Node[] }
  | { kind: "text"; value: string }
  | { kind: "class"; ranges: Ranges; negated: boolean }
  | { kind: "repeat"; node: Node; min: number; max: number };

class Unsupported extends Error {}

/** Longest string this builds; anything longer is left to the other candidates. */
const MAX_LENGTH = 4096;
const DIGIT: Ranges = [[48, 57]];
const WORD: Ranges = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122],
];
const SPACE: Ranges = [
  [9, 13],
  [32, 32],
  [160, 160],
  [0xfeff, 0xfeff],
];
/** Characters tried first, so results look like ordinary identifiers. */
const PREFERRED = "a0A_-x.1 ";

function complement(ranges: Ranges): Ranges {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Ranges = [];
  let next = 0;
  for (const [low, high] of sorted) {
    if (low > next) out.push([next, low - 1]);
    next = Math.max(next, high + 1);
  }
  if (next <= 0xffff) out.push([next, 0xffff]);
  return out;
}

const inRanges = (ranges: Ranges, code: number) => ranges.some(([low, high]) => code >= low && code <= high);

function pickFrom(ranges: Ranges, negated: boolean): string {
  const effective = negated ? complement(ranges) : ranges;
  for (const char of PREFERRED) if (inRanges(effective, char.charCodeAt(0))) return char;
  // Printable ASCII next, then whatever the class starts with.
  for (let code = 33; code < 127; code++) if (inRanges(effective, code)) return String.fromCharCode(code);
  const first = effective[0];
  if (!first) throw new Unsupported("a class that matches nothing");
  return String.fromCharCode(first[0]);
}

class Parser {
  #index = 0;
  readonly #source: string;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): Node {
    const node = this.#alternation();
    if (this.#index < this.#source.length) throw new Unsupported(`unexpected ${this.#source[this.#index] ?? ""}`);
    return node;
  }

  #peek(offset = 0): string | undefined {
    return this.#source[this.#index + offset];
  }

  #alternation(): Node {
    const options = [this.#sequence()];
    while (this.#peek() === "|") {
      this.#index++;
      options.push(this.#sequence());
    }
    const [only] = options;
    return options.length === 1 && only ? only : { kind: "alt", options };
  }

  #sequence(): Node {
    const items: Node[] = [];
    for (let char = this.#peek(); char !== undefined && char !== "|" && char !== ")"; char = this.#peek()) {
      const atom = this.#atom();
      items.push(this.#quantified(atom));
    }
    return { kind: "seq", items };
  }

  #atom(): Node {
    const char = this.#peek() ?? "";
    this.#index++;
    switch (char) {
      case "^":
      case "$":
        return { kind: "text", value: "" };
      case ".":
        return { kind: "text", value: "a" };
      case "(": {
        if (this.#peek() === "?") {
          const next = this.#peek(1);
          if (next === ":") this.#index += 2;
          else if (next === "<" && this.#peek(2) !== "=" && this.#peek(2) !== "!") {
            const end = this.#source.indexOf(">", this.#index);
            if (end === -1) throw new Unsupported("unterminated group name");
            this.#index = end + 1;
          } else throw new Unsupported("lookaround");
        }
        const inner = this.#alternation();
        if (this.#peek() !== ")") throw new Unsupported("unterminated group");
        this.#index++;
        return inner;
      }
      case "[":
        return this.#class();
      case "\\":
        return this.#escape();
      default:
        return { kind: "text", value: char };
    }
  }

  #escape(): Node {
    const char = this.#peek();
    if (char === undefined) throw new Unsupported("trailing backslash");
    this.#index++;
    const set = this.#set(char);
    if (set) return set;
    if (char === "b" || char === "B") return { kind: "text", value: "" }; // an assertion; the result is checked
    if (/[1-9]/.test(char) || char === "k") throw new Unsupported("back-reference");
    return { kind: "text", value: this.#control(char) };
  }

  /** `\d`, `\w`, `\s` and their negations. */
  #set(char: string): Node | undefined {
    const ranges =
      char.toLowerCase() === "d"
        ? DIGIT
        : char.toLowerCase() === "w"
          ? WORD
          : char.toLowerCase() === "s"
            ? SPACE
            : undefined;
    if (!ranges) return undefined;
    return { kind: "class", ranges, negated: char === char.toUpperCase() };
  }

  /** The character an escape stands for (outside the sets). */
  #control(char: string): string {
    const simple: Record<string, string> = { n: "\n", r: "\r", t: "\t", v: "\v", f: "\f", "0": "\0" };
    if (char in simple) return simple[char] ?? char;
    const hex = (length: number) => {
      const digits = this.#source.slice(this.#index, this.#index + length);
      if (!new RegExp(`^[0-9a-fA-F]{${String(length)}}$`).test(digits)) return char; // an identity escape
      this.#index += length;
      return String.fromCharCode(parseInt(digits, 16));
    };
    if (char === "x") return hex(2);
    if (char === "u") return hex(4);
    if (char === "c") throw new Unsupported("control escape");
    return char;
  }

  #class(): Node {
    const negated = this.#peek() === "^";
    if (negated) this.#index++;
    const ranges: Ranges = [];
    let first = true;
    for (;;) {
      const char = this.#peek();
      if (char === undefined) throw new Unsupported("unterminated class");
      if (char === "]" && !first) break;
      if (char === "]") throw new Unsupported("empty class");
      first = false;
      const low = this.#classAtom();
      if (typeof low !== "number") {
        ranges.push(...low);
        continue;
      }
      if (this.#peek() === "-" && this.#peek(1) !== "]" && this.#peek(1) !== undefined) {
        this.#index++;
        const high = this.#classAtom();
        if (typeof high !== "number" || high < low) throw new Unsupported("class range");
        ranges.push([low, high]);
      } else {
        ranges.push([low, low]);
      }
    }
    this.#index++;
    return { kind: "class", ranges, negated };
  }

  /** One character code, or a set's ranges for `\d`, `\w`, `\s` and their negations. */
  #classAtom(): number | Ranges {
    const char = this.#peek() ?? "";
    this.#index++;
    if (char !== "\\") return char.charCodeAt(0);
    const escaped = this.#peek();
    if (escaped === undefined) throw new Unsupported("trailing backslash");
    this.#index++;
    const set = this.#set(escaped);
    if (set?.kind === "class") return set.negated ? complement(set.ranges) : set.ranges;
    if (escaped === "b") return 8; // backspace inside a class
    return this.#control(escaped).charCodeAt(0);
  }

  #quantified(atom: Node): Node {
    const char = this.#peek();
    let min: number;
    let max: number;
    if (char === "*" || char === "+" || char === "?") {
      this.#index++;
      [min, max] = char === "*" ? [0, Infinity] : char === "+" ? [1, Infinity] : [0, 1];
    } else if (char === "{") {
      const match = /^\{(\d+)(,(\d*))?\}/.exec(this.#source.slice(this.#index));
      if (!match) return atom; // without the u flag, a "{" that is not a quantifier is a literal
      this.#index += match[0].length;
      min = Number(match[1]);
      max = match[2] === undefined ? min : match[3] === "" ? Infinity : Number(match[3]);
    } else {
      return atom;
    }
    if (this.#peek() === "?") this.#index++; // lazy: the same strings match
    return { kind: "repeat", node: atom, min, max };
  }
}

function generate(node: Node, budget: { extra: number }): string {
  switch (node.kind) {
    case "text":
      return node.value;
    case "class":
      return pickFrom(node.ranges, node.negated);
    case "seq":
      return node.items.map((item) => generate(item, budget)).join("");
    case "alt":
      return node.options[0] ? generate(node.options[0], budget) : "";
    case "repeat": {
      if (node.min > MAX_LENGTH) throw new Unsupported("too long");
      const once = generate(node.node, { extra: 0 });
      let count = node.min;
      while (budget.extra > 0 && count < node.max && once.length > 0 && count < MAX_LENGTH) {
        count++;
        budget.extra -= once.length;
      }
      return once.repeat(count);
    }
  }
}

/** A string matching `pattern` (as `new RegExp(pattern)` would), at least `minLength` long when it can; or undefined. */
export function stringMatching(pattern: string, minLength = 0): string | undefined {
  let tree: Node;
  try {
    tree = new Parser(pattern).parse();
    const shortest = generate(tree, { extra: 0 });
    if (shortest.length >= minLength) return shortest;
    return generate(tree, { extra: minLength - shortest.length });
  } catch (error) {
    if (error instanceof Unsupported) return undefined;
    throw error;
  }
}
