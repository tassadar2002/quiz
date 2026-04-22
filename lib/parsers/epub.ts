import { EPub } from 'epub2';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ParseResult } from './types';

function stripHtml(html: string): string {
  // Kill script/style blocks wholesale, then tags, then whitespace-normalize.
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const noTags = noScript.replace(/<[^>]+>/g, ' ');
  return noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parseEpub(buf: Buffer): Promise<ParseResult> {
  const path = join(tmpdir(), `quiz-${randomUUID()}.epub`);
  await fs.writeFile(path, buf);
  try {
    const epub = await EPub.createAsync(path);
    const chapters: NonNullable<ParseResult['chapters']> = [];
    for (const item of epub.flow) {
      if (!item.id) continue;
      try {
        const raw = await epub.getChapterAsync(item.id);
        const text = stripHtml(raw);
        if (!text) continue;
        chapters.push({
          id: item.id,
          title: item.title?.trim() || item.id,
          text,
        });
      } catch {
        // Skip unreadable spine items rather than failing the whole parse.
        continue;
      }
    }
    const fullText = chapters.map((c) => c.text).join('\n\n');
    return { text: fullText, chapters };
  } finally {
    await fs.unlink(path).catch(() => {});
  }
}
