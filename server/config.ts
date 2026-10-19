import { existsSync, realpathSync, statSync } from 'node:fs';

export interface Settings {
  apiKey: string;
  backendModel: string;
  port: number;
  origin: string;
  studyDir: string;
  maxSessionSeconds: number;
  closeTimeoutMs: number;
  maxDelegations: number;
  maxToolCalls: number;
  maxToolRounds: number;
  backendMaxOutputTokens: number;
  backendResultMaxChars: number;
  topicMaxChars: number;
  readMaxChars: number;
}

export const STUDY_FILE_EXTENSIONS = ['.md', '.txt'];

export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): Settings {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key];
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
    return value;
  };
  const port = integer('PORT', 3000, 1024, 65535);
  const backendModel = env.OPENAI_BACKEND_MODEL?.trim() || 'gpt-5.4-mini';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(backendModel))
    throw new Error('OPENAI_BACKEND_MODEL must be a model ID.');
  if (env.HOST && env.HOST !== '127.0.0.1') throw new Error('This app only supports HOST=127.0.0.1.');
  const studyDirRaw = env.STUDY_DIR?.trim() || '';
  if (!studyDirRaw || !existsSync(studyDirRaw) || !statSync(studyDirRaw).isDirectory())
    throw new Error('STUDY_DIR must be set to an existing folder in .env.');
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || '',
    backendModel,
    port,
    origin: `http://127.0.0.1:${port}`,
    studyDir: realpathSync(studyDirRaw),
    maxSessionSeconds: integer('MAX_SESSION_SECONDS', 1800, 60, 3600),
    closeTimeoutMs: 20000,
    maxDelegations: integer('MAX_DELEGATIONS', 100, 1, 1000),
    maxToolCalls: integer('MAX_TOOL_CALLS', 300, 1, 3000),
    maxToolRounds: integer('MAX_TOOL_ROUNDS', 6, 1, 20),
    backendMaxOutputTokens: integer('BACKEND_MAX_OUTPUT_TOKENS', 2000, 256, 16000),
    backendResultMaxChars: integer('BACKEND_RESULT_MAX_CHARS', 4000, 400, 20000),
    topicMaxChars: integer('TOPIC_MAX_CHARS', 20000, 1000, 200000),
    readMaxChars: integer('READ_MAX_CHARS', 20000, 1000, 200000),
  };
}
