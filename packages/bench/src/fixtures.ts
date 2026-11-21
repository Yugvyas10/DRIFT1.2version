/**
 * Real-world OpenAPI descriptions used to test DRIFT at scale (PLAN §6 M1, Q9).
 * Downloaded by script at pinned commits and verified by SHA-256, never vendored.
 * Licences were checked on 2026-09-26 via the GitHub API (both MIT).
 */
export interface Fixture {
  id: string;
  repository: string;
  commit: string;
  path: string;
  licence: string;
  sha256: string;
  bytes: number;
}

export const FIXTURES: readonly Fixture[] = [
  {
    id: "github-3.0",
    repository: "github/rest-api-description",
    commit: "c6721f32a17a71397ae46be21be90d7f1a173b6e",
    path: "descriptions/api.github.com/api.github.com.yaml",
    licence: "MIT",
    sha256: "1a521232d95580855858876d96bfffc7681e0dcd02139834b21fa0f293410ae9",
    bytes: 9878434,
  },
  {
    id: "github-3.1",
    repository: "github/rest-api-description",
    commit: "c6721f32a17a71397ae46be21be90d7f1a173b6e",
    path: "descriptions-next/api.github.com/api.github.com.yaml",
    licence: "MIT",
    sha256: "5cd3814c457ecb3af2c5a11563b8cc61e94ec1fa2bbca5437af736a66c380071",
    bytes: 9869314,
  },
  {
    id: "stripe-3.0",
    repository: "stripe/openapi",
    commit: "18fa2cc768024b47789dc6fa243acd48478acac2",
    path: "openapi/spec3.yaml",
    licence: "MIT",
    sha256: "50a7c326eaa50093447f124dbfd3330b717e44ea8fd5434d8ba76cbaf5bbaca3",
    bytes: 6629420,
  },
];

export function sourceUrl(fixture: Fixture): string {
  return `https://raw.githubusercontent.com/${fixture.repository}/${fixture.commit}/${fixture.path}`;
}

export function cacheFileName(fixture: Fixture): string {
  const extension = fixture.path.slice(fixture.path.lastIndexOf("."));
  return `${fixture.id}${extension}`;
}
