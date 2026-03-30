import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { z } from 'zod';
import * as schema from './schema.js';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
});

const env = EnvSchema.parse(process.env);
const dbPath = env.DATABASE_URL ?? 'file:quality.db';

const client = createClient({ url: dbPath });

export const db = drizzle(client, { schema });
