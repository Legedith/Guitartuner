#!/usr/bin/env python3
"""Build a best-effort playlist chord catalog from licensed public datasets.

The matcher deliberately records provenance, confidence, score components, and
estimated timing. It refuses weak/ambiguous matches rather than silently
attaching a popular song's chart to a different recording with the same title.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import duckdb
from rapidfuzz import fuzz
from unidecode import unidecode

CHORDONOMICON_URL = "https://huggingface.co/datasets/ailsntua/Chordonomicon"
SPOTIFY_METADATA_URL = "https://huggingface.co/datasets/GildasLeDrogoff/spotify-huge-track-analysis-dataset"

GENERIC_TITLE_WORDS = {
    "official", "audio", "video", "music", "lyric", "lyrics", "visualizer",
    "full", "song", "hd", "hq", "topic", "vevo", "version", "track",
}
STOP_TOKENS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "from",
    "with", "feat", "featuring", "ft", "by", "at", "is", "it", "my", "your",
}
SIGNIFICANT_VERSION_TAGS = {
    "live", "acoustic", "remix", "instrumental", "karaoke", "cover", "demo",
    "unplugged", "reprise", "spedup", "slowed", "lofi", "mashup", "medley",
}
SECTION_NAMES = {
    "intro": "Intro", "verse": "Verse", "chorus": "Chorus", "bridge": "Bridge",
    "prechorus": "Pre-chorus", "postchorus": "Post-chorus", "outro": "Outro",
    "interlude": "Interlude", "instrumental": "Instrumental", "solo": "Solo",
    "break": "Break", "hook": "Hook", "refrain": "Refrain", "ending": "Ending",
}
SUPPORTED_SUFFIXES = {
    "", "m", "7", "maj7", "m7", "6", "m6", "add9", "madd9", "9", "maj9",
    "m9", "11", "m11", "13", "maj13", "m13", "sus2", "sus4", "7sus4",
    "dim", "dim7", "aug", "5", "m7b5", "mmaj7", "7b5", "7#5", "7b9",
    "7#9", "add11", "6add9",
}


def sql_literal(path: str | Path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def clean_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def ascii_text(value: Any) -> str:
    return unidecode(clean_space(value)).lower()


def extract_version_tags(value: Any) -> set[str]:
    text = ascii_text(value).replace("-", " ").replace("_", " ")
    compact = re.sub(r"[^a-z0-9]+", "", text)
    tags: set[str] = set()
    patterns = {
        "live": r"\blive\b|liveat|livefrom",
        "acoustic": r"\bacoustic\b",
        "remix": r"\bremix(?:ed)?\b|\bmix\b",
        "instrumental": r"\binstrumental\b",
        "karaoke": r"\bkaraoke\b",
        "cover": r"\bcover\b",
        "demo": r"\bdemo\b",
        "unplugged": r"\bunplugged\b",
        "reprise": r"\breprise\b",
        "spedup": r"sped\s*up|speed\s*up",
        "slowed": r"\bslowed\b|slow\s*version",
        "lofi": r"\blo[ -]?fi\b",
        "mashup": r"\bmashup\b",
        "medley": r"\bmedley\b",
    }
    for tag, pattern in patterns.items():
        if re.search(pattern, text) or tag in compact:
            tags.add(tag)
    return tags


def normalize_title(value: Any, *, base: bool = False) -> str:
    text = ascii_text(value)
    text = text.replace("&", " and ")
    text = re.sub(r"\b(?:feat(?:uring)?|ft)\.?\s+.+$", " ", text)
    text = re.sub(r"\s+-\s+(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer).*$", " ", text)

    def clean_group(match: re.Match[str]) -> str:
        inner = match.group(1)
        tags = extract_version_tags(inner)
        generic = set(re.findall(r"[a-z0-9]+", inner)) <= GENERIC_TITLE_WORDS
        if base and (tags or generic or "remaster" in inner or "version" in inner):
            return " "
        if generic:
            return " "
        return " " + inner + " "

    text = re.sub(r"[\[(]([^\])]+)[\])]", clean_group, text)
    text = re.sub(r"\b(?:official|music|audio|video|lyrics?|visualizer|full song)\b", " ", text)
    if base:
        text = re.sub(
            r"\b(?:live|acoustic|remix(?:ed)?|instrumental|karaoke|cover|demo|unplugged|reprise|sped up|slowed|lo fi|lofi|mashup|medley|remaster(?:ed)?)\b",
            " ",
            text,
        )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return clean_space(text)


def normalize_artist(value: Any) -> str:
    text = ascii_text(value)
    text = re.sub(r"\s+-\s+topic$", "", text)
    text = re.sub(r"\b(?:official|vevo|records?|music)\b", " ", text)
    text = re.sub(r"\b(?:feat(?:uring)?|ft|with)\b", " and ", text)
    text = text.replace("&", " and ").replace("|", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return clean_space(text)


def title_tokens(value: str) -> tuple[str, ...]:
    return tuple(token for token in value.split() if len(token) >= 3 and token not in STOP_TOKENS)


@dataclass(slots=True)
class Candidate:
    spotify_id: str
    title: str
    artist: str
    album: str
    duration: float
    tempo: float
    release_date: str
    chords: str
    chord_release_date: str
    genres: str
    main_genre: str
    title_norm: str
    title_base: str
    artist_norm: str
    version_tags: frozenset[str]


@dataclass(slots=True)
class MatchScore:
    candidate_index: int
    total: float
    title: float
    artist: float
    duration: float
    duration_diff: float | None
    version_penalty: float


def build_chord_metadata(chordonomicon_path: Path, spotify_path: Path, cache_path: Path) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET threads TO 4")
    con.execute("SET memory_limit TO '5GB'")
    con.execute("SET temp_directory TO '/tmp/fretline-duckdb'")
    chord_file = sql_literal(chordonomicon_path)
    spotify_file = sql_literal(spotify_path)
    cache_file = sql_literal(cache_path)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE chord_source AS
        SELECT spotify_song_id, chords, release_date, genres, main_genre, spotify_artist_id
        FROM (
          SELECT
            spotify_song_id,
            chords,
            release_date,
            genres,
            main_genre,
            spotify_artist_id,
            row_number() OVER (
              PARTITION BY spotify_song_id
              ORDER BY length(chords) DESC NULLS LAST, try_cast(id AS BIGINT) ASC NULLS LAST
            ) AS row_number
          FROM read_csv_auto(
            {chord_file},
            header = true,
            all_varchar = true,
            sample_size = -1,
            ignore_errors = true
          )
          WHERE regexp_full_match(coalesce(spotify_song_id, ''), '[A-Za-z0-9]{{22}}')
            AND length(coalesce(chords, '')) > 0
        )
        WHERE row_number = 1
        """
    )
    count = con.execute("SELECT count(*) FROM chord_source").fetchone()[0]
    print(f"Loaded {count:,} unique Chordonomicon Spotify IDs.", flush=True)
    con.execute(
        f"""
        COPY (
          WITH spotify AS (
            SELECT
              track_id,
              any_value(track_name) AS track_name,
              string_agg(DISTINCT artist_name, ' | ') AS artist_name,
              any_value(album_name) AS album_name,
              any_value(CAST(album_release_date AS VARCHAR)) AS album_release_date,
              max(CAST(duration_ms AS BIGINT)) AS duration_ms,
              max(CAST(tempo AS DOUBLE)) AS tempo
            FROM read_parquet({spotify_file})
            WHERE track_id IN (SELECT spotify_song_id FROM chord_source)
            GROUP BY track_id
          )
          SELECT
            spotify.track_id,
            spotify.track_name,
            spotify.artist_name,
            spotify.album_name,
            spotify.duration_ms,
            spotify.tempo,
            spotify.album_release_date,
            chord_source.chords,
            chord_source.release_date AS chord_release_date,
            chord_source.genres,
            chord_source.main_genre
          FROM spotify
          INNER JOIN chord_source ON spotify.track_id = chord_source.spotify_song_id
        ) TO {cache_file} (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    matched = con.execute(f"SELECT count(*) FROM read_parquet({cache_file})").fetchone()[0]
    print(f"Resolved metadata for {matched:,} Chordonomicon tracks.", flush=True)
    con.close()


def load_candidates(cache_path: Path) -> list[Candidate]:
    con = duckdb.connect()
    rows = con.execute(
        """
        SELECT track_id, track_name, artist_name, album_name, duration_ms, tempo,
               album_release_date, chords, chord_release_date, genres, main_genre
        FROM read_parquet(?)
        """,
        [str(cache_path)],
    ).fetchall()
    con.close()
    candidates: list[Candidate] = []
    for row in rows:
        title = clean_space(row[1])
        artist = clean_space(row[2])
        album = clean_space(row[3])
        duration = float(row[4] or 0) / 1000
        tempo = float(row[5] or 0)
        combined_version = f"{title} {album}"
        candidates.append(
            Candidate(
                spotify_id=row[0], title=title, artist=artist, album=album,
                duration=duration, tempo=tempo, release_date=clean_space(row[6]),
                chords=clean_space(row[7]), chord_release_date=clean_space(row[8]),
                genres=clean_space(row[9]), main_genre=clean_space(row[10]),
                title_norm=normalize_title(title), title_base=normalize_title(title, base=True),
                artist_norm=normalize_artist(artist), version_tags=frozenset(extract_version_tags(combined_version)),
            )
        )
    return candidates


def build_candidate_indexes(candidates: list[Candidate]) -> tuple[dict[str, list[int]], dict[str, list[int]], dict[tuple[str, int], list[int]]]:
    exact: dict[str, list[int]] = defaultdict(list)
    token_counts: Counter[str] = Counter()
    buckets: dict[tuple[str, int], list[int]] = defaultdict(list)
    for index, candidate in enumerate(candidates):
        exact[candidate.title_base].append(index)
        tokens = set(title_tokens(candidate.title_base))
        token_counts.update(tokens)
        first = candidate.title_base[:1]
        buckets[(first, len(candidate.title_base) // 5)].append(index)
    token_index: dict[str, list[int]] = defaultdict(list)
    for index, candidate in enumerate(candidates):
        for token in set(title_tokens(candidate.title_base)):
            if token_counts[token] <= 1800:
                token_index[token].append(index)
    return exact, token_index, buckets


def candidate_pool(
    title_base: str,
    exact: dict[str, list[int]],
    token_index: dict[str, list[int]],
    buckets: dict[tuple[str, int], list[int]],
    candidates: list[Candidate],
) -> list[int]:
    pool: set[int] = set(exact.get(title_base, []))
    tokens = sorted(title_tokens(title_base), key=lambda token: len(token), reverse=True)
    for token in tokens[:4]:
        pool.update(token_index.get(token, []))
    first = title_base[:1]
    length_bucket = len(title_base) // 5
    for bucket in range(max(0, length_bucket - 2), length_bucket + 3):
        pool.update(buckets.get((first, bucket), []))
    if len(pool) > 9000:
        pool = set(sorted(pool, key=lambda index: abs(len(candidates[index].title_base) - len(title_base)))[:9000])
    return list(pool)


def score_candidate(track: dict[str, Any], candidate: Candidate, index: int) -> MatchScore:
    title_score = max(
        fuzz.WRatio(track["title_norm"], candidate.title_norm),
        fuzz.WRatio(track["title_base"], candidate.title_base),
        fuzz.token_set_ratio(track["title_base"], candidate.title_base),
    )
    artist_score = 0.0
    if track["artist_norm"] and candidate.artist_norm:
        artist_score = max(
            fuzz.token_set_ratio(track["artist_norm"], candidate.artist_norm),
            fuzz.WRatio(track["artist_norm"], candidate.artist_norm),
            fuzz.partial_ratio(track["artist_norm"], candidate.artist_norm),
        )
    elif not track["artist_norm"]:
        artist_score = 58.0

    duration_diff: float | None = None
    duration_score = 50.0
    if track["duration"] > 0 and candidate.duration > 0:
        duration_diff = abs(track["duration"] - candidate.duration)
        if duration_diff <= 2:
            duration_score = 100.0
        elif duration_diff >= 45:
            duration_score = 0.0
        else:
            duration_score = max(0.0, 100.0 - ((duration_diff - 2) * (100.0 / 43.0)))

    target_tags = track["version_tags"] & SIGNIFICANT_VERSION_TAGS
    candidate_tags = set(candidate.version_tags) & SIGNIFICANT_VERSION_TAGS
    missing = target_tags - candidate_tags
    extra = candidate_tags - target_tags
    version_penalty = (len(missing) * 15.0) + (len(extra) * 6.0)
    total = (title_score * 0.57) + (artist_score * 0.28) + (duration_score * 0.15) - version_penalty
    if track["title_base"] == candidate.title_base:
        total += 3.0
    if track["artist_norm"] and track["artist_norm"] == candidate.artist_norm:
        total += 2.0
    return MatchScore(index, total, title_score, artist_score, duration_score, duration_diff, version_penalty)


def classify_match(track: dict[str, Any], best: MatchScore, second: MatchScore | None, candidate: Candidate) -> str | None:
    margin = best.total - (second.total if second else 0.0)
    duration_diff = best.duration_diff if best.duration_diff is not None else 999.0
    exact_title = track["title_base"] == candidate.title_base
    exact_artist = bool(track["artist_norm"]) and track["artist_norm"] == candidate.artist_norm
    significant_conflict = best.version_penalty >= 15

    if significant_conflict:
        return None
    if exact_title and exact_artist and duration_diff <= 16:
        return "high"
    if exact_title and best.artist >= 90 and (duration_diff <= 18 or best.duration_diff is None):
        return "high"
    if best.total >= 91 and best.title >= 94 and best.artist >= 84 and margin >= 2.5 and (duration_diff <= 22 or best.duration_diff is None):
        return "high"
    if best.total >= 85 and best.title >= 90 and best.artist >= 72 and margin >= 4.0 and (duration_diff <= 30 or best.duration_diff is None):
        return "medium"
    if best.total >= 79 and best.title >= 86 and best.artist >= 58 and margin >= 7.0 and (duration_diff <= 35 or best.duration_diff is None):
        return "low"
    return None


def normalize_note(root: str, accidental: str) -> str:
    return root + ("#" if accidental == "s" else "b" if accidental == "b" else "")


def normalize_suffix(raw_suffix: str, unknown_suffixes: Counter[str]) -> tuple[str, bool]:
    suffix = raw_suffix.strip().replace("♯", "#").replace("♭", "b")
    lower = suffix.lower().replace("-", "")
    lower = lower.replace("minor", "min").replace("major", "maj")
    aliases = {
        "": "", "min": "m", "m": "m", "maj": "", "7": "7",
        "maj7": "maj7", "min7": "m7", "m7": "m7", "6": "6", "maj6": "6",
        "min6": "m6", "m6": "m6", "add9": "add9", "add2": "add9",
        "minadd9": "madd9", "madd9": "madd9", "9": "9", "maj9": "maj9",
        "min9": "m9", "m9": "m9", "11": "11", "maj11": "11",
        "min11": "m11", "m11": "m11", "13": "13", "maj13": "maj13",
        "min13": "m13", "m13": "m13", "sus": "sus4", "sus2": "sus2",
        "sus4": "sus4", "7sus": "7sus4", "7sus4": "7sus4", "dim": "dim",
        "dim7": "dim7", "aug": "aug", "+": "aug", "5": "5", "no3": "5",
        "no3d": "5", "min7b5": "m7b5", "m7b5": "m7b5", "hdim7": "m7b5",
        "minmaj7": "mMaj7", "mmaj7": "mMaj7", "7b5": "7b5", "7#5": "7#5",
        "7b9": "7b9", "7#9": "7#9", "add11": "add11", "add4": "add11",
        "6add9": "6add9", "69": "6add9",
    }
    if lower in aliases:
        return aliases[lower], False
    if lower.endswith("no5"):
        base = lower[:-3]
        mapped = aliases.get(base, "m" if base.startswith("min") or base.startswith("m") else "")
        return mapped, True
    if "add13" in lower:
        return "6", True
    if lower.startswith("min"):
        unknown_suffixes[lower] += 1
        return "m", True
    if lower.startswith("m") and not lower.startswith("maj"):
        unknown_suffixes[lower] += 1
        return "m", True
    if lower.startswith("dim"):
        unknown_suffixes[lower] += 1
        return "dim", True
    if lower.startswith("aug"):
        unknown_suffixes[lower] += 1
        return "aug", True
    if lower.startswith("7"):
        unknown_suffixes[lower] += 1
        return "7", True
    unknown_suffixes[lower or "<empty>"] += 1
    return "", True


def normalize_chord_token(token: str, unknown_suffixes: Counter[str]) -> tuple[str | None, bool]:
    match = re.fullmatch(r"([A-G])([sb]?)([^/]*?)(?:/([A-G])([sb]?)(.*))?", token)
    if not match:
        return None, True
    root = normalize_note(match.group(1), match.group(2))
    suffix, approximate = normalize_suffix(match.group(3), unknown_suffixes)
    bass = ""
    if match.group(4):
        bass = "/" + normalize_note(match.group(4), match.group(5))
    return f"{root}{suffix}{bass}", approximate


def section_label(marker: str) -> str:
    match = re.fullmatch(r"<([a-z]+)_(\d+)>", marker.lower())
    if not match:
        return "Section"
    name = SECTION_NAMES.get(match.group(1), match.group(1).replace("_", " ").title())
    number = int(match.group(2))
    return f"{name} {number}" if number > 1 else name


def build_chart(candidate: Candidate, track: dict[str, Any], confidence: str, best: MatchScore, margin: float, unknown_suffixes: Counter[str]) -> tuple[dict[str, Any] | None, int]:
    sections: list[dict[str, Any]] = []
    current = {"label": "Song", "chords": []}
    approximate_count = 0
    for token in candidate.chords.split():
        if token.startswith("<") and token.endswith(">"):
            if current["chords"]:
                sections.append(current)
            current = {"label": section_label(token), "chords": []}
            continue
        chord, approximate = normalize_chord_token(token, unknown_suffixes)
        if chord:
            current["chords"].append(chord)
            approximate_count += int(approximate)
    if current["chords"]:
        sections.append(current)
    chord_count = sum(len(section["chords"]) for section in sections)
    if chord_count < 2:
        return None, approximate_count

    duration = float(track.get("duration") or candidate.duration or 0)
    bpm = float(candidate.tempo or 0)
    if not math.isfinite(bpm) or bpm < 20 or bpm > 300:
        bpm = 90.0
    if duration <= 0:
        duration = chord_count * (60 / bpm) * 4
    start_padding = min(2.0, duration * 0.01)
    usable_duration = max(chord_count * 0.25, duration - start_padding)
    spacing = usable_duration / chord_count
    beats_per_chord = spacing * bpm / 60

    raw_lines: list[str] = []
    events: list[dict[str, Any]] = []
    chord_index = 0
    for section in sections:
        raw_lines.append(f"[{section['label']}]")
        raw_lines.append(" | ".join(section["chords"]))
        first_in_section = True
        for chord in section["chords"]:
            events.append({
                "time": round(start_padding + (chord_index * spacing), 2),
                "chord": chord,
                "section": section["label"] if first_in_section else "",
            })
            first_in_section = False
            chord_index += 1

    duration_diff = best.duration_diff
    chart = {
        "videoId": track["videoId"],
        "title": track["title"],
        "artist": track["artist"],
        "bpm": round(bpm, 3),
        "beatsPerChord": round(beats_per_chord, 3),
        "raw": "\n".join(raw_lines),
        "events": events,
        "sourceUrl": CHORDONOMICON_URL,
        "updatedAt": int(datetime.now(tz=timezone.utc).timestamp() * 1000),
        "bundled": True,
        "license": "CC BY-NC 4.0",
        "provenance": {
            "dataset": "Chordonomicon",
            "spotifySongId": candidate.spotify_id,
            "spotifyTitle": candidate.title,
            "spotifyArtist": candidate.artist,
            "spotifyAlbum": candidate.album,
            "confidence": confidence,
            "score": round(best.total, 2),
            "titleScore": round(best.title, 2),
            "artistScore": round(best.artist, 2),
            "durationDifferenceSeconds": round(duration_diff, 2) if duration_diff is not None else None,
            "runnerUpMargin": round(margin, 2),
            "timing": "estimated-uniform-fit",
            "chordSpellingApproximations": approximate_count,
            "mainGenre": candidate.main_genre or None,
        },
    }
    return chart, approximate_count


def prepare_track(track: dict[str, Any]) -> dict[str, Any]:
    title = clean_space(track.get("title"))
    artist = clean_space(track.get("artist"))
    return {
        **track,
        "title": title,
        "artist": artist,
        "duration": float(track.get("duration") or 0),
        "title_norm": normalize_title(title),
        "title_base": normalize_title(title, base=True),
        "artist_norm": normalize_artist(artist),
        "version_tags": extract_version_tags(f"{title} {track.get('album', '')}"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--playlist", default="src/data/playlist-catalog.json")
    parser.add_argument("--chordonomicon", required=True)
    parser.add_argument("--spotify-metadata", required=True)
    parser.add_argument("--metadata-cache", default="/tmp/fretline-chord-metadata.parquet")
    parser.add_argument("--output", default="src/data/chord-catalog.json")
    parser.add_argument("--report", default="src/data/chord-match-report.json")
    parser.add_argument("--reuse-metadata-cache", action="store_true")
    args = parser.parse_args()

    playlist_path = Path(args.playlist)
    chordonomicon_path = Path(args.chordonomicon)
    spotify_path = Path(args.spotify_metadata)
    metadata_cache = Path(args.metadata_cache)
    output_path = Path(args.output)
    report_path = Path(args.report)

    playlist = json.loads(playlist_path.read_text(encoding="utf-8"))
    tracks = [prepare_track(track) for track in playlist.get("tracks", [])]
    if not tracks:
        raise RuntimeError("Playlist catalog is empty.")

    if not args.reuse_metadata_cache or not metadata_cache.exists():
        build_chord_metadata(chordonomicon_path, spotify_path, metadata_cache)
    candidates = load_candidates(metadata_cache)
    if len(candidates) < 100_000:
        raise RuntimeError(f"Only {len(candidates):,} Spotify chord candidates were resolved; source extraction is incomplete.")
    print(f"Scoring {len(tracks):,} playlist entries against {len(candidates):,} chord candidates.", flush=True)
    exact, token_index, buckets = build_candidate_indexes(candidates)

    unique_tracks: dict[str, dict[str, Any]] = {}
    for track in tracks:
        unique_tracks.setdefault(track["videoId"], track)

    charts: dict[str, dict[str, Any]] = {}
    matches: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    confidence_counts: Counter[str] = Counter()
    unknown_suffixes: Counter[str] = Counter()
    approximate_chords = 0

    for position, track in enumerate(unique_tracks.values(), start=1):
        if not track["title_base"]:
            unmatched.append({"videoId": track["videoId"], "title": track["title"], "artist": track["artist"], "reason": "empty-title"})
            continue
        pool = candidate_pool(track["title_base"], exact, token_index, buckets, candidates)
        scored = sorted((score_candidate(track, candidates[index], index) for index in pool), key=lambda item: item.total, reverse=True)
        best = scored[0] if scored else None
        second = scored[1] if len(scored) > 1 else None
        if not best:
            unmatched.append({"videoId": track["videoId"], "title": track["title"], "artist": track["artist"], "reason": "no-candidates"})
            continue
        candidate = candidates[best.candidate_index]
        confidence = classify_match(track, best, second, candidate)
        margin = best.total - (second.total if second else 0.0)
        if not confidence:
            unmatched.append({
                "videoId": track["videoId"], "title": track["title"], "artist": track["artist"],
                "reason": "below-threshold", "bestSpotifyId": candidate.spotify_id,
                "bestSpotifyTitle": candidate.title, "bestSpotifyArtist": candidate.artist,
                "score": round(best.total, 2), "titleScore": round(best.title, 2),
                "artistScore": round(best.artist, 2), "margin": round(margin, 2),
                "durationDifferenceSeconds": round(best.duration_diff, 2) if best.duration_diff is not None else None,
            })
            continue
        chart, approximate_count = build_chart(candidate, track, confidence, best, margin, unknown_suffixes)
        if not chart:
            unmatched.append({"videoId": track["videoId"], "title": track["title"], "artist": track["artist"], "reason": "unusable-progression"})
            continue
        charts[track["videoId"]] = chart
        confidence_counts[confidence] += 1
        approximate_chords += approximate_count
        matches.append({
            "videoId": track["videoId"], "title": track["title"], "artist": track["artist"],
            "spotifySongId": candidate.spotify_id, "spotifyTitle": candidate.title,
            "spotifyArtist": candidate.artist, "confidence": confidence,
            "score": round(best.total, 2), "margin": round(margin, 2),
            "durationDifferenceSeconds": round(best.duration_diff, 2) if best.duration_diff is not None else None,
            "chordChanges": len(chart["events"]), "approximatedChordSpellings": approximate_count,
        })
        if position % 100 == 0:
            print(f"Processed {position:,}/{len(unique_tracks):,} unique videos; {len(charts):,} charts accepted.", flush=True)

    now = datetime.now(tz=timezone.utc).isoformat()
    unique_video_count = len(unique_tracks)
    catalog = {
        "schema": "fretline-chord-catalog",
        "version": 1,
        "playlistId": playlist.get("playlistId"),
        "generatedAt": now,
        "license": "CC BY-NC 4.0",
        "attribution": {
            "chords": {
                "name": "Chordonomicon",
                "url": CHORDONOMICON_URL,
                "citation": "Kantarelis et al., CHORDONOMICON: A Dataset of 666,000 Songs and their Chord Progressions, 2024",
            },
            "spotifyMetadata": {
                "name": "Spotify Huge Track Analysis Dataset",
                "url": SPOTIFY_METADATA_URL,
            },
        },
        "timingNotice": "Chord sequences are dataset transcriptions. Change times are estimates fitted uniformly to the YouTube track duration and may require manual correction.",
        "stats": {
            "playlistEntries": len(tracks),
            "uniqueVideos": unique_video_count,
            "chartedUniqueVideos": len(charts),
            "coveragePercent": round((len(charts) / unique_video_count) * 100, 2),
            "highConfidence": confidence_counts["high"],
            "mediumConfidence": confidence_counts["medium"],
            "lowConfidence": confidence_counts["low"],
            "unmatched": len(unmatched),
            "spotifyChordCandidates": len(candidates),
            "approximatedChordSpellings": approximate_chords,
        },
        "charts": charts,
    }
    report = {
        "schema": "fretline-chord-match-report",
        "version": 1,
        "generatedAt": now,
        "stats": catalog["stats"],
        "matches": matches,
        "unmatched": unmatched,
        "unknownChordSuffixes": unknown_suffixes.most_common(100),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(catalog["stats"], indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"Chord catalog generation failed: {error}", file=sys.stderr)
        raise
