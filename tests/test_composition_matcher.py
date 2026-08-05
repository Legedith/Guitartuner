from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "index-composition-chords.py"
SPEC = importlib.util.spec_from_file_location("fretline_composition_matcher_tests", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {SCRIPT}")
MATCHER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MATCHER
SPEC.loader.exec_module(MATCHER)
BASE = MATCHER.BASE
LYRICS = MATCHER.LYRICS


def track(title: str, artist: str, duration: float = 0, video_id: str = "dQw4w9WgXcQ") -> dict:
    return {
        "videoId": video_id,
        "title": title,
        "artist": artist,
        "duration": duration,
        "title_norm": BASE.normalize_title(title),
        "title_base": BASE.normalize_title(title, base=True),
        "artist_norm": BASE.normalize_artist(artist),
        "version_tags": BASE.extract_version_tags(title),
    }


def candidate(title: str, artist: str, duration: float = 0, spotify_id: str = "2mgEVBgwMKARxj9AHhaOq7"):
    return SimpleNamespace(
        spotify_id=spotify_id,
        title=title,
        artist=artist,
        album="",
        duration=duration,
        title_norm=BASE.normalize_title(title),
        title_base=BASE.normalize_title(title, base=True),
        artist_norm=BASE.normalize_artist(artist),
        version_tags=frozenset(BASE.extract_version_tags(title)),
    )


class FakeVerifier:
    def __init__(self, status: str = "verified", similarity: float = 0.92):
        self.status = status
        self.similarity = similarity
        self.calls = 0

    def verify(self, left, right):
        self.calls += 1
        return LYRICS.Verification(status=self.status, similarity=self.similarity, reason="unit-test")


class CompositionMatcherTests(unittest.TestCase):
    def setUp(self):
        MATCHER.VERIFICATIONS.clear()
        MATCHER.POLICY_STATS.clear()
        self.verifier = FakeVerifier()
        MATCHER.VERIFIER = self.verifier

    def score(self, left: dict, right, index: int = 0):
        return MATCHER.composition_score_candidate(left, right, index)

    def classify(self, left: dict, right, runner_up_total: float = 0, verification: str = "verified"):
        self.verifier.status = verification
        best = self.score(left, right)
        second = SimpleNamespace(total=runner_up_total) if runner_up_total else None
        return MATCHER.composition_classify_match(left, best, second, right), best

    def test_cover_with_same_distinctive_title_is_accepted_after_lyrics_match(self):
        confidence, score = self.classify(
            track("Time in a Bottle", "Jim Croce", 147),
            candidate("Time In A Bottle", "Glen Campbell", 154),
        )
        self.assertEqual(confidence, "medium")
        self.assertEqual(score.title, 100)
        self.assertEqual(self.verifier.calls, 1)

    def test_acoustic_or_remix_version_by_same_artist_needs_no_lyrics_call(self):
        confidence, score = self.classify(
            track("Kasoor (Acoustic)", "Prateek Kuhad", 215),
            candidate("Kasoor", "Prateek Kuhad", 181),
        )
        self.assertEqual(confidence, "high")
        self.assertEqual(score.version_penalty, 0)
        self.assertEqual(self.verifier.calls, 0)

    def test_same_christmas_standard_by_another_artist_is_accepted_when_lyrics_match(self):
        confidence, _ = self.classify(
            track("Let It Snow! Let It Snow! Let It Snow!", "Dean Martin", 118),
            candidate("Let It Snow, Let It Snow, Let It Snow", "Martina McBride", 129),
        )
        self.assertEqual(confidence, "medium")

    def test_same_title_different_song_is_rejected_when_lyrics_conflict(self):
        confidence, _ = self.classify(
            track("I Ain't The One", "Lynyrd Skynyrd", 224),
            candidate("I Ain't the One", "Spoon", 219),
            verification="conflict",
        )
        self.assertIsNone(confidence)

    def test_token_subset_does_not_turn_baby_titles_into_a_candidate(self):
        confidence, score = self.classify(
            track("Baby Got Back", "Sir Mix-A-Lot", 264),
            candidate("Baby, Baby, Baby", "Roy Buchanan", 260),
        )
        self.assertIsNone(confidence)
        self.assertLess(score.title, 80)
        self.assertEqual(self.verifier.calls, 0)

    def test_johnny_b_goode_does_not_collapse_to_johnny(self):
        confidence, score = self.classify(
            track("Johnny B. Goode", "Release", 162),
            candidate("Johnny", "Les Wampas", 172),
        )
        self.assertIsNone(confidence)
        self.assertLess(score.title, 80)

    def test_shared_acoustic_word_does_not_match_unrelated_song(self):
        confidence, score = self.classify(
            track("The Sound of Silence (Acoustic Version)", "Simon & Garfunkel", 195),
            candidate("Twice in Life - Acoustic Version", "Mono Inc.", 196),
        )
        self.assertIsNone(confidence)
        self.assertLess(score.title, 80)

    def test_short_generic_title_still_needs_more_than_same_title(self):
        confidence, _ = self.classify(
            track("Home", "Artist One", 210),
            candidate("Home", "Unrelated Artist", 420),
            verification="unavailable",
        )
        self.assertIsNone(confidence)

    def test_distinctive_cover_can_ignore_large_duration_change_when_lyrics_match(self):
        confidence, _ = self.classify(
            track("The Sound of Silence (Live)", "Disturbed", 260),
            candidate("The Sound of Silence", "Simon & Garfunkel", 185),
        )
        self.assertEqual(confidence, "medium")

    def test_unreliable_topic_artist_can_use_tight_duration_fallback(self):
        confidence, _ = self.classify(
            track("Nijanga Nenena", "- Topic", 312),
            candidate("Nijanga Nenena", "Karthik", 313),
            verification="unavailable",
        )
        self.assertEqual(confidence, "medium")


class LyricFingerprintTests(unittest.TestCase):
    def test_repeated_or_missing_sections_still_verify(self):
        left = """First light over the river\nWe walk the old road home\nFirst light over the river\nWe walk the old road home\nThe morning knows our names"""
        right = """First light over the river\nWe walk the old road home\nThe morning knows our names"""
        metrics = LYRICS.lyric_similarity(left, right)
        self.assertEqual(LYRICS.similarity_status(metrics), "verified")
        self.assertGreater(metrics["containment"], 0.7)

    def test_unrelated_lyrics_conflict(self):
        left = """First light over the river\nWe walk the old road home\nThe morning knows our names\nCarry every memory"""
        right = """Neon wheels across the city\nMidnight engines never sleep\nPaper stars are falling quickly\nCount the secrets that we keep"""
        metrics = LYRICS.lyric_similarity(left, right)
        self.assertEqual(LYRICS.similarity_status(metrics), "conflict")

    def test_short_text_is_not_treated_as_proof(self):
        metrics = LYRICS.lyric_similarity("hello again", "hello again")
        self.assertEqual(LYRICS.similarity_status(metrics), "unavailable")


if __name__ == "__main__":
    unittest.main()
