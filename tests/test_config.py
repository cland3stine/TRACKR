from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.config import (  # noqa: E402
    OUTPUT_ROOT_STATE_NEEDS_USER_CHOICE,
    OUTPUT_ROOT_STATE_RESOLVED,
    TrackrConfig,
    load_persisted_root_config,
    persist_output_root_choice,
    resolve_output_root,
)
from test_utils import repo_temp_dir  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_legacy_missing_chooses_trackr_and_persists(self) -> None:
        with repo_temp_dir() as home_dir:
            cfg = TrackrConfig.from_dict({})

            resolution = resolve_output_root(cfg, home_dir=home_dir)
            self.assertEqual(resolution.state, OUTPUT_ROOT_STATE_RESOLVED)
            self.assertEqual(resolution.output_root, home_dir / "TRACKR")

            persisted = load_persisted_root_config(home_dir=home_dir)
            self.assertEqual(persisted.output_root, home_dir / "TRACKR")
            self.assertFalse(persisted.migration_prompt_seen)

    def test_legacy_exists_needs_choice_when_prompt_not_seen(self) -> None:
        with repo_temp_dir() as home_dir:
            (home_dir / "NowPlayingLite").mkdir(parents=True, exist_ok=True)
            cfg = TrackrConfig.from_dict({})

            resolution = resolve_output_root(cfg, home_dir=home_dir)
            self.assertEqual(resolution.state, OUTPUT_ROOT_STATE_NEEDS_USER_CHOICE)
            self.assertIsNone(resolution.output_root)

            persisted = load_persisted_root_config(home_dir=home_dir)
            self.assertIsNone(persisted.output_root)
            self.assertFalse(persisted.migration_prompt_seen)

    def test_choice_persists_and_no_longer_prompts(self) -> None:
        with repo_temp_dir() as home_dir:
            (home_dir / "NowPlayingLite").mkdir(parents=True, exist_ok=True)

            first = resolve_output_root(TrackrConfig.from_dict({}), home_dir=home_dir)
            self.assertEqual(first.state, OUTPUT_ROOT_STATE_NEEDS_USER_CHOICE)

            persist_output_root_choice("legacy", home_dir=home_dir)
            after_legacy = resolve_output_root(TrackrConfig.from_dict({}), home_dir=home_dir)
            self.assertEqual(after_legacy.state, OUTPUT_ROOT_STATE_RESOLVED)
            self.assertEqual(after_legacy.output_root, home_dir / "NowPlayingLite")

            persist_output_root_choice("trackr", home_dir=home_dir)
            after_trackr = resolve_output_root(TrackrConfig.from_dict({}), home_dir=home_dir)
            self.assertEqual(after_trackr.state, OUTPUT_ROOT_STATE_RESOLVED)
            self.assertEqual(after_trackr.output_root, home_dir / "TRACKR")

            persisted = load_persisted_root_config(home_dir=home_dir)
            self.assertEqual(persisted.output_root, home_dir / "TRACKR")
            self.assertTrue(persisted.migration_prompt_seen)

    def test_explicit_output_root_never_prompts(self) -> None:
        with repo_temp_dir() as home_dir:
            (home_dir / "NowPlayingLite").mkdir(parents=True, exist_ok=True)
            explicit = home_dir / "CustomRoot"
            cfg = TrackrConfig.from_dict({"output_root": str(explicit)})

            resolution = resolve_output_root(cfg, home_dir=home_dir)
            self.assertEqual(resolution.state, OUTPUT_ROOT_STATE_RESOLVED)
            self.assertEqual(resolution.output_root, explicit)


if __name__ == "__main__":
    unittest.main()
