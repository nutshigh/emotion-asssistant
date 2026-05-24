import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Colors } from "../theme/colors";
import { clearProfile, exportProfile } from "../db/profileRepository";
import { useProfileStore } from "../store/profileStore";
import { DEFAULT_PROFILE } from "../types";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

export function SettingsScreen() {
  const { setProfile } = useProfileStore();

  const handleClear = () => {
    Alert.alert("确认清除", "这将清除所有关于你的记忆数据，无法恢复。确定继续吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "清除",
        style: "destructive",
        onPress: async () => {
          await clearProfile();
          setProfile({ ...DEFAULT_PROFILE, first_interaction: new Date().toISOString(), last_updated: new Date().toISOString() });
        },
      },
    ]);
  };

  const handleExport = async () => {
    try {
      const json = await exportProfile();
      const path = `${FileSystem.cacheDirectory}soulmate_profile.json`;
      await FileSystem.writeAsStringAsync(path, json);
      await Sharing.shareAsync(path, { mimeType: "application/json" });
    } catch {
      Alert.alert("导出失败", "无法导出数据，请稍后重试。");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={handleExport}>
          <Text style={styles.rowText}>导出我的数据</Text>
          <Text style={styles.rowArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={handleClear}>
          <Text style={[styles.rowText, styles.dangerText]}>清除所有记忆</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 16 },
  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  rowText: { fontSize: 15, color: Colors.text },
  rowArrow: { fontSize: 20, color: Colors.textMuted },
  dangerText: { color: Colors.danger },
});
