import { z } from 'zod';

// Drizzle's $type<string[]>() is compile-time only. This runtime gate
// catches malformed rows (e.g. from a manual SQL patch) before they
// hit a render that would crash with a less helpful stack.
const OptionsSchema = z.array(z.string()).length(3);

export function parseOptions(raw: unknown): string[] {
  const result = OptionsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `question.options is malformed (expected 3-string array): ${JSON.stringify(raw)}`,
    );
  }
  return result.data;
}
