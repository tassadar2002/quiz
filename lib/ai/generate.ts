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

export type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; response: GenerateResponse }
  | { type: 'error'; message: string };

export async function* generateQuestionsStream(
  sourceText: string,
): AsyncGenerator<StreamEvent> {
  if (process.env.USE_FAKE_AI === 'true') {
    const fake = fakeGenerateResponse();
    const json = JSON.stringify(fake, null, 2);
    const step = 80;
    for (let i = 0; i < json.length; i += step) {
      yield { type: 'chunk', text: json.slice(i, i + step) };
      await new Promise((r) => setTimeout(r, 20));
    }
    yield { type: 'done', response: fake };
    return;
  }

  let stream: AsyncIterable<{
    choices?: Array<{ delta?: { content?: string | null } | null }>;
  }>;
  try {
    const client = getLLMClient();
    const model = getModelName();
    stream = (await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(sourceText) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      stream: true,
    })) as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string | null } | null }>;
    }>;
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : 'LLM request failed',
    };
    return;
  }

  let full = '';
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        yield { type: 'chunk', text: delta };
      }
    }
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : 'LLM stream interrupted',
    };
    return;
  }

  try {
    const parsed = JSON.parse(full);
    const validated = GenerateResponseSchema.parse(parsed);
    yield { type: 'done', response: validated };
  } catch {
    yield {
      type: 'error',
      message: 'AI 生成失败（JSON 解析或类别分布校验不通过，可修改原文后重试）',
    };
  }
}
