import { describe, it, expect } from 'vitest';
import { detectKind } from './index';

const pdfHeader = Buffer.from('%PDF-1.4\n%...');
const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const junk = Buffer.from('hello');

describe('detectKind', () => {
  it('accepts .pdf with %PDF- header', () => {
    expect(detectKind('book.pdf', pdfHeader)).toBe('pdf');
  });
  it('rejects .pdf without correct header', () => {
    expect(detectKind('book.pdf', junk)).toBe(null);
  });
  it('accepts .epub with ZIP header', () => {
    expect(detectKind('book.epub', zipHeader)).toBe('epub');
  });
  it('rejects .epub without ZIP header', () => {
    expect(detectKind('book.epub', junk)).toBe(null);
  });
  it('accepts .srt by extension alone', () => {
    expect(detectKind('subs.srt', Buffer.from('1\n00:00:01 --> 00:00:02\nhi'))).toBe(
      'srt',
    );
  });
  it('is case-insensitive on extension', () => {
    expect(detectKind('BOOK.PDF', pdfHeader)).toBe('pdf');
  });
  it('rejects unknown extension', () => {
    expect(detectKind('book.txt', junk)).toBe(null);
  });
});
