# Changesets

Version bumps and changelogs for the workspace packages. Every PR that changes a package's behaviour adds a changeset:

```bash
pnpm changeset
```

Packages are private for now (`privatePackages.version: true`), so changesets version them without publishing. `ENGINE_VERSION` in `packages/core` and `CLI_VERSION` in `packages/cli` are kept equal to their `package.json` versions by tests, so a version bump must update them too.
