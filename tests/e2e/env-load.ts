import { readFileSync } from 'node:fs';

// In CI we rely on explicit env vars from the workflow; never shadow
// them with a stray .env.local if one is ever committed by accident.
if (!process.env.CI) {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
    }
  } catch {}
}
