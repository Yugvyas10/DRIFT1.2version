import { describe, expect, it } from "vitest";
import { harness } from "../testing/harness";
import { checkCredentials, userForGitHub } from "./users";

const h = harness();
const PASSWORD = "correct horse battery"; // the harness registers every test user with this

describe("checkCredentials", () => {
  it("returns the user for the right password, whatever the case of the address", async () => {
    const user = await h.user("Dana");
    expect(await checkCredentials(h.db, user.email.toUpperCase(), PASSWORD)).toEqual({
      id: user.id,
      email: user.email,
      name: "Dana",
      tokenVersion: 0,
    });
  });

  it("returns nothing for a wrong password, an unknown address or a GitHub-only account", async () => {
    const user = await h.user();
    expect(await checkCredentials(h.db, user.email, "wrong horse battery")).toBeUndefined();
    expect(await checkCredentials(h.db, `${h.unique("nobody")}@example.com`, PASSWORD)).toBeUndefined();
    const github = await userForGitHub(h.db, {
      providerAccountId: h.unique("gh"),
      email: `${h.unique("octo")}@example.com`,
      name: null,
    });
    expect(await checkCredentials(h.db, github?.email ?? "", PASSWORD)).toBeUndefined();
  });
});

describe("userForGitHub", () => {
  it("creates a user for a new GitHub identity and returns the same user next time", async () => {
    const profile = { providerAccountId: h.unique("gh"), email: `${h.unique("Octo")}@Example.com`, name: "Octo Cat" };
    const first = await userForGitHub(h.db, profile);
    expect(first).toMatchObject({ email: profile.email.toLowerCase(), name: "Octo Cat", tokenVersion: 0 });
    // Later sign-ins find the identity, even if the address on GitHub changed.
    const again = await userForGitHub(h.db, { ...profile, email: "changed@example.com" });
    expect(again?.id).toBe(first?.id);
    expect(await h.db.account.count({ where: { userId: first?.id ?? "" } })).toBe(1);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: first?.id ?? "" } })).passwordHash).toBeNull();
  });

  it("refuses to take over a password account that has the same email address", async () => {
    const existing = await h.user();
    expect(
      await userForGitHub(h.db, { providerAccountId: h.unique("gh"), email: existing.email, name: "Impostor" })
    ).toBeUndefined();
    expect(await h.db.account.count({ where: { userId: existing.id } })).toBe(0);
    // The password account still works.
    expect((await checkCredentials(h.db, existing.email, PASSWORD))?.id).toBe(existing.id);
  });
});
