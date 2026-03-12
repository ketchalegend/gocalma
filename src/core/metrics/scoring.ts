import type { Detection, GroundTruthDocument, PiiType } from '../../types/domain';

export interface TypeMetrics {
  type: PiiType;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface ScoreResult {
  perType: TypeMetrics[];
  macroRecall: number;
  macroF1: number;
  totalTp: number;
  totalFp: number;
  totalFn: number;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchText(truth: string, prediction: string): boolean {
  const a = norm(truth);
  const b = norm(prediction);
  return a === b || a.includes(b) || b.includes(a);
}

export function scoreDetections(detections: Detection[], groundTruth: GroundTruthDocument): ScoreResult {
  const types = Array.from(new Set(groundTruth.entities.map((entity) => entity.type)));
  const perType: TypeMetrics[] = [];

  for (const type of types) {
    const truth = groundTruth.entities.filter((entity) => entity.type === type);
    const preds = detections.filter((detection) => detection.type === type);

    const matchedTruth = new Set<string>();
    const matchedPredictions = new Set<number>();

    preds.forEach((prediction, predictionIndex) => {
      const truthIndex = truth.findIndex(
        (entity, index) => !matchedTruth.has(`${type}:${index}`) && entity.page === prediction.page && matchText(entity.text, prediction.text),
      );

      if (truthIndex >= 0) {
        matchedTruth.add(`${type}:${truthIndex}`);
        matchedPredictions.add(predictionIndex);
      }
    });

    const tp = matchedPredictions.size;
    const fp = preds.length - tp;
    const fn = truth.length - tp;

    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    perType.push({ type, tp, fp, fn, precision, recall, f1 });
  }

  const totalTp = perType.reduce((sum, value) => sum + value.tp, 0);
  const totalFp = perType.reduce((sum, value) => sum + value.fp, 0);
  const totalFn = perType.reduce((sum, value) => sum + value.fn, 0);
  const macroRecall = perType.reduce((sum, value) => sum + value.recall, 0) / Math.max(perType.length, 1);
  const macroF1 = perType.reduce((sum, value) => sum + value.f1, 0) / Math.max(perType.length, 1);

  return { perType, macroRecall, macroF1, totalTp, totalFp, totalFn };
}
