#!/usr/bin/env python3
"""Run Fretline's chord matcher in composition-first mode.

The base matcher remains conservative. This policy accepts covers, remixes,
live, acoustic, remastered, slowed, sped-up, and similar recordings when the
underlying normalized song title is the same or very close. Artist and duration
remain useful ranking signals, but version differences no longer veto a match.
Short, generic titles still need corroborating artist or duration evidence.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

BASE_SCRIPT = Path(__file__).with_name("index-chords.py")
SPEC = importlib.util.spec_from_file_location("fretline_base_chord_indexer", BASE_SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {BASE_SCRIPT}")
BASE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BASE
SPEC.loader.exec_module(BASE)


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

    # Version tags are recorded in provenance but deliberately do not penalize
    # the score: the user prefers the same composition over the exact mix.
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


def composition_classify_match(track: dict[str, Any], best: Any, second: Any | None, candidate: Any) -> str | None:
    margin = best.total - (second.total if second else 0.0)
    exact_title = track["title_base"] == candidate.title_base
    exact_artist = bool(track["artist_norm"]) and track["artist_norm"] == candidate.artist_norm
    distinctive = _distinctive_title(track["title_base"])
    very_distinctive = _very_distinctive_title(track["title_base"])
    duration_difference = best.duration_diff

    # Exact normalized titles are the strongest proxy for shared lyrics. Covers
    # and alternate versions may have different artists and very different run
    # times, so neither is a veto for a distinctive title.
    if exact_title:
        if exact_artist or best.artist >= 88:
            return "high"
        if very_distinctive:
            return "medium"
        if distinctive and (best.artist >= 20 or duration_difference is None or duration_difference <= 150):
            return "medium"
        if best.artist >= 55:
            return "low"
        if duration_difference is not None and duration_difference <= 20 and margin >= 1.0:
            return "low"
        return None

    # Near-title matches still need stronger artist evidence or a clearly
    # distinctive title. This catches punctuation, transliteration, subtitles,
    # and minor metadata differences without reviving token-subset false hits.
    if best.title >= 97 and best.artist >= 78:
        return "high"
    if best.title >= 96 and very_distinctive and best.artist >= 20 and margin >= 2.0:
        return "medium"
    if best.title >= 93 and best.artist >= 82 and margin >= 2.0:
        return "medium"
    if best.title >= 91 and best.artist >= 65 and margin >= 5.0:
        return "low"
    if best.title >= 88 and best.artist >= 92 and margin >= 4.0:
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

    if exact_title and not same_artist:
        match_mode = "same-composition-cover"
    elif different_version:
        match_mode = "same-composition-version"
    elif exact_title:
        match_mode = "same-title-recording"
    else:
        match_mode = "fuzzy-composition"

    chart["provenance"]["matchMode"] = match_mode
    chart["provenance"]["titleExact"] = exact_title
    chart["provenance"]["artistEquivalent"] = same_artist
    chart["provenance"]["versionDifferenceAccepted"] = different_version
    chart["provenance"]["playlistVersionTags"] = sorted(target_tags)
    chart["provenance"]["matchedVersionTags"] = sorted(candidate_tags)
    chart["provenance"]["policy"] = "composition-first-v1"
    return chart, approximate_count


BASE.score_candidate = composition_score_candidate
BASE.classify_match = composition_classify_match
BASE.build_chart = composition_build_chart

if __name__ == "__main__":
    raise SystemExit(BASE.main())
