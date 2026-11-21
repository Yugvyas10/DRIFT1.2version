import { isAlias, isMap, isPair, isScalar, isSeq, LineCounter, parseDocument, type Node as YamlNode } from "yaml";

export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Finds the line and column of a value in a source file, given its reference tokens.
 * The YAML syntax tree is built lazily, on the first lookup, and only then: positions are needed for
 * diagnostics and reports, which are rare compared with ingesting valid specs (ADR-0003).
 */
export class PositionIndex {
  readonly #text: string;
  #tree: { contents: YamlNode | null; lines: LineCounter } | undefined;

  constructor(text: string) {
    this.#text = text;
  }

  locate(tokens: readonly string[]): SourcePosition | undefined {
    const tree = this.#load();
    let node: unknown = tree.contents;
    let offset = rangeStart(node);
    for (const token of tokens) {
      if (isMap(node)) {
        const pair = node.items.find((item) => isPair(item) && isScalar(item.key) && String(item.key.value) === token);
        if (!pair) break;
        offset = rangeStart(pair.key) ?? offset;
        node = pair.value;
        offset = rangeStart(node) ?? offset;
      } else if (isSeq(node)) {
        const item: unknown = node.items[Number(token)];
        if (item === undefined || !/^(0|[1-9][0-9]*)$/.test(token)) break;
        node = item;
        offset = rangeStart(node) ?? offset;
      } else {
        break;
      }
      if (isAlias(node)) break;
    }
    if (offset === undefined) return undefined;
    const { line, col } = tree.lines.linePos(offset);
    return { line, column: col };
  }

  #load() {
    if (!this.#tree) {
      const lines = new LineCounter();
      // Lenient parse: this only locates values in text that was already parsed successfully.
      const doc = parseDocument(this.#text, { lineCounter: lines, uniqueKeys: false });
      this.#tree = { contents: doc.contents, lines };
    }
    return this.#tree;
  }
}

function rangeStart(node: unknown): number | undefined {
  if (node && typeof node === "object" && "range" in node) {
    const range = (node as { range?: [number, number, number] | null }).range;
    return range ? range[0] : undefined;
  }
  return undefined;
}
