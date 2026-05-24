import React, { useEffect, useRef } from "react";
import { View, FlatList, Text, StyleSheet, ActivityIndicator } from "react-native";
import { ChatBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import { sendMessage, triggerSummarize } from "../services/chatService";
import { getRecentMessages } from "../db/chatRepository";
import { getProfile } from "../db/profileRepository";
import { Colors } from "../theme/colors";

export function ChatScreen() {
  const { messages, isSending, currentReply, error, loadMessages, setError } = useChatStore();
  const { setProfile } = useProfileStore();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      const [msgs, profile] = await Promise.all([getRecentMessages(50), getProfile()]);
      loadMessages(msgs);
      setProfile(profile);
    })();
  }, []);

  const handleSend = async (text: string) => {
    await sendMessage(text);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isSending) {
      const timer = setTimeout(() => triggerSummarize(), 5000);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isSending]);

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
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
