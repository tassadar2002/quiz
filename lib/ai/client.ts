import OpenAI from 'openai';

export function getLLMClient() {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) throw new Error('LLM_BASE_URL or LLM_API_KEY not set');
  return new OpenAI({ baseURL, apiKey });
}

export function getModelName(): string {
  return process.env.LLM_MODEL ?? 'deepseek-chat';
}
