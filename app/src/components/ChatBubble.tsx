import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";
import type { Message } from "../types";

interface Props {
  message: Message;
}

export function ChatBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.container, isUser ? styles.containerRight : styles.containerLeft]}>
      <View style={[styles.bubble, isUser ? styles.bubbleSelf : styles.bubbleOther]}>
        <Text style={styles.text}>{message.content}</Text>
        <Text style={styles.time}>
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4 },
  containerLeft: { alignItems: "flex-start" },
  containerRight: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bubbleOther: {
    backgroundColor: Colors.bgBubbleOther,
    borderBottomLeftRadius: 4,
  },
  bubbleSelf: {
    backgroundColor: Colors.bgBubbleSelf,
    borderBottomRightRadius: 4,
  },
  text: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  time: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: "right" },
});
