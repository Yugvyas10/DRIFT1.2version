/**
 * DRIFT Platform — Centralized Presentation & Demonstration Dataset
 *
 * This file consolidates ALL demonstration data used across the DRIFT platform:
 * 1. Database & Organization Seed Records
 * 2. 6-Stage Interactive Pipeline Canvas Specimens (AST, Diffs, Replay, Classification, Reports, CI Gate)
 * 3. Dashboard Telemetry, KPIs & Chart Datasets
 * 4. Live Console Terminal Stream Data
 *
 * Use this file to demonstrate exact data provenance to hackathon judges, clients, and technical panels.
 */

// ============================================================================
// 1. DATABASE & ORGANIZATION DEMO SEED RECORDS
// ============================================================================
export const DEMO_DATABASE_RECORDS = {
  user: {
    id: "usr_demo_101",
    name: "Demo Architect",
    email: "demo@drift.dev",
    password: "driftdemo123",
  },
  organization: {
    id: "org_drift_demo",
    name: "DRIFT Demo Org",
    slug: "drift-demo",
  },
  project: {
    id: "prj_orders_checkout",
    name: "Orders & Checkout Service",
    slug: "orders-checkout-service",
    repoFullName: "acme/orders-checkout-service",
    environment: "Production",
    specVersion: "v1.5.0",
  },
  report: {
    id: "rep_checkout_zip",
    prTitle: "PR #402: Add Zip Validation to Checkout",
    severity: "CRITICAL_BREAKING",
    safeCount: 3,
    warningCount: 0,
    breakingCount: 1,
    jsonPayload: JSON.stringify({
      changes: [
        {
          field: "Order.amount",
          from: "integer",
          to: "string",
          classification: "CRITICAL_BREAKING",
          impactedConsumers: [
            "checkout-web-ui",
            "mobile-app-ios",
            "legacy-billing-service",
          ],
        },
      ],
    }),
  },
};

// ============================================================================
// 2. 6-STAGE INTERACTIVE PIPELINE CANVAS SPECIMEN DATA
// ============================================================================
export const DEMO_PIPELINE_STAGES_DATA = {
  stage1Validation: {
    stageNumber: 1,
    title: "OpenAPI Spec Validation & AST Parsing",
    specimenBaselineSpec: `{
  "openapi": "3.1.0",
  "info": { "title": "Payments API", "version": "1.2.0" },
  "paths": {
    "/v2/orders": {
      "post": {
        "summary": "Create Order",
        "parameters": [
          { "name": "billing_zip", "in": "query", "required": false }
        ]
      }
    }
  }
}`,
    specimenCandidateSpec: `{
  "openapi": "3.1.0",
  "info": { "title": "Payments API", "version": "1.3.0" },
  "paths": {
    "/v2/orders": {
      "post": {
        "summary": "Create Order",
        "parameters": [
          { "name": "billing_zip", "in": "query", "required": true }
        ]
      }
    }
  }
}`,
    outputs: ["Normalized AST Object Tree", "Component References Registry"],
  },

  stage2DiffEngine: {
    stageNumber: 2,
    title: "Semantic AST Contract Diffing",
    deltas: [
      {
        endpoint: "POST /v2/orders",
        changeType: "REQUIRED_PARAM_ADDED",
        paramName: "billing_zip",
        impact:
          "Breaking change: New mandatory query parameter added to existing endpoint",
        severity: "CRITICAL_BREAKING",
      },
      {
        endpoint: "GET /v2/orders/{id}",
        changeType: "FIELD_DEPRECATED",
        paramName: "legacy_user_id",
        impact: "Safe deprecation: Field scheduled for deletion in v2.0",
        severity: "WARNING",
      },
      {
        endpoint: "GET /v2/health",
        changeType: "FIELD_ADDED",
        paramName: "uptime_seconds",
        impact: "Non-breaking addition: New optional response field",
        severity: "PASSED",
      },
    ],
  },

  stage3TrafficReplay: {
    stageNumber: 3,
    title: "Shadow Traffic Replay",
    targetEndpoint: "http://staging-candidate.internal:8080",
    trafficSource: "eBPF Production Mirror Stream",
    stats: {
      totalRequestsReplayed: 1420,
      successfulResponses: 1218,
      failedResponses: 202,
      failureRatePercentage: 14.2,
      replayDurationMs: 1480,
    },
    sampleFailingPayload: {
      requestMethod: "POST",
      requestPath: "/v2/orders",
      requestBody: { orderId: "ord_9981", amount: 149.99 },
      responseStatusCode: 400,
      errorMessage: "Missing mandatory query parameter: billing_zip",
    },
  },

  stage4Classification: {
    stageNumber: 4,
    title: "Risk & Compatibility Classification",
    calculatedSeverity: "BREAKING",
    mappedDbSeverity: "CRITICAL_BREAKING",
    classificationReasoning: [
      "Rule MATCH: REQUIRED_PARAM_ADDED is a candidate breaking mutation.",
      "Evidence VERIFIED: Shadow traffic replay produced 202 failures (14.2% error rate).",
      "Conclusion: PR #402 introduces a verified breaking API contract regression.",
    ],
  },

  stage5ReportGeneration: {
    stageNumber: 5,
    title: "Multi-Format Report Generation",
    reportFormats: [
      "GitHub Checks API",
      "HTML Audit Report",
      "Console stdout JSON",
    ],
    summary: {
      totalChanges: 3,
      safeCount: 1,
      warningCount: 1,
      breakingCount: 1,
      impactedConsumersCount: 3,
    },
  },

  stage6CicdGate: {
    stageNumber: 6,
    title: "CI/CD Quality Gate & PR Block",
    gateResult: "PR MERGE BLOCKED",
    exitCode: 1,
    githubActionMessage:
      "::error::DRIFT Sentinel Gate Failed: 1 CRITICAL_BREAKING regression detected in PR #402. Merge blocked.",
  },
};

// ============================================================================
// 3. DASHBOARD TELEMETRY, KPIS & CHART DATASETS
// ============================================================================
export const DEMO_DASHBOARD_TELEMETRY = {
  kpis: [
    {
      label: "Active Monitored Contracts",
      value: "47",
      trend: "+3",
      color: "text-primary",
    },
    {
      label: "Blocked Merges (7d)",
      value: "6",
      trend: "-2",
      color: "text-chart-3",
    },
    {
      label: "Avg AST Diff Latency",
      value: "702ms",
      trend: "-48ms",
      color: "text-chart-2",
    },
    {
      label: "Live Drift Alerts",
      value: "2",
      trend: "+1",
      color: "text-destructive",
    },
  ],

  weeklyChangeBreakdown: [
    { day: "Mon", breaking: 2, compatible: 8, cosmetic: 14 },
    { day: "Tue", breaking: 0, compatible: 5, cosmetic: 11 },
    { day: "Wed", breaking: 1, compatible: 7, cosmetic: 9 },
    { day: "Thu", breaking: 3, compatible: 10, cosmetic: 16 },
    { day: "Fri", breaking: 0, compatible: 4, cosmetic: 8 },
    { day: "Sat", breaking: 0, compatible: 2, cosmetic: 3 },
    { day: "Sun", breaking: 0, compatible: 1, cosmetic: 2 },
  ],

  diffLatencyBenchmarkMs: [
    { run: "1", ms: 680 },
    { run: "2", ms: 742 },
    { run: "3", ms: 611 },
    { run: "4", ms: 789 },
    { run: "5", ms: 703 },
    { run: "6", ms: 658 },
    { run: "7", ms: 724 },
    { run: "8", ms: 691 },
    { run: "9", ms: 756 },
    { run: "10", ms: 672 },
  ],

  monitoredMicroservices: [
    {
      name: "Payments Core Microservice",
      env: "Production",
      specVersion: "v1.2.0",
      status: "HEALTHY",
      replayedRequests: "1.4M / mo",
      lastRun: "4m ago",
    },
    {
      name: "Orders & Checkout Service",
      env: "Staging Candidate",
      specVersion: "v1.3.0-rc1",
      status: "CRITICAL",
      replayedRequests: "500k / mo",
      lastRun: "12m ago",
    },
    {
      name: "User Auth & Tokens Mesh",
      env: "Production",
      specVersion: "v2.1.0",
      status: "HEALTHY",
      replayedRequests: "2.8M / mo",
      lastRun: "1h ago",
    },
    {
      name: "Webhooks Dispatch Engine",
      env: "Production",
      specVersion: "v1.0.4",
      status: "WARNING",
      replayedRequests: "300k / mo",
      lastRun: "3h ago",
    },
  ],

  recentPipelineRuns: [
    {
      repo: "orders-api",
      pr: "#842",
      status: "blocked",
      changes: 3,
      breaking: 1,
      time: "2m ago",
    },
    {
      repo: "payments-svc",
      pr: "#119",
      status: "passed",
      changes: 5,
      breaking: 0,
      time: "14m ago",
    },
    {
      repo: "billing-svc",
      pr: "#67",
      status: "passed",
      changes: 2,
      breaking: 0,
      time: "38m ago",
    },
    {
      repo: "analytics-svc",
      pr: "#204",
      status: "blocked",
      changes: 4,
      breaking: 2,
      time: "1h ago",
    },
    {
      repo: "user-svc",
      pr: "#88",
      status: "passed",
      changes: 1,
      breaking: 0,
      time: "2h ago",
    },
    {
      repo: "auth-svc",
      pr: "#45",
      status: "passed",
      changes: 3,
      breaking: 0,
      time: "3h ago",
    },
  ],
};

// ============================================================================
// 4. LIVE CONSOLE TERMINAL LOG LINES STREAM
// ============================================================================
export const DEMO_CONSOLE_LOGS_STREAM = [
  "[00:00.012] [AST:PARSE] Ingesting baseline spec v1.2.0 and candidate spec v1.3.0...",
  "[00:00.048] [AST:DEREF] Dereferencing 14 $ref schema definitions across 8 endpoint paths.",
  "[00:00.092] [AST:VALID] Baseline and candidate specifications pass OpenAPI 3.1 syntax check.",
  "[00:00.145] [DIFF:ENGINE] Executing semantic tree comparison...",
  "[00:00.198] [DIFF:DELTA] Detected mutation at POST /v2/orders -> mandatory parameter 'billing_zip' added.",
  "[00:00.260] [REPLAY:START] Spawning eBPF traffic mirror listener (target: http://staging:8080)...",
  "[00:00.820] [REPLAY:RUN] Replayed 1,420 production request payloads.",
  "[00:01.120] [REPLAY:WARN] 202 requests returned HTTP 400 (14.2% error rate).",
  "[00:01.240] [CLASSIFY] Rule MATCH: REQUIRED_PARAM_ADDED + Failing Replay Evidence = BREAKING.",
  "[00:01.350] [REPORT:GEN] Created Sentinel Report rep_checkout_zip (Severity: CRITICAL_BREAKING).",
  "[00:01.480] [GATE:CI] Dispatching GitHub Check Run status: FAILURE (exit code 1). Merge blocked.",
];
