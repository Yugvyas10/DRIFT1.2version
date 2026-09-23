import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters"),
  environment: z.string().default("Production"),
  specVersion: z.string().default("v1.0.0"),
});

export const apiKeySchema = z.object({
  name: z.string().min(2, "Key name must be at least 2 characters"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
