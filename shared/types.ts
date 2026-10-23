export type Phase = 'idle' | 'connecting' | 'live' | 'closing' | 'closed' | 'incomplete' | 'error';
export type ActivityStatus = 'running' | 'completed' | 'failed';

export interface PersonaOption {
  id: string;
  label: string;
}

export interface ConsoleConfig {
  csrf: string;
  configured: boolean;
  model: string;
  backendModel: string;
  maxSessionSeconds: number;
  userPromptMaxChars: number;
  personas: PersonaOption[];
  studyDir: string;
  studyFiles: string[];
}

export interface StartOptions {
  persona: string;
  topicFile: string;
  userPrompt: string;
  studyDir: string;
  conversationId: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  persona: string;
  topicFile: string;
  userPrompt: string;
  studyDir: string;
  updatedAt: string;
}

export interface SessionStartEvent {
  type: 'session_start';
  persona: string;
  topicFile: string;
  userPrompt: string;
  studyDir: string;
  resumed: boolean;
}

export interface ConversationRecord {
  at: string;
  sessionId: string;
  event: ConsoleEvent | SessionStartEvent;
}

export type ConsoleEvent =
  | { type: 'ready'; startedAt: number; maxSessionSeconds: number }
  | {
      type: 'transcript';
      id: string;
      role: 'user' | 'assistant';
      text: string;
      startMs: number;
      endMs: number;
    }
  | { type: 'delegation'; id: string; status: ActivityStatus; detail: string }
  | {
      type: 'tool';
      id: string;
      delegationId: string;
      name: string;
      arguments: unknown;
      result: unknown;
      status: ActivityStatus;
    }
  | { type: 'backend_text'; id: string; text: string }
  | { type: 'usage'; seconds: number; inputTokens: number; outputTokens: number }
  | { type: 'closing'; reason: string }
  | {
      type: 'closed';
      finalized: boolean;
      reason: string;
      seconds: number | null;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: 'error'; code: string; message: string; action: string };

export interface TranscriptGroup {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  startMs: number;
  endMs: number;
}
