import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { z } from 'zod';
import * as schema from './schema.js';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  SERPER_API_KEY: z.string().min(1).optional(),
});

const env = EnvSchema.parse(process.env);
const dbPath = env.DATABASE_URL ?? 'file:quality.db';

export const serperApiKey = env.SERPER_API_KEY;

const client = createClient({ url: dbPath });

export const db = drizzle(client, { schema });
