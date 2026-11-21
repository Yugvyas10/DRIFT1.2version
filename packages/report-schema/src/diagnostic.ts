import { z } from "zod";

/** Machine-readable diagnostic codes produced while loading and validating a spec. */
export const DIAGNOSTIC_CODES = [
  "FILE_READ_ERROR",
  "FILE_TOO_LARGE",
  "TOO_MANY_FILES",
  "SYNTAX_ERROR",
  "DUPLICATE_KEY",
  "ALIAS_LIMIT",
  "DEPTH_LIMIT",
  "NOT_AN_OBJECT",
  "UNSUPPORTED_VERSION",
  "OAS_SCHEMA",
  "REF_REMOTE_DISALLOWED",
  "REF_OUTSIDE_ROOT",
  "REF_NOT_FOUND",
  "REF_UNSUPPORTED",
  "PATH_TEMPLATE_CONFLICT",
  "PATH_PARAM_UNDECLARED",
] as const;

export const DiagnosticCode = z.enum(DIAGNOSTIC_CODES);
export type DiagnosticCode = z.infer<typeof DiagnosticCode>;

/** A located problem in a spec. Errors make a spec unusable; warnings do not. */
export const Diagnostic = z.object({
  severity: z.enum(["error", "warning"]),
  code: DiagnosticCode,
  message: z.string(),
  /** Display path of the file, as chosen by the caller (the CLI uses a path relative to the working directory). */
  file: z.string(),
  /** JSON pointer inside the file, when the problem is at a specific value. */
  pointer: z.string().optional(),
  /** 1-based line and column, when they could be determined. */
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
});
export type Diagnostic = z.infer<typeof Diagnostic>;
