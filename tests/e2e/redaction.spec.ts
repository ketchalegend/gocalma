import path from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';

const TEST_RESULTS_DIR = path.resolve(process.cwd(), 'test-results');
const MIN_REDACTED_PDF_BYTES = 1024;
const MIN_KEY_FILE_BYTES = 256;

const CANONICAL_SAMPLES: Array<{ fileName: string; reviewTimeoutMs: number }> = [
  { fileName: 'sample_hospital_invoice_synthetic.pdf', reviewTimeoutMs: 60000 },
  { fileName: 'sample_social_security_notice_synthetic.pdf', reviewTimeoutMs: 60000 },
  { fileName: 'sample_scanned_admission_form_synthetic.pdf', reviewTimeoutMs: 120000 },
];

async function redactAndDownload(page: Page, sourceFileName: string, reviewTimeoutMs: number) {
  await page.goto('/');

  const sourcePath = path.resolve(process.cwd(), `sample-pdfs/${sourceFileName}`);
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]');
  await fileInput.setInputFiles(sourcePath);

  await expect(page.getByRole('heading', { name: /Review detections/i })).toBeVisible({ timeout: reviewTimeoutMs });

  const errorMessage = page.getByRole('alert');
  if (await errorMessage.count()) {
    throw new Error(`Upload processing failed for ${sourceFileName}: ${await errorMessage.first().textContent()}`);
  }

  await page.getByRole('button', { name: /Generate redacted outputs/i }).click();
  await expect(page.getByRole('heading', { name: /Download Outputs/i })).toBeVisible({ timeout: 30000 });

  const baseName = sourceFileName.replace(/\.pdf$/i, '');
  const redactedPdfPath = path.join(TEST_RESULTS_DIR, `${baseName}_redacted.pdf`);
  const keyFilePath = path.join(TEST_RESULTS_DIR, `${baseName}.gocalma`);

  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download redacted PDF/i }).click();
  const pdfDownload = await pdfDownloadPromise;
  await pdfDownload.saveAs(redactedPdfPath);

  const keyDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download key file/i }).click();
  const keyDownload = await keyDownloadPromise;
  await keyDownload.saveAs(keyFilePath);

  expect(fs.existsSync(redactedPdfPath)).toBe(true);
  expect(fs.existsSync(keyFilePath)).toBe(true);

  const redactedPdfSize = fs.statSync(redactedPdfPath).size;
  const keyFileSize = fs.statSync(keyFilePath).size;
  expect(redactedPdfSize).toBeGreaterThan(MIN_REDACTED_PDF_BYTES);
  expect(keyFileSize).toBeGreaterThan(MIN_KEY_FILE_BYTES);

  const redactedPdfHeader = fs.readFileSync(redactedPdfPath).subarray(0, 4).toString();
  expect(redactedPdfHeader).toBe('%PDF');
}

test('integration: redact canonical sample PDFs and export artifacts', async ({ page }) => {
  if (!fs.existsSync(TEST_RESULTS_DIR)) {
    fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  }

  for (const sample of CANONICAL_SAMPLES) {
    await redactAndDownload(page, sample.fileName, sample.reviewTimeoutMs);
  }
});

test('can unselect detections in review', async ({ page }) => {
  await page.goto('/');

  const filePath = path.resolve(process.cwd(), 'sample-pdfs/sample_social_security_notice_synthetic.pdf');
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(1000);

  // Wait for review stage
  await expect(page.getByText(/Processing document locally/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: /Review detections/i })).toBeVisible({ timeout: 60000 });
  
  // Verify initial selection
  await expect(page.getByText(/currently selected/i)).toBeVisible();

  // Test deselecting all
  await page.getByRole('button', { name: /Select none/i }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText(/0 currently selected/i)).toBeVisible({ timeout: 10000 });

  // Test selecting all
  await page.getByRole('button', { name: /Select all/i }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText(/\d+ currently selected/i)).toBeVisible({ timeout: 10000 });
});
