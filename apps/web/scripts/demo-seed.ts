/**
 * DEMO mode (PLAN Q12): marks an organisation as a demonstration and fills one of its projects with runs made by
 * the real `drift` CLI on the example contracts in `examples/`. Nothing is written by hand: every run is the CLI's
 * own output, uploaded (`drift compare --upload`) or computed by the platform's worker (`drift run`).
 *
 *   pnpm turbo run build --filter=@drift/cli --filter=@drift/db
 *   DATABASE_URL=… DRIFT_API_KEY=drift_… pnpm --filter @drift/web run demo:seed -- \
 *     --org <slug> --project <slug> --api-url http://localhost:3000 [--server-runs]
 *
 * The API key needs runs:write for the project; `--server-runs` also needs a running worker.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { createDb } from "@drift/db";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const cli = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));

const { values } = parseArgs({
  // pnpm passes its "--" separator on.
  args: process.argv.slice(2).filter((argument) => argument !== "--"),
  options: {
    org: { type: "string" },
    project: { type: "string" },
    "api-url": { type: "string" },
    "server-runs": { type: "boolean", default: false },
  },
});
const org = values.org;
const project = values.project;
const apiUrl = values["api-url"] ?? process.env.DRIFT_API_URL;
if (!org || !project || !apiUrl || !process.env.DATABASE_URL || !process.env.DRIFT_API_KEY) {
  console.error(
    "usage: DATABASE_URL=… DRIFT_API_KEY=… demo-seed --org <slug> --project <slug> --api-url <url> [--server-runs]"
  );
  process.exit(2);
}

const examples = (name: string) => `examples/petstore/${name}`;
/** A fixed commit per scenario, so seeding twice gives the same runs (the upload is idempotent). */
const commit = (n: number) => String(n).repeat(40);

const scenarios = [
  { name: "breaking change, recorded traffic", head: "v2-breaking.yaml", traffic: true, commit: commit(1) },
  { name: "breaking change, synthetic samples only", head: "v2-breaking.yaml", traffic: false, commit: commit(2) },
  { name: "additive change", head: "v2-additive.yaml", traffic: false, commit: commit(3) },
];

async function drift(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [cli, ...args], {
      cwd: repo,
      env: process.env,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

const db = createDb(process.env.DATABASE_URL);
try {
  const marked = await db.organization.updateMany({ where: { slug: org }, data: { demo: true } });
  if (marked.count === 0) throw new Error(`no organisation "${org}"`);
  console.log(`marked ${org} as a DEMO organisation`);
  for (const scenario of scenarios) {
    const inputs = [
      "--base",
      examples("v1.yaml"),
      "--head",
      examples(scenario.head),
      ...(scenario.traffic ? ["--traffic", examples("traffic.jsonl")] : []),
    ];
    const target = ["--project", project, "--api-url", apiUrl, "--commit", scenario.commit, "--branch", "demo"];
    const uploaded = await drift(["compare", ...inputs, "--no-cache", "--upload", ...target]);
    // Exit 1 is a failed gate, which the breaking scenarios are meant to show; 2 and 3 are real problems.
    if (uploaded.code > 1) throw new Error(`drift compare --upload (${scenario.name}): ${uploaded.stderr.trim()}`);
    console.log(`${scenario.name}: ${/uploaded {2}run (\S+)/.exec(uploaded.stdout)?.[1] ?? "?"} (uploaded)`);
    if (values["server-runs"]) {
      const ran = await drift(["run", ...inputs, ...target]);
      if (ran.code > 1) throw new Error(`drift run (${scenario.name}): ${ran.stderr.trim()}`);
      console.log(`${scenario.name}: ${/^run (\S+)/m.exec(ran.stdout)?.[1] ?? "?"} (on the platform)`);
    }
  }
} finally {
  await db.$disconnect();
}
