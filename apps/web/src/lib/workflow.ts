/**
 * The GitHub Actions workflow file of the project setup wizard (PLAN M7), from the options chosen. Inputs and
 * permissions follow packages/github-action/action.yml: the comment needs pull-requests: write, SARIF needs
 * security-events: write, and uploading needs a project, the platform's URL and an API key from a secret.
 */
export function workflowYaml(options: {
  spec: string;
  traffic: string;
  failOn: "breaking" | "risky";
  comment: boolean;
  sarif: boolean;
  upload: boolean;
  project: string;
  appUrl: string;
}): string {
  const quoted = (value: string) => JSON.stringify(value);
  const permissions = [
    "  contents: read",
    ...(options.comment ? ["  pull-requests: write # the PR comment"] : []),
    ...(options.sarif ? ["  security-events: write # SARIF upload to code scanning"] : []),
  ];
  const inputs = [
    `          spec: ${quoted(options.spec)}`,
    ...(options.traffic.trim() === "" ? [] : [`          traffic: ${quoted(options.traffic.trim())}`]),
    ...(options.failOn === "risky" ? ["          fail-on: risky"] : []),
    ...(options.comment ? [] : ["          comment: false"]),
    ...(options.sarif ? ["          sarif: true"] : []),
    ...(options.upload
      ? [
          "          upload: true",
          `          project: ${quoted(options.project)}`,
          `          api-url: ${quoted(options.appUrl)}`,
          "          api-key: ${{ secrets.DRIFT_API_KEY }}",
        ]
      : []),
  ];
  return [
    "name: API contract",
    "on:",
    "  pull_request:",
    `    paths: [${quoted(options.spec)}]`,
    "",
    "permissions:",
    ...permissions,
    "",
    "jobs:",
    "  drift:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "      # Pin the Action to a full commit SHA of the DRIFT repository (a tag can be moved; a SHA cannot).",
    "      - uses: Yugvyas10/DRIFT1.2version/packages/github-action@<commit-sha>",
    "        with:",
    ...inputs,
    "",
  ].join("\n");
}
