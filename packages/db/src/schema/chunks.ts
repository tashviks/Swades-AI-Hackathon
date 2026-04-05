import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const chunks = pgTable("chunks", {
  ackedAt: timestamp("acked_at").notNull().defaultNow(),
  bucketKey: text("bucket_key").notNull(),
  id: uuid("id").primaryKey(),
  reconciled: boolean("reconciled").notNull().default(false),
  sessionId: text("session_id").notNull(),
  transcript: text("transcript"),
  userName: text("user_name").notNull().default("Unknown"),
});
