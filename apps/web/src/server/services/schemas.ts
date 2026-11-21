import { z } from "zod";
import { PasswordSchema } from "../auth/password";
import { API_KEY_PERMISSIONS } from "../auth/permissions";

/** Request bodies of the management API. The same shapes are in apps/web/openapi/drift-api.yaml. */

export const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Use lower-case letters, digits and hyphens");
export const Name = z.string().trim().min(1).max(100);
export const Email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const RoleName = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

export const Register = z.strictObject({ email: Email, password: PasswordSchema, name: Name.optional() });
export const OrgCreate = z.strictObject({ name: Name, slug: Slug });
export const ProjectCreate = z.strictObject({
  name: Name,
  slug: Slug,
  repo: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "Use owner/name")
    .optional(),
  specPath: z.string().min(1).max(500).optional(),
});
export const KeyCreate = z.strictObject({
  name: Name,
  project: Slug.optional(),
  permissions: z.array(z.enum(API_KEY_PERMISSIONS)).min(1).max(API_KEY_PERMISSIONS.length),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export const InvitationCreate = z.strictObject({ email: Email, role: RoleName });
export const InvitationAccept = z.strictObject({ token: z.string().min(20).max(200) });
export const RoleChange = z.strictObject({ role: RoleName });
export const SuppressionCreate = z.strictObject({
  changeId: z.string().regex(/^[0-9a-f]{16}$/, "Use the 16-character change id from a report"),
  reason: z.string().trim().min(10, "Say why, in at least 10 characters").max(500),
  expiresAt: z.iso.datetime({ offset: true }),
});
