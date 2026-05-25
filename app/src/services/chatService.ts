import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import {
  saveMessage,
  getRecentMessages,
  saveConversationSummary,
  updateSessionTitle,
  touchSession,
} from "../db/chatRepository";
import { saveProfile } from "../db/profileRepository";
import { streamChat as apiStreamChat, summarizeConversation } from "../api/client";
import { mergeProfileUpdates } from "./profileService";
import type { Message } from "../types";

export async function sendMessage(content: string): Promise<void> {
  const store = useChatStore.getState();
  const profileStore = useProfileStore.getState();

  store.setError(null);
  store.setSending(true);

  const sessionId = store.currentSessionId;

  const userMsg: Message = {
    id: `u_${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };

  store.addMessage(userMsg);
  await saveMessage({ ...userMsg, session_id: sessionId });

  // Auto-title: use first user message as session title
  const recentMessages = await getRecentMessages(sessionId, 30);
  const userMessages = recentMessages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    const title = content.slice(0, 20) + (content.length > 20 ? "..." : "");
    await updateSessionTitle(sessionId, title);
    store.updateSessionTitle(sessionId, title);
  }

  await touchSession(sessionId);
  const summaries = await (await import("../db/chatRepository")).getConversationSummaries(3);
  const summary = summaries.join("\n");

  store.clearReply();

  try {
    const stream = apiStreamChat({
      message: content,
      profile: profileStore.profile,
      conversation_summary: summary,
      recent_messages: recentMessages.slice(-20),
    });

    let fullReply = "";
    let clientTokenCount = 0;
    for await (const event of stream) {
      if (event.type === "token" && event.content) {
        clientTokenCount++;
        fullReply += event.content;
        store.appendToReply(event.content);
        // Diagnostic: log every token received on client
        console.log(`[client] RECV token #${clientTokenCount}: "${event.content}" (len=${event.content.length})`);
      }
    }
    console.log(`[client] Stream done. Total tokens: ${clientTokenCount}, fullReply (${fullReply.length} chars): "${fullReply}"`);

    const assistantMsg: Message = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: fullReply,
      timestamp: new Date().toISOString(),
    };
    store.addMessage(assistantMsg);
    await saveMessage({ ...assistantMsg, session_id: sessionId });
  } catch (err: any) {
    store.setError(err?.message || "发送失败，请检查网络后重试");
  } finally {
    store.setSending(false);
    store.clearReply();
  }
}

export async function triggerSummarize(): Promise<void> {
  const store = useChatStore.getState();
  const profileStore = useProfileStore.getState();

  if (store.messages.length < 10) return;

  try {
    const result = await summarizeConversation({
      messages: store.messages.slice(-30),
      profile: profileStore.profile,
    });

    if (result.conversation_summary) {
      await saveConversationSummary(result.conversation_summary);
    }

    if (result.profile_updates) {
      const merged = mergeProfileUpdates(profileStore.profile, result.profile_updates);
      profileStore.setProfile(merged);
      await saveProfile(merged);
    }
  } catch {
    // Silent fail — summarize is non-critical
  }
}
