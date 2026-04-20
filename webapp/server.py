from __future__ import annotations

import base64
import json
import os
import re
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BIND_HOST = os.getenv("ANKIVIVA_HOST", "0.0.0.0")
BROWSER_HOST = os.getenv("ANKIVIVA_BROWSER_HOST", "127.0.0.1")
PORT = int(os.getenv("ANKIVIVA_PORT", "8780"))
ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT / "uploads"
AUDIO_CACHE_DIR = ROOT / "audio" / "azure_cache"
LOCAL_SETTINGS_PATH = ROOT / "local_settings.json"


def load_local_settings() -> dict:
    if LOCAL_SETTINGS_PATH.exists():
        return json.loads(LOCAL_SETTINGS_PATH.read_text(encoding="utf-8"))
    return {}


SETTINGS = load_local_settings()
AZURE_SPEECH = SETTINGS.get("azureSpeech", {})


def sanitize_name(value: str, fallback: str = "item") -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return safe or fallback


def get_azure_speech_config() -> dict:
    env_keys = [os.getenv("AZURE_SPEECH_KEY"), os.getenv("AZURE_SPEECH_KEY_FALLBACK")]
    file_keys = AZURE_SPEECH.get("keys", [])
    keys = [key for key in [*file_keys, *env_keys] if key]
    return {
        "region": AZURE_SPEECH.get("region") or os.getenv("AZURE_SPEECH_REGION") or "southeastasia",
        "keys": keys,
        "voice": AZURE_SPEECH.get("voice", "en-GB-ThomasNeural"),
        "rate": AZURE_SPEECH.get("rate", "-8%"),
        "pitch": AZURE_SPEECH.get("pitch", "0%"),
        "style": AZURE_SPEECH.get("style"),
        "styleDegree": AZURE_SPEECH.get("styleDegree"),
        "outputFormat": AZURE_SPEECH.get("outputFormat", "audio-24khz-96kbitrate-mono-mp3"),
    }


def build_tts_ssml(text: str, config: dict) -> str:
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
    voice = config["voice"]
    rate = config["rate"]
    pitch = config["pitch"]
    style = config.get("style")
    style_degree = config.get("styleDegree")

    prosody = f'<prosody rate="{rate}" pitch="{pitch}">{escaped}</prosody>'
    if style:
        degree_attr = f' styledegree="{style_degree}"' if style_degree else ""
        content = f'<mstts:express-as style="{style}"{degree_attr}>{prosody}</mstts:express-as>'
    else:
        content = prosody

    return (
        '<speak version="1.0" xml:lang="en-GB" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="https://www.w3.org/2001/mstts">'
        f'<voice name="{voice}">{content}</voice>'
        "</speak>"
    )


def synthesize_text_to_speech(prompt_id: str, text: str) -> str:
    config = get_azure_speech_config()
    if not config["keys"]:
        raise RuntimeError("Azure Speech key is not configured.")

    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe_prompt = sanitize_name(prompt_id, "prompt")
    target_path = AUDIO_CACHE_DIR / f"{safe_prompt}.mp3"
    if target_path.exists():
        return f"./{target_path.relative_to(ROOT).as_posix()}"

    url = f'https://{config["region"]}.tts.speech.microsoft.com/cognitiveservices/v1'
    payload = build_tts_ssml(text, config).encode("utf-8")
    last_error: Exception | None = None

    for key in config["keys"]:
        request = urllib.request.Request(url=url, data=payload, method="POST")
        request.add_header("Ocp-Apim-Subscription-Key", key)
        request.add_header("Ocp-Apim-Subscription-Region", config["region"])
        request.add_header("Content-Type", "application/ssml+xml")
        request.add_header("X-Microsoft-OutputFormat", config["outputFormat"])
        request.add_header("User-Agent", "AnkiVivaWeb")
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                audio_bytes = response.read()
            target_path.write_bytes(audio_bytes)
            return f"./{target_path.relative_to(ROOT).as_posix()}"
        except urllib.error.HTTPError as exc:
            last_error = exc
        except Exception as exc:  # pragma: no cover - defensive network path
            last_error = exc

    raise RuntimeError(f"Azure Speech synthesis failed: {last_error}")


def get_lan_urls(port: int) -> list[str]:
    addresses: list[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            addresses.append(probe.getsockname()[0])
    except OSError:
        pass

    try:
        host_name = socket.gethostname()
        addresses.extend(socket.gethostbyname_ex(host_name)[2])
    except OSError:
        pass

    lan_urls: list[str] = []
    seen: set[str] = set()
    for address in addresses:
        if not address or address.startswith("127."):
            continue
        if address in seen:
            continue
        seen.add(address)
        lan_urls.append(f"http://{address}:{port}")
    return lan_urls


class VivaHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            speech_config = get_azure_speech_config()
            body = json.dumps(
                {
                    "ok": True,
                    "uploadEnabled": True,
                    "azureSpeechEnabled": bool(speech_config["keys"]),
                    "azureSpeechVoice": speech_config["voice"],
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if parsed.path == "/api/synthesize-prompt":
                prompt_id = payload.get("promptId", "unknown")
                text = payload.get("text", "").strip()
                if not text:
                    raise ValueError("text missing")
                audio_url = synthesize_text_to_speech(prompt_id, text)
                body = json.dumps({"ok": True, "url": audio_url}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if parsed.path != "/api/upload-recording":
                self.send_error(404, "Not Found")
                return

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
    webbrowser.open(f"http://{BROWSER_HOST}:{PORT}")


def main() -> None:
    os.chdir(ROOT)
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((BIND_HOST, PORT), VivaHandler)
    threading.Timer(1.0, open_browser).start()
    print(f"Serving AnkiViva Web at http://{BROWSER_HOST}:{PORT}")
    if BIND_HOST == "0.0.0.0":
        lan_urls = get_lan_urls(PORT)
        if lan_urls:
            print("Phone access on same Wi-Fi:")
            for url in lan_urls:
                print(f"  {url}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
