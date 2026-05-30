import { test, expect } from '@playwright/test';

test('loads My Trips shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('My Trips')).toBeVisible();
});
