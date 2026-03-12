import path from 'node:path';
import { test, expect } from '@playwright/test';

test('upload -> review -> generate -> download screen', async ({ page }) => {
  await page.goto('/');

  const filePath = path.resolve(process.cwd(), 'sample-pdfs/sample_hospital_invoice_synthetic.pdf');
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]');
  await fileInput.setInputFiles(filePath);

  await expect(page.getByRole('heading', { name: /Review Detections/i })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: /Generate redacted outputs/i })).toBeVisible();

  await page.getByRole('button', { name: /Generate redacted outputs/i }).click();

  await expect(page.getByRole('heading', { name: /Download Outputs/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /Download redacted PDF/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download key file/i })).toBeVisible();
});

test('can unselect detections in review', async ({ page }) => {
  await page.goto('/');

  const filePath = path.resolve(process.cwd(), 'sample-pdfs/sample_hospital_invoice_synthetic.pdf');
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]');
  await fileInput.setInputFiles(filePath);

  await expect(page.getByRole('heading', { name: /Review Detections/i })).toBeVisible({ timeout: 60000 });
  const selectedSummary = page.getByText(/selected$/i);
  await expect(selectedSummary).toBeVisible();

  await page.getByRole('button', { name: /Select none/i }).click();
  await expect(page.getByText(/^0 selected$/i)).toBeVisible();

  await page.getByRole('button', { name: /Select all/i }).click();
  await expect(page.getByText(/^\d+ selected$/i)).toBeVisible();
});
