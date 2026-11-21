import { describe, expect, it } from "vitest";
import { createApi } from "../api/handlers";
import { dispatch } from "../api/routes";
import { harness } from "../testing/harness";

const h = harness();

async function setup() {
  const org = await h.org();
  const project = h.unique("api");
  await h.call("POST", `/api/v1/orgs/${org.slug}/projects`, {
    user: org.owner,
    body: { name: "API", slug: project, repo: "acme/api", specPath: "openapi.yaml" },
  });
  return { ...org, project };
}

const inAYear = () => new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

describe("projects", () => {
  it("are created by admins, listed for members, and unique by slug within an organisation", async () => {
    const t = await setup();
    const list = await h.call<{ projects: unknown[] }>("GET", `/api/v1/orgs/${t.slug}/projects`, { user: t.owner });
    expect(list.body.projects).toEqual([
      expect.objectContaining({ slug: t.project, repo: "acme/api", specPath: "openapi.yaml" }),
    ]);
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${t.slug}/projects`, {
          user: t.owner,
          body: { name: "Again", slug: t.project },
        })
      ).status
    ).toBe(409);
    // The same slug in another organisation is fine.
    const other = await h.org();
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${other.slug}/projects`, {
          user: other.owner,
          body: { name: "Same", slug: t.project },
        })
      ).status
    ).toBe(201);
  });
});

describe("suppressions", () => {
  it("accept a change until a date, with a reason, and are audited", async () => {
    const t = await setup();
    const path = `/api/v1/orgs/${t.slug}/projects/${t.project}/suppressions`;
    const body = { changeId: "0123456789abcdef", reason: "Agreed with the mobile team", expiresAt: inAYear() };
    const created = await h.call<{ suppression: { id: string } }>("POST", path, { user: t.owner, body });
    expect(created.status).toBe(201);
    expect((await h.call<{ suppressions: unknown[] }>("GET", path, { user: t.owner })).body.suppressions).toEqual([
      expect.objectContaining({ id: created.body.suppression.id, changeId: body.changeId, project: t.project }),
    ]);
    const audit = await h.call<{ entries: { action: string; target: { id: string } }[] }>(
      "GET",
      `/api/v1/orgs/${t.slug}/audit`,
      { user: t.owner }
    );
    expect(audit.body.entries[0]).toMatchObject({
      action: "suppression.create",
      target: { type: "suppression", id: created.body.suppression.id },
    });
  });

  it("need a reason, a future expiry, an existing project and at least a MEMBER", async () => {
    const t = await setup();
    const path = `/api/v1/orgs/${t.slug}/projects/${t.project}/suppressions`;
    const body = { changeId: "0123456789abcdef", reason: "Agreed with the mobile team", expiresAt: inAYear() };
    expect((await h.call("POST", path, { user: t.owner, body: { ...body, reason: "ok" }, valid: false })).status).toBe(
      400
    );
    expect(
      (await h.call("POST", path, { user: t.owner, body: { ...body, expiresAt: "2020-01-01T00:00:00Z" } })).status
    ).toBe(400);
    expect((await h.call("POST", path.replace(t.project, "no-such"), { user: t.owner, body })).status).toBe(404);
    const viewer = await h.user();
    await h.join(t.id, viewer.id, "VIEWER");
    expect((await h.call("POST", path, { user: viewer, body })).status).toBe(403);
    expect((await h.call("GET", path, { user: viewer })).status).toBe(200);
  });
});

describe("the audit log", () => {
  it("is readable by admins and owners only", async () => {
    const t = await setup();
    const member = await h.user();
    await h.join(t.id, member.id, "MEMBER");
    expect((await h.call("GET", `/api/v1/orgs/${t.slug}/audit`, { user: member })).status).toBe(403);
    const entries = await h.call<{ entries: { action: string }[] }>("GET", `/api/v1/orgs/${t.slug}/audit?limit=1`, {
      user: t.owner,
    });
    expect(entries.body.entries.map((e) => e.action)).toEqual(["project.create"]);
  });

  it("is append-only in the database itself: an entry cannot be changed or deleted", async () => {
    const t = await setup();
    const entry = await h.db.auditLog.findFirstOrThrow({ where: { orgId: t.id } });
    await expect(
      h.db.auditLog.update({ where: { id: entry.id }, data: { action: "nothing.happened" } })
    ).rejects.toThrow(/append-only/);
    await expect(h.db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
    expect((await h.db.auditLog.findUniqueOrThrow({ where: { id: entry.id } })).action).toBe(entry.action);
  });
});

describe("health", () => {
  it("is alive, and ready when the database and the object store answer", async () => {
    expect(await h.call("GET", "/healthz")).toMatchObject({ status: 200, body: { status: "ok" } });
    expect(await h.call("GET", "/readyz")).toMatchObject({
      status: 200,
      body: { status: "ok", checks: { database: "ok", storage: "ok" } },
    });
  });

  it("is not ready when a dependency is down, without saying why", async () => {
    const broken = createApi({
      db: h.db,
      store: { ...h.store, ping: () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:8333")) },
      session: () => Promise.resolve(undefined),
    });
    const response = await dispatch(broken, new Request("http://drift.test/readyz"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded", checks: { database: "ok", storage: "down" } });
  });
});
