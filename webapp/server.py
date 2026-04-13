from __future__ import annotations

import base64
import json
import os
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8780
ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT / "uploads"


class VivaHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/health":
            body = json.dumps({"ok": True, "uploadEnabled": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/upload-recording":
            self.send_error(404, "Not Found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            user = payload.get("user", "anonymous")
            prompt_id = payload.get("promptId", "unknown")
            file_name = payload.get("fileName", "recording.webm")
            audio_base64 = payload.get("audioBase64", "")
            if not audio_base64:
                raise ValueError("audioBase64 missing")

            safe_user = "".join(ch for ch in user if ch.isalnum() or ch in ("-", "_")) or "anonymous"
            safe_prompt = "".join(ch for ch in prompt_id if ch.isalnum() or ch in ("-", "_")) or "unknown"
            ext = Path(file_name).suffix or ".webm"
            target_dir = UPLOAD_DIR / safe_user
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / f"{safe_prompt}-{Path(file_name).stem}{ext}"
            target_path.write_bytes(base64.b64decode(audio_base64))

            relative_url = target_path.relative_to(ROOT).as_posix()
            body = json.dumps({"ok": True, "url": f"./{relative_url}"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def open_browser() -> None:
    webbrowser.open(f"http://{HOST}:{PORT}")


def main() -> None:
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), VivaHandler)
    threading.Timer(1.0, open_browser).start()
    print(f"Serving AnkiViva Web at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
