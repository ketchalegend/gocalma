import { useMemo, useState } from 'react';
import type { Detection, ExtractedPdf, KeyFilePayload, RedactionResult } from '../types/domain';
import { extractPdf } from '../core/pdf/extractor';
import { PIIDetector } from '../core/pii/detector';
import { createRedactionPackage } from '../core/redaction/service';
import { downloadBlob } from './download';
import { decryptOriginalPdfBytes, matchesRedactedPdf, parseKeyFile } from '../core/security/key-manager';
import { restoreRedactedText } from '../core/redaction/unredact';
import { OCR_ENABLED } from '../core/ocr/feature-flag';
import { detectOcrDetections } from '../core/ocr/ocr-detector';

const detector = new PIIDetector();

type Stage = 'upload' | 'processing' | 'review' | 'download';
type Tab = 'redact' | 'unredact';

function UnredactPanel() {
  const [redactedPdfBytes, setRedactedPdfBytes] = useState<Uint8Array | null>(null);
  const [redactedPdfName, setRedactedPdfName] = useState('');
  const [keyPayload, setKeyPayload] = useState<KeyFilePayload | null>(null);
  const [keyFileName, setKeyFileName] = useState('');
  const [restoredPdfBlob, setRestoredPdfBlob] = useState<Blob | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<boolean | null>(null);

  function reset() {
    setRedactedPdfBytes(null);
    setRedactedPdfName('');
    setKeyPayload(null);
    setKeyFileName('');
    setRestoredPdfBlob(null);
    setRestoreFileName('');
    setStatus('');
    setError('');
    setVerified(null);
  }

  async function handleRedactedPdf(file: File) {
    setError('');
    setStatus('');
    setVerified(null);
    setRestoredPdfBlob(null);
    setRedactedPdfName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    setRedactedPdfBytes(bytes);

    if (keyPayload) {
      await verifyAndRestore(keyPayload, bytes);
    } else {
      setStatus('Redacted PDF loaded. Now import the .gocalma key file.');
    }
  }

  async function handleKeyFile(file: File) {
    setError('');
    setStatus('');
    setVerified(null);
    setRestoredPdfBlob(null);
    setKeyFileName(file.name);

    try {
      const payload = await parseKeyFile(file);
      setKeyPayload(payload);

      if (redactedPdfBytes) {
        await verifyAndRestore(payload, redactedPdfBytes);
      } else {
        setStatus('Key file loaded. Now import the redacted PDF.');
      }
    } catch (e) {
      setError(`Invalid key file: ${e instanceof Error ? e.message : 'Parse error'}`);
    }
  }

  async function verifyAndRestore(payload: KeyFilePayload, pdfBytes: Uint8Array) {
    setError('');
    setStatus('Verifying...');

    try {
      const match = await matchesRedactedPdf(payload, pdfBytes);

      if (match === false) {
        setVerified(false);
        setError('This key file does not belong to this redacted PDF. They were created from different documents.');
        setStatus('');
        setRestoredPdfBlob(null);
        return;
      }

      const restoredBytes = await decryptOriginalPdfBytes(payload);
      const stableBytes = Uint8Array.from(restoredBytes);
      setRestoredPdfBlob(new Blob([stableBytes], { type: 'application/pdf' }));
      setRestoreFileName(payload.originalFileName || 'restored.pdf');

      if (match === true) {
        setVerified(true);
        setStatus('Verified: key file matches the redacted PDF. Original document restored successfully.');
      } else {
        setVerified(null);
        setStatus('Original document restored. Note: this key file has no verification hash — cannot confirm it matches the uploaded PDF.');
      }
    } catch (e) {
      setError(`Restoration failed: ${e instanceof Error ? e.message : 'Decryption error'}`);
      setRestoredPdfBlob(null);
    }
  }

  return (
    <div className="unredact-panel">
      <h3>Restore Original Document</h3>
      <p>Upload a redacted PDF and its matching .gocalma key file to restore the original document.</p>

      <div className="unredact-inputs">
        <label className="file-input">
          1. Import redacted PDF
          <input
            type="file"
            accept="application/pdf"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleRedactedPdf(file);
            }}
          />
        </label>
        {redactedPdfName && <small className="file-badge">{redactedPdfName}</small>}

        <label className="file-input">
          2. Import .gocalma key file
          <input
            type="file"
            accept="application/json,.gocalma"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleKeyFile(file);
            }}
          />
        </label>
        {keyFileName && <small className="file-badge">{keyFileName}</small>}
      </div>

      {status && (
        <p role="status" className={verified === true ? 'success-msg' : 'info-msg'}>
          {verified === true && '\u2705 '}{status}
        </p>
      )}
      {error && (
        <p role="alert" className="error-msg">
          {'\u274C '}{error}
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          disabled={!restoredPdfBlob || verified === false}
          onClick={() => {
            if (!restoredPdfBlob) return;
            downloadBlob(restoredPdfBlob, restoreFileName.replace(/\.pdf$/i, '_restored.pdf'));
          }}
        >
          Download restored original PDF
        </button>
        <button type="button" onClick={reset} className="secondary-btn">
          Reset
        </button>
      </div>
    </div>
  );
}

export function RedactionTool() {
  const [activeTab, setActiveTab] = useState<Tab>('redact');
  const [stage, setStage] = useState<Stage>('upload');
  const [pdf, setPdf] = useState<ExtractedPdf | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RedactionResult | null>(null);
  const [redactedText, setRedactedText] = useState<string[]>([]);
  const [restoredText, setRestoredText] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [warning, setWarning] = useState<string>('');
  const [enableNer, setEnableNer] = useState<boolean>(false);
  const [aggressiveLineMode, setAggressiveLineMode] = useState<boolean>(false);
  const [nerModel, setNerModel] = useState<'bert-base'>('bert-base');
  const [useLocalNerService, setUseLocalNerService] = useState<boolean>(false);
  const [restorePayload, setRestorePayload] = useState<KeyFilePayload | null>(null);

  const selectedDetections = useMemo(
    () => detections.filter((detection) => selected.has(detection.id)),
    [detections, selected],
  );
  const selectedCount = selected.size;

  async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: number | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function handleUpload(file: File) {
    setStage('processing');
    setError('');
    setWarning('');
    setFileName(file.name);

    try {
      const extracted = await withTimeout(extractPdf(file), 25000, 'PDF extraction timed out.');
      const detectionTimeout = enableNer ? 180000 : 25000;
      const minConfidence = useLocalNerService ? 0.7 : 0.8;
      const found = await withTimeout(
        detector.detect(extracted, {
          useRegex: true,
          useNER: enableNer,
          minConfidence,
          aggressiveLineMode,
          nerModel,
          useLocalNerService,
        }),
        detectionTimeout,
        'PII detection timed out.',
      );
      if (enableNer) {
        const nerError = detector.getLastNerError();
        if (nerError) {
          throw new Error(`NER unavailable: ${nerError}`);
        } else {
          if (useLocalNerService) setWarning('Local NER service active: http://127.0.0.1:8787');
          else {
            const modelId = detector.getActiveNerModelId();
            if (modelId) setWarning(`NER loaded locally: ${modelId}`);
          }
        }
      }
      let ocrFound: typeof found = [];
      if (OCR_ENABLED) {
        try {
          ocrFound = await withTimeout(detectOcrDetections(extracted), 120000, 'OCR detection timed out (Tesseract may still be downloading language data — try again).');
          console.log(`[OCR] Detected ${ocrFound.length} OCR-based PII items`);
        } catch (ocrErr) {
          const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
          console.error('[OCR] Detection failed:', msg);
          setWarning(`OCR detection failed: ${msg}. Text-based detections still applied.`);
        }
      }
      const merged = [...found, ...ocrFound];

      setPdf(extracted);
      setDetections(merged);
      setSelected(new Set(merged.map((entry) => entry.id)));
      setStage('review');
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unknown processing error';
      setError(`Processing failed: ${message}`);
      setStage('upload');
    }
  }

  async function handleGenerate() {
    if (!pdf) return;
    setStage('processing');
    setError('');

    try {
      const nextResult = await withTimeout(
        createRedactionPackage(pdf, selectedDetections),
        30000,
        'PDF redaction timed out.',
      );
      setResult(nextResult);
      setRedactedText(nextResult.redactedTextByPage);
      setRestoredText([]);
      setStage('download');
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'Unknown redaction error';
      setError(`Redaction failed: ${message}`);
      setStage('review');
    }
  }

  async function handleInlineRestore(file: File) {
    try {
      const payload = await parseKeyFile(file);
      setRestorePayload(payload);
      if (result) {
        const restored = await restoreRedactedText(result.redactedTextByPage, payload);
        setRestoredText(restored);
      }
    } catch (e) {
      setRestoredText([]);
      setRestorePayload(null);
    }
  }

  return (
    <section>
      <nav className="tab-nav">
        <button
          type="button"
          className={activeTab === 'redact' ? 'tab-active' : ''}
          onClick={() => setActiveTab('redact')}
        >
          Redact PII
        </button>
        <button
          type="button"
          className={activeTab === 'unredact' ? 'tab-active' : ''}
          onClick={() => setActiveTab('unredact')}
        >
          Restore Original
        </button>
      </nav>

      {activeTab === 'unredact' && <UnredactPanel />}

      {activeTab === 'redact' && (
        <>
          <h2>Redaction Workflow</h2>
          <p>Scope: Core + reversible. OCR is feature-flagged ({OCR_ENABLED ? 'enabled' : 'disabled'}).</p>

          {stage === 'upload' && (
            <>
              <label className="file-input">
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
              </label>
              <label className="file-input">
                <input
                  type="checkbox"
                  checked={enableNer}
                  onChange={(event) => setEnableNer(event.currentTarget.checked)}
                />
                Enable NER model enrichment (slower, first run downloads model)
              </label>
              {enableNer && (
                <label className="file-input">
                  <input
                    type="checkbox"
                    checked={useLocalNerService}
                    onChange={(event) => setUseLocalNerService(event.currentTarget.checked)}
                  />
                  Use local GLiNER service (http://127.0.0.1:8787)
                </label>
              )}
              {enableNer && (
                <label className="file-input">
                  NER model
                  <select
                    value={nerModel}
                    disabled={useLocalNerService}
                    onChange={(event) => setNerModel(event.currentTarget.value as 'bert-base')}
                  >
                    <option value="bert-base">Xenova/bert-base-NER (local /models)</option>
                  </select>
                </label>
              )}
              <label className="file-input">
                <input
                  type="checkbox"
                  checked={aggressiveLineMode}
                  onChange={(event) => setAggressiveLineMode(event.currentTarget.checked)}
                />
                Aggressive privacy mode (redact full lines containing detected PII)
              </label>
            </>
          )}

          {stage === 'processing' && <p>Processing document locally...</p>}
          {error && <p role="alert">{error}</p>}
          {warning && <p role="status">{warning}</p>}

          {stage === 'review' && (
            <>
              <h3>Review Detections ({detections.length})</h3>
              <p>{selectedCount} selected</p>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(detections.map((entry) => entry.id)))}
                >
                  Select all
                </button>
                <button type="button" onClick={() => setSelected(new Set())}>
                  Select none
                </button>
              </div>
              <div className="detection-grid">
                {detections.map((detection) => (
                  <div key={detection.id} className="detection-card">
                    <input
                      id={`detection-${detection.id}`}
                      type="checkbox"
                      checked={selected.has(detection.id)}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.currentTarget.checked) next.add(detection.id);
                          else next.delete(detection.id);
                          return next;
                        });
                      }}
                    />
                    <label htmlFor={`detection-${detection.id}`}>
                      <strong>{detection.type}</strong>
                      <span>{detection.text}</span>
                      <small>
                        page {detection.page} · {detection.source} · conf {detection.confidence.toFixed(2)}
                      </small>
                    </label>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => void handleGenerate()}>
                Generate redacted outputs
              </button>
            </>
          )}

          {stage === 'download' && result && (
            <>
              <h3>Download Outputs</h3>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => downloadBlob(result.redactedPdfBlob, fileName.replace(/\.pdf$/i, '_redacted.pdf'))}
                >
                  Download redacted PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadBlob(result.encryptedKeyBlob, fileName.replace(/\.pdf$/i, '.gocalma'))}
                >
                  Download key file
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setStage('upload');
                    setPdf(null);
                    setDetections([]);
                    setSelected(new Set());
                    setResult(null);
                    setRedactedText([]);
                    setRestoredText([]);
                    setError('');
                    setWarning('');
                    setRestorePayload(null);
                  }}
                >
                  Redact another PDF
                </button>
              </div>

              <details>
                <summary>Text comparison (redacted vs restored)</summary>
                <label className="file-input">
                  Import .gocalma key to preview text restoration
                  <input
                    type="file"
                    accept="application/json,.gocalma"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void handleInlineRestore(file);
                    }}
                  />
                </label>
                <div className="text-panels">
                  <article>
                    <h5>Redacted text</h5>
                    {redactedText.map((page, index) => (
                      <pre key={`redacted-${index + 1}`}>Page {index + 1}\n{page}</pre>
                    ))}
                  </article>
                  <article>
                    <h5>Restored text</h5>
                    {restoredText.length === 0 ? (
                      <p>Import key file to restore.</p>
                    ) : (
                      restoredText.map((page, index) => (
                        <pre key={`restored-${index + 1}`}>Page {index + 1}\n{page}</pre>
                      ))
                    )}
                  </article>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
