/* Comprehensive seed script populating all DRIFT Prisma models. Run: npm run prisma:seed */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  const passwordHash = await bcrypt.hash("driftdemo123", 10);

  // 1. Users
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@drift.dev" },
    update: { passwordHash },
    create: {
      email: "demo@drift.dev",
      name: "Tyrell (Lead Architect)",
      passwordHash,
    },
  });

  const sarahUser = await prisma.user.upsert({
    where: { email: "sarah@drift.dev" },
    update: { passwordHash },
    create: {
      email: "sarah@drift.dev",
      name: "Sarah Jenkins (DevOps Lead)",
      passwordHash,
    },
  });

  const alexUser = await prisma.user.upsert({
    where: { email: "alex@drift.dev" },
    update: { passwordHash },
    create: {
      email: "alex@drift.dev",
      name: "Alex Rivera (API Engineer)",
      passwordHash,
    },
  });

  // 2. Organization
  const org = await prisma.organization.upsert({
    where: { slug: "drift-demo" },
    update: {},
    create: { name: "Acme Corp Enterprise", slug: "drift-demo" },
  });

  // 3. Memberships
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: demoUser.id, organizationId: org.id } },
    update: { role: "OWNER" },
    create: { userId: demoUser.id, organizationId: org.id, role: "OWNER" },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: sarahUser.id, organizationId: org.id } },
    update: { role: "ADMIN" },
    create: { userId: sarahUser.id, organizationId: org.id, role: "ADMIN" },
  });

  // 4. Projects
  const project1 = await prisma.project.upsert({
    where: { id: "prj_orders_checkout" },
    update: {},
    create: {
      id: "prj_orders_checkout",
      organizationId: org.id,
      name: "Orders & Checkout Service",
      slug: "orders-checkout-service",
      repoFullName: "acme/orders-checkout-service",
      environment: "Production",
      specVersion: "v1.5.0",
    },
  });

  const project2 = await prisma.project.upsert({
    where: { id: "prj_payments_core" },
    update: {},
    create: {
      id: "prj_payments_core",
      organizationId: org.id,
      name: "Payments Core Microservice",
      slug: "payments-core-service",
      repoFullName: "acme/payments-core-service",
      environment: "Production",
      specVersion: "v1.2.0",
    },
  });

  // 5. Analyses
  const analysis1 = await prisma.analysis.upsert({
    where: { runId: "run_checkout_pr402_abc123" },
    update: {},
    create: {
      projectId: project1.id,
      runId: "run_checkout_pr402_abc123",
      status: "COMPLETED",
      durationMs: 1480,
    },
  });

  // 6. Reports
  await prisma.report.upsert({
    where: { id: "rep_checkout_zip" },
    update: {},
    create: {
      id: "rep_checkout_zip",
      projectId: project1.id,
      analysisId: analysis1.id,
      prTitle: "PR #402: Add Zip Validation to Checkout",
      severity: "CRITICAL_BREAKING",
      safeCount: 3,
      warningCount: 0,
      breakingCount: 1,
      jsonPayload: JSON.stringify({
        changes: [{ field: "Order.amount", from: "integer", to: "string", classification: "CRITICAL_BREAKING" }],
      }),
    },
  });

  await prisma.report.upsert({
    where: { id: "rep_payments_legacy" },
    update: {},
    create: {
      id: "rep_payments_legacy",
      projectId: project2.id,
      prTitle: "PR #398: Deprecate Legacy Token Header",
      severity: "WARNING",
      safeCount: 5,
      warningCount: 1,
      breakingCount: 0,
      jsonPayload: JSON.stringify({
        changes: [{ field: "Header.X-Legacy-Token", classification: "WARNING" }],
      }),
    },
  });

  // 7. API Keys
  const rawKey = "drift_live_demo_key_98f30192a837c49120a";
  await prisma.apiKey.upsert({
    where: { key: hashApiKey(rawKey) },
    update: {},
    create: {
      userId: demoUser.id,
      name: "GitHub Actions CI Runner Key",
      key: hashApiKey(rawKey),
    },
  });

  // 8. Audit Logs
  await prisma.auditLog.create({
    data: {
      userId: demoUser.id,
      action: "PROJECT_CREATED",
      details: "Created project Orders & Checkout Service",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: sarahUser.id,
      action: "API_KEY_CREATED",
      details: "Generated GitHub Actions CI Runner Key",
    },
  });

  // 9. Notifications
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      title: "Critical Breaking Change Detected",
      message: "PR #402 in Orders & Checkout Service introduced 1 breaking mutation.",
      read: false,
    },
  });

  console.log("🌱 Database seeding complete across all Prisma models:");
  console.log(`  - Users created: 3 (demo@drift.dev, sarah@drift.dev, alex@drift.dev)`);
  console.log(`  - Organization: Acme Corp Enterprise`);
  console.log(`  - Projects: 2 (Orders & Checkout, Payments Core)`);
  console.log(`  - Reports: 2 (PR #402, PR #398)`);
  console.log(`  - API Keys: 1 (GitHub Actions Runner Key)`);
  console.log(`  - Audit Logs & Notifications populated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
