import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from harness import LearnerMemory, WorkflowEngine, WorkflowError
from providers import OllamaProvider, WhisperCppProvider


ROOT = Path(__file__).resolve().parent
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
WHISPER_URL = os.environ.get(
    "WHISPER_URL", "http://127.0.0.1:8080/inference"
)
chat_provider = OllamaProvider(OLLAMA_URL)
transcription_provider = WhisperCppProvider(WHISPER_URL)
learner_memory = LearnerMemory()


def memory_action(context, _node):
    return {"learner_context": learner_memory.context(context.get("language", "fr"))}


def llm_action(context, node):
    messages = [dict(message) for message in context["messages"]]
    if node.get("use_memory"):
        learner_context = context.get("learner_context", "")
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] += f"\n\nGespeicherter Lernverlauf:\n{learner_context}"
        else:
            messages.insert(0, {"role": "system", "content": f"Gespeicherter Lernverlauf:\n{learner_context}"})
    return {"text": chat_provider.chat(context["model"], messages)}


workflow_engine = WorkflowEngine(
    ROOT / "workflows",
    {"memory": memory_action, "llm": llm_action},
)


class AppHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_000_000:
            raise ValueError("Anfrage ist zu groß.")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        if self.path == "/api/status":
            return self.send_json(200, {
                "ollama": self.check_service(f"{OLLAMA_URL}/api/tags"),
                "whisper": self.check_service(WHISPER_URL.rsplit("/", 1)[0]),
            })
        if self.path == "/api/workflows":
            return self.send_json(200, {"workflows": workflow_engine.list_workflows()})
        if self.path == "/api/practice":
            return self.send_json(200, {"history": learner_memory.history()})
        if self.path == "/api/models":
            try:
                return self.send_json(200, {
                    "models": chat_provider.list_models()
                })
            except (OSError, ValueError, urllib.error.URLError):
                return self.send_json(503, {"error": "Ollama ist nicht erreichbar."})

        relative = "index.html" if self.path == "/" else self.path.lstrip("/")
        requested = (ROOT / relative).resolve()
        if ROOT not in requested.parents or not requested.is_file():
            self.send_error(404)
            return
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }.get(requested.suffix, "application/octet-stream")
        data = requested.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def check_service(url):
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except (OSError, urllib.error.URLError):
            return False

    def do_POST(self):
        if self.path == "/api/chat":
            return self.chat()
        if self.path == "/api/transcribe":
            return self.transcribe()
        if self.path == "/api/practice":
            return self.save_practice()
        self.send_error(404)

    def chat(self):
        try:
            request = self.read_json()
            context = {
                "model": request["model"],
                "messages": request["messages"],
                "language": request.get("language", "fr"),
            }
            result = workflow_engine.run(request.get("workflow", "coach"), context)
            self.send_json(200, {"text": result.get("text", "")})
        except WorkflowError as error:
            self.send_json(400, {"error": str(error)})
        except (KeyError, ValueError, urllib.error.HTTPError, urllib.error.URLError, OSError) as error:
            self.send_json(502, {"error": f"Ollama-Anfrage fehlgeschlagen: {error}"})

    def save_practice(self):
        try:
            entry = self.read_json()
            if entry.get("language") not in {"fr", "es", "it"} or not entry.get("recognized"):
                return self.send_json(400, {"error": "Ungültiger Übungseintrag."})
            return self.send_json(201, {"entry": learner_memory.add_practice(entry)})
        except (KeyError, TypeError, ValueError, OSError) as error:
            return self.send_json(400, {"error": f"Übung konnte nicht gespeichert werden: {error}"})

    def transcribe(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not length or length > 25_000_000:
                return self.send_json(400, {"error": "Aufnahme fehlt oder ist größer als 25 MB."})
            audio = self.rfile.read(length)
            filename = Path(self.headers.get("X-Filename", "aufnahme.webm")).name
            language = self.headers.get("X-Language", "fr")
            text = transcription_provider.transcribe(audio, filename, language)
            self.send_json(200, {"text": text})
        except (ValueError, urllib.error.HTTPError, urllib.error.URLError, OSError) as error:
            self.send_json(502, {
                "error": f"Transkription fehlgeschlagen. Läuft ein lokaler whisper.cpp-Server? {error}"
            })

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8765"))), AppHandler)
    print(f"Sprachraum läuft auf http://127.0.0.1:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSprachraum beendet.")
        server.server_close()