import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const images = sqliteTable('images', {
  url: text('url').primaryKey(),
  artist: text('artist').notNull(),
  source: text('source'),
  score: real('score').default(0),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const qualitySignals = sqliteTable('quality_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  artist: text('artist').notNull(),
  action: text('action').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
