import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    env: {
      SESSION_SECRET: 'x'.repeat(32),
      ADMIN_PASSWORD: 'test-password',
      DATABASE_URL: 'postgresql://quiz:quiz@localhost:5432/quiz_test',
      LLM_BASE_URL: 'https://example.invalid',
      LLM_API_KEY: 'test',
      LLM_MODEL: 'fake',
      USE_FAKE_AI: 'true',
      TEST_BYPASS_AUTH: 'true',
    },
  },
});
