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


def track(title: str, artist: str, duration: float = 0) -> dict:
    return {
        "title": title,
        "artist": artist,
        "duration": duration,
        "title_norm": BASE.normalize_title(title),
        "title_base": BASE.normalize_title(title, base=True),
        "artist_norm": BASE.normalize_artist(artist),
        "version_tags": BASE.extract_version_tags(title),
    }


def candidate(title: str, artist: str, duration: float = 0):
    return SimpleNamespace(
        title=title,
        artist=artist,
        album="",
        duration=duration,
        title_norm=BASE.normalize_title(title),
        title_base=BASE.normalize_title(title, base=True),
        artist_norm=BASE.normalize_artist(artist),
        version_tags=frozenset(BASE.extract_version_tags(title)),
    )


class CompositionMatcherTests(unittest.TestCase):
    def score(self, left: dict, right, index: int = 0):
        return MATCHER.composition_score_candidate(left, right, index)

    def classify(self, left: dict, right, runner_up_total: float = 0):
        best = self.score(left, right)
        second = SimpleNamespace(total=runner_up_total) if runner_up_total else None
        return MATCHER.composition_classify_match(left, best, second, right), best

    def test_cover_with_same_distinctive_title_is_accepted(self):
        confidence, score = self.classify(
            track("Time in a Bottle", "Jim Croce", 147),
            candidate("Time In A Bottle", "Glen Campbell", 154),
        )
        self.assertEqual(confidence, "medium")
        self.assertEqual(score.title, 100)

    def test_acoustic_or_remix_version_never_vetoes_same_song(self):
        confidence, score = self.classify(
            track("Kasoor (Acoustic)", "Prateek Kuhad", 215),
            candidate("Kasoor", "Prateek Kuhad", 181),
        )
        self.assertEqual(confidence, "high")
        self.assertEqual(score.version_penalty, 0)

    def test_same_christmas_standard_by_another_artist_is_accepted(self):
        confidence, _ = self.classify(
            track("Let It Snow! Let It Snow! Let It Snow!", "Dean Martin", 118),
            candidate("Let It Snow, Let It Snow, Let It Snow", "Martina McBride", 129),
        )
        self.assertEqual(confidence, "medium")

    def test_token_subset_does_not_turn_baby_titles_into_a_false_exact_match(self):
        confidence, score = self.classify(
            track("Baby Got Back", "Sir Mix-A-Lot", 264),
            candidate("Baby, Baby, Baby", "Roy Buchanan", 260),
        )
        self.assertIsNone(confidence)
        self.assertLess(score.title, 80)

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

    def test_short_generic_title_still_needs_corroboration(self):
        confidence, _ = self.classify(
            track("Home", "Artist One", 210),
            candidate("Home", "Unrelated Artist", 420),
        )
        self.assertIsNone(confidence)

    def test_distinctive_exact_title_can_ignore_large_version_duration_change(self):
        confidence, _ = self.classify(
            track("The Sound of Silence (Live)", "Disturbed", 260),
            candidate("The Sound of Silence", "Simon & Garfunkel", 185),
        )
        self.assertEqual(confidence, "medium")


if __name__ == "__main__":
    unittest.main()
