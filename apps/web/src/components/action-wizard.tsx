"use client";

import { useId, useState } from "react";
import { workflowYaml } from "@/lib/workflow";
import { ui } from "./ui";

export interface WizardDefaults {
  /** The project's slug (for `upload`). */
  project: string;
  /** The contract's path in the repository, from the project's settings. */
  specPath?: string;
  /** The platform's URL (`api-url`). */
  appUrl: string;
}

/**
 * The project setup wizard (PLAN M7): choose the options, copy the workflow file the GitHub Action needs. Nothing is
 * sent anywhere; the file is built in the browser from the choices.
 */
export function ActionWizard({ defaults }: { defaults: WizardDefaults }) {
  const id = useId();
  const [spec, setSpec] = useState(defaults.specPath ?? "openapi.yaml");
  const [traffic, setTraffic] = useState("");
  const [failOn, setFailOn] = useState<"breaking" | "risky">("breaking");
  const [comment, setComment] = useState(true);
  const [sarif, setSarif] = useState(false);
  const [upload, setUpload] = useState(false);
  const [copied, setCopied] = useState(false);
  const yaml = workflowYaml({
    spec: spec.trim() === "" ? "openapi.yaml" : spec.trim(),
    traffic,
    failOn,
    comment,
    sarif,
    upload,
    project: defaults.project,
    appUrl: defaults.appUrl,
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <form
        className="space-y-4"
        aria-label="Workflow options"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div>
          <label htmlFor={`${id}-spec`} className={ui.label}>
            Contract path in the repository
          </label>
          <input
            id={`${id}-spec`}
            value={spec}
            onChange={(event) => {
              setSpec(event.target.value);
            }}
            className={ui.input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-traffic`} className={ui.label}>
            Recorded traffic (optional)
          </label>
          <input
            id={`${id}-traffic`}
            value={traffic}
            placeholder="traffic.jsonl"
            onChange={(event) => {
              setTraffic(event.target.value);
            }}
            className={ui.input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-fail-on`} className={ui.label}>
            Fail the check on
          </label>
          <select
            id={`${id}-fail-on`}
            value={failOn}
            onChange={(event) => {
              setFailOn(event.target.value === "risky" ? "risky" : "breaking");
            }}
            className={ui.input}
          >
            <option value="breaking">BREAKING</option>
            <option value="risky">RISKY or BREAKING</option>
          </select>
        </div>
        <fieldset className="space-y-2 text-sm">
          <legend className={ui.label}>Also</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={comment}
              onChange={(event) => {
                setComment(event.target.checked);
              }}
            />
            Comment on the pull request
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sarif}
              onChange={(event) => {
                setSarif(event.target.checked);
              }}
            />
            Upload SARIF to code scanning
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={upload}
              onChange={(event) => {
                setUpload(event.target.checked);
              }}
            />
            Upload each run to this project
          </label>
        </fieldset>
      </form>
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Save as <code className="font-mono">.github/workflows/drift.yml</code>
          </p>
          <button
            type="button"
            className={ui.buttonQuiet}
            onClick={() => {
              void navigator.clipboard.writeText(yaml).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre
          tabIndex={0}
          className="overflow-x-auto rounded-md bg-background-2 p-4 font-mono text-xs"
          data-testid="workflow-yaml"
        >
          {yaml}
        </pre>
        {upload && (
          <p className="text-sm text-muted-foreground">
            Add a repository secret <code className="font-mono">DRIFT_API_KEY</code> with a key that has{" "}
            <code className="font-mono">runs:write</code> for this project.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          To block merges, make the <code className="font-mono">drift</code> check required in the repository&apos;s
          branch protection.
        </p>
      </div>
    </div>
  );
}
