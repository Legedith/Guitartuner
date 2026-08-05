#!/usr/bin/env python3
"""Responsible LRCLIB client for composition verification.

Lyrics are used transiently to compare two recording candidates. Fretline never
writes lyric text to its repository catalog: only LRCLIB record IDs, aggregate
similarity, and verification status are retained in generated provenance.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz
from unidecode import unidecode

LRCLIB_SEARCH_URL = "https://lrclib.net/api/search"
CLIENT_ID = "Fretline/1.5 (+https://github.com/Legedith/Guitartuner)"
GENERIC_ARTISTS = {
    "", "release", "topic", "various artists", "unknown", "unknown artist",
    "official", "music", "records", "soundtrack", "youtube music",
}
SECTION_LINE = re.compile(
    r"^(?:verse|chorus|bridge|intro|outro|pre[ -]?chorus|post[ -]?chorus|hook|"
    r"refrain|instrumental|solo|break|repeat|interlude|ending)(?:\s+\d+)?$",
    re.IGNORECASE,
)
TIMESTAMP = re.compile(r"\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]")
METADATA_TAG = re.compile(r"\[[^\]]{1,80}\]|\([^)]{1,80}\)")


def clean_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_metadata(value: Any) -> str:
    text = unidecode(clean_space(value)).lower().replace("&", " and ")
    text = re.sub(r"\b(?:feat(?:uring)?|ft)\.?\b", " and ", text)
    text = re.sub(r"\b(?:official|vevo|records?|music|topic)\b", " ", text)
    return clean_space(re.sub(r"[^a-z0-9]+", " ", text))


def reliable_artist(value: Any) -> bool:
    artist = normalize_metadata(value)
    return len(artist) >= 3 and artist not in GENERIC_ARTISTS


def lyrics_text(record: dict[str, Any] | None) -> str:
    if not record:
        return ""
    plain = record.get("plainLyrics")
    if isinstance(plain, str) and plain.strip():
        return plain
    synced = record.get("syncedLyrics")
    return TIMESTAMP.sub("", synced) if isinstance(synced, str) else ""


def normalize_lyrics(value: Any) -> tuple[list[str], list[str]]:
    raw = str(value or "").replace("\r", "\n")
    lines: list[str] = []
    words: list[str] = []
    for raw_line in raw.splitlines():
        line = TIMESTAMP.sub("", raw_line)
        line = METADATA_TAG.sub(" ", line)
        line = unidecode(line).lower()
        line = clean_space(re.sub(r"[^a-z0-9']+", " ", line))
        if not line or SECTION_LINE.fullmatch(line):
            continue
        line_words = re.findall(r"[a-z0-9]+", line)
        if not line_words:
            continue
        normalized_line = " ".join(line_words)
        lines.append(normalized_line)
        words.extend(line_words)
    return lines, words


def ngrams(words: list[str], size: int) -> set[tuple[str, ...]]:
    if len(words) < size:
        return set()
    return {tuple(words[index:index + size]) for index in range(len(words) - size + 1)}


def lyric_similarity(left: Any, right: Any) -> dict[str, float | int]:
    left_lines, left_words = normalize_lyrics(left)
    right_lines, right_words = normalize_lyrics(right)
    if min(len(left_words), len(right_words)) < 18:
        return {"score": 0.0, "containment": 0.0, "jaccard": 0.0, "sequence": 0.0, "lineContainment": 0.0, "words": min(len(left_words), len(right_words))}

    size = 4 if min(len(left_words), len(right_words)) >= 45 else 3
    left_grams = ngrams(left_words, size)
    right_grams = ngrams(right_words, size)
    intersection = len(left_grams & right_grams)
    containment = intersection / max(1, min(len(left_grams), len(right_grams)))
    jaccard = intersection / max(1, len(left_grams | right_grams))

    left_line_set = {line for line in left_lines if len(line.split()) >= 3}
    right_line_set = {line for line in right_lines if len(line.split()) >= 3}
    line_intersection = len(left_line_set & right_line_set)
    line_containment = line_intersection / max(1, min(len(left_line_set), len(right_line_set)))

    left_text = " ".join(left_words[:5000])
    right_text = " ".join(right_words[:5000])
    sequence = fuzz.ratio(left_text, right_text) / 100.0
    score = max(
        (containment * 0.72) + (jaccard * 0.28),
        (sequence * 0.68) + (containment * 0.32),
        (line_containment * 0.82) + (jaccard * 0.18),
    )
    return {
        "score": round(score, 4),
        "containment": round(containment, 4),
        "jaccard": round(jaccard, 4),
        "sequence": round(sequence, 4),
        "lineContainment": round(line_containment, 4),
        "words": min(len(left_words), len(right_words)),
    }


def similarity_status(metrics: dict[str, float | int]) -> str:
    words = int(metrics.get("words", 0))
    containment = float(metrics.get("containment", 0))
    jaccard = float(metrics.get("jaccard", 0))
    sequence = float(metrics.get("sequence", 0))
    line_containment = float(metrics.get("lineContainment", 0))
    if words < 18:
        return "unavailable"
    if (
        (containment >= 0.52 and jaccard >= 0.24)
        or sequence >= 0.68
        or line_containment >= 0.62
    ):
        return "verified"
    if (
        containment <= 0.12
        and jaccard <= 0.06
        and line_containment <= 0.12
        and sequence <= 0.56
    ):
        return "conflict"
    return "uncertain"


@dataclass(slots=True)
class Verification:
    status: str
    similarity: float | None = None
    target_id: int | None = None
    candidate_id: int | None = None
    target_title: str = ""
    target_artist: str = ""
    candidate_title: str = ""
    candidate_artist: str = ""
    metrics: dict[str, float | int] | None = None
    reason: str = ""

    def provenance(self) -> dict[str, Any]:
        return {
            "lyricsVerification": self.status,
            "lyricsSimilarity": self.similarity,
            "lrclibTargetId": self.target_id,
            "lrclibCandidateId": self.candidate_id,
            "lrclibTargetTitle": self.target_title or None,
            "lrclibTargetArtist": self.target_artist or None,
            "lrclibCandidateTitle": self.candidate_title or None,
            "lrclibCandidateArtist": self.candidate_artist or None,
            "lyricsVerificationReason": self.reason or None,
        }


class LRCLIBVerifier:
    def __init__(self, cache_path: str | Path | None = None, delay_seconds: float = 0.32):
        self.cache_path = Path(cache_path or os.environ.get("FRETLINE_LRCLIB_CACHE", "/tmp/fretline-lrclib-cache.json"))
        self.delay_seconds = max(0.2, delay_seconds)
        self.last_request_at = 0.0
        self.cache: dict[str, dict[str, Any] | None] = {}
        try:
            value = json.loads(self.cache_path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                self.cache = value
        except (OSError, json.JSONDecodeError):
            pass

    def _save(self) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def _request_json(self, url: str) -> Any:
        for attempt in range(4):
            elapsed = time.monotonic() - self.last_request_at
            if elapsed < self.delay_seconds:
                time.sleep(self.delay_seconds - elapsed)
            request = urllib.request.Request(url, headers={"User-Agent": CLIENT_ID, "Accept": "application/json"})
            try:
                self.last_request_at = time.monotonic()
                with urllib.request.urlopen(request, timeout=18) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    retry_after = float(error.headers.get("Retry-After", "2") or 2)
                    time.sleep(max(1.0, min(30.0, retry_after)))
                    continue
                if 500 <= error.code < 600 and attempt < 3:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                return None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                if attempt < 3:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                return None
        return None

    def _select(self, records: Any, title: str, artist: str, duration: float) -> dict[str, Any] | None:
        if not isinstance(records, list):
            return None
        title_norm = normalize_metadata(title)
        artist_norm = normalize_metadata(artist)
        artist_is_reliable = reliable_artist(artist)
        best: tuple[float, dict[str, Any]] | None = None
        for record in records[:20]:
            if not isinstance(record, dict):
                continue
            text = lyrics_text(record)
            if not text:
                continue
            record_title = normalize_metadata(record.get("trackName"))
            record_artist = normalize_metadata(record.get("artistName"))
            title_score = max(fuzz.ratio(title_norm, record_title), fuzz.WRatio(title_norm, record_title))
            artist_score = max(fuzz.token_set_ratio(artist_norm, record_artist), fuzz.WRatio(artist_norm, record_artist)) if artist_is_reliable else 55.0
            record_duration = float(record.get("duration") or 0)
            duration_difference = abs(duration - record_duration) if duration > 0 and record_duration > 0 else None
            duration_score = 60.0 if duration_difference is None else max(0.0, 100.0 - min(100.0, duration_difference * 2.0))
            score = (title_score * 0.61) + (artist_score * 0.29) + (duration_score * 0.10)
            if title_score < 78 or (artist_is_reliable and artist_score < 38):
                continue
            if best is None or score > best[0]:
                best = (score, record)
        return best[1] if best else None

    def find(self, title: str, artist: str, duration: float = 0) -> dict[str, Any] | None:
        key = json.dumps([normalize_metadata(title), normalize_metadata(artist), round(float(duration or 0))], ensure_ascii=False)
        if key in self.cache:
            return self.cache[key]
        parameters = {"track_name": clean_space(title)}
        if reliable_artist(artist):
            parameters["artist_name"] = clean_space(artist)
        url = LRCLIB_SEARCH_URL + "?" + urllib.parse.urlencode(parameters)
        record = self._select(self._request_json(url), title, artist, float(duration or 0))
        self.cache[key] = record
        self._save()
        return record

    def verify(self, track: dict[str, Any], candidate: Any) -> Verification:
        target_artist_reliable = reliable_artist(track.get("artist"))
        target = self.find(track.get("title", ""), track.get("artist", ""), float(track.get("duration") or 0))
        matched = self.find(candidate.title, candidate.artist, float(candidate.duration or 0))
        if not target or not matched:
            return Verification(status="unavailable", reason="lyrics-not-found")
        if not target_artist_reliable:
            return Verification(
                status="unavailable",
                target_id=target.get("id"), candidate_id=matched.get("id"),
                target_title=clean_space(target.get("trackName")), target_artist=clean_space(target.get("artistName")),
                candidate_title=clean_space(matched.get("trackName")), candidate_artist=clean_space(matched.get("artistName")),
                reason="playlist-artist-metadata-unreliable",
            )
        metrics = lyric_similarity(lyrics_text(target), lyrics_text(matched))
        status = similarity_status(metrics)
        return Verification(
            status=status,
            similarity=float(metrics["score"]),
            target_id=target.get("id"), candidate_id=matched.get("id"),
            target_title=clean_space(target.get("trackName")), target_artist=clean_space(target.get("artistName")),
            candidate_title=clean_space(matched.get("trackName")), candidate_artist=clean_space(matched.get("artistName")),
            metrics=metrics,
            reason="lyric-fingerprint-comparison",
        )
