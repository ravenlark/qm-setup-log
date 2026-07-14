from __future__ import annotations

import argparse
import sys
from http.server import HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from api.telemetry.parse import handler  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the XRK parser handler locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=3015, type=int)
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), handler)
    print(f"Serving XRK parser at http://{args.host}:{args.port}/api/telemetry/parse", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
