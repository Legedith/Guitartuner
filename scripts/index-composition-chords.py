#!/usr/bin/env python3
"""Run Fretline's chord matcher in composition-first mode.

Alternate versions by the same artist are accepted from metadata. Cross-artist
covers are checked against transient LRCLIB lyric fingerprints when available.
No lyric text is written to the generated repository data.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

BASE_SCRIPT = Path(__file__).with_name("index-chords.py")
LYRICS_SCRIPT = Path(__file__).with_name("lrclib_lyrics.py")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


BASE = load_module("fretline_base_chord_indexer", BASE_SCRIPT)
LYRICS = load_module("fretline_lrclib_lyrics", LYRICS_SCRIPT)
VERIFIER = LYRICS.LRCLIBVerifier()
VERIFICATIONS: dict[tuple[str, str], Any] = {}
POLICY_STATS: Counter[str] = Counter()


def _title_metrics(left: str, right: str) -> tuple[float, float, float]:
    left_tokens = set(BASE.title_tokens(left))
    right_tokens = set(BASE.title_tokens(right))
    if not left_tokens or not right_tokens:
        return 0.0, 0.0, 0.0
    shared = len(left_tokens & right_tokens)
    overlap = shared / max(len(left_tokens), len(right_tokens))
    containment = shared / min(len(left_tokens), len(right_tokens))
    balance = min(len(left_tokens), len(right_tokens)) / max(len(left_tokens), len(right_tokens))
    return overlap, containment, balance


def _composition_title_score(track: dict[str, Any], candidate: Any) -> float:
    if track["title_base"] == candidate.title_base:
        return 100.0

    ratio = BASE.fuzz.ratio(track["title_base"], candidate.title_base)
    sorted_ratio = BASE.fuzz.token_sort_ratio(track["title_base"], candidate.title_base)
    weighted_ratio = BASE.fuzz.WRatio(track["title_norm"], candidate.title_norm) * 0.94
    score = max(ratio, sorted_ratio * 0.99, weighted_ratio)

    overlap, containment, balance = _title_metrics(track["title_base"], candidate.title_base)
    if overlap < 0.34:
        score -= 24.0
    elif overlap < 0.5:
        score -= 15.0
    elif overlap < 0.67:
        score -= 7.0
    if containment < 0.67:
        score -= 10.0
    if containment >= 0.99 and balance < 0.5:
        score -= 12.0

    length_ratio = min(len(track["title_base"]), len(candidate.title_base)) / max(
        1, len(track["title_base"]), len(candidate.title_base)
    )
    if length_ratio < 0.5:
        score -= 8.0
    return max(0.0, min(100.0, score))


def _duration_score(track_duration: float, candidate_duration: float) -> tuple[float, float | None]:
    if track_duration <= 0 or candidate_duration <= 0:
        return 55.0, None
    difference = abs(track_duration - candidate_duration)
    if difference <= 8:
        score = 100.0
    elif difference <= 30:
        score = 100.0 - ((difference - 8) * (30.0 / 22.0))
    elif difference <= 90:
        score = 70.0 - ((difference - 30) * 0.5)
    elif difference <= 180:
        score = 40.0 - ((difference - 90) * (30.0 / 90.0))
    else:
        score = 0.0
    return max(0.0, score), difference


def composition_score_candidate(track: dict[str, Any], candidate: Any, index: int) -> Any:
    title_score = _composition_title_score(track, candidate)
    if track["artist_norm"] and candidate.artist_norm:
        artist_score = max(
            BASE.fuzz.token_set_ratio(track["artist_norm"], candidate.artist_norm),
            BASE.fuzz.WRatio(track["artist_norm"], candidate.artist_norm),
            BASE.fuzz.partial_ratio(track["artist_norm"], candidate.artist_norm),
        )
    elif not track["artist_norm"]:
        artist_score = 52.0
    else:
        artist_score = 0.0

    duration_score, duration_difference = _duration_score(track["duration"], candidate.duration)
    exact_title = track["title_base"] == candidate.title_base
    exact_artist = bool(track["artist_norm"]) and track["artist_norm"] == candidate.artist_norm

    total = (title_score * 0.76) + (artist_score * 0.14) + (duration_score * 0.10)
    if exact_title:
        total += 12.0
    if exact_artist:
        total += 4.0

    return BASE.MatchScore(
        candidate_index=index,
        total=total,
        title=title_score,
        artist=artist_score,
        duration=duration_score,
        duration_diff=duration_difference,
        version_penalty=0.0,
    )


def _distinctive_title(title_base: str) -> bool:
    tokens = BASE.title_tokens(title_base)
    return len(tokens) >= 2 or len(title_base.replace(" ", "")) >= 10


def _very_distinctive_title(title_base: str) -> bool:
    tokens = BASE.title_tokens(title_base)
    return len(tokens) >= 3 or len(title_base.replace(" ", "")) >= 16


def verification_for(track: dict[str, Any], candidate: Any):
    key = (track.get("videoId", ""), candidate.spotify_id)
    if key not in VERIFICATIONS:
        VERIFICATIONS[key] = VERIFIER.verify(track, candidate)
    return VERIFICATIONS[key]


def composition_classify_match(track: dict[str, Any], best: Any, second: Any | None, candidate: Any) -> str | None:
    margin = best.total - (second.total if second else 0.0)
    exact_title = track["title_base"] == candidate.title_base
    same_artist = best.artist >= 88
    distinctive = _distinctive_title(track["title_base"])
    very_distinctive = _very_distinctive_title(track["title_base"])
    duration_difference = best.duration_diff

    # Same-artist versions do not need lyric verification. Remixes, live takes,
    # acoustic versions, remasters, and extended edits share the composition.
    if same_artist:
        POLICY_STATS["sameArtistAccepted"] += 1
        if exact_title or best.title >= 97:
            return "high"
        if best.title >= 92 and margin >= 1.5:
            return "medium"
        if best.title >= 88 and margin >= 4.0:
            return "low"
        return None

    # Do not call a public lyrics service for weak metadata candidates.
    plausible = (
        exact_title
        or (best.title >= 96 and very_distinctive)
        or (best.title >= 93 and best.artist >= 55)
        or (best.title >= 90 and best.artist >= 82)
    )
    if not plausible:
        return None

    verification = verification_for(track, candidate)
    POLICY_STATS[f"lyrics_{verification.status}"] += 1
    if verification.status == "verified":
        return "medium" if exact_title or best.title >= 96 else "low"
    if verification.status == "conflict":
        POLICY_STATS["lyricsConflictRejected"] += 1
        return None

    # When lyrics are unavailable, retain only narrow fallbacks. Missing or
    # generic playlist artist metadata is common for Topic/Release uploads.
    target_artist_reliable = LYRICS.reliable_artist(track.get("artist"))
    if not target_artist_reliable and exact_title and distinctive:
        if duration_difference is None or duration_difference <= 35:
            POLICY_STATS["unverifiedFallbackAccepted"] += 1
            return "medium"
    if verification.status == "uncertain" and exact_title and very_distinctive:
        if duration_difference is not None and duration_difference <= 30 and margin >= 2.0:
            POLICY_STATS["uncertainFallbackAccepted"] += 1
            return "low"
    if verification.status == "unavailable" and exact_title and very_distinctive:
        if duration_difference is not None and duration_difference <= 15 and margin >= 4.0:
            POLICY_STATS["unverifiedFallbackAccepted"] += 1
            return "low"
    return None


_BASE_BUILD_CHART = BASE.build_chart


def composition_build_chart(candidate: Any, track: dict[str, Any], confidence: str, best: Any, margin: float, unknown_suffixes: Any):
    chart, approximate_count = _BASE_BUILD_CHART(candidate, track, confidence, best, margin, unknown_suffixes)
    if not chart:
        return chart, approximate_count

    exact_title = track["title_base"] == candidate.title_base
    same_artist = best.artist >= 88
    target_tags = set(track["version_tags"]) & BASE.SIGNIFICANT_VERSION_TAGS
    candidate_tags = set(candidate.version_tags) & BASE.SIGNIFICANT_VERSION_TAGS
    different_version = target_tags != candidate_tags
    verification = VERIFICATIONS.get((track.get("videoId", ""), candidate.spotify_id))

    if same_artist and different_version:
        match_mode = "same-composition-version"
    elif same_artist and exact_title:
        match_mode = "same-title-recording"
    elif verification and verification.status == "verified":
        match_mode = "same-composition-cover"
    elif not same_artist and exact_title:
        match_mode = "same-title-unverified"
    else:
        match_mode = "fuzzy-composition"

    chart["provenance"]["matchMode"] = match_mode
    chart["provenance"]["titleExact"] = exact_title
    chart["provenance"]["artistEquivalent"] = same_artist
    chart["provenance"]["versionDifferenceAccepted"] = different_version
    chart["provenance"]["playlistVersionTags"] = sorted(target_tags)
    chart["provenance"]["matchedVersionTags"] = sorted(candidate_tags)
    chart["provenance"]["policy"] = "composition-first-lyrics-v2"
    if verification:
        chart["provenance"].update(verification.provenance())
    else:
        chart["provenance"].update({
            "lyricsVerification": "not-required",
            "lyricsSimilarity": None,
            "lrclibTargetId": None,
            "lrclibCandidateId": None,
            "lyricsVerificationReason": "artist-metadata-equivalent",
        })
    return chart, approximate_count


def argument_value(name: str, default: str) -> Path:
    try:
        return Path(sys.argv[sys.argv.index(name) + 1])
    except (ValueError, IndexError):
        return Path(default)


def patch_generated_stats() -> None:
    output_path = argument_value("--output", "src/data/chord-catalog.json")
    report_path = argument_value("--report", "src/data/chord-match-report.json")
    catalog = json.loads(output_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    additions = {
        "matchingPolicy": "composition-first-lyrics-v2",
        "sameArtistAccepted": POLICY_STATS["sameArtistAccepted"],
        "lyricsVerified": POLICY_STATS["lyrics_verified"],
        "lyricsConflictsRejected": POLICY_STATS["lyricsConflictRejected"],
        "lyricsUnavailable": POLICY_STATS["lyrics_unavailable"],
        "lyricsUncertain": POLICY_STATS["lyrics_uncertain"],
        "unverifiedFallbackAccepted": POLICY_STATS["unverifiedFallbackAccepted"],
        "uncertainFallbackAccepted": POLICY_STATS["uncertainFallbackAccepted"],
    }
    catalog["matchingPolicy"] = "composition-first-lyrics-v2"
    catalog["stats"].update(additions)
    report["matchingPolicy"] = "composition-first-lyrics-v2"
    report["stats"].update(additions)
    output_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


BASE.score_candidate = composition_score_candidate
BASE.classify_match = composition_classify_match
BASE.build_chart = composition_build_chart

if __name__ == "__main__":
    result = BASE.main()
    patch_generated_stats()
    raise SystemExit(result)
