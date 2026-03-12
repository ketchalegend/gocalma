import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPdfFromBytes } from '../src/core/pdf/extractor';
import { PIIDetector } from '../src/core/pii/detector';
import { scoreDetections } from '../src/core/metrics/scoring';
import { validateGroundTruthDocument } from '../src/core/ground-truth/schema';

const groundTruthDir = path.resolve(process.cwd(), 'ground-truth');
const samplePdfDir = path.resolve(process.cwd(), 'sample-pdfs');

async function run() {
  const files = (await readdir(groundTruthDir))
    .filter((file) => file.endsWith('.json') && file !== 'schema.json')
    .sort();
  const detector = new PIIDetector();

  let macroRecallTotal = 0;
  let evaluated = 0;
  let coreRecallTotal = 0;
  let coreEvaluated = 0;

  for (const gtFile of files) {
    const raw = JSON.parse(await readFile(path.join(groundTruthDir, gtFile), 'utf8'));
    const parsed = validateGroundTruthDocument(raw);

    if (!parsed.success) {
      console.error(`Invalid schema in ${gtFile}:`, parsed.error.issues[0]?.message);
      process.exitCode = 1;
      continue;
    }

    const gt = parsed.data;
    const bytes = new Uint8Array(await readFile(path.join(samplePdfDir, gt.fileName)));
    const extracted = await extractPdfFromBytes(bytes, gt.fileName);
    const detections = await detector.detect(extracted, { useRegex: true, useNER: false });

    const score = scoreDetections(detections, gt);
    macroRecallTotal += score.macroRecall;
    evaluated += 1;
    const isCoreDoc = gt.entities.some((entity) => entity.source === 'text');
    if (isCoreDoc) {
      coreRecallTotal += score.macroRecall;
      coreEvaluated += 1;
    }

    console.log(`\n[${gt.docId}] ${gt.fileName}`);
    console.log(`macro recall: ${(score.macroRecall * 100).toFixed(2)}%`);
    console.log(`macro f1: ${(score.macroF1 * 100).toFixed(2)}%`);
    score.perType.forEach((metric) => {
      console.log(
        `  ${metric.type.padEnd(18)} recall ${(metric.recall * 100).toFixed(1)}% precision ${(metric.precision * 100).toFixed(1)}%`,
      );
    });
  }

  if (evaluated > 0) {
    const overallRecall = macroRecallTotal / evaluated;
    const coreRecall = coreEvaluated > 0 ? coreRecallTotal / coreEvaluated : 0;
    console.log(`\nOverall macro recall: ${(overallRecall * 100).toFixed(2)}%`);
    console.log(`Core text-PDF macro recall: ${(coreRecall * 100).toFixed(2)}%`);
    if (coreRecall < 0.9) {
      console.log('Challenge gate not met: core text-PDF macro recall < 90%.');
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
