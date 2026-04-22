import { describe, it, expect } from 'vitest';
import { parseSrt } from './srt';

describe('parseSrt', () => {
  it('strips cue numbers, timestamps, and blank lines', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,500 --> 00:00:08,000
This is a subtitle.
`;
    expect(parseSrt(srt).text).toBe('Hello, world! This is a subtitle.');
  });

  it('handles CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nOne line.\r\n\r\n';
    expect(parseSrt(srt).text).toBe('One line.');
  });

  it('strips HTML-ish formatting', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
<i>Italic</i> and <b>bold</b>.
`;
    expect(parseSrt(srt).text).toBe('Italic and bold.');
  });

  it('returns empty text for an empty file', () => {
    expect(parseSrt('').text).toBe('');
  });
});
