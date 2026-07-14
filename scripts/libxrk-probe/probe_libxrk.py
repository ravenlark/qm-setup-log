from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from api.telemetry.xrk_parser import parse_xrk_file  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe an XRK/XRZ file with libxrk.")
    parser.add_argument("--file", required=True, help="Path to an XRK or XRZ file.")
    parser.add_argument(
        "--include-samples",
        action="store_true",
        help="Include a capped sample list for each channel.",
    )
    parser.add_argument(
        "--max-samples",
        default=25,
        type=int,
        help="Maximum samples per channel when --include-samples is used.",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Omit full channel details and return channelSummary/keyChannels only.",
    )
    args = parser.parse_args()

    summary = parse_xrk_file(
        args.file,
        include_samples=args.include_samples,
        max_samples=args.max_samples,
        include_channels=not args.summary_only,
    )
    print(json.dumps(summary, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
