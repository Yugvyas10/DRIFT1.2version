/**
 * Engine identity. Recorded in every report and in every stage cache key (ADR-0006),
 * so a new engine version never reuses outputs computed by an older one.
 * `version.test.ts` keeps ENGINE_VERSION equal to this package's package.json version.
 */
export const ENGINE_NAME = "drift-engine";
export const ENGINE_VERSION = "0.0.0";
