from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.config import TrackrConfig  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_default_output_root_is_trackr(self) -> None:
        self.assertEqual(TrackrConfig.default_output_root(), Path.home() / "TRACKR")

    def test_from_dict_uses_trackr_default_when_output_root_missing(self) -> None:
        cfg = TrackrConfig.from_dict({})
        self.assertEqual(cfg.output_root, Path.home() / "TRACKR")


if __name__ == "__main__":
    unittest.main()
