import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useProfileStore } from "../store/profileStore";
import { getProfile } from "../db/profileRepository";
import { Colors } from "../theme/colors";

export function ProfileScreen() {
  const { profile, relationshipDays, setProfile } = useProfileStore();

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfile(p);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🌸</Text>
        <Text style={styles.days}>{relationshipDays}</Text>
        <Text style={styles.daysLabel}>天</Text>
        <Text style={styles.subtext}>
          从第一天到现在{"\n"}陪你走过了{" "}
          <Text style={styles.highlight}>{profile.total_conversations}</Text> 次对话
        </Text>
        <Text style={styles.footer}>就这样慢慢了解你 ✨</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emoji: { fontSize: 48, marginBottom: 12 },
  days: { fontSize: 56, fontWeight: "300", color: Colors.accentDark },
  daysLabel: { fontSize: 16, color: Colors.textSecondary, marginBottom: 20 },
  subtext: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", lineHeight: 24 },
  highlight: { color: Colors.accentDark, fontWeight: "600" },
  footer: { marginTop: 24, fontSize: 13, color: Colors.textMuted },
});
