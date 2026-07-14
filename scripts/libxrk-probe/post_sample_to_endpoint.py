from __future__ import annotations

import argparse
import json
import mimetypes
import uuid
from pathlib import Path
from urllib import request


def main() -> int:
    parser = argparse.ArgumentParser(description="POST the sample XRK to a parser endpoint.")
    parser.add_argument("url", help="Endpoint URL, for example http://localhost:3000/api/telemetry/parse")
    parser.add_argument(
        "--file",
        default="work/aim/Rory_Animal_AAA_Generic testing_a_0872.xrk",
        help="XRK/XRZ file to upload.",
    )
    args = parser.parse_args()

    file_path = Path(args.file)
    boundary = f"----mysetuplog-{uuid.uuid4().hex}"
    body = multipart_body(boundary, file_path)
    req = request.Request(
        args.url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
    )

    with request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))

    print(json.dumps(payload["derived"], indent=2))
    return 0


def multipart_body(boundary: str, file_path: Path) -> bytes:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8")
    footer = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return header + file_path.read_bytes() + footer


if __name__ == "__main__":
    raise SystemExit(main())
