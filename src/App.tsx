import './index.css';
import { RedactionTool } from './ui/RedactionTool';
import { FilesProcessedProvider, useFilesProcessed } from './ui/FilesProcessedContext';

function HeroWithStats() {
  const { count } = useFilesProcessed();
  return (
    <section className="hero-panel">
      <div className="hero-copy">
        <p className="eyebrow">GoCalma challenge build</p>
        <h1>Local-first PDF redaction for real documents.</h1>
        <p className="hero-summary">
          Runs in the browser, supports scanned and phone-captured PDFs, and keeps review plus
          reversible export in one flow.
        </p>
      </div>

      <aside className="hero-aside" aria-label="Product highlights">
        <div className="hero-stat">
          <span>Files processed</span>
          <strong>{count}</strong>
        </div>
        <div className="hero-stat">
          <span>Benchmark</span>
          <strong>97.50% core recall</strong>
        </div>
        <div className="hero-stat">
          <span>Privacy</span>
          <strong>Browser-only processing</strong>
        </div>
        <div className="hero-stat">
          <span>Coverage</span>
          <strong>Text, scanned, phone-captured PDFs</strong>
        </div>
      </aside>
    </section>
  );
}

export default function App() {
  return (
    <FilesProcessedProvider>
      <main className="app-shell">
        <HeroWithStats />
        <RedactionTool />
      </main>
    </FilesProcessedProvider>
  );
}
