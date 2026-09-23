# DRIFT — Contract-Aware API Regression Sentinel

DRIFT is a developer platform that catches breaking API changes before they ship. It parses OpenAPI 3.x, gRPC, and GraphQL ASTs, replays shadow production traffic, and gates breaking pull requests in CI/CD.

**Live demo:** https://driftapi.vercel.app

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, React Three Fiber
- **Backend:** Next.js API routes (serverless functions)
- **Database:** PostgreSQL via Prisma (Neon)
- **Auth:** NextAuth.js (credentials, bcrypt-hashed passwords)
- **UI:** shadcn/ui components, Recharts, Sonner, Zustand

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Push the schema (or run migrations)
npx prisma migrate deploy

# 4. Seed demo data (optional)
npm run prisma:seed

# 5. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable          | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string (use the Neon pooled URL in production)        |
| `NEXTAUTH_SECRET` | Secret used to sign NextAuth JWTs — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL`    | Canonical URL of the deployment (e.g. `https://driftapi.vercel.app`)        |

## Scripts

| Script                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | Start the dev server                         |
| `npm run build`           | Build for production (runs migrations first) |
| `npm run lint`            | ESLint                                       |
| `npm run type-check`      | TypeScript check                             |
| `npm run prisma:generate` | Regenerate the Prisma client                 |
| `npm run prisma:seed`     | Seed demo data                               |
| `npm run prisma:studio`   | Open Prisma Studio                           |

## API Routes

| Route                          | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `POST /api/auth/register`      | Create a user (bcrypt-hashed password, duplicate email → 409) |
| `POST /api/auth/[...nextauth]` | NextAuth credentials login (DB-verified)                      |
| `GET/POST /api/projects`       | List / create projects                                        |
| `POST /api/keys`               | Create an API key (hashed at rest, plaintext returned once)   |
| `GET/POST /api/reports`        | List / create sentinel reports                                |
| `GET /api/health`              | Health check — probes the database with `SELECT 1`            |

## Deployment

The project is deployed on Vercel with automatic deployments from `main`. The database runs on Neon (free tier, serverless Postgres). CI runs typecheck + lint on every push via GitHub Actions.

## Pages

Home · Technology · Interactive Pipeline · Live Demo · Dashboard · Docs · Pricing · Enterprise · Blog · Contact · Settings · Login/Register
