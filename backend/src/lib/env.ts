import { z } from "zod";

const envSchema = z.object({
  PORT: z
    .string()
    .default("3001")
    .transform(Number),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  KNOT_CLIENT_ID: z.string().min(1, "KNOT_CLIENT_ID is required"),
  KNOT_CLIENT_SECRET: z.string().min(1, "KNOT_CLIENT_SECRET is required"),
  KNOT_ENVIRONMENT: z
    .enum(["development", "production"])
    .default("development"),
  PHOTON_TEST_NUMBER: z.string().min(1, "PHOTON_TEST_NUMBER is required"),
  PHOTON_ADDRESS: z.string().optional(),
  PHOTON_TOKEN: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  WEBHOOK_BASE_URL: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function validateEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  _env = parsed.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}
