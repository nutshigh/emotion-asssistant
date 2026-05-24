import React, { useEffect, useRef, useCallback } from "react";
import { View, FlatList, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Alert, ScrollView } from "react-native";
import { ChatBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import { sendMessage, triggerSummarize } from "../services/chatService";
import { getRecentMessages, createSession, getSessions, deleteSession as dbDeleteSession } from "../db/chatRepository";
import { getProfile } from "../db/profileRepository";
import type { Session } from "../db/chatRepository";
import { Colors } from "../theme/colors";

export function ChatScreen() {
  const {
    messages, isSending, currentReply, error,
    loadMessages, setError,
    currentSessionId, setCurrentSessionId,
    sessions, setSessions, addSession, removeSession,
    drawerOpen, setDrawerOpen,
  } = useChatStore();
  const { setProfile } = useProfileStore();
  const flatListRef = useRef<FlatList>(null);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const msgs = await getRecentMessages(sessionId, 100);
    loadMessages(msgs);
  }, [loadMessages, setCurrentSessionId]);

  const initChat = useCallback(async () => {
    const [profile, allSessions] = await Promise.all([
      getProfile(),
      getSessions(),
    ]);
    setProfile(profile);

    let activeSessions = allSessions;
    if (activeSessions.length === 0) {
      const s = await createSession();
      activeSessions = [s];
    }
    setSessions(activeSessions);
    setCurrentSessionId(activeSessions[0].id);
    const msgs = await getRecentMessages(activeSessions[0].id, 100);
    loadMessages(msgs);
  }, []);

  useEffect(() => { initChat(); }, []);

  const handleSend = async (text: string) => {
    await sendMessage(text);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleNewSession = async () => {
    const s = await createSession();
    addSession(s);
    await loadSession(s.id);
    setDrawerOpen(false);
  };

  const handleSwitchSession = async (s: Session) => {
    await loadSession(s.id);
    setDrawerOpen(false);
  };

  const handleDeleteSession = (s: Session) => {
    if (sessions.length <= 1) {
      Alert.alert("提示", "至少保留一个会话");
      return;
    }
    Alert.alert("删除会话", `确定删除「${s.title}」吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除", style: "destructive",
        onPress: async () => {
          await dbDeleteSession(s.id);
          removeSession(s.id);
          if (currentSessionId === s.id) {
            const next = sessions.find((x) => x.id !== s.id) || sessions[0];
            if (next) await loadSession(next.id);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isSending) {
      const timer = setTimeout(() => triggerSummarize(), 5000);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isSending]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const DrawerContent = (
    <View style={drawerStyles.overlay}>
      <TouchableOpacity style={drawerStyles.backdrop} onPress={() => setDrawerOpen(false)} activeOpacity={1} />
      <View style={drawerStyles.panel}>
        <Text style={drawerStyles.title}>会话列表</Text>
        <TouchableOpacity style={drawerStyles.newBtn} onPress={handleNewSession}>
          <Text style={drawerStyles.newBtnText}>+ 新对话</Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }}>
          {sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[drawerStyles.item, s.id === currentSessionId && drawerStyles.itemActive]}
              onPress={() => handleSwitchSession(s)}
              onLongPress={() => handleDeleteSession(s)}
            >
              <View style={{ flex: 1 }}>
                <Text style={drawerStyles.itemTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={drawerStyles.itemTime}>
                  {new Date(s.last_active_at).toLocaleDateString("zh-CN")}
                </Text>
              </View>
              <Text style={drawerStyles.itemArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header bar with hamburger */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.menuBtn}>
          <Text style={styles.menuBtnText}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentSession?.title || "SoulMate"}
        </Text>
        <View style={styles.menuBtn} />
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss} onPress={() => setError(null)}>✕</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌸</Text>
            <Text style={styles.emptyText}>嗨，我在</Text>
            <Text style={styles.emptySubtext}>想聊什么都可以</Text>
          </View>
        }
        ListFooterComponent={
          isSending && currentReply === "" ? (
            <ActivityIndicator color={Colors.accent} style={{ padding: 16 }} />
          ) : null
        }
      />

      <ChatInput onSend={handleSend} disabled={isSending} />

      {/* Drawer Modal */}
      <Modal visible={drawerOpen} animationType="none" transparent onRequestClose={() => setDrawerOpen(false)}>
        {DrawerContent}
      </Modal>
    </View>
  );
}

const drawerStyles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  panel: {
    width: 280,
    backgroundColor: Colors.bg,
    paddingTop: 50,
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: "600", color: Colors.text, marginBottom: 16 },
  newBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  newBtnText: { color: Colors.white, fontWeight: "600", fontSize: 15 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemActive: { borderColor: Colors.accent, backgroundColor: "#FFF0E5" },
  itemTitle: { fontSize: 14, color: Colors.text, fontWeight: "500" },
  itemTime: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  itemArrow: { fontSize: 18, color: Colors.textMuted, marginLeft: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgHeader,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: Colors.text, flex: 1, textAlign: "center" },
  menuBtn: { width: 36, alignItems: "center" },
  menuBtnText: { fontSize: 22, color: Colors.accentDark },
  list: { paddingVertical: 8 },
  empty: { alignItems: "center", marginTop: 120 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 20, color: Colors.accentDark, fontWeight: "300" },
  emptySubtext: { fontSize: 14, color: Colors.textMuted, marginTop: 8 },
  errorBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF0E5",
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: { color: Colors.accentDark, fontSize: 13, flex: 1 },
  errorDismiss: { color: Colors.textMuted, fontSize: 16, paddingLeft: 12 },
});
