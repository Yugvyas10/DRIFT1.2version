# @drift/db

**Owner:** P3 (Tanishq Chavan). Reviewer P2. **Status:** reserved; implemented in **M5**.

## Planned

Prisma schema, migrations, client and seed for the platform. Entities (PLAN §6 M5):

- identity and tenancy: User, Account, Session, Organization, Membership (OWNER/ADMIN/MEMBER/VIEWER), Invitation, Project, ApiKey;
- runs: Run, StageExecution, Artifact, Change, Evidence;
- policy and history: Policy, Suppression, AuditLog, WebhookDelivery.

Every query is scoped by organisation. Local Postgres comes from `infra/docker-compose.yml` (Postgres 18). The seed will contain only real engine output (PLAN Q12).
