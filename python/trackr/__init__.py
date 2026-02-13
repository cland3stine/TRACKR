"""TRACKR deterministic core skeleton."""

from trackr.beatlink_bridge import build_runtime_device_bridge
from trackr.config import TrackrConfig
from trackr.core import TrackrCore
from trackr.device_bridge import DeckStatus, NullDeviceBridge, RealDeviceBridge, TrackMetadata
from trackr.simulated_source import SimulatedEventSource, SimulatedTrackEvent

__all__ = [
    "TrackrConfig",
    "TrackrCore",
    "build_runtime_device_bridge",
    "DeckStatus",
    "TrackMetadata",
    "NullDeviceBridge",
    "RealDeviceBridge",
    "SimulatedEventSource",
    "SimulatedTrackEvent",
]
