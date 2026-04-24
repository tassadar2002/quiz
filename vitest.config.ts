import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Shell env takes precedence over these defaults. If you run
//   DATABASE_URL=postgresql://my-other-host/other pnpm test
// that value wins.
const withDefault = (key: string, fallback: string) => process.env[key] ?? fallback;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
    setupFiles: ['./tests/setup-fakes.ts'],
    env: {
      SESSION_SECRET: withDefault('SESSION_SECRET', 'x'.repeat(32)),
      ADMIN_PASSWORD: withDefault('ADMIN_PASSWORD', 'test-password'),
      DATABASE_URL: withDefault(
        'DATABASE_URL',
        'postgresql://quiz:quiz@localhost:5432/quiz',
      ),
      LLM_BASE_URL: withDefault('LLM_BASE_URL', 'https://example.invalid'),
      LLM_API_KEY: withDefault('LLM_API_KEY', 'test'),
      LLM_MODEL: withDefault('LLM_MODEL', 'fake'),
      USE_FAKE_AI: withDefault('USE_FAKE_AI', 'true'),
      USE_FAKE_TTS: withDefault('USE_FAKE_TTS', 'true'),
      USE_FAKE_STORAGE: withDefault('USE_FAKE_STORAGE', 'true'),
      TEST_BYPASS_AUTH: withDefault('TEST_BYPASS_AUTH', 'true'),
    },
  },
});
