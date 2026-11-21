import { describe, expect, it } from "vitest";
import { harness } from "../testing/harness";

const h = harness();

interface Invited {
  token: string;
  invitation: { id: string; email: string; role: string };
}

describe("invitations", () => {
  it("invites by email with a token shown once, and the invited user joins with it", async () => {
    const org = await h.org();
    const guest = await h.user();
    const invited = await h.call<Invited>("POST", `/api/v1/orgs/${org.slug}/invitations`, {
      user: org.owner,
      body: { email: guest.email.toUpperCase(), role: "MEMBER" },
    });
    expect(invited.status).toBe(201);
    const { token, invitation } = invited.body;
    const row = await h.db.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);

    const joined = await h.call("POST", "/api/v1/invitations/accept", { user: guest, body: { token } });
    expect(joined).toMatchObject({ status: 200, body: { org: org.slug, role: "MEMBER" } });
    const members = await h.call<{ members: { email: string; role: string }[] }>(
      "GET",
      `/api/v1/orgs/${org.slug}/members`,
      { user: guest }
    );
    expect(members.body.members.map((m) => `${m.email} ${m.role}`)).toEqual([
      `${org.owner.email} OWNER`,
      `${guest.email} MEMBER`,
    ]);

    // A used token works for nobody.
    expect((await h.call("POST", "/api/v1/invitations/accept", { user: guest, body: { token } })).status).toBe(404);
    const audit = await h.call<{ entries: { action: string }[] }>("GET", `/api/v1/orgs/${org.slug}/audit`, {
      user: org.owner,
    });
    expect(audit.body.entries.map((e) => e.action)).toEqual(["member.join", "member.invite", "org.create"]);
  });

  it("only works for the invited address, before it expires, and not for members", async () => {
    const org = await h.org();
    const [guest, thief] = await Promise.all([h.user(), h.user()]);
    const { token, invitation } = (
      await h.call<Invited>("POST", `/api/v1/orgs/${org.slug}/invitations`, {
        user: org.owner,
        body: { email: guest.email, role: "VIEWER" },
      })
    ).body;
    expect((await h.call("POST", "/api/v1/invitations/accept", { user: thief, body: { token } })).status).toBe(404);
    expect(
      (await h.call("POST", "/api/v1/invitations/accept", { user: guest, body: { token: "x".repeat(43) } })).status
    ).toBe(404);
    expect((await h.call("POST", "/api/v1/invitations/accept", { body: { token } })).status).toBe(401);

    await h.db.invitation.update({ where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await h.call("POST", "/api/v1/invitations/accept", { user: guest, body: { token } })).status).toBe(404);

    const again = (
      await h.call<Invited>("POST", `/api/v1/orgs/${org.slug}/invitations`, {
        user: org.owner,
        body: { email: guest.email, role: "VIEWER" },
      })
    ).body;
    await h.join(org.id, guest.id, "VIEWER");
    expect(
      (await h.call("POST", "/api/v1/invitations/accept", { user: guest, body: { token: again.token } })).status
    ).toBe(409);
    expect(
      (
        await h.call("POST", `/api/v1/orgs/${org.slug}/invitations`, {
          user: org.owner,
          body: { email: guest.email, role: "VIEWER" },
        })
      ).status
    ).toBe(409);
  });

  it("cannot be used to hand out a role above the inviter's reach", async () => {
    const org = await h.org();
    const [admin, member] = await Promise.all([h.user(), h.user()]);
    await h.join(org.id, admin.id, "ADMIN");
    await h.join(org.id, member.id, "MEMBER");
    const invite = (user: { id: string }, role: string) =>
      h.call("POST", `/api/v1/orgs/${org.slug}/invitations`, {
        user,
        body: { email: `${h.unique("new")}@example.com`, role },
      });
    expect((await invite(member, "VIEWER")).status).toBe(403);
    expect((await invite(admin, "OWNER")).status).toBe(403);
    expect((await invite(admin, "ADMIN")).status).toBe(201);
    expect((await invite(org.owner, "OWNER")).status).toBe(201);
  });
});

describe("roles and membership", () => {
  it("changes a role with an audit entry, within what the actor may assign", async () => {
    const org = await h.org();
    const [admin, member] = await Promise.all([h.user(), h.user()]);
    await h.join(org.id, admin.id, "ADMIN");
    await h.join(org.id, member.id, "MEMBER");
    const change = (user: { id: string }, target: string, role: string) =>
      h.call("PATCH", `/api/v1/orgs/${org.slug}/members/${target}`, { user, body: { role } });

    expect((await change(member, admin.id, "VIEWER")).status).toBe(403);
    expect((await change(admin, member.id, "OWNER")).status).toBe(403);
    expect((await change(admin, org.owner.id, "MEMBER")).status).toBe(403);
    expect((await change(admin, "usr_000000000000000000000000", "VIEWER")).status).toBe(404);
    expect(await change(admin, member.id, "VIEWER")).toMatchObject({
      status: 200,
      body: { member: { role: "VIEWER" } },
    });
    // Assigning the role someone already has changes nothing and is not audited.
    expect((await change(admin, member.id, "VIEWER")).status).toBe(200);

    const audit = await h.call<{ entries: { action: string; metadata: unknown; target: { id: string } }[] }>(
      "GET",
      `/api/v1/orgs/${org.slug}/audit`,
      { user: admin }
    );
    expect(audit.body.entries.filter((e) => e.action === "member.role_change")).toEqual([
      expect.objectContaining({ target: { type: "user", id: member.id }, metadata: { from: "MEMBER", to: "VIEWER" } }),
    ]);
  });

  it("always keeps one owner", async () => {
    const org = await h.org();
    const path = `/api/v1/orgs/${org.slug}/members/${org.owner.id}`;
    expect((await h.call("PATCH", path, { user: org.owner, body: { role: "ADMIN" } })).status).toBe(409);
    expect((await h.call("DELETE", path, { user: org.owner })).status).toBe(409);
    const second = await h.user();
    await h.join(org.id, second.id, "OWNER");
    expect((await h.call("PATCH", path, { user: org.owner, body: { role: "ADMIN" } })).status).toBe(200);
  });

  it("lets a member leave, an admin remove members, and nobody remove someone above them", async () => {
    const org = await h.org();
    const [admin, member, viewer] = await Promise.all([h.user(), h.user(), h.user()]);
    await h.join(org.id, admin.id, "ADMIN");
    await h.join(org.id, member.id, "MEMBER");
    await h.join(org.id, viewer.id, "VIEWER");
    const remove = (user: { id: string }, target: string) =>
      h.call("DELETE", `/api/v1/orgs/${org.slug}/members/${target}`, { user });
    expect((await remove(member, viewer.id)).status).toBe(403);
    expect((await remove(admin, org.owner.id)).status).toBe(403);
    expect((await remove(viewer, viewer.id)).status).toBe(204); // leaving
    expect((await remove(admin, member.id)).status).toBe(204);
    expect((await remove(admin, member.id)).status).toBe(404);
    expect((await h.call("GET", `/api/v1/orgs/${org.slug}/members`, { user: member })).status).toBe(404);
  });
});
