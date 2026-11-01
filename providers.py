import json
import urllib.request


class OllamaProvider:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")

    def list_models(self):
        with urllib.request.urlopen(f"{self.base_url}/api/tags", timeout=3) as response:
            payload = json.load(response)
        return [model["name"] for model in payload.get("models", [])]

    def chat(self, model, messages):
        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": False,
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.load(response)
        return payload.get("message", {}).get("content", "")


class WhisperCppProvider:
    def __init__(self, inference_url):
        self.inference_url = inference_url

    def transcribe(self, audio, filename, language):
        boundary = "----sprachraum-local-boundary"
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode(),
            audio,
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson".encode(),
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n{language}".encode(),
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        request = urllib.request.Request(
            self.inference_url,
            data=b"".join(parts),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.load(response)
        return payload.get("text", "")