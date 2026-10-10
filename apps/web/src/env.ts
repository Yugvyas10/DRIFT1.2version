import { parseWebEnv } from "@/lib/env-schema";

/** Validated server environment. Import this instead of reading `process.env` directly. */
export const env = parseWebEnv(process.env);
