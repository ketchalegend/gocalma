import { useState } from 'react';
import type { Detection, GroundTruthDocument, GroundTruthEntity } from '../types/domain';
import { extractPdf } from '../core/pdf/extractor';
import { PIIDetector } from '../core/pii/detector';
import { PII_TYPES } from '../types/domain';
import { validateGroundTruthDocument } from '../core/ground-truth/schema';
import { downloadBlob } from './download';

const detector = new PIIDetector();

function toGroundTruth(docId: string, fileName: string, detections: Detection[]): GroundTruthDocument {
  const entities: GroundTruthEntity[] = detections.map((detection, index) => ({
    id: `gt-${(index + 1).toString().padStart(4, '0')}`,
    docId,
    page: detection.page,
    type: detection.type,
    text: detection.text,
    bbox: detection.bbox,
    start: detection.start,
    end: detection.end,
    source: detection.source === 'ocr' ? 'ocr' : 'text',
  }));

  return {
    schemaVersion: '1.0.0',
    docId,
    fileName,
    generatedAt: new Date().toISOString(),
    entities,
  };
}

export function GroundTruthTool() {
  const [docId, setDocId] = useState('sample-doc');
  const [groundTruth, setGroundTruth] = useState<GroundTruthDocument | null>(null);
  const [status, setStatus] = useState('Upload a PDF to generate editable labels.');

  async function handleFile(file: File) {
    setStatus('Extracting and running detector...');
    const extracted = await extractPdf(file);
    const detections = await detector.detect(extracted, { useRegex: true, useNER: false, aggressiveLineMode: false });
    setGroundTruth(toGroundTruth(docId, file.name, detections));
    setStatus(`Generated ${detections.length} candidate entities. Review and export.`);
  }

  function updateEntity(index: number, patch: Partial<GroundTruthEntity>) {
    setGroundTruth((current) => {
      if (!current) return current;
      const entities = [...current.entities];
      entities[index] = { ...entities[index], ...patch };
      return { ...current, entities };
    });
  }

  function removeEntity(index: number) {
    setGroundTruth((current) => {
      if (!current) return current;
      return {
        ...current,
        entities: current.entities.filter((_, entityIndex) => entityIndex !== index),
      };
    });
  }

  function exportGroundTruth() {
    if (!groundTruth) return;

    const parsed = validateGroundTruthDocument(groundTruth);
    if (!parsed.success) {
      setStatus(`Schema validation failed: ${parsed.error.issues[0]?.message ?? 'unknown error'}`);
      return;
    }

    const blob = new Blob([JSON.stringify(groundTruth, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${groundTruth.docId}.json`);
    setStatus('Ground truth exported successfully.');
  }

  return (
    <section>
      <h2>Ground Truth Builder</h2>
      <p>{status}</p>

      <label>
        Document ID
        <input value={docId} onChange={(event) => setDocId(event.currentTarget.value)} />
      </label>

      <label className="file-input">
        Upload PDF for annotations
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </label>

      {groundTruth && (
        <>
          <div className="actions">
            <button type="button" onClick={exportGroundTruth}>
              Export ground truth JSON
            </button>
          </div>
          <div className="detection-grid">
            {groundTruth.entities.map((entity, index) => (
              <div key={entity.id} className="detection-card">
                <label>
                  Type
                  <select
                    value={entity.type}
                    onChange={(event) => updateEntity(index, { type: event.currentTarget.value as GroundTruthEntity['type'] })}
                  >
                    {PII_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Text
                  <input value={entity.text} onChange={(event) => updateEntity(index, { text: event.currentTarget.value })} />
                </label>
                <label>
                  Page
                  <input
                    type="number"
                    min={1}
                    value={entity.page}
                    onChange={(event) => updateEntity(index, { page: Number(event.currentTarget.value) || 1 })}
                  />
                </label>
                <button type="button" onClick={() => removeEntity(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
