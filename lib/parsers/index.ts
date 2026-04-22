import type { ParseResult } from './types';
import { parsePdf } from './pdf';
import { parseEpub } from './epub';
import { parseSrt } from './srt';

export type ParserKind = 'pdf' | 'epub' | 'srt';

export const SIZE_LIMITS: Record<ParserKind, number> = {
  pdf: 20 * 1024 * 1024,
  epub: 20 * 1024 * 1024,
  srt: 2 * 1024 * 1024,
};

export function detectKind(filename: string, buf: Buffer): ParserKind | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return buf.slice(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null;
  if (ext === 'epub') {
    // ZIP magic bytes: 0x50 0x4B 0x03 0x04
    return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
      ? 'epub'
      : null;
  }
  if (ext === 'srt') return 'srt';
  return null;
}

export async function parseFile(
  buf: Buffer,
  kind: ParserKind,
): Promise<ParseResult> {
  if (kind === 'pdf') return parsePdf(buf);
  if (kind === 'epub') return parseEpub(buf);
  return parseSrt(buf.toString('utf8'));
}

export type { ParseResult };
