import { test, expect } from '@playwright/test';
import { seedKidData } from './setup';

test('kid completes a short-title quiz and sees results', async ({ page }) => {
  await seedKidData();

  await page.goto('/');
  await expect(page.getByText('__e2e_sentinel_9f3b_do_not_edit__')).toBeVisible();
  await page.getByText('__e2e_sentinel_9f3b_do_not_edit__').click();
  await page.getByText('E2E Short Title').click();
  await page.getByRole('link', { name: '开始 Quiz' }).click();

  // Answer each of 10 questions by clicking option A
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: /^A\./ }).click();
  }

  await expect(page.getByText(/得分 \d+ \/ 10/)).toBeVisible();
  const eitherResult = page.getByText('错题').or(page.getByText('全对了'));
  await expect(eitherResult.first()).toBeVisible();
});
