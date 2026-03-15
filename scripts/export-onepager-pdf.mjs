import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const inputPath = path.join(root, 'docs', 'onepager.html');
const outputPath = path.join(root, 'docs', 'GoCalma-OnePager.pdf');

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(inputPath).href, { waitUntil: 'load' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  console.log(outputPath);
} finally {
  await browser.close();
}
