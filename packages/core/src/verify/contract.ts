import type { TrafficRecord } from "@drift/report-schema";
import { Router } from "../corpus/router.ts";
import { isJsonMediaType, mediaTypeOf } from "../corpus/sample.ts";
import { toSample } from "../corpus/traffic.ts";
import type { SpecIR } from "../ingest/ir.ts";
import { Checker, matchMedia, responseKey } from "./verify.ts";

/** One HTTP exchange to check, in the shape of a traffic record (docs/traffic-format.md). */
export type ContractExchange = TrafficRecord;

export interface ContractProblem {
  /** Which side of the exchange does not follow the contract. */
  side: "request" | "response";
  /** Where: a JSON pointer such as `/body/commit`, `/query/limit` or `/response/body/runs/0/id`. */
  pointer: string;
  message: string;
}

/**
 * Checks real requests and responses against a contract, with the validators the engine uses for evidence.
 * It is how a server's contract tests ask "does my handler do what the OpenAPI file says?" (DRIFT's own API
 * tests use it against apps/web/openapi/drift-api.yaml).
 *
 * A problem is reported for: a request no operation matches; a parameter or request body the contract rejects;
 * a response status or media type the operation does not document; a response body its schema rejects.
 */
export class ContractChecker {
  readonly #spec: SpecIR;
  readonly #router: Router;
  readonly #checker: Checker;

  constructor(spec: SpecIR) {
    this.#spec = spec;
    this.#router = new Router(spec);
    this.#checker = new Checker(spec);
  }

  check(exchange: ContractExchange): ContractProblem[] {
    const sample = toSample(1, exchange);
    const match = this.#router.match(sample.method, sample.path);
    const operation = match === undefined ? undefined : this.#spec.operations[match.operation];
    if (!match || !operation) {
      return [{ side: "request", pointer: "/path", message: `${sample.method} ${sample.path} is not in the contract` }];
    }
    const routed = { ...sample, operation: match.operation, pathParams: match.pathParams };
    const problems: ContractProblem[] = this.#checker
      .request(routed, operation)
      .failures.map(({ pointer, message }) => ({ side: "request" as const, pointer, message }));

    const response = sample.response;
    if (!response) return problems;
    const status = responseKey(response.status, operation.responses);
    if (status === undefined) {
      problems.push({
        side: "response",
        pointer: "/response/status",
        message: `status ${String(response.status)} is not documented for ${operation.key}`,
      });
      return problems;
    }
    const content = operation.responses[status]?.content ?? {};
    const documented = Object.keys(content);
    if (!response.body) {
      if (documented.length > 0) {
        problems.push({
          side: "response",
          pointer: "/response/body",
          message: `status ${status} documents a body, but none was sent`,
        });
      }
      return problems;
    }
    const contentType = mediaTypeOf(response.body.contentType) ?? response.body.contentType;
    const mediaType = matchMedia(contentType, documented);
    if (mediaType === undefined) {
      problems.push({
        side: "response",
        pointer: "/response/headers/content-type",
        message: `media type ${contentType} is not documented for status ${status}`,
      });
      return problems;
    }
    if (isJsonMediaType(contentType)) {
      for (const failure of this.#checker.response(
        operation,
        status,
        mediaType,
        response.body.value,
        "/response/body"
      )) {
        problems.push({ side: "response", pointer: failure.pointer, message: failure.message });
      }
    }
    return problems;
  }
}
