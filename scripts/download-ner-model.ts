import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';
const TARGET_ROOT = path.resolve(process.cwd(), 'public', 'models', MODEL_ID);
const TARGET_RESOLVE_MAIN = path.resolve(TARGET_ROOT, 'resolve', 'main');
const API_URL = `https://huggingface.co/api/models/${MODEL_ID}`;

interface HfModelInfo {
  siblings?: Array<{ rfilename?: string }>;
}

function shouldDownload(file: string): boolean {
  if (!file) return false;
  if (file.startsWith('.')) return false;
  if (file.endsWith('.md')) return false;
  if (file.endsWith('.txt') && file !== 'vocab.txt') return false;
  return true;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function downloadFile(file: string): Promise<void> {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${file}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const targets = [path.join(TARGET_ROOT, file), path.join(TARGET_RESOLVE_MAIN, file)];
  for (const filePath of targets) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }
  process.stdout.write(`downloaded ${file}\n`);
}

async function main() {
  process.stdout.write(`Fetching file list for ${MODEL_ID}...\n`);
  const info = await fetchJson<HfModelInfo>(API_URL);
  const files = (info.siblings ?? [])
    .map((entry) => entry.rfilename ?? '')
    .filter(shouldDownload)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error('No model files found to download.');
  }

  process.stdout.write(`Downloading ${files.length} files into ${TARGET_ROOT}\n`);
  for (const file of files) {
    await downloadFile(file);
  }
  process.stdout.write('NER model download complete.\n');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`download failed: ${message}\n`);
  process.exit(1);
});
