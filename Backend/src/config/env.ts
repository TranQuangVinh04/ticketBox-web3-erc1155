import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Postgres (pgAdmin chỉ là GUI; app kết nối trực tiếp tới Postgres)
  // Ưu tiên dùng DATABASE_URL; nếu không có thì dùng các biến DB_* bên dưới.
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  // "true" để bật SSL (thường dùng khi deploy); local thường để trống/false.
  DB_SSL: z.string().optional()
});

export const env = EnvSchema.parse(process.env);

