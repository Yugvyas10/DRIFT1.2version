import { ingestSpec } from "@drift/core";
import type { Db } from "@drift/db";
import type { ObjectStore } from "@drift/platform";
import { Report } from "@drift/report-schema";
import { can, type Actor } from "../auth/actor";
import { forbidden } from "../http";
import { ownRun } from "./runs";

/** Largest stored report the pages read (a Stripe-sized comparison is a few MiB). */
export const MAX_REPORT_BYTES = 64 * 1024 * 1024;
/** Largest contract the diff view shows (the platform accepts 20 MiB; showing more is not useful in a page). */
export const MAX_DIFF_SPEC_BYTES = 5 * 1024 * 1024;

export interface ArtifactView {
  kind: string;
  size: number;
  contentType: string;
  sha256: string;
}

/**
 * The run's `drift-report/v1` report from storage, validated against its schema; undefined while the run has none
 * (queued, running, failed) or when it is too large to show.
 */
export async function loadReport(db: Db, store: ObjectStore, actor: Actor, runId: string): Promise<Report | undefined> {
  if (!can(actor, "runs:read")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  const artifact = await db.artifact.findFirst({
    where: { runId: run.id, orgId: actor.orgId, kind: "report-json", verifiedAt: { not: null } },
  });
  if (!artifact) return undefined;
  const text = await store.getText(artifact.storageKey, MAX_REPORT_BYTES);
  if (text === undefined) return undefined;
  // Stored by the worker or checked on upload; parsed again because the page trusts nothing it reads back.
  const parsed = Report.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
}

/** The run's stored files (inputs and report renderings), verified ones only. */
export async function listArtifacts(db: Db, actor: Actor, runId: string): Promise<ArtifactView[]> {
  if (!can(actor, "runs:read")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  const rows = await db.artifact.findMany({
    where: { runId: run.id, orgId: actor.orgId, verifiedAt: { not: null } },
    orderBy: { kind: "asc" },
  });
  return rows.map((row) => ({ kind: row.kind, size: row.size, contentType: row.contentType, sha256: row.sha256 }));
}

export type ContractText =
  { available: true; base: string; head: string } | { available: false; reason: "uploaded" | "missing" | "too-large" };

/**
 * The two contracts of a server-side run, for the diff view. An uploaded run has no stored contracts: the CLI
 * sends only the report.
 */
export async function loadContracts(db: Db, store: ObjectStore, actor: Actor, runId: string): Promise<ContractText> {
  if (!can(actor, "runs:read")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  if (run.mode !== "SERVER") return { available: false, reason: "uploaded" };
  const inputs = await db.artifact.findMany({
    where: { runId: run.id, orgId: actor.orgId, kind: { in: ["input-base", "input-head"] }, verifiedAt: { not: null } },
  });
  const base = inputs.find((input) => input.kind === "input-base");
  const head = inputs.find((input) => input.kind === "input-head");
  if (!base || !head) return { available: false, reason: "missing" };
  if (base.size > MAX_DIFF_SPEC_BYTES || head.size > MAX_DIFF_SPEC_BYTES)
    return { available: false, reason: "too-large" };
  const [baseText, headText] = await Promise.all([
    store.getText(base.storageKey, MAX_DIFF_SPEC_BYTES),
    store.getText(head.storageKey, MAX_DIFF_SPEC_BYTES),
  ]);
  if (baseText === undefined || headText === undefined) return { available: false, reason: "missing" };
  return { available: true, base: baseText, head: headText };
}

/** Where each change is in the old and the new contract (1-based lines; absent when it is not on that side). */
export type ChangeLines = Map<string, { base?: number; head?: number }>;

/** Ingests one contract from memory with the engine, for its `locate`; undefined when it does not ingest. */
async function ingested(name: string, text: string) {
  const path = `/contract/${name}`;
  const missing = () => Promise.reject(new Error("the diff view reads single-file contracts"));
  const result = await ingestSpec(path, {
    reader: {
      size: (file) => (file === path ? Promise.resolve(Buffer.byteLength(text)) : missing()),
      readText: (file) => (file === path ? Promise.resolve(text) : missing()),
      realpath: (file) => Promise.resolve(file),
    },
    displayPath: () => name,
  });
  return result.spec;
}

/**
 * Locates every change of the report in both contracts with the engine's own position index (the report has the
 * position on the change's side only), so the diff view can show the old and the new text side by side.
 */
export async function locateChanges(report: Report, contracts: { base: string; head: string }): Promise<ChangeLines> {
  const [base, head] = await Promise.all([
    ingested(report.base.file, contracts.base),
    ingested(report.head.file, contracts.head),
  ]);
  return new Map(
    report.changes.map((change) => {
      const before = base?.locate(change.location)?.line;
      const after = head?.locate(change.location)?.line;
      return [
        change.id,
        { ...(before === undefined ? {} : { base: before }), ...(after === undefined ? {} : { head: after }) },
      ];
    })
  );
}
