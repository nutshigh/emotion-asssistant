// backend/src/services/promptBuilder.ts
import type { UserProfile } from "../../../shared/types";

export function buildSystemPrompt(profile: UserProfile, conversationSummary: string): string {
  const parts: string[] = [];

  // Fixed base — cached
  parts.push(`你是 SoulMate，一个情感陪护助手。核心原则：
1. 真诚共情，不用模板化语言回复
2. 记住用户说过的重要事情，在合适的时候自然提起
3. 人格随交互进化，不刻意迎合用户
4. 安全边界：不鼓励自伤、不提供医疗诊断、不替代专业心理治疗
5. 用中文回复，语气自然温暖，像朋友聊天`);

  // Profile injection
  const profileLines: string[] = [];
  const ctx = profile.life_context;
  if (ctx.occupation) profileLines.push(`用户职业：${ctx.occupation}`);
  if (ctx.routine) profileLines.push(`日常节奏：${ctx.routine}`);
  if (ctx.important_relationships.length > 0) profileLines.push(`重要关系：${ctx.important_relationships.join("、")}`);
  if (ctx.ongoing_challenges.length > 0) profileLines.push(`当前挑战：${ctx.ongoing_challenges.join("、")}`);

  const comm = profile.communication_style;
  profileLines.push(`沟通偏好：${comm.formality < 0.4 ? "偏随意" : comm.formality > 0.6 ? "偏正式" : "自然"}，${comm.verbosity < 0.4 ? "回复简洁" : comm.verbosity > 0.6 ? "喜欢详细展开" : "适中的回复长度"}${comm.humor_level > 0.6 ? "，可以适当幽默" : ""}${comm.emoji_usage > 0.6 ? "，可以适当用 emoji" : ""}`);

  const emo = profile.emotional_patterns;
  if (emo.common_moods.length > 0) profileLines.push(`常见情绪：${emo.common_moods.join("、")}`);
  if (emo.best_response_style) profileLines.push(`最佳回应方式：${emo.best_response_style}`);

  if (profile.interests_topics.length > 0) {
    profileLines.push(`兴趣话题：${profile.interests_topics.map((t) => t.topic).join("、")}`);
  }

  const rel = profile.relationship;
  profileLines.push(`关系阶段：${rel.stage === "new" ? "刚认识" : rel.stage === "building" ? "熟悉中" : rel.stage === "familiar" ? "很熟悉了" : "亲密"}`);
  if (rel.topics_to_avoid.length > 0) profileLines.push(`回避话题：${rel.topics_to_avoid.join("、")}`);

  if (profileLines.length > 0) {
    parts.push(`\n【用户画像】\n${profileLines.join("\n")}`);
  }

  // Conversation context
  if (conversationSummary) {
    parts.push(`\n【近期对话】\n${conversationSummary}`);
  }

  return parts.join("\n");
}
