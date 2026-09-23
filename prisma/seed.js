/* Demo seed data for local dev and presentations. Run: npm run prisma:seed */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("driftdemo123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@drift.dev" },
    update: {},
    create: {
      email: "demo@drift.dev",
      name: "Demo User",
      passwordHash,
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "drift-demo" },
    update: {},
    create: { name: "DRIFT Demo Org", slug: "drift-demo" },
  });

  const project = await prisma.project.upsert({
    where: { id: "prj_orders_checkout" },
    update: {},
    create: {
      id: "prj_orders_checkout",
      organizationId: org.id,
      name: "Orders & Checkout Service",
      slug: "orders-checkout-service",
      environment: "Production",
      specVersion: "v1.5.0",
    },
  });

  await prisma.report.upsert({
    where: { id: "rep_checkout_zip" },
    update: {},
    create: {
      id: "rep_checkout_zip",
      projectId: project.id,
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

  console.log("Seed complete:");
  console.log(`  User: ${demoUser.email} (password: driftdemo123)`);
  console.log(`  Org:  ${org.slug}`);
  console.log(`  Project: ${project.name} (${project.id})`);
  console.log("  Report: PR #402: Add Zip Validation to Checkout");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
