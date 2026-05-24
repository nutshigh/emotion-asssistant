import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import { saveMessage, getRecentMessages, saveConversationSummary } from "../db/chatRepository";
import { saveProfile } from "../db/profileRepository";
import { streamChat as apiStreamChat, summarizeConversation } from "../api/client";
import { mergeProfileUpdates } from "./profileService";
import type { Message } from "../types";

export async function sendMessage(content: string): Promise<void> {
  const store = useChatStore.getState();
  const profileStore = useProfileStore.getState();

  store.setError(null);
  store.setSending(true);

  const userMsg: Message = {
    id: `u_${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };

  store.addMessage(userMsg);
  await saveMessage(userMsg);

  const recentMessages = await getRecentMessages(30);
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
    for await (const event of stream) {
      if (event.type === "token" && event.content) {
        fullReply += event.content;
        store.appendToReply(event.content);
      }
    }

    const assistantMsg: Message = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: fullReply,
      timestamp: new Date().toISOString(),
    };
    store.addMessage(assistantMsg);
    await saveMessage(assistantMsg);
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
