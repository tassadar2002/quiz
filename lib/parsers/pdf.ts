import { PDFParse } from 'pdf-parse';
import type { ParseResult } from './types';

export async function parsePdf(buf: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const res = await parser.getText();
    return { text: res.text.replace(/\r\n/g, '\n').trim() };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
