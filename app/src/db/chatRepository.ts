import { getDatabase } from "./database";
import type { Message } from "../types";

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO messages (id, role, content, timestamp) VALUES (?, ?, ?, ?)",
    [message.id, message.role, message.content, message.timestamp]
  );
}

export async function getRecentMessages(limit: number = 50): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string; role: string; content: string; timestamp: string;
  }>("SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?", [limit]);
  return rows.reverse().map((r) => ({ ...r, role: r.role as "user" | "assistant" }));
}

export async function getConversationSummaries(limit: number = 5): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ summary: string }>(
    "SELECT summary FROM conversation_summaries ORDER BY created_at DESC LIMIT ?", [limit]
  );
  return rows.map((r) => r.summary);
}

export async function saveConversationSummary(summary: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO conversation_summaries (summary, created_at) VALUES (?, ?)",
    [summary, new Date().toISOString()]
  );
}

export async function cleanOldMessages(daysAgo: number = 30): Promise<void> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString();
  await db.runAsync("DELETE FROM messages WHERE timestamp < ?", [cutoff]);
}
