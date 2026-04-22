import { getLLMClient, getModelName } from './client';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { GenerateResponseSchema, type GenerateResponse } from './schema';
import { fakeGenerateResponse } from './fake';

const MAX_RETRIES = 2;
const BACKOFF_MS = [1000, 3000];

export class GenerateError extends Error {
  constructor(msg: string, opts?: ErrorOptions) {
    super(msg, opts);
    this.name = 'GenerateError';
  }
}

export async function generateQuestions(sourceText: string): Promise<GenerateResponse> {
  if (process.env.USE_FAKE_AI === 'true') {
    return fakeGenerateResponse();
  }
  return generateRealWithRetry(sourceText);
}

async function generateRealWithRetry(sourceText: string): Promise<GenerateResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateOnce(sourceText);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
    }
  }
  throw new GenerateError('AI 生成失败（重试后仍未得到合法结果）', { cause: lastErr });
}

async function generateOnce(sourceText: string): Promise<GenerateResponse> {
  const client = getLLMClient();
  const model = getModelName();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(sourceText) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error('empty completion');
  const parsed = JSON.parse(content);
  return GenerateResponseSchema.parse(parsed);
}
