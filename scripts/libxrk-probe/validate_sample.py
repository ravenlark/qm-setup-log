from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from api.telemetry.xrk_parser import parse_xrk_file  # noqa: E402


SAMPLE_FILE = ROOT / "work" / "aim" / "Rory_Animal_AAA_Generic testing_a_0872.xrk"


def main() -> int:
    payload = parse_xrk_file(SAMPLE_FILE, include_channels=False)
    derived = payload["derived"]

    checks = {
        "bestCompleteLapSeconds": (derived["bestCompleteLapSeconds"], 6.508),
        "totalLaps": (derived["totalLaps"], 13),
        "completeLapCount": (derived["completeLapCount"], 11),
        "averageRpm": (derived["averageRpm"], 4807.256124721604),
        "maxRpm": (derived["maxRpm"], 6067),
    }

    failed = False
    for name, (actual, expected) in checks.items():
        if isinstance(expected, float):
            passed = math.isclose(actual, expected, rel_tol=0, abs_tol=0.001)
        else:
            passed = actual == expected
        print(f"{name}: {actual} expected {expected} {'OK' if passed else 'FAIL'}")
        failed = failed or not passed

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
