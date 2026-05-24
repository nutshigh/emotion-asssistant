// ---- User Profile ----
export interface UserProfile {
  version: number;
  last_updated: string;
  first_interaction: string;
  total_conversations: number;
  communication_style: {
    formality: number;
    verbosity: number;
    humor_level: number;
    emoji_usage: number;
    preferred_pronoun: string | null;
  };
  emotional_patterns: {
    common_moods: string[];
    stress_triggers: string[];
    coping_methods: string[];
    best_response_style: string;
  };
  interests_topics: Array<{ topic: string; confidence: number; frequency: string }>;
  life_context: {
    occupation: string;
    routine: string;
    important_relationships: string[];
    ongoing_challenges: string[];
  };
  interaction_preferences: {
    active_hours: string[];
    avg_session_minutes: number;
    response_length_preference: string;
  };
  relationship: {
    stage: "new" | "building" | "familiar" | "close";
    topics_to_avoid: string[];
    inside_jokes: string[];
    shared_context: string[];
  };
}

export const DEFAULT_PROFILE: UserProfile = {
  version: 1,
  last_updated: new Date().toISOString(),
  first_interaction: new Date().toISOString(),
  total_conversations: 0,
  communication_style: { formality: 0.5, verbosity: 0.5, humor_level: 0.5, emoji_usage: 0.5, preferred_pronoun: null },
  emotional_patterns: { common_moods: [], stress_triggers: [], coping_methods: [], best_response_style: "先共情再回应" },
  interests_topics: [],
  life_context: { occupation: "", routine: "", important_relationships: [], ongoing_challenges: [] },
  interaction_preferences: { active_hours: [], avg_session_minutes: 0, response_length_preference: "medium" },
  relationship: { stage: "new", topics_to_avoid: [], inside_jokes: [], shared_context: [] },
};

// ---- Message ----
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ---- API Contracts ----
export interface ChatRequest {
  message: string;
  profile: UserProfile;
  conversation_summary: string;
  recent_messages: Message[];
}

export interface ChatSSEEvent {
  type: "token" | "done";
  content?: string;
  message_id?: string;
}

export interface SummarizeRequest {
  messages: Message[];
  profile: UserProfile;
}

export interface SummarizeResponse {
  conversation_summary: string;
  profile_updates: Partial<UserProfile>;
  new_facts: string[];
}
