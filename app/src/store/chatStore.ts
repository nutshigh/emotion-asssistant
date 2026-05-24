import { create } from "zustand";
import type { Message } from "../types";

interface ChatState {
  messages: Message[];
  isSending: boolean;
  currentReply: string;
  error: string | null;

  addMessage: (msg: Message) => void;
  setSending: (sending: boolean) => void;
  appendToReply: (token: string) => void;
  clearReply: () => void;
  setError: (err: string | null) => void;
  loadMessages: (msgs: Message[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isSending: false,
  currentReply: "",
  error: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setSending: (sending) => set({ isSending: sending }),
  appendToReply: (token) => set((s) => ({ currentReply: s.currentReply + token })),
  clearReply: () => set({ currentReply: "" }),
  setError: (error) => set({ error }),
  loadMessages: (msgs) => set({ messages: msgs }),
}));
