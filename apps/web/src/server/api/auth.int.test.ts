import { describe, expect, it } from "vitest";
import { hashApiKey } from "../auth/api-key";
import { harness } from "../testing/harness";

const h = harness();

describe("accounts", () => {
  it("registers a user with a bcrypt hash, and never returns or stores the password", async () => {
    const email = `${h.unique("alice")}@Example.com`;
    const reply = await h.call<{ user: { id: string; email: string; name: string } }>("POST", "/api/v1/auth/register", {
      body: { email, password: "correct horse battery", name: "Alice" },
    });
    expect(reply.status).toBe(201);
    expect(reply.body.user).toMatchObject({ email: email.toLowerCase(), name: "Alice" });
    expect(JSON.stringify(reply.body)).not.toContain("correct horse");
    const row = await h.db.user.findUniqueOrThrow({ where: { id: reply.body.user.id } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row.passwordHash).not.toContain("correct horse");
  });

  it("refuses a second account for the same address, a weak password and a non-JSON body", async () => {
    const user = await h.user();
    const body = { email: user.email.toUpperCase(), password: "correct horse battery" };
    expect((await h.call("POST", "/api/v1/auth/register", { body })).status).toBe(409);
    expect(
      (
        await h.call("POST", "/api/v1/auth/register", {
          body: { email: "x@example.com", password: "short" },
          valid: false,
        })
      ).status
    ).toBe(400);
    const form = await h.call("POST", "/api/v1/auth/register", {
      raw: "email=x",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      valid: false,
    });
    expect(form.status).toBe(415);
  });
});

describe("authentication", () => {
  it("needs a session or an API key", async () => {
    expect((await h.call("GET", "/api/v1/orgs")).status).toBe(401);
    expect((await h.call("GET", "/api/v1/orgs", { headers: { authorization: "Bearer not-a-drift-key" } })).status).toBe(
      401
    );
    expect(
      (await h.call("GET", "/api/v1/orgs", { key: "drift_unknownunknownunknownunknownunknownunkno" })).status
    ).toBe(401);
  });

  it("refuses a session for a user who no longer exists", async () => {
    expect((await h.call("GET", "/api/v1/orgs", { user: { id: "usr_000000000000000000000000" } })).status).toBe(401);
  });

  it("refuses sessions issued before the user's tokenVersion was raised (sign out everywhere)", async () => {
    const user = await h.user();
    expect((await h.call("GET", "/api/v1/orgs", { user })).status).toBe(200);
    await h.db.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    expect((await h.call("GET", "/api/v1/orgs", { user })).status).toBe(401);
    expect((await h.call("GET", "/api/v1/orgs", { user: { ...user, tokenVersion: 1 } })).status).toBe(200);
  });
});

describe("organisations and tenancy", () => {
  it("creates an organisation owned by its creator, with an audit entry", async () => {
    const org = await h.org();
    const mine = await h.call<{ orgs: { slug: string; role: string }[] }>("GET", "/api/v1/orgs", { user: org.owner });
    expect(mine.body.orgs).toEqual([expect.objectContaining({ slug: org.slug, role: "OWNER" })]);
    const audit = await h.call<{ entries: { action: string; actor: { user?: string } }[] }>(
      "GET",
      `/api/v1/orgs/${org.slug}/audit`,
      { user: org.owner }
    );
    expect(audit.body.entries).toEqual([
      expect.objectContaining({ action: "org.create", actor: { user: org.owner.id } }),
    ]);
  });

  it("refuses a slug that is taken or malformed", async () => {
    const org = await h.org();
    expect(
      (await h.call("POST", "/api/v1/orgs", { user: org.owner, body: { name: "Again", slug: org.slug } })).status
    ).toBe(409);
    expect(
      (
        await h.call("POST", "/api/v1/orgs", {
          user: org.owner,
          body: { name: "Bad", slug: "Not A Slug" },
          valid: false,
        })
      ).status
    ).toBe(400);
  });

  it("answers 404 for another organisation's resources, as if they did not exist (PLAN M5)", async () => {
    const [mine, theirs] = await Promise.all([h.org(), h.org()]);
    for (const path of ["projects", "keys", "members", "audit"]) {
      expect((await h.call("GET", `/api/v1/orgs/${theirs.slug}/${path}`, { user: mine.owner })).status).toBe(404);
    }
    const created = await h.call("POST", `/api/v1/orgs/${theirs.slug}/projects`, {
      user: mine.owner,
      body: { name: "X", slug: "x" },
    });
    expect(created.status).toBe(404);
    expect((await h.call("GET", "/api/v1/orgs/no-such-org/projects", { user: mine.owner })).status).toBe(404);
  });

  it("reads the role from the database on every request, so a change applies at once", async () => {
    const org = await h.org();
    const member = await h.user();
    await h.join(org.id, member.id, "VIEWER");
    const create = () =>
      h.call("POST", `/api/v1/orgs/${org.slug}/projects`, { user: member, body: { name: "P", slug: h.unique("p") } });
    expect((await create()).status).toBe(403);
    const changed = await h.call("PATCH", `/api/v1/orgs/${org.slug}/members/${member.id}`, {
      user: org.owner,
      body: { role: "ADMIN" },
    });
    expect(changed.status).toBe(200);
    expect((await create()).status).toBe(201); // the same session, no new sign-in
    await h.call("DELETE", `/api/v1/orgs/${org.slug}/members/${member.id}`, { user: org.owner });
    expect((await create()).status).toBe(404); // no longer a member
  });
});

describe("API keys", () => {
  async function orgWithProject() {
    const org = await h.org();
    const project = h.unique("api");
    await h.call("POST", `/api/v1/orgs/${org.slug}/projects`, {
      user: org.owner,
      body: { name: "API", slug: project },
    });
    return { ...org, project };
  }
  const createKey = (org: { slug: string; owner: { id: string } }, body: Record<string, unknown> = {}) =>
    h.call<{ key: string; apiKey: { id: string; prefix: string } }>("POST", `/api/v1/orgs/${org.slug}/keys`, {
      user: org.owner,
      body: { name: "CI", permissions: ["runs:read", "runs:write"], ...body },
    });

  it("shows a key once: the response has it, the list and the database never do", async () => {
    const org = await orgWithProject();
    const created = await createKey(org);
    expect(created.status).toBe(201);
    const { key, apiKey } = created.body;
    expect(key).toMatch(/^drift_[A-Za-z0-9_-]{43}$/);
    expect(apiKey.prefix).toBe(key.slice(0, 14));

    const list = await h.call<{ keys: unknown[] }>("GET", `/api/v1/orgs/${org.slug}/keys`, { user: org.owner });
    expect(list.body.keys).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(key);
    const row = await h.db.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } });
    expect(row.hash).toBe(hashApiKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it("only lets ADMIN and OWNER create keys: VIEWER and MEMBER get 403, and so does a key", async () => {
    const org = await orgWithProject();
    for (const role of ["VIEWER", "MEMBER"] as const) {
      const user = await h.user();
      await h.join(org.id, user.id, role);
      const reply = await h.call("POST", `/api/v1/orgs/${org.slug}/keys`, {
        user,
        body: { name: "CI", permissions: ["runs:write"] },
      });
      expect(reply.status).toBe(403);
      expect((await h.call("GET", `/api/v1/orgs/${org.slug}/keys`, { user })).status).toBe(403);
    }
    const admin = await h.user();
    await h.join(org.id, admin.id, "ADMIN");
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${org.slug}/keys`, {
          user: admin,
          body: { name: "CI", permissions: ["runs:write"] },
        })
      ).status
    ).toBe(201);
    const { key } = (await createKey(org)).body;
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${org.slug}/keys`, {
          key,
          body: { name: "More", permissions: ["runs:write"] },
        })
      ).status
    ).toBe(403);
    expect((await h.call("GET", "/api/v1/orgs", { key })).status).toBe(403);
    // Only run permissions can be put on a key.
    const admins = await h.call("POST", `/api/v1/orgs/${org.slug}/keys`, {
      user: org.owner,
      body: { name: "X", permissions: ["keys:write"] },
      valid: false,
    });
    expect(admins.status).toBe(400);
  });

  it("gets 401 once revoked or expired, and revocation and creation are audited", async () => {
    const org = await orgWithProject();
    const { key, apiKey } = (await createKey(org)).body;
    const use = (k: string) => h.call("GET", `/api/v1/projects/${org.project}/runs`, { key: k });
    expect((await use(key)).status).toBe(200);
    expect((await h.db.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } })).lastUsedAt).not.toBeNull();

    expect((await h.call("DELETE", `/api/v1/orgs/${org.slug}/keys/${apiKey.id}`, { user: org.owner })).status).toBe(
      204
    );
    expect((await use(key)).status).toBe(401);
    // Revoking again is fine and adds no second audit entry.
    expect((await h.call("DELETE", `/api/v1/orgs/${org.slug}/keys/${apiKey.id}`, { user: org.owner })).status).toBe(
      204
    );
    expect(
      (await h.call("DELETE", `/api/v1/orgs/${org.slug}/keys/key_000000000000000000000000`, { user: org.owner })).status
    ).toBe(404);

    const expired = (await createKey(org, { expiresAt: "2020-01-01T00:00:00Z" })).body.key;
    expect((await use(expired)).status).toBe(401);

    const audit = await h.call<{ entries: { action: string; target: { id: string }; metadata: unknown }[] }>(
      "GET",
      `/api/v1/orgs/${org.slug}/audit`,
      { user: org.owner }
    );
    const forKey = audit.body.entries.filter((entry) => entry.target.id === apiKey.id).map((entry) => entry.action);
    expect(forKey).toEqual(["key.revoke", "key.create"]);
    expect(JSON.stringify(audit.body)).not.toContain(key);
  });

  it("works only in its own organisation, and only in its project when it is scoped to one", async () => {
    const [org, other] = await Promise.all([orgWithProject(), orgWithProject()]);
    const second = h.unique("second");
    await h.call("POST", `/api/v1/orgs/${org.slug}/projects`, {
      user: org.owner,
      body: { name: "Second", slug: second },
    });
    const scoped = (await createKey(org, { project: org.project })).body.key;
    expect((await h.call("GET", `/api/v1/projects/${org.project}/runs`, { key: scoped })).status).toBe(200);
    expect((await h.call("GET", `/api/v1/projects/${second}/runs`, { key: scoped })).status).toBe(404);
    expect((await h.call("GET", `/api/v1/projects/${other.project}/runs`, { key: scoped })).status).toBe(404);
    expect((await h.call("GET", `/api/v1/orgs/${other.slug}/projects`, { key: scoped })).status).toBe(404);
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${org.slug}/keys`, {
          user: org.owner,
          body: { name: "X", project: "no-such", permissions: ["runs:read"] },
        })
      ).status
    ).toBe(404);
    // A key that may only write cannot read.
    const writeOnly = (await createKey(org, { permissions: ["runs:write"] })).body.key;
    expect((await h.call("GET", `/api/v1/projects/${org.project}/runs`, { key: writeOnly })).status).toBe(403);
  });
});
