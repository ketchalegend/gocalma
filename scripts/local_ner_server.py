#!/usr/bin/env python3
"""
Local GLiNER service for GoCalma.

Run:
  python3 scripts/local_ner_server.py

Optional env vars:
  GLINER_MODEL_ID=knowledgator/gliner-pii-edge-v1.0
  GLINER_HOST=127.0.0.1
  GLINER_PORT=8787
  GLINER_THRESHOLD=0.35
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


MODEL_ID = os.getenv("GLINER_MODEL_ID", "knowledgator/gliner-pii-edge-v1.0")
HOST = os.getenv("GLINER_HOST", "127.0.0.1")
PORT = int(os.getenv("GLINER_PORT", "8787"))
DEFAULT_THRESHOLD = float(os.getenv("GLINER_THRESHOLD", "0.35"))


def _json_response(handler: BaseHTTPRequestHandler, code: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def _load_model():
    try:
        from gliner import GLiNER  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "Missing dependency 'gliner'. Install with: pip install gliner"
        ) from exc

    return GLiNER.from_pretrained(MODEL_ID)


MODEL = None
MODEL_ERROR: str | None = None

try:
    MODEL = _load_model()
except Exception as exc:
    MODEL_ERROR = str(exc)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        _json_response(self, 200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            _json_response(
                self,
                200 if MODEL is not None else 503,
                {
                    "ok": MODEL is not None,
                    "model": MODEL_ID,
                    "error": MODEL_ERROR,
                },
            )
            return
        _json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/detect":
            _json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        if MODEL is None:
            _json_response(self, 503, {"ok": False, "error": MODEL_ERROR or "Model unavailable"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            _json_response(self, 400, {"ok": False, "error": "Invalid JSON body"})
            return

        text = str(payload.get("text", ""))
        if not text.strip():
            _json_response(self, 400, {"ok": False, "error": "Missing non-empty 'text'"})
            return

        candidate_labels = payload.get("candidate_labels") or []
        if not isinstance(candidate_labels, list) or not all(isinstance(x, str) for x in candidate_labels):
            _json_response(self, 400, {"ok": False, "error": "'candidate_labels' must be a string array"})
            return

        threshold = float(payload.get("threshold", DEFAULT_THRESHOLD))

        try:
            entities = MODEL.predict_entities(text, candidate_labels, threshold=threshold)
            normalized = []
            for entry in entities:
                normalized.append(
                    {
                        "label": entry.get("label"),
                        "text": entry.get("text"),
                        "start": entry.get("start"),
                        "end": entry.get("end"),
                        "score": entry.get("score", 0.0),
                    }
                )
            _json_response(self, 200, {"ok": True, "entities": normalized, "model": MODEL_ID})
        except Exception as exc:
            _json_response(self, 500, {"ok": False, "error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep terminal output concise.
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[local-ner] listening on http://{HOST}:{PORT} model={MODEL_ID}")
    if MODEL_ERROR:
        print(f"[local-ner] model unavailable: {MODEL_ERROR}")
    server.serve_forever()


if __name__ == "__main__":
    main()

