import './index.css';
import { RedactionTool } from './ui/RedactionTool';

export default function App() {
  return (
    <main className="app-shell">
      <header>
        <h1>GoCalma Local PDF Redactor</h1>
        <p>Local-first PII redaction with reversible key export.</p>
      </header>

      <RedactionTool />
    </main>
  );
}
