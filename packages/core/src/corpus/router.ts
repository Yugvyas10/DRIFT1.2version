import type { SpecIR } from "../ingest/ir.ts";

interface Node {
  literal: Map<string, Node>;
  /** Segments that mix text and parameters, such as `{id}.json`. */
  mixed: { pattern: RegExp; node: Node }[];
  param?: Node;
  /** Method (upper case) → operation key. */
  operations: Map<string, string>;
}

const newNode = (): Node => ({ literal: new Map(), mixed: [], operations: new Map() });

export interface RouteMatch {
  operation: string;
  /** Decoded path parameter values by position. */
  pathParams: string[];
}

/**
 * Matches recorded requests to operations (PLAN §4.4 "Routing"). Server base paths are stripped first; then the
 * path is matched segment by segment against a trie of path templates, preferring literal segments over
 * parameters, as OpenAPI requires (`/users/me` wins over `/users/{id}`).
 */
export class Router {
  readonly #root = newNode();
  readonly #basePaths: string[];

  constructor(spec: SpecIR) {
    // Longest first, so `/api/v2` is tried before `/api`.
    this.#basePaths = [...spec.basePaths].sort((a, b) => b.length - a.length);
    for (const operation of Object.values(spec.operations)) {
      let node = this.#root;
      for (const segment of segmentsOf(operation.template)) {
        if (segment === "{}") {
          node.param ??= newNode();
          node = node.param;
        } else if (segment.includes("{}")) {
          const source = `^${segment.split("{}").map(escapeRegExp).join("(.+?)")}$`;
          let entry = node.mixed.find((candidate) => candidate.pattern.source === source);
          if (!entry) {
            entry = { pattern: new RegExp(source, "s"), node: newNode() };
            node.mixed.push(entry);
          }
          node = entry.node;
        } else {
          let next = node.literal.get(segment);
          if (!next) {
            next = newNode();
            node.literal.set(segment, next);
          }
          node = next;
        }
      }
      node.operations.set(operation.method.toUpperCase(), operation.key);
    }
  }

  match(method: string, path: string): RouteMatch | undefined {
    for (const base of this.#basePaths) {
      if (base !== "" && path !== base && !path.startsWith(`${base}/`)) continue;
      const rest = path.slice(base.length) || "/";
      const found = walk(this.#root, segmentsOf(rest).map(decode), 0, method.toUpperCase(), []);
      if (found) return found;
    }
    return undefined;
  }
}

function walk(node: Node, segments: string[], index: number, method: string, params: string[]): RouteMatch | undefined {
  if (index === segments.length) {
    const operation = node.operations.get(method);
    return operation === undefined ? undefined : { operation, pathParams: params };
  }
  const segment = segments[index] ?? "";
  const literal = node.literal.get(segment);
  const viaLiteral = literal && walk(literal, segments, index + 1, method, params);
  if (viaLiteral) return viaLiteral;
  for (const { pattern, node: next } of node.mixed) {
    const match = pattern.exec(segment);
    if (!match) continue;
    const found = walk(next, segments, index + 1, method, [...params, ...match.slice(1)]);
    if (found) return found;
  }
  if (node.param && segment !== "") return walk(node.param, segments, index + 1, method, [...params, segment]);
  return undefined;
}

/** `/a/b/` → `["a", "b"]`; `/` → `[]`. */
function segmentsOf(path: string): string[] {
  const trimmed = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? [] : trimmed.split("/");
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
