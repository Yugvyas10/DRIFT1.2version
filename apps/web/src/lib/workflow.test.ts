import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, parseDataText } from "@drift/core";
import { workflowYaml } from "./workflow";

const base = {
  spec: "api/openapi.yaml",
  traffic: "",
  failOn: "breaking" as "breaking" | "risky",
  comment: true,
  sarif: false,
  upload: false,
  project: "orders",
  appUrl: "https://drift.example",
};

interface Workflow {
  on: { pull_request: { paths: string[] } };
  permissions: Record<string, string>;
  jobs: { drift: { steps: { uses: string; with?: Record<string, unknown> }[] } };
}

function read(options: Partial<typeof base>): Workflow {
  const parsed = parseDataText(workflowYaml({ ...base, ...options }), "drift.yml", DEFAULT_LIMITS);
  if (!parsed.ok) throw new Error("not YAML");
  return parsed.value as unknown as Workflow;
}

describe("the setup wizard's workflow file", () => {
  it("is valid YAML that runs the Action on changes to the contract, with least privilege", () => {
    const workflow = read({});
    expect(workflow.on.pull_request.paths).toEqual(["api/openapi.yaml"]);
    expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "write" });
    const step = workflow.jobs.drift.steps[1];
    expect(step?.uses).toBe("Yugvyas10/DRIFT1.2version/packages/github-action@<commit-sha>");
    expect(step?.with).toEqual({ spec: "api/openapi.yaml" });
  });

  it("adds exactly the inputs and permissions of the options chosen", () => {
    const workflow = read({ traffic: " traffic.jsonl ", failOn: "risky", comment: false, sarif: true, upload: true });
    expect(workflow.permissions).toEqual({ contents: "read", "security-events": "write" });
    expect(workflow.jobs.drift.steps[1]?.with).toEqual({
      spec: "api/openapi.yaml",
      traffic: "traffic.jsonl",
      "fail-on": "risky",
      comment: false,
      sarif: true,
      upload: true,
      project: "orders",
      "api-url": "https://drift.example",
      "api-key": "${{ secrets.DRIFT_API_KEY }}",
    });
  });

  it("quotes values, so a path cannot inject YAML", () => {
    const workflow = read({ spec: 'a: b\n  evil: "x"' });
    expect(workflow.jobs.drift.steps[1]?.with?.spec).toBe('a: b\n  evil: "x"');
  });
});
