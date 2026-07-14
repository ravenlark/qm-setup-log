from __future__ import annotations

import contextlib
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

from libxrk import aim_xrk


DEFAULT_KEY_CHANNELS = {
    "Internal Batt",
    "Lateral Grip",
    "Logger Temperature",
    "RPM",
    "GPS Speed",
    "GPS Latitude",
    "GPS Longitude",
    "GPS Altitude",
    "GPS_InlineAcc",
    "GPS_LateralAcc",
    "GPS_Yaw_Rate",
}


def parse_xrk_file(
    file_path: str | Path,
    *,
    include_samples: bool = False,
    max_samples: int = 25,
    include_channels: bool = True,
    key_channels: set[str] | None = None,
) -> dict[str, Any]:
    path = Path(file_path).resolve()
    with contextlib.redirect_stdout(sys.stderr):
        log = aim_xrk(str(path))

    laps = read_laps(log)
    channels = [
        read_channel(name, table, include_samples, max_samples)
        for name, table in log.channels.items()
    ]
    rpm_channel = find_channel(channels, "rpm")
    complete_laps = laps[1:-1] if len(laps) > 2 else laps
    selected_key_channels = key_channels or DEFAULT_KEY_CHANNELS
    recording_duration_seconds = max(
        [
            value
            for value in [
                *(lap["endSeconds"] for lap in laps),
                *(channel["last"]["timeSeconds"] for channel in channels if channel["last"]),
            ]
            if value is not None
        ],
        default=None,
    )

    payload: dict[str, Any] = {
        "file": {
            "name": path.name,
            "sha256": sha256_file(path),
            "sizeBytes": path.stat().st_size,
        },
        "metadata": normalize_mapping(getattr(log, "metadata", {})),
        "derived": {
            "shortestLapSeconds": min(
                (lap["durationSeconds"] for lap in laps if lap["durationSeconds"] is not None),
                default=None,
            ),
            "bestCompleteLapSeconds": min(
                (
                    lap["durationSeconds"]
                    for lap in complete_laps
                    if lap["durationSeconds"] is not None
                ),
                default=None,
            ),
            "totalLaps": len(laps),
            "completeLapCount": len(complete_laps),
            "averageRpm": rpm_channel.get("average") if rpm_channel else None,
            "maxRpm": rpm_channel.get("max") if rpm_channel else None,
            "recordingDurationSeconds": recording_duration_seconds,
        },
        "laps": laps,
        "channelSummary": [
            {
                "name": channel["name"],
                "units": channel["units"],
                "sampleCount": channel["sampleCount"],
                "min": channel["min"],
                "max": channel["max"],
                "average": channel["average"],
            }
            for channel in channels
        ],
        "keyChannels": [
            channel for channel in channels if channel["name"] in selected_key_channels
        ],
    }

    if include_channels:
        payload["channels"] = channels

    return payload


def read_laps(log: Any) -> list[dict[str, Any]]:
    laps_table = getattr(log, "laps", None)
    if laps_table is None:
        return []

    names = set(laps_table.column_names)
    start_key = "start_time" if "start_time" in names else "start"
    end_key = "end_time" if "end_time" in names else "end"
    num_key = "num" if "num" in names else None

    laps: list[dict[str, Any]] = []
    for index in range(laps_table.num_rows):
        start = numeric_scalar(laps_table.column(start_key)[index].as_py())
        end = numeric_scalar(laps_table.column(end_key)[index].as_py())
        lap_number = laps_table.column(num_key)[index].as_py() if num_key else index
        start_seconds = timecode_to_seconds(start)
        end_seconds = timecode_to_seconds(end)
        laps.append(
            {
                "index": index,
                "lapNumber": lap_number,
                "startSeconds": start_seconds,
                "endSeconds": end_seconds,
                "durationSeconds": (
                    end_seconds - start_seconds
                    if start_seconds is not None and end_seconds is not None
                    else None
                ),
            }
        )
    return laps


def read_channel(
    name: str,
    table: Any,
    include_samples: bool,
    max_samples: int,
) -> dict[str, Any]:
    value_column_name = value_column(table, name)
    time_column_name = "timecodes" if "timecodes" in table.column_names else table.column_names[0]
    values = [clean_json_number(value.as_py()) for value in table.column(value_column_name)]
    numeric_values = [
        value for value in values if isinstance(value, (int, float)) and math.isfinite(value)
    ]
    time_values = [numeric_scalar(value.as_py()) for value in table.column(time_column_name)]

    first = sample_row(time_values, values, 0) if table.num_rows else None
    last = sample_row(time_values, values, table.num_rows - 1) if table.num_rows else None
    samples = None
    if include_samples:
        samples = [
            sample_row(time_values, values, index)
            for index in range(min(max_samples, table.num_rows))
        ]

    metadata = read_channel_metadata(table, value_column_name)
    return {
        "name": name,
        "units": metadata.get("units"),
        "sampleCount": table.num_rows,
        "first": first,
        "last": last,
        "min": min(numeric_values) if numeric_values else None,
        "max": max(numeric_values) if numeric_values else None,
        "average": sum(numeric_values) / len(numeric_values) if numeric_values else None,
        "metadata": metadata,
        "samples": samples,
    }


def value_column(table: Any, preferred_name: str) -> str:
    non_time_columns = [name for name in table.column_names if name != "timecodes"]
    if preferred_name in non_time_columns:
        return preferred_name
    if len(non_time_columns) == 1:
        return non_time_columns[0]
    return non_time_columns[-1]


def read_channel_metadata(table: Any, value_column_name: str) -> dict[str, Any]:
    field = table.schema.field(value_column_name)
    if not field.metadata:
        return {}
    return {
        key.decode("utf-8", errors="replace"): value.decode("utf-8", errors="replace")
        for key, value in field.metadata.items()
    }


def sample_row(time_values: list[Any], values: list[Any], index: int) -> dict[str, Any]:
    return {
        "timeSeconds": timecode_to_seconds(time_values[index]),
        "value": values[index],
    }


def timecode_to_seconds(value: Any) -> float | None:
    value = numeric_scalar(value)
    if value is None:
        return None
    return value / 1000


def clean_json_number(value: Any) -> Any:
    value = numeric_scalar(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def numeric_scalar(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    return value


def find_channel(channels: list[dict[str, Any]], needle: str) -> dict[str, Any] | None:
    needle = needle.lower()
    for channel in channels:
        name = str(channel.get("name") or "").lower()
        function = str(channel.get("metadata", {}).get("function") or "").lower()
        if needle in name or needle in function:
            return channel
    return None


def normalize_mapping(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): normalize_mapping(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize_mapping(item) for item in value]
    return clean_json_number(value)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def to_json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
