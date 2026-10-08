# ADR-0009: Run the web app and worker on Azure Container Apps instead of Fly.io

Status: Accepted (2026-10-08). Supersedes the Fly.io parts of [ADR-0008](0008-hosting.md) (Decisions 1, 4 and 7); its Neon, R2, region, configuration and demo-data decisions stand.
Date: 2026-10-08
Owner: P4 (decision). Operations owner to be agreed; P3 is suggested.

## Context

ADR-0008 put the web app, the worker and Redis on Fly.io. Fly has no free tier for new organisations: its trial lasts 2 hours of Machine runtime or 7 days, and a card is needed after that. The team wants a public instance for about two months without paying for it.

**Azure for Students** gives full-time university students $100 of credit a year with no card. We compared it with the free tiers of Render, Koyeb, Google Cloud Run and Oracle Cloud:

- Render and Koyeb have no free always-on worker.
- Cloud Run needs a billing account (a card).
- Oracle's Always Free tier needs card verification and may reclaim idle instances.

Azure's list prices for Singapore (Retail Prices API, 2026-10-08) put Container Apps at about $29–37 a month for our three processes, so two months fit in the credit.

## Decision

1. **Azure Container Apps, Consumption plan, region Singapore (`southeastasia`).** One resource group holds:
   - a Log Analytics workspace (30-day retention, a daily cap of 0.15 GB, below the 5 GB a month that is free);
   - a Consumption-only environment;
   - a migration job;
   - one container app.

   The template is `infra/azure/main.bicep`.

2. **One container app with three containers:** `web` (the only one with ingress, port 3000), `worker`, and a **Redis sidecar**, scaled to exactly one replica. They share the replica's network, so Redis listens on `127.0.0.1` only.
   - Container Apps offers TCP between apps only in environments with a custom virtual network. A sidecar needs no network, no TCP ingress and no extra resources.
   - Together they use 1.25 vCPU and 2.5 GiB, a valid Consumption combination.
3. **Redis has no persistence.** The containers have no lasting disk, and Redis holds only the queue, recent run events, rate limits and worker slots; results live in Postgres and R2.
   - **The cost:** a new revision (every deploy) or a Redis restart drops whatever is queued or running. Those runs stay "queued" or "running" until re-run.
   - **Acceptable for a demo,** because deploys are rare and a re-run is one click.
   - **The password:** still required, from a secret. `deploy.sh` generates a new one each deploy, since only the app's own containers use it.
4. **Migrations run as a manually triggered Container Apps job,** before the new image goes live. `infra/azure/deploy.sh` deploys the template without the app, starts the job and waits for it, then deploys the app. If the job fails, the running app is untouched. This is what Fly's `release_command` did.
5. **Images:**
   - `.github/workflows/images.yml` builds the platform and Redis images and publishes them to GitHub's container registry, tagged with the commit SHA. This runs on pushes to `master`, or on an `images-*` tag for a branch.
   - Container Apps pulls them anonymously when the packages are public, or with a GitHub token with `read:packages`.
   - The CI job `images` builds and smoke-tests the same images on every PR.
6. **Health:**
   - startup and liveness probes on `/healthz` for `web` (not `/readyz`, so that Neon can scale to zero);
   - Container Apps restarts any container that exits.
7. **Deploys are run by hand** (`az login`, then `deploy.sh`), from a laptop or Azure Cloud Shell. A GitHub Actions deploy would need an Entra ID app registration, which student tenants often don't allow; for a two-month demo it isn't worth it.
8. **Budget:** an alert at $40 a month in Cost Management. **Delete the resource group when the demo ends**, which removes everything in one step.

## Alternatives considered

- **Stay on Fly.io (ADR-0008).** It is built and tested, but it needs a card and is not free.
- **Three separate container apps with a custom virtual network** (TCP ingress for Redis). This is closer to ADR-0008's separate Redis Machine, and deploys wouldn't restart Redis. But a VNet-integrated Consumption-only environment needs its own subnet and more configuration that we can't test before the first deploy.
- **One B-series VM running `docker compose`.** About $25 a month, and Redis could keep a disk. But we would own the OS, HTTPS certificates, the firewall and updates, and building the image on a 1–2 GB VM is not possible, so it would still need a registry.
- **Oracle Cloud Always Free.** No charge at all, but it needs card verification, idle instances may be reclaimed, and we would run the server ourselves.
- **Azure Cache for Redis.** It is managed and persistent, but it costs more than the rest of the deployment.

## Consequences

- **No card is needed:** Neon and R2 are on free tiers, and Azure uses the student credit. When the credit runs out, Azure disables the services and the subscription rather than billing ([Microsoft](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled)).
- **The repository changes:**
  - `infra/container/` (the release, web and worker scripts and the Redis sidecar image) replaces `infra/fly/`;
  - `infra/azure/` (the template and the deploy script) replaces `fly.toml`;
  - `.github/workflows/images.yml` replaces the Fly deploy workflow;
  - CI's `images` job also compiles the template and tests the worker against the Redis sidecar on the loopback, as in Azure.
- **Platform limits that matter:**
  - **HTTP requests end after 240 seconds.** Event streams reconnect and resume with `Last-Event-ID` (ADR-0004). Uploads of up to 25 MiB finish well inside that.
  - **The ingress passes only the client's address in `X-Forwarded-For`,** which is the entry the rate limits read (SECURITY T16).
- **Still to verify on the first deploy:**
  - R2 with path-style requests;
  - SSE through Azure's ingress;
  - Neon cold starts during the migration job (the job retries once);
  - the worker's memory under a real run.

## Questions an examiner might ask

- **Why three containers in one app, when separate services are the norm?** Container Apps only connects apps over TCP inside a virtual network; a sidecar shares the replica's loopback and needs nothing else. The cost is that Redis restarts with each revision, which only drops in-flight runs. We accepted that for a two-month demo and recorded the VNet alternative.
- **How do migrations run before the new code?** `deploy.sh` deploys the migration job with the new image, starts it and waits for `Succeeded`. Only then does it deploy the app; a failure stops the deploy with the old revision still serving.
- **What stops the student credit from running out?** The deployment is sized for about $29–37 a month (list prices), there is a $40 budget alert, the logs are capped below their free allowance, and the resource group is deleted when the demo ends. Azure for Students disables the subscription instead of charging when the credit is gone.
- **Where are the secrets?** In the Container Apps' secrets (encrypted at rest, referenced by environment variables). `deploy.sh` reads them from the environment and passes them in a parameters file only the user can read, deleted on exit. Azure keeps secure parameters out of the deployment history.
