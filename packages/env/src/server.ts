import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BUCKET_ACCESS_KEY: z.string().min(1),
    BUCKET_ENDPOINT: z.url(),
    BUCKET_NAME: z.string().min(1),
    BUCKET_REGION: z.string().default("us-east-1"),
    BUCKET_SECRET_KEY: z.string().min(1),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ASSEMBLY_AI_API_KEY: z.string().min(1),
  },
});
