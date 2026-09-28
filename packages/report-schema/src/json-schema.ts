import { z } from "zod";
import { Report } from "./report.ts";
import { TrafficRecord } from "./traffic.ts";

/**
 * The published JSON Schemas, generated from the zod types so they can never drift apart.
 * They are committed under `schemas/`; a test fails when the committed files differ from this output.
 */
export function jsonSchemas(): Record<string, unknown> {
  return {
    "drift-report-v1.schema.json": z.toJSONSchema(Report, { target: "draft-2020-12", io: "output" }),
    "drift-traffic-v1.schema.json": z.toJSONSchema(TrafficRecord, { target: "draft-2020-12", io: "input" }),
  };
}
