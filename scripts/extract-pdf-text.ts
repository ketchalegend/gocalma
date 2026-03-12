import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPdfFromBytes } from '../src/core/pdf/extractor';

const sampleDir = path.resolve(process.cwd(), 'sample-pdfs');
const outputPath = path.resolve(process.cwd(), '.tmp_extracted_text.txt');

async function run() {
  const files = (await readdir(sampleDir)).filter((file) => file.endsWith('.pdf')).sort();
  const lines: string[] = [];

  for (const fileName of files) {
    const bytes = new Uint8Array(await readFile(path.join(sampleDir, fileName)));
    const extracted = await extractPdfFromBytes(bytes, fileName);

    lines.push(`=== ${fileName}`);
    for (const page of extracted.pages) {
      lines.push(`--- PAGE ${page.page}`);
      lines.push(page.text);
    }
    lines.push('');
  }

  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
