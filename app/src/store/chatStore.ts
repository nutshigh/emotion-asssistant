import { create } from "zustand";
import type { Message } from "../types";
import type { Session } from "../db/chatRepository";

interface ChatState {
  messages: Message[];
  isSending: boolean;
  currentReply: string;
  error: string | null;
  currentSessionId: string;
  sessions: Session[];
  drawerOpen: boolean;

  addMessage: (msg: Message) => void;
  setSending: (sending: boolean) => void;
  appendToReply: (token: string) => void;
  clearReply: () => void;
  setError: (err: string | null) => void;
  loadMessages: (msgs: Message[]) => void;
  setCurrentSessionId: (id: string) => void;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isSending: false,
  currentReply: "",
  error: null,
  currentSessionId: "",
  sessions: [],
  drawerOpen: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setSending: (sending) => set({ isSending: sending }),
  appendToReply: (token) => set((s) => ({ currentReply: s.currentReply + token })),
  clearReply: () => set({ currentReply: "" }),
  setError: (error) => set({ error }),
  loadMessages: (msgs) => set({ messages: msgs }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) })),
  updateSessionTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
    })),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
