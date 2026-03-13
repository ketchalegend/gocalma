import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OCR_LANGUAGES = ['eng', 'deu', 'fra', 'ita', 'spa'] as const;
const SOURCE_BASE_URL = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main';
const TARGET_ROOT = path.resolve(process.cwd(), 'public', 'tessdata');

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadLanguage(lang: string, targetPath: string): Promise<void> {
  const url = `${SOURCE_BASE_URL}/${lang}.traineddata`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(targetPath, bytes);
  process.stdout.write(`downloaded ${lang}.traineddata\n`);
}

async function provisionLanguage(lang: string): Promise<void> {
  const filename = `${lang}.traineddata`;
  const targetPath = path.join(TARGET_ROOT, filename);
  if (await fileExists(targetPath)) {
    process.stdout.write(`present ${filename}\n`);
    return;
  }

  await downloadLanguage(lang, targetPath);
}

async function main() {
  await mkdir(TARGET_ROOT, { recursive: true });
  process.stdout.write(`Provisioning OCR languages in ${TARGET_ROOT}\n`);

  for (const lang of OCR_LANGUAGES) {
    await provisionLanguage(lang);
  }

  process.stdout.write('OCR language provisioning complete.\n');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`download failed: ${message}\n`);
  process.exit(1);
});
