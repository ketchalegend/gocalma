import './index.css';
import { RedactionTool } from './ui/RedactionTool';

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">GoCalma challenge build</p>
          <h1>Private PDF redaction, kept local.</h1>
          <p className="hero-summary">
            Review detections, export a safe PDF, and keep the encrypted recovery key separate.
          </p>
        </div>

        <aside className="hero-aside" aria-label="Product highlights">
          <div className="hero-stat">
            <span>Flow</span>
            <strong>Upload → review → export</strong>
          </div>
          <div className="hero-stat">
            <span>Privacy</span>
            <strong>Zero document upload</strong>
          </div>
          <div className="hero-stat">
            <span>Recovery</span>
            <strong>Encrypted `.gocalma` key</strong>
          </div>
        </aside>
      </section>

      <RedactionTool />
    </main>
  );
}
