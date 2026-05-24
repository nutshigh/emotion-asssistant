import { getDatabase } from "./database";
import type { Message } from "../types";

export interface Session {
  id: string;
  title: string;
  created_at: string;
  last_active_at: string;
}

// -- Messages (scoped to session) --

export async function saveMessage(message: Message & { session_id: string }): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
    [message.id, message.session_id, message.role, message.content, message.timestamp]
  );
}

export async function getRecentMessages(sessionId: string, limit: number = 50): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string; role: string; content: string; timestamp: string;
  }>(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
    [sessionId, limit]
  );
  return rows.reverse().map((r) => ({ ...r, role: r.role as "user" | "assistant" }));
}

export async function getLastAssistantMessage(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ content: string }>(
    "SELECT content FROM messages WHERE role = 'assistant' ORDER BY timestamp DESC LIMIT 1"
  );
  return row?.content || "";
}

// -- Sessions --

export async function createSession(): Promise<Session> {
  const db = await getDatabase();
  const session: Session = {
    id: `s_${Date.now()}`,
    title: "新对话",
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  };
  await db.runAsync(
    "INSERT INTO sessions (id, title, created_at, last_active_at) VALUES (?, ?, ?, ?)",
    [session.id, session.title, session.created_at, session.last_active_at]
  );
  return session;
}

export async function getSessions(): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Session>(
    "SELECT * FROM sessions ORDER BY last_active_at DESC"
  );
  return rows;
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE sessions SET title = ?, last_active_at = ? WHERE id = ?", [
    title, new Date().toISOString(), sessionId,
  ]);
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE sessions SET last_active_at = ? WHERE id = ?", [
    new Date().toISOString(), sessionId,
  ]);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM messages WHERE session_id = ?", [sessionId]);
  await db.runAsync("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

// -- Summaries (cross-session) --

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
