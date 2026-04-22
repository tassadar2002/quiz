import type { ParseResult } from './types';

export function parseSrt(text: string): ParseResult {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\d+$/.test(line)) continue;           // cue number
    if (/-->/.test(line)) continue;             // timestamp
    // HTML-ish inline formatting tags (<i>, <b>, <font ...>) — strip
    out.push(line.replace(/<[^>]+>/g, ''));
  }
  return { text: out.join(' ').replace(/\s+/g, ' ').trim() };
}
