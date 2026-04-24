const VOICE = 'en-US-JennyNeural';
const RATE = '-10%';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text: string): string {
  return `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='${VOICE}'><prosody rate='${RATE}'>${escapeXml(text)}</prosody></voice></speak>`;
}

export async function synthesize(text: string): Promise<Buffer> {
  if (process.env.USE_FAKE_TTS === 'true') {
    const { fakeSynthesize } = await import('./azure-fake');
    return fakeSynthesize(text);
  }
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured');
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'quiz-tts',
    },
    body: buildSsml(text),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
