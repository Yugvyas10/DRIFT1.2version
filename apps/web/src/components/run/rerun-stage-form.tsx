import { rerunStageAction } from "@/app/actions";
import type { RerunStage } from "@/lib/canvas";
import { ActionForm } from "../action-form";
import { ui } from "../ui";
import type { InspectorContext } from "./inspectors";

const INTRO: Record<RerunStage, string> = {
  corpus:
    "A new corpus re-runs Corpus, Verify and Classify; Ingest and Diff come from the cache. The file is redacted before use.",
  verify: "A new seed changes which samples are kept and generated, so Corpus, Verify and Classify run again.",
  classify: "A new policy, ruleset or fail-on re-runs only Classify; every stage before it comes from the cache.",
  report: "The same inputs again: every stage comes from the cache.",
};

/**
 * "Re-run from this stage" (PLAN M7): a child run with the same contracts and what this stage depends on changed.
 * Shown for a finished server-side run to members who may start runs.
 */
export function RerunStageForm({ context, stage }: { context: InspectorContext; stage: RerunStage }) {
  const { run } = context;
  if (run.mode !== "server") {
    return stage === "report" ? (
      <p className="text-sm text-muted-foreground">
        An uploaded run has no stored inputs, so it cannot be re-run here: compare again with{" "}
        <code className="font-mono">drift compare</code>, or run on the platform with{" "}
        <code className="font-mono">drift run</code>.
      </p>
    ) : null;
  }
  if (!context.canRerun || (run.status !== "complete" && run.status !== "failed")) return null;
  const id = (name: string) => `rerun-${stage}-${name}`;
  return (
    <section aria-labelledby={id("title")} className="space-y-3 border-t border-border/60 pt-4">
      <h4 id={id("title")} className="font-semibold">
        Re-run from {stage === "report" ? "the start" : `this stage`}
      </h4>
      <p className="text-sm text-muted-foreground">{INTRO[stage]}</p>
      <div className="max-w-md">
        <ActionForm
          action={rerunStageAction.bind(null, context.org, context.project, run.id, stage)}
          submit={stage === "report" ? "Re-run" : "Re-run with these inputs"}
        >
          {stage === "corpus" && (
            <>
              <div>
                <label htmlFor={id("traffic")} className={ui.label}>
                  Traffic (drift-traffic/v1 JSONL or HAR, up to 25 MiB)
                </label>
                <input
                  id={id("traffic")}
                  name="traffic"
                  type="file"
                  accept=".jsonl,.ndjson,.har,.json"
                  className={ui.input}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dropTraffic" /> Without traffic (synthetic samples only)
              </label>
            </>
          )}
          {(stage === "corpus" || stage === "verify") && (
            <div>
              <label htmlFor={id("seed")} className={ui.label}>
                Seed
              </label>
              <input id={id("seed")} name="seed" type="number" min={0} step={1} className={ui.input} />
            </div>
          )}
          {stage === "classify" && (
            <>
              <div>
                <label htmlFor={id("policy")} className={ui.label}>
                  Policy (drift-policy/v1, YAML or JSON)
                </label>
                <input id={id("policy")} name="policy" type="file" accept=".yaml,.yml,.json" className={ui.input} />
              </div>
              <div>
                <label htmlFor={id("rules")} className={ui.label}>
                  Ruleset (drift-rules/v1, YAML or JSON)
                </label>
                <input id={id("rules")} name="rules" type="file" accept=".yaml,.yml,.json" className={ui.input} />
              </div>
              <div>
                <label htmlFor={id("fail-on")} className={ui.label}>
                  Fail on
                </label>
                <select id={id("fail-on")} name="failOn" className={ui.input} defaultValue="">
                  <option value="">as before</option>
                  <option value="breaking">BREAKING</option>
                  <option value="risky">RISKY or BREAKING</option>
                </select>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </section>
  );
}
