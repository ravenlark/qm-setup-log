from __future__ import annotations

import cgi
import json
import os
import tempfile
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from api.telemetry.xrk_parser import parse_xrk_file, to_json_bytes


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".xrk", ".xrz"}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self) -> None:
        try:
            content_length = int(self.headers.get("content-length", "0"))
            if content_length <= 0:
                self.send_json({"error": "Missing request body."}, status=400)
                return
            if content_length > MAX_UPLOAD_BYTES:
                self.send_json({"error": "XRK upload is too large."}, status=413)
                return

            content_type = self.headers.get("content-type", "")
            if "multipart/form-data" not in content_type.lower():
                self.send_json({"error": "Expected multipart/form-data with a file field."}, status=415)
                return

            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(content_length),
                },
                keep_blank_values=True,
            )
            upload = form["file"] if "file" in form else None
            if upload is None or not getattr(upload, "filename", ""):
                self.send_json({"error": "Missing file field."}, status=400)
                return

            filename = Path(upload.filename).name
            extension = Path(filename).suffix.lower()
            if extension not in ALLOWED_EXTENSIONS:
                self.send_json({"error": "Only .xrk and .xrz files are supported."}, status=400)
                return

            query = parse_qs(urlparse(self.path).query)
            include_samples = first_query_value(query, "includeSamples") == "true"
            include_channels = first_query_value(query, "includeChannels") != "false"
            max_samples = parse_int(first_query_value(query, "maxSamples"), default=25)

            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir) / f"{uuid.uuid4().hex}{extension}"
                with temp_path.open("wb") as output:
                    remaining = content_length
                    while True:
                        chunk = upload.file.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        output.write(chunk)
                        remaining -= len(chunk)

                payload = parse_xrk_file(
                    temp_path,
                    include_samples=include_samples,
                    max_samples=max_samples,
                    include_channels=include_channels,
                )
                payload["file"]["originalName"] = filename

            self.send_json(payload)
        except Exception as exc:
            self.send_json({"error": "XRK parse failed.", "detail": str(exc)}, status=500)

    def do_GET(self) -> None:
        self.send_json(
            {
                "ok": True,
                "message": "POST multipart/form-data with a .xrk or .xrz file field named 'file'.",
            }
        )

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = to_json_bytes(payload)
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        allowed_origin = os.environ.get("TELEMETRY_PARSE_ALLOWED_ORIGIN", "*")
        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")


def first_query_value(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    return values[0] if values else None


def parse_int(value: str | None, *, default: int) -> int:
    if value is None:
        return default
    try:
        return max(1, min(int(value), 20000))
    except ValueError:
        return default
