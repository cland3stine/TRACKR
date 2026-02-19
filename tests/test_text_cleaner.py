from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))

from trackr.text_cleaner import clean_track_line, normalize_for_dedupe, EM_DASH  # noqa: E402


class TextCleanerTests(unittest.TestCase):
    # --- Camelot key removal ---

    def test_bare_camelot_key_removed(self):
        self.assertEqual(clean_track_line("Artist - Title 8A"), "Artist - Title")

    def test_camelot_key_in_brackets_removed(self):
        self.assertEqual(clean_track_line("Artist - Title [12B]"), "Artist - Title")

    def test_camelot_key_in_parens_removed(self):
        self.assertEqual(clean_track_line("Artist - Title (4A)"), "Artist - Title")

    def test_camelot_key_with_spaces_in_brackets(self):
        self.assertEqual(clean_track_line("Artist - Title [ 8A ]"), "Artist - Title")

    def test_camelot_key_case_insensitive(self):
        self.assertEqual(clean_track_line("Artist - Title 11b"), "Artist - Title")

    def test_camelot_key_at_start(self):
        self.assertEqual(clean_track_line("8A Artist - Title"), "Artist - Title")

    # --- Bracket tag removal ---

    def test_genre_bracket_tag_removed(self):
        self.assertEqual(clean_track_line("Artist - Title [breaks]"), "Artist - Title")

    def test_multiple_bracket_tags_removed(self):
        self.assertEqual(
            clean_track_line("Artist [warmup] - Title [breaks]"),
            "Artist - Title",
        )

    def test_camelot_bracket_and_genre_bracket_both_removed(self):
        self.assertEqual(
            clean_track_line("Artist - Title [8A] [progressive]"),
            "Artist - Title",
        )

    # --- Dash normalization ---

    def test_en_dash_normalized(self):
        self.assertEqual(clean_track_line("Artist \u2013 Title"), "Artist - Title")

    def test_em_dash_normalized(self):
        self.assertEqual(clean_track_line("Artist \u2014 Title"), "Artist - Title")

    def test_double_dash_normalized(self):
        self.assertEqual(clean_track_line("Artist -- Title"), "Artist - Title")

    # --- Mix label stripping (Original Mix / Extended Mix only) ---

    def test_original_mix_stripped_by_default(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Original Mix)"),
            "Artist - Title",
        )

    def test_extended_mix_stripped_by_default(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Extended Mix)"),
            "Artist - Title",
        )

    def test_original_mix_preserved_when_disabled(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Original Mix)", strip_mix_labels=False),
            "Artist - Title (Original Mix)",
        )

    def test_extended_mix_preserved_when_disabled(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Extended Mix)", strip_mix_labels=False),
            "Artist - Title (Extended Mix)",
        )

    def test_remix_never_stripped(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Remix)"),
            "Artist - Title (Remix)",
        )

    def test_radio_edit_never_stripped(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Radio Edit)"),
            "Artist - Title (Radio Edit)",
        )

    def test_club_mix_never_stripped(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Club Mix)"),
            "Artist - Title (Club Mix)",
        )

    def test_edit_never_stripped(self):
        self.assertEqual(
            clean_track_line("Artist - Title (Edit)"),
            "Artist - Title (Edit)",
        )

    def test_mix_label_case_insensitive(self):
        self.assertEqual(
            clean_track_line("Artist - Title (ORIGINAL MIX)"),
            "Artist - Title",
        )

    # --- Whitespace and edge cases ---

    def test_whitespace_collapsed(self):
        self.assertEqual(clean_track_line("Artist   -   Title"), "Artist - Title")

    def test_none_returns_empty(self):
        self.assertEqual(clean_track_line(None), "")

    def test_empty_string_returns_empty(self):
        self.assertEqual(clean_track_line(""), "")

    def test_trailing_dash_cleaned(self):
        self.assertEqual(clean_track_line("Artist -"), "Artist")

    def test_leading_dash_cleaned(self):
        self.assertEqual(clean_track_line("- Title"), "Title")

    # --- Combined scenarios (realistic CDJ metadata) ---

    def test_full_cdj_metadata_cleanup(self):
        """Realistic CDJ metadata with Camelot key and bracket tags."""
        self.assertEqual(
            clean_track_line("Sasha - Xpander [8A] [progressive]"),
            "Sasha - Xpander",
        )

    def test_full_cleanup_strips_extended_mix_by_default(self):
        self.assertEqual(
            clean_track_line(
                "Yotto - Hear Me Out (Extended Mix) [11B] [melodic house]"
            ),
            "Yotto - Hear Me Out",
        )

    def test_full_cleanup_preserves_extended_mix_when_disabled(self):
        self.assertEqual(
            clean_track_line(
                "Yotto - Hear Me Out (Extended Mix) [11B] [melodic house]",
                strip_mix_labels=False,
            ),
            "Yotto - Hear Me Out (Extended Mix)",
        )

    def test_full_cleanup_preserves_remix(self):
        self.assertEqual(
            clean_track_line(
                "Yotto - Hear Me Out (Remix) [11B] [melodic house]"
            ),
            "Yotto - Hear Me Out (Remix)",
        )

    # --- Dedupe normalization ---

    def test_normalize_strips_timestamp_prefix(self):
        self.assertEqual(
            normalize_for_dedupe("12:34 Artist - Title"),
            "artist - title",
        )

    def test_normalize_case_insensitive(self):
        self.assertEqual(
            normalize_for_dedupe("ARTIST - TITLE"),
            "artist - title",
        )

    def test_normalize_cleans_before_normalizing(self):
        self.assertEqual(
            normalize_for_dedupe("Artist - Title [8A] [breaks]"),
            "artist - title",
        )

    def test_normalize_none_returns_empty(self):
        self.assertEqual(normalize_for_dedupe(None), "")


if __name__ == "__main__":
    unittest.main()
