#!/usr/bin/env python3
"""Recalculate public matching statistics from charts that were actually emitted."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def chart_counts(charts: dict[str, Any]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for chart in charts.values():
        provenance = chart.get("provenance") if isinstance(chart, dict) else None
        if not isinstance(provenance, dict):
            continue
        status = provenance.get("lyricsVerification")
        mode = provenance.get("matchMode")
        if provenance.get("artistEquivalent"):
            counts["sameArtistAccepted"] += 1
        if status == "verified":
            counts["lyricsVerified"] += 1
        if mode == "same-composition-cover":
            counts["verifiedCoverMatches"] += 1
        if mode == "same-composition-version":
            counts["alternateVersionMatches"] += 1
        if mode == "same-title-unverified":
            counts["sameTitleUnverifiedMatches"] += 1
            if status == "unavailable":
                counts["unverifiedFallbackAccepted"] += 1
            elif status == "uncertain":
                counts["uncertainFallbackAccepted"] += 1
    return counts


def update(path: Path, counts: Counter[str], *, compact: bool) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    stats = payload.setdefault("stats", {})
    stats["matchingPolicy"] = "composition-first-lyrics-v2"
    stats["lyricsUnavailableAttempts"] = stats.get("lyricsUnavailable", 0)
    stats["lyricsUncertainAttempts"] = stats.get("lyricsUncertain", 0)
    for key in (
        "sameArtistAccepted",
        "lyricsVerified",
        "verifiedCoverMatches",
        "alternateVersionMatches",
        "sameTitleUnverifiedMatches",
        "unverifiedFallbackAccepted",
        "uncertainFallbackAccepted",
    ):
        stats[key] = counts[key]
    payload["matchingPolicy"] = "composition-first-lyrics-v2"
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="src/data/chord-catalog.json")
    parser.add_argument("--report", default="src/data/chord-match-report.json")
    args = parser.parse_args()
    catalog_path = Path(args.catalog)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    charts = catalog.get("charts")
    if not isinstance(charts, dict):
        raise RuntimeError("Generated chord catalog has no charts object.")
    counts = chart_counts(charts)
    update(catalog_path, counts, compact=True)
    update(Path(args.report), counts, compact=False)
    print(json.dumps(dict(counts), indent=2))


if __name__ == "__main__":
    main()
