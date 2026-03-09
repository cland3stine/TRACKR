import { useState, useEffect, useRef, useCallback } from "react";
import { checkForUpdate } from "./updater";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bgDeep: "#0a0a0a",
  bgPanel: "rgba(18, 18, 22, 0.72)",
  bgPanelSolid: "#131315",
  bgInset: "rgba(24, 24, 28, 0.6)",
  bgInsetHover: "rgba(34, 34, 40, 0.7)",
  borderRack: "rgba(255, 255, 255, 0.06)",
  borderLight: "rgba(255, 255, 255, 0.09)",
  borderFocus: "rgba(255, 255, 255, 0.14)",
  textPrimary: "#d0d0d4",
  textDim: "#606068",
  textMuted: "#3a3a40",
  green: "#2ecc40",
  greenDim: "#1a5c25",
  amber: "#f0c020",
  amberDim: "#5c4a10",
  red: "#e8413a",
  redDim: "#5c1a18",
  blue: "#4a9eff",
  cyan: "#7fdbca",
  cyanDim: "#2a4a42",
  // Glass effects
  glass: "rgba(255, 255, 255, 0.03)",
  glassHover: "rgba(255, 255, 255, 0.06)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  blur: "blur(20px)",
  blurLight: "blur(12px)",
  radius: 14,
  radiusSm: 10,
  radiusXs: 6,
};

const font = (size, weight = 400) => ({
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  fontSize: size,
  fontWeight: weight,
  lineHeight: 1.5,
});

// ─── LED COMPONENT ───────────────────────────────────────────────────────────
const Led = ({ color, size = 8, pulse = false, style = {} }) => (
  <span
    style={{
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: "50%",
      backgroundColor: color,
      boxShadow: `0 0 ${size}px ${color}60, 0 0 ${size * 2}px ${color}20`,
      animation: pulse ? "ledPulse 3s ease-in-out infinite" : "none",
      flexShrink: 0,
      ...style,
    }}
  />
);

// ─── RACK PANEL ──────────────────────────────────────────────────────────────
const RackPanel = ({ label, labelRight, children, style = {} }) => (
  <div
    style={{
      background: C.bgPanel,
      backdropFilter: C.blur,
      WebkitBackdropFilter: C.blur,
      border: `1px solid ${C.glassBorder}`,
      borderTop: `1px solid ${C.borderLight}`,
      borderRadius: C.radius,
      padding: 16,
      position: "relative",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      ...style,
    }}
  >
    {label && (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${C.borderRack}`,
        }}
      >
        <span
          style={{
            ...font(9, 700),
            color: C.textMuted,
            letterSpacing: 2.5,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {labelRight && (
          <span style={{ ...font(9, 500), color: C.textMuted, letterSpacing: 1 }}>
            {labelRight}
          </span>
        )}
      </div>
    )}
    {children}
  </div>
);

// ─── TOGGLE SWITCH ───────────────────────────────────────────────────────────
const Toggle = ({ on, onChange, disabled = false, label }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 0",
      opacity: disabled ? 0.35 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    onClick={() => !disabled && onChange(!on)}
  >
    <span style={{ ...font(11, 500), color: C.textDim }}>{label}</span>
    <div
      style={{
        width: 38,
        height: 20,
        borderRadius: 10,
        background: on ? `${C.green}25` : C.bgInset,
        border: `1px solid ${on ? C.green + "50" : C.glassBorder}`,
        position: "relative",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        flexShrink: 0,
        boxShadow: on ? `0 0 12px ${C.green}15, inset 0 1px 2px rgba(0,0,0,0.2)` : "inset 0 1px 2px rgba(0,0,0,0.2)",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: on ? C.green : C.textMuted,
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: on ? `0 0 8px ${C.green}50` : "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </div>
  </div>
);

// ─── BUTTON ──────────────────────────────────────────────────────────────────
const Btn = ({ children, color, onClick, disabled, fullWidth, style = {} }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...font(10, 700),
        letterSpacing: 2,
        textTransform: "uppercase",
        color: disabled ? C.textMuted : color === C.red ? "#fff" : C.bgDeep,
        background: disabled ? C.bgInset : hover ? color + "dd" : color,
        border: `1px solid ${disabled ? C.glassBorder : color}`,
        borderRadius: C.radiusSm,
        padding: "10px 20px",
        cursor: disabled ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.4 : 1,
        boxShadow: disabled ? "none" : hover
          ? `0 4px 16px ${color}30, 0 0 20px ${color}15`
          : `0 2px 8px ${color}20`,
        ...style,
      }}
    >
      {children}
    </button>
  );
};

// ─── STATE BADGE ─────────────────────────────────────────────────────────────
const StateBadge = ({ state }) => {
  const configs = {
    running: { bg: C.green + "18", border: C.green + "40", color: C.green, text: "RUNNING", pulse: true },
    stopped: { bg: C.bgInset, border: C.glassBorder, color: C.textMuted, text: "STOPPED", pulse: false },
    starting: { bg: C.amber + "12", border: C.amber + "35", color: C.amber, text: "STARTING...", pulse: true },
    stopping: { bg: C.amber + "12", border: C.amber + "35", color: C.amber, text: "STOPPING...", pulse: true },
    error: { bg: C.red + "18", border: C.red + "40", color: C.red, text: "ERROR", pulse: false },
  };
  const c = configs[state] || configs.stopped;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 14px",
        borderRadius: 20,
        background: c.bg,
        border: `1px solid ${c.border}`,
        backdropFilter: C.blurLight,
        WebkitBackdropFilter: C.blurLight,
        boxShadow: state === "running" ? `0 0 16px ${C.green}10` : "none",
        transition: "all 0.3s ease",
      }}
    >
      <Led color={c.color} size={6} pulse={c.pulse} />
      <span style={{ ...font(10, 700), color: c.color, letterSpacing: 2 }}>{c.text}</span>
    </div>
  );
};

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const EM_DASH = "—";

const FONT_OPTIONS = [
  "Good Times",
  "Orbitron",
  "Rajdhani",
  "Exo 2",
  "Oxanium",
  "Michroma",
  "Share Tech",
  "Audiowide",
  "Bruno Ace",
  "Chakra Petch",
];

// Google Fonts that need to be loaded via <link> (Good Times is local-install only)
const GFONTS_SET = new Set(FONT_OPTIONS.filter((f) => f !== "Good Times"));

const DEFAULT_STYLE = {
  font_family: "Good Times",
  text_transform: "uppercase",
  letter_spacing: 0.15,
  font_size: 36,
  font_color: "#ffffff",
  drop_shadow_on: true,
  drop_shadow_x: 6,
  drop_shadow_y: 6,
  drop_shadow_blur: 6,
  drop_shadow_color: "#000000",
  line_gap: 14,
};

// ─── SLIDER CONTROL ─────────────────────────────────────────────────────────
const SliderControl = ({ label, value, min, max, step, unit, onChange, disabled = false }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "6px 0", gap: 10 }}>
    <span style={{ ...font(11, 500), color: C.textDim, minWidth: 120 }}>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ flex: 1, accentColor: C.cyan, cursor: disabled ? "not-allowed" : "pointer" }}
    />
    <span style={{ ...font(10, 500), color: C.textPrimary, minWidth: 50, textAlign: "right" }}>
      {typeof value === "number" ? (step < 1 ? value.toFixed(2) : value) : value}{unit || ""}
    </span>
  </div>
);

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function TRACKR() {
  const parseTrackLine = (line = "") => {
    const s = String(line || "").trim();
    const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (!m) return { artist: s || EM_DASH, title: "" };
    return { artist: (m[1] || "").trim() || EM_DASH, title: (m[2] || "").trim() };
  };

  const toUiTrack = (item = {}) => {
    const split = parseTrackLine(item.line || "");
    return {
      time: item.time || "",
      artist: split.artist,
      title: split.title,
      plays: Number.isFinite(item.play_count) ? item.play_count : 0,
    };
  };

  const parseSessionDisplay = (sessionFileName) => {
    const raw = String(sessionFileName || "").trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\((\d+)\)-tracklist\.txt$/);
    if (!m) return { label: raw || EM_DASH };
    return { label: `${m[1]}(${m[2]})` };
  };

  const resolveContractCore = () => {
    if (typeof window === "undefined") return null;
    const candidates = [window.trackrCore, window.TRACKR_CORE, window.trackrBridge, window.trackr];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (
        typeof candidate.start === "function" &&
        typeof candidate.stop === "function" &&
        typeof candidate.refresh === "function" &&
        typeof candidate.get_status === "function"
      ) {
        return candidate;
      }
    }
    return null;
  };

  const renderTrackText = (track) => {
    if (!track) return EM_DASH;
    return track.title ? `${track.artist} — ${track.title}` : track.artist || EM_DASH;
  };

  const [appState, setAppState] = useState("stopped"); // stopped, starting, running, stopping, error
  const [activeTab, setActiveTab] = useState("live");
  const [timestamps, setTimestamps] = useState(true);
  const [stripMixLabels, setStripMixLabels] = useState(true);
  const [sharePlayCount, setSharePlayCount] = useState(false);
  const [delay, setDelay] = useState(3);
  const [overlayStyle, setOverlayStyle] = useState({ ...DEFAULT_STYLE });
  const [startInTray, setStartInTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [outputDir, setOutputDir] = useState("");
  const [migrationPromptSeen, setMigrationPromptSeen] = useState(false);
  const [outputRootChoice, setOutputRootChoice] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [apiEnabled, setApiEnabled] = useState(true);
  const [previewBg, setPreviewBg] = useState("#000000");
  const [apiPort] = useState(8755);
  const [lanIp, setLanIp] = useState("127.0.0.1");
  const [toasts, setToasts] = useState([]);
  const [publishedAgo, setPublishedAgo] = useState(0);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [sessionLabel, setSessionLabel] = useState(EM_DASH);
  const [deviceCount, setDeviceCount] = useState(0);
  const [devices, setDevices] = useState([]);
  const [updateStatus, setUpdateStatus] = useState({ state: "idle" });
  const [enrichmentEnabled, setEnrichmentEnabled] = useState(false);
  const [beatportUsername, setBeatportUsername] = useState("");
  const [beatportPassword, setBeatportPassword] = useState("");
  const [beatportConnStatus, setBeatportConnStatus] = useState(null); // null | "testing" | {ok, message}
  const [artOverlayEnabled, setArtOverlayEnabled] = useState(false);
  // Live enrichment (current track metadata + art)
  const [liveEnrichment, setLiveEnrichment] = useState(null);
  // History tab — Track History sub-tab
  const [historySubTab, setHistorySubTab] = useState("tracks"); // "tracks" | "sessions"
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const historyDebounceRef = useRef(null);
  // History tab — Session History sub-tab
  const [sessionRows, setSessionRows] = useState([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSessionTracks, setSelectedSessionTracks] = useState([]);
  const [selectedSessionTrack, setSelectedSessionTrack] = useState(null);
  const tracklistRef = useRef(null);
  const timerRef = useRef(null);
  const coreRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const statusPollRef = useRef(null);

  const isRunning = appState === "running";
  const isTransitioning = appState === "starting" || appState === "stopping";
  const currentTrack = tracks[tracks.length - 1];
  const previousTrack = tracks.length >= 2 ? tracks[tracks.length - 2] : null;
  const connectionState =
    appState === "starting" ? "scanning" : isRunning ? (deviceCount > 0 ? "online" : "scanning") : "offline";
  const deviceLabel = devices.length > 0
    ? devices.map((d) => `${d.count} ${d.name}`).join(" · ")
    : `${deviceCount} Device${deviceCount !== 1 ? "s" : ""}`;
  // Style debounce ref
  const styleDebounceRef = useRef(null);

  // Fetch enrichment for current track on initial load / track change
  useEffect(() => {
    if (!currentTrack?.artist || !currentTrack?.title) return;
    window.electronAPI.invoke("db:get-track", { artist: currentTrack.artist, title: currentTrack.title })
      .then((row) => {
        if (row?.enrichment_status === "complete") setLiveEnrichment(row);
      })
      .catch(() => {});
  }, [currentTrack?.artist, currentTrack?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-increment "published ago" — only ticks while playback is active
  useEffect(() => {
    if (isRunning && playbackActive) {
      timerRef.current = setInterval(() => setPublishedAgo((p) => p + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    return undefined;
  }, [isRunning, playbackActive]);

  const addToast = useCallback((msg, severity = "info") => {
    const id = Date.now();
    setToasts((t) => [...t.slice(-2), { id, msg, severity }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  const callCore = useCallback(async (method, ...args) => {
    if (!coreRef.current) coreRef.current = resolveContractCore();
    const core = coreRef.current;
    if (!core || typeof core[method] !== "function") {
      return { ok: false, error: { code: "bridge_unavailable", message: `Missing core method: ${method}` } };
    }
    try {
      const result = await Promise.resolve(core[method](...args));
      if (result && typeof result === "object") return result;
      return { ok: false, error: { code: "invalid_response", message: "Invalid core response" } };
    } catch (error) {
      return { ok: false, error: { code: "bridge_exception", message: error?.message || String(error) } };
    }
  }, []);

  const syncStatus = useCallback((status) => {
    if (!status) return;
    if (status.app_state) setAppState(status.app_state);
    if (Number.isFinite(status.device_count)) setDeviceCount(status.device_count);
    if (Array.isArray(status.devices)) setDevices(status.devices);
    if (typeof status.is_playback_active === "boolean") setPlaybackActive(status.is_playback_active);
    if (typeof status.api_enabled === "boolean") setApiEnabled(status.api_enabled);
    if (typeof status.strip_mix_labels === "boolean") setStripMixLabels(status.strip_mix_labels);
    if (status.lan_ip) setLanIp(status.lan_ip);
    if (typeof status.share_play_count_via_api === "boolean") setSharePlayCount(status.share_play_count_via_api);
    if (typeof status.migration_prompt_seen === "boolean") setMigrationPromptSeen(status.migration_prompt_seen);
    if (typeof status.start_with_windows === "boolean") setStartWithWindows(status.start_with_windows);
    if (typeof status.start_in_tray === "boolean") setStartInTray(status.start_in_tray);
    if (status.output_root) setOutputDir(status.output_root);
    if (status.session_file_name) {
      const parsed = parseSessionDisplay(status.session_file_name);
      setSessionLabel(parsed.label);
    } else {
      setSessionLabel(EM_DASH);
    }
  }, []);

  const applyOutputRootResolution = useCallback((payload) => {
    if (!payload) return;
    if (typeof payload.migration_prompt_seen === "boolean") {
      setMigrationPromptSeen(payload.migration_prompt_seen);
    }
    if (payload.state === "needs_user_choice" || payload.needs_user_choice) {
      setOutputRootChoice({
        legacy: payload.legacy_output_root || `${"%USERPROFILE%"}\\TRACKR`,
        trackr: payload.trackr_output_root || `${"%USERPROFILE%"}\\TRACKR`,
      });
      return;
    }
    if (payload.output_root) setOutputDir(payload.output_root);
    setOutputRootChoice(null);
  }, []);

  const reloadTracklist = useCallback(async () => {
    const res = await callCore("get_running_tracklist");
    if (!res?.ok) return;
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    setTracks(items.map((item) => toUiTrack(item)));
  }, [callCore]);

  const reloadStyle = useCallback(async () => {
    const res = await callCore("get_style");
    if (!res?.ok) return;
    setOverlayStyle((prev) => ({ ...prev, ...res.data }));
  }, [callCore]);

  const refreshFromCore = useCallback(async () => {
    const statusRes = await callCore("get_status");
    if (statusRes?.ok) syncStatus(statusRes.data);
    await reloadTracklist();
  }, [callCore, syncStatus, reloadTracklist]);

  useEffect(() => {
    let mounted = true;

    const bind = async () => {
      const outputRootRes = await callCore("resolve_output_root");
      if (outputRootRes?.ok) {
        applyOutputRootResolution(outputRootRes.data);
      }
      await refreshFromCore();
      await reloadStyle();

      // Load enrichment config via IPC (includes password, not exposed via HTTP)
      try {
        const cfg = await window.electronAPI.invoke("config:get");
        if (cfg?.enrichment) {
          setEnrichmentEnabled(cfg.enrichment.enabled || false);
          setBeatportUsername(cfg.enrichment.beatportUsername || "");
          setBeatportPassword(cfg.enrichment.beatportPassword || "");
          setArtOverlayEnabled(cfg.enrichment.artOverlayEnabled || false);
        }
      } catch (_) { /* non-critical */ }

      const subRes = await callCore("subscribe_events", (event) => {
        if (!mounted || !event) return;
        const payload = event.payload || {};

        if (event.event_type === "state_changed" && payload.app_state) {
          setAppState(payload.app_state);
          return;
        }

        if (event.event_type === "publish_succeeded") {
          setPublishedAgo(0);
          reloadTracklist();
          return;
        }

        if (event.event_type === "tracklist_appended") {
          setPublishedAgo(0);
          setTracks((prev) => [...prev, toUiTrack(payload)]);
          return;
        }

        if (event.event_type === "session_reset") {
          setTracks([]);
          setPublishedAgo(0);
          return;
        }

        if (event.event_type === "playback_changed") {
          setPlaybackActive(!!payload.is_playback_active);
          return;
        }

        if (event.event_type === "api_rebound") {
          if (typeof payload.enabled === "boolean") setApiEnabled(payload.enabled);
          if (payload.bind_host) setApiBindHost(payload.bind_host);
        }
      });

      if (subRes?.ok && subRes.data?.unsubscribe) {
        unsubscribeRef.current = subRes.data.unsubscribe;
      }

      statusPollRef.current = setInterval(() => {
        refreshFromCore();
      }, 2000);
    };

    bind();

    // Direct IPC listeners
    window.electronAPI.on("trackr:session-started", () => {
      setTracks([]);
      setPublishedAgo(0);
      setLiveEnrichment(null);
    });
    window.electronAPI.on("trackr:enrichment-update", (data) => {
      setLiveEnrichment(data || null);
    });
    window.electronAPI.on("trackr:track-published", () => {
      setLiveEnrichment(null); // clear until enrichment arrives
    });

    return () => {
      mounted = false;
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      if (typeof unsubscribeRef.current === "function") unsubscribeRef.current();
      window.electronAPI.removeAllListeners("trackr:session-started");
      window.electronAPI.removeAllListeners("trackr:enrichment-update");
      window.electronAPI.removeAllListeners("trackr:track-published");
    };
  }, [applyOutputRootResolution, callCore, refreshFromCore, reloadStyle, reloadTracklist]);

  const buildConfig = useCallback(
    () => ({
      output_root: outputDir || null,
      migration_prompt_seen: migrationPromptSeen,
      delay_seconds: delay,
      timestamps_enabled: timestamps,
      strip_mix_labels: stripMixLabels,
      api_enabled: apiEnabled,
      share_play_count_via_api: sharePlayCount,
      api_port: apiPort,
    }),
    [outputDir, migrationPromptSeen, delay, timestamps, apiEnabled, sharePlayCount, apiPort]
  );

  const performStop = useCallback(async () => {
    setAppState("stopping");
    const res = await callCore("stop");
    if (!res?.ok) {
      setAppState("error");
      addToast(`Stop failed: ${res?.error?.message || "Unknown error"}`, "error");
      return;
    }
    await refreshFromCore();
    addToast("TRACKR stopped", "info");
  }, [callCore, addToast, refreshFromCore]);

  const performRefresh = useCallback(async () => {
    setAppState("stopping");
    const res = await callCore("refresh");
    if (!res?.ok) {
      setAppState("error");
      addToast(`Refresh failed: ${res?.error?.message || "Unknown error"}`, "error");
      return;
    }
    setPublishedAgo(0);
    await refreshFromCore();
    addToast("New session started", "success");
  }, [callCore, addToast, refreshFromCore]);

  const handleStartStop = useCallback(async () => {
    if (appState === "stopped" || appState === "error") {
      if (outputRootChoice) {
        addToast("Select an output folder before starting.", "warning");
        return;
      }
      setAppState("starting");
      const res = await callCore("start", buildConfig());
      if (!res?.ok) {
        setAppState("error");
        addToast(`Start failed: ${res?.error?.message || "Unknown error"}`, "error");
        return;
      }
      if (res.data?.needs_user_choice) {
        applyOutputRootResolution(res.data);
        setAppState("stopped");
        addToast("Choose output folder to continue.", "warning");
        return;
      }
      setPublishedAgo(0);
      await refreshFromCore();
      addToast("TRACKR started", "success");
      return;
    }

    if (appState === "running") {
      setConfirmDialog({ type: "stop", message: "ARE YOU SURE YOU WANT TO STOP THE SESSION?" });
    }
  }, [appState, addToast, applyOutputRootResolution, buildConfig, callCore, outputRootChoice]);

  const handleRefresh = useCallback(async () => {
    if (!isRunning) return;
    setConfirmDialog({ type: "refresh", message: "ARE YOU SURE YOU WANT TO REFRESH THE SESSION?" });
  }, [isRunning]);

  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const handleConfirmProceed = useCallback(async () => {
    if (!confirmDialog?.type) return;
    const nextAction = confirmDialog.type;
    setConfirmDialog(null);
    if (nextAction === "stop") {
      await performStop();
      return;
    }
    if (nextAction === "refresh") {
      await performRefresh();
      return;
    }
    if (nextAction === "reset-counts") {
      const res = await callCore("reset_play_counts");
      if (res?.ok) {
        addToast("All play counts reset", "success");
      } else {
        addToast("Failed to reset play counts", "error");
      }
    }
  }, [confirmDialog, performStop, performRefresh, callCore, addToast]);

  const handleStyleChange = useCallback((key, value) => {
    setOverlayStyle((prev) => ({ ...prev, [key]: value }));
    if (styleDebounceRef.current) clearTimeout(styleDebounceRef.current);
    styleDebounceRef.current = setTimeout(async () => {
      const res = await callCore("set_style", { [key]: value });
      if (!res?.ok) {
        addToast(`Style update failed: ${res?.error?.message || "Unknown error"}`, "error");
      }
    }, 200);
  }, [callCore, addToast]);

  const handleResetStyle = useCallback(async () => {
    const res = await callCore("set_style", { ...DEFAULT_STYLE });
    if (!res?.ok) {
      addToast(`Style reset failed: ${res?.error?.message || "Unknown error"}`, "error");
      return;
    }
    setOverlayStyle({ ...DEFAULT_STYLE });
    addToast("Overlay style reset to defaults", "info");
  }, [callCore, addToast]);

  const handleOutputRootChoice = useCallback(
    async (choice) => {
      const res = await callCore("set_output_root_choice", choice);
      if (!res?.ok) {
        addToast(`Output folder selection failed: ${res?.error?.message || "Unknown error"}`, "error");
        return;
      }
      applyOutputRootResolution(res.data);
      await refreshFromCore();
      if (choice === "legacy") {
        addToast("Using legacy output folder.", "info");
      } else {
        addToast("Switched output folder to TRACKR.", "success");
      }
    },
    [addToast, applyOutputRootResolution, callCore, refreshFromCore]
  );

  const handleBrowseOutputDir = useCallback(async () => {
    try {
      const selected = await window.electronAPI.invoke('dialog:open-directory');
      if (!selected) return;
      setOutputDir(selected);
      const result = await callCore("set_config", { output_root: selected, migration_prompt_seen: true });
      if (result?.ok) {
        addToast(`Output folder set to ${selected}`, "success");
      } else {
        addToast("Failed to update output folder", "error");
      }
    } catch (err) {
      addToast(`Browse failed: ${err?.message || err}`, "error");
    }
  }, [callCore, addToast]);

  const handleStartInTrayChange = useCallback(async (next) => {
    setStartInTray(next);
    await callCore("set_config", { start_in_tray: next });
  }, [callCore]);

  const handleStartWithWindowsChange = useCallback(async (next) => {
    setStartWithWindows(next);
    await callCore("set_config", { start_with_windows: next });
  }, [callCore]);

  const handleApiEnabledChange = useCallback(
    (next) => {
      setApiEnabled(next);
      if (isRunning) addToast("API setting will apply on next refresh/start", "info");
    },
    [isRunning, addToast]
  );

  const handleSharePlayCountChange = useCallback(
    (next) => {
      setSharePlayCount(next);
      if (isRunning) addToast("API setting will apply on next refresh/start", "info");
    },
    [isRunning, addToast]
  );

  const handleEnrichmentToggle = useCallback(async (next) => {
    setEnrichmentEnabled(next);
    await window.electronAPI.invoke("config:set", { enrichment: { enabled: next } });
  }, []);

  const handleBeatportCredentialsSave = useCallback(async () => {
    await window.electronAPI.invoke("config:set", {
      enrichment: { beatportUsername: beatportUsername, beatportPassword: beatportPassword },
    });
    addToast("Beatport credentials saved", "success");
  }, [beatportUsername, beatportPassword, addToast]);

  const handleTestBeatportConnection = useCallback(async () => {
    setBeatportConnStatus("testing");
    // Save credentials first so the test uses them
    await window.electronAPI.invoke("config:set", {
      enrichment: { beatportUsername: beatportUsername, beatportPassword: beatportPassword },
    });
    try {
      const result = await window.electronAPI.invoke("enrichment:test-connection");
      setBeatportConnStatus(result);
    } catch (err) {
      setBeatportConnStatus({ ok: false, message: err?.message || "Unknown error" });
    }
  }, [beatportUsername, beatportPassword]);

  const handleArtOverlayToggle = useCallback(async (next) => {
    setArtOverlayEnabled(next);
    await window.electronAPI.invoke("config:set", { enrichment: { artOverlayEnabled: next } });
  }, []);

  const formatAgo = (s) => (s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`);

  // ─── HISTORY ────────────────────────────────────────────────────────────────
  const HISTORY_PAGE_SIZE = 50;

  const loadHistory = useCallback(async (query, page) => {
    try {
      const result = await window.electronAPI.invoke("db:search-tracks", {
        query: query || undefined,
        limit: HISTORY_PAGE_SIZE,
        offset: page * HISTORY_PAGE_SIZE,
      });
      setHistoryRows(result?.rows || []);
      setHistoryTotal(result?.total || 0);
    } catch {
      // IPC error — leave empty
    }
  }, []);

  // Reload history when tab becomes active or page changes
  useEffect(() => {
    if (activeTab === "history") loadHistory(historyQuery, historyPage);
  }, [activeTab, historyPage, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reload history when enrichment completes (new track data available)
  useEffect(() => {
    const handler = () => {
      if (activeTab === "history") loadHistory(historyQuery, historyPage);
    };
    window.electronAPI.on("trackr:enrichment-update", handler);
    window.electronAPI.on("trackr:track-published", handler);
    return () => {
      window.electronAPI.removeAllListeners("trackr:enrichment-update");
      window.electronAPI.removeAllListeners("trackr:track-published");
    };
  }, [activeTab, historyQuery, historyPage, loadHistory]);

  const handleHistorySearch = useCallback((value) => {
    setHistoryQuery(value);
    setHistoryPage(0);
    setSelectedTrack(null);
    clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => loadHistory(value, 0), 250);
  }, [loadHistory]);

  const historyPageCount = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  // ─── SESSION HISTORY ──────────────────────────────────────────────────────
  const SESSION_PAGE_SIZE = 50;

  const loadSessions = useCallback(async (page) => {
    try {
      const result = await window.electronAPI.invoke("db:search-sessions", {
        limit: SESSION_PAGE_SIZE,
        offset: page * SESSION_PAGE_SIZE,
      });
      setSessionRows(result?.rows || []);
      setSessionTotal(result?.total || 0);
    } catch {
      // IPC error
    }
  }, []);

  const loadSessionTracks = useCallback(async (sessionId) => {
    try {
      const tracks = await window.electronAPI.invoke("db:get-session-tracks", { sessionId });
      setSelectedSessionTracks(tracks || []);
    } catch {
      setSelectedSessionTracks([]);
    }
  }, []);

  // Reload sessions when sub-tab becomes active or page changes
  useEffect(() => {
    if (activeTab === "history" && historySubTab === "sessions") loadSessions(sessionPage);
  }, [activeTab, historySubTab, sessionPage, loadSessions]);

  // Load session tracks when a session is selected
  useEffect(() => {
    setSelectedSessionTrack(null);
    if (selectedSession) loadSessionTracks(selectedSession.id);
    else setSelectedSessionTracks([]);
  }, [selectedSession, loadSessionTracks]);

  const sessionPageCount = Math.max(1, Math.ceil(sessionTotal / SESSION_PAGE_SIZE));

  const formatDate = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const formatDateTime = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date} ${time}`;
  };

  const formatDuration = (startIso, endIso) => {
    if (!startIso || !endIso) return "\u2014";
    const ms = new Date(endIso) - new Date(startIso);
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`;
  };

  // ─── TABS ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "live", label: "LIVE" },
    { id: "history", label: "HISTORY" },
    { id: "style", label: "STYLE" },
    { id: "settings", label: "SETTINGS" },
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: C.bgDeep,
        color: C.textPrimary,
        display: "flex",
        flexDirection: "column",
        ...font(12),
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
        input[type="text"], input[type="password"], input[type="number"] {
          border-radius: ${C.radiusXs}px !important;
          transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
        }
        input[type="text"]:focus, input[type="password"]:focus {
          border-color: ${C.cyan}40 !important;
          box-shadow: 0 0 12px ${C.cyan}10 !important;
        }
        input[type="range"] {
          height: 4px;
          border-radius: 2px;
        }
        @keyframes ledPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes flashCyan {
          0% { border-left-color: ${C.cyan}; }
          100% { border-left-color: transparent; }
        }
        @keyframes glassShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ flexShrink: 0, zIndex: 10 }}>
        {/* Row 1: Status bar */}
        <div
          style={{
            height: 48,
            background: "rgba(14, 14, 18, 0.85)",
            backdropFilter: C.blur,
            WebkitBackdropFilter: C.blur,
            borderBottom: `1px solid ${C.borderRack}`,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 24,
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...font(14, 700), letterSpacing: 4, color: C.textPrimary }}>TRACKR</span>
            <span style={{ ...font(9, 400), color: C.textMuted, letterSpacing: 1 }}>v1.0</span>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Connection */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Led
              color={connectionState === "online" ? C.green : connectionState === "scanning" ? C.amber : C.red}
              size={7}
              pulse={connectionState === "scanning"}
            />
            <span
              style={{
                ...font(10, 600),
                letterSpacing: 1.5,
                color:
                  connectionState === "online" ? C.green : connectionState === "scanning" ? C.amber : C.textMuted,
              }}
            >
              {connectionState === "online"
                ? "ONLINE"
                : connectionState === "scanning"
                ? "SCANNING"
                : "OFFLINE"}
            </span>
            <span
              style={{
                ...font(10, 400),
                color: C.textDim,
                marginLeft: 4,
                borderLeft: `1px solid ${C.borderRack}`,
                paddingLeft: 10,
              }}
            >
              {deviceLabel}
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: C.borderRack }} />

          {/* State Badge */}
          <StateBadge state={appState} />

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: C.borderRack }} />

          {/* Window controls (decorative) */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {["─", "□", "✕"].map((icon, i) => (
              <span
                key={i}
                style={{
                  ...font(12, 400),
                  color: i === 2 ? C.textDim : C.textMuted,
                  cursor: "pointer",
                  padding: "4px 6px",
                  borderRadius: C.radiusXs,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = i === 2 ? C.red : C.textPrimary;
                  e.target.style.background = i === 2 ? `${C.red}15` : C.glass;
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = i === 2 ? C.textDim : C.textMuted;
                  e.target.style.background = "transparent";
                }}
              >
                {icon}
              </span>
            ))}
          </div>
        </div>

        {/* Row 2: Now Playing strip */}
        <div
          style={{
            minHeight: 40,
            background: "rgba(8, 8, 10, 0.9)",
            borderBottom: `1px solid ${C.borderRack}`,
            display: "flex",
            alignItems: "center",
            padding: "6px 20px",
            gap: 14,
          }}
        >
          {/* NOW label */}
          <span
            style={{
              ...font(9, 700),
              color: isRunning && currentTrack ? C.cyan : C.textMuted,
              letterSpacing: 2.5,
              flexShrink: 0,
            }}
          >
            NOW
          </span>

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: C.borderRack, flexShrink: 0 }} />

          {/* Current track */}
          {isRunning && currentTrack ? (
            <span style={{ ...font(12, 600), color: C.textPrimary }}>
              {renderTrackText(currentTrack)}
            </span>
          ) : (
            <span style={{ ...font(12, 400), color: C.textMuted }}>—</span>
          )}

          {/* Deck + recency */}
          {isRunning && currentTrack && (
            <>
              <div style={{ width: 1, height: 16, background: C.borderRack, flexShrink: 0 }} />
              <span style={{ ...font(9, 400), color: playbackActive ? C.textMuted : C.textDim, flexShrink: 0 }}>
                {formatAgo(publishedAgo)}{!playbackActive && " · stopped"}
              </span>
            </>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* PREV label + track */}
          {isRunning && previousTrack && (
            <>
              <span
                style={{
                  ...font(9, 700),
                  color: C.textMuted,
                  letterSpacing: 2.5,
                  flexShrink: 0,
                }}
              >
                PREV
              </span>
              <div style={{ width: 1, height: 16, background: C.borderRack, flexShrink: 0 }} />
              <span style={{ ...font(11, 400), color: C.textDim, flexShrink: 0 }}>
                {renderTrackText(previousTrack)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ─── LEFT SIDEBAR ─── */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 10,
            overflowY: "auto",
            borderRight: `1px solid ${C.borderRack}`,
            background: "rgba(8, 8, 10, 0.4)",
          }}
        >
          {/* ── Combined Status + Controls ── */}
          <RackPanel label="CONTROLS" style={{ flex: 0 }}>
            {/* Status row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Led color={isRunning ? C.green : appState === "error" ? C.red : C.textMuted} size={7} pulse={isRunning} />
              <span style={{ ...font(11, 600), color: isRunning ? C.green : appState === "error" ? C.red : C.textDim, letterSpacing: 1 }}>
                {appState.toUpperCase()}
              </span>
              <span style={{ ...font(9, 400), color: C.textMuted, marginLeft: "auto" }}>
                {deviceLabel}
              </span>
            </div>

            {/* Buttons side by side */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <Btn
                fullWidth
                color={isRunning ? C.red : C.green}
                onClick={handleStartStop}
                disabled={isTransitioning}
              >
                {appState === "starting" ? "STARTING..." : appState === "stopping" ? "STOPPING..." : isRunning ? "■ STOP" : "▶ START"}
              </Btn>
              <Btn
                fullWidth
                color={C.amber}
                onClick={handleRefresh}
                disabled={!isRunning || isTransitioning}
              >
                ↻ REFRESH
              </Btn>
            </div>

            {/* Parameters — compact */}
            <div style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  opacity: isRunning ? 0.35 : 1,
                }}
              >
                <span style={{ ...font(10, 500), color: C.textDim }}>Delay</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => !isRunning && setDelay(Math.max(1, delay - 1))}
                    disabled={isRunning}
                    style={{ ...font(10, 700), width: 20, height: 20, border: `1px solid ${C.borderRack}`, borderRadius: 3, background: C.bgInset, color: C.textDim, cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >−</button>
                  <span style={{ ...font(11, 600), color: C.textPrimary, minWidth: 24, textAlign: "center", background: C.bgInset, border: `1px solid ${C.borderRack}`, borderRadius: 3, padding: "1px 4px" }}>
                    {delay}
                  </span>
                  <button
                    onClick={() => !isRunning && setDelay(Math.min(30, delay + 1))}
                    disabled={isRunning}
                    style={{ ...font(10, 700), width: 20, height: 20, border: `1px solid ${C.borderRack}`, borderRadius: 3, background: C.bgInset, color: C.textDim, cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >+</button>
                  <span style={{ ...font(9, 400), color: C.textMuted }}>sec</span>
                </div>
              </div>
              <Toggle label="Timestamps" on={timestamps} onChange={setTimestamps} disabled={isRunning} />
              <Toggle label="Strip Original/Extended" on={stripMixLabels} onChange={setStripMixLabels} disabled={isRunning} />
            </div>
          </RackPanel>

          {/* ── Now Playing Enrichment ── */}
          {currentTrack && (
            <RackPanel label="NOW PLAYING" style={{ flex: 0 }}>
              {liveEnrichment?.art_filename ? (
                <img
                  src={`http://127.0.0.1:${apiPort}/art/cache/${liveEnrichment.art_filename}`}
                  alt=""
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 4, marginBottom: 10, background: C.bgInset }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : liveEnrichment?.artFilename ? (
                <img
                  src={`http://127.0.0.1:${apiPort}/art/cache/${liveEnrichment.artFilename}`}
                  alt=""
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 4, marginBottom: 10, background: C.bgInset }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px" }}>
                {(liveEnrichment?.label) && (
                  <>
                    <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Label</span>
                    <span style={{ ...font(10, 400), color: C.textPrimary }}>{liveEnrichment.label}</span>
                  </>
                )}
                {(liveEnrichment?.year) && (
                  <>
                    <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Year</span>
                    <span style={{ ...font(10, 400), color: C.textPrimary }}>{liveEnrichment.year}</span>
                  </>
                )}
                {(liveEnrichment?.genre) && (
                  <>
                    <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Genre</span>
                    <span style={{ ...font(10, 400), color: C.textPrimary }}>{liveEnrichment.genre}</span>
                  </>
                )}
                {(liveEnrichment?.bpm) && (
                  <>
                    <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>BPM</span>
                    <span style={{ ...font(10, 400), color: C.textPrimary }}>{liveEnrichment.bpm}</span>
                  </>
                )}
                {(liveEnrichment?.key_name || liveEnrichment?.key) && (
                  <>
                    <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Key</span>
                    <span style={{ ...font(10, 400), color: C.textPrimary }}>{liveEnrichment.key_name || liveEnrichment.key}</span>
                  </>
                )}
              </div>

              {!liveEnrichment && enrichmentEnabled && (
                <div style={{ ...font(9, 400), color: C.textMuted, textAlign: "center", padding: "8px 0" }}>
                  Enriching...
                </div>
              )}
              {!liveEnrichment && !enrichmentEnabled && (
                <div style={{ ...font(9, 400), color: C.textMuted, textAlign: "center", padding: "4px 0" }}>
                  Enrichment disabled
                </div>
              )}
            </RackPanel>
          )}

          {/* ── Output info ── */}
          <div style={{ ...font(9, 400), color: C.textMuted, padding: "4px 8px", marginTop: "auto" }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outputDir || "%USERPROFILE%\\TRACKR"}
            </div>
            <div style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sessionLabel}
            </div>
          </div>
        </div>

        {/* ─── RIGHT CONTENT ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 10px",
              background: "rgba(14, 14, 18, 0.6)",
              backdropFilter: C.blurLight,
              WebkitBackdropFilter: C.blurLight,
              borderBottom: `1px solid ${C.borderRack}`,
              flexShrink: 0,
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...font(10, active ? 700 : 500),
                    letterSpacing: 2,
                    color: active ? C.cyan : C.textMuted,
                    background: active ? `${C.cyan}10` : "transparent",
                    border: "none",
                    borderRadius: C.radiusXs,
                    padding: "8px 20px",
                    cursor: "pointer",
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    textTransform: "uppercase",
                    boxShadow: active ? `0 0 12px ${C.cyan}08` : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.target.style.color = C.textDim;
                      e.target.style.background = C.glass;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.target.style.color = C.textMuted;
                      e.target.style.background = "transparent";
                    }
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden", padding: 10 }}>
            {/* ─── LIVE TAB ─── */}
            {activeTab === "live" && (
              <RackPanel
                label="SESSION TRACKLIST"
                labelRight={`${sessionLabel} — ${tracks.length} tracks`}
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                <div
                  ref={tracklistRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    background: C.bgInset,
                    border: `1px solid ${C.borderRack}`,
                    borderRadius: 4,
                    padding: 0,
                  }}
                >
                  {tracks.length === 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        gap: 12,
                        padding: 40,
                      }}
                    >
                      <Led color={C.textMuted} size={8} pulse />
                      <span style={{ ...font(11, 400), color: C.textMuted }}>Waiting for first track...</span>
                    </div>
                  ) : (
                    tracks.map((track, i) => {
                      const isLast = i === tracks.length - 1;
                      return (
                        <div
                          key={`${track.time}-${track.artist}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "9px 14px",
                            borderBottom: i < tracks.length - 1 ? `1px solid ${C.borderRack}40` : "none",
                            borderLeft: isLast ? `2px solid ${C.green}` : "2px solid transparent",
                            background: isLast ? `${C.green}06` : "transparent",
                            animation: "slideIn 0.3s ease",
                            transition: "background 0.3s ease",
                          }}
                        >
                          {/* Timestamp */}
                          {timestamps && (
                            <span
                              style={{
                                ...font(10, 400),
                                color: C.textMuted,
                                minWidth: 50,
                                flexShrink: 0,
                              }}
                            >
                              {track.time}
                            </span>
                          )}

                          {/* Track line */}
                          <span
                            style={{
                              ...font(11, isLast ? 500 : 400),
                              color: isLast ? C.textPrimary : C.textDim,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {track.title ? (
                              <>
                                {track.artist} <span style={{ color: C.textMuted }}>—</span> {track.title}
                              </>
                            ) : (
                              track.artist
                            )}
                          </span>

                          {/* Play count */}
                          <span
                            style={{
                              ...font(9, 600),
                              color: C.cyan,
                              background: `${C.cyan}10`,
                              border: `1px solid ${C.cyan}20`,
                              borderRadius: 10,
                              padding: "2px 8px",
                              marginLeft: 12,
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                            }}
                          >
                            ×{track.plays}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </RackPanel>
            )}

            {/* ─── HISTORY TAB ─── */}
            {activeTab === "history" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                {/* Sub-tab bar */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {[{ id: "tracks", label: "TRACKS" }, { id: "sessions", label: "SESSIONS" }].map((st) => {
                    const active = historySubTab === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => { setHistorySubTab(st.id); setSelectedTrack(null); setSelectedSession(null); }}
                        style={{
                          ...font(9, 700),
                          letterSpacing: 2,
                          textTransform: "uppercase",
                          color: active ? C.cyan : C.textMuted,
                          background: active ? `${C.cyan}10` : "transparent",
                          border: "none",
                          borderRadius: C.radiusXs,
                          padding: "8px 20px",
                          cursor: "pointer",
                          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>

                {/* ─── TRACKS SUB-TAB ─── */}
                {historySubTab === "tracks" && (
                  <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <RackPanel
                        label="TRACK HISTORY"
                        labelRight={`${historyTotal} track${historyTotal !== 1 ? "s" : ""}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
                      >
                        <input
                          type="text"
                          value={historyQuery}
                          onChange={(e) => handleHistorySearch(e.target.value)}
                          placeholder="Search..."
                          style={{
                            ...font(11, 400),
                            color: C.textPrimary,
                            background: C.bgInset,
                            border: `1px solid ${C.borderRack}`,
                            borderRadius: 3,
                            padding: "8px 12px",
                            outline: "none",
                            marginBottom: 12,
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 2fr 1.5fr 50px 50px 60px",
                            gap: 8,
                            padding: "0 4px 8px",
                            borderBottom: `1px solid ${C.borderRack}`,
                          }}
                        >
                          {["ARTIST", "TITLE", "LABEL", "YEAR", "PLAYS", "LAST"].map((h) => (
                            <span key={h} style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2, textTransform: "uppercase" }}>
                              {h}
                            </span>
                          ))}
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                          {historyRows.length === 0 && (
                            <div style={{ ...font(11, 400), color: C.textMuted, padding: "24px 4px", textAlign: "center" }}>
                              {historyQuery ? "No tracks match your search" : "No tracks in history yet"}
                            </div>
                          )}
                          {historyRows.map((row) => {
                            const isSelected = selectedTrack?.id === row.id;
                            return (
                              <div
                                key={row.id}
                                onClick={() => setSelectedTrack(isSelected ? null : row)}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "2fr 2fr 1.5fr 50px 50px 60px",
                                  gap: 8,
                                  padding: "6px 4px",
                                  cursor: "pointer",
                                  background: isSelected ? `${C.cyan}12` : "transparent",
                                  borderLeft: isSelected ? `2px solid ${C.cyan}` : "2px solid transparent",
                                  borderBottom: `1px solid ${C.borderRack}30`,
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = C.bgInsetHover; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                              >
                                <span style={{ ...font(10, 500), color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.artist}</span>
                                <span style={{ ...font(10, 400), color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                                <span style={{ ...font(10, 400), color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label || "\u2014"}</span>
                                <span style={{ ...font(10, 400), color: C.textDim }}>{row.year || "\u2014"}</span>
                                <span style={{ ...font(10, 600), color: row.play_count > 1 ? C.cyan : C.textDim }}>{row.play_count}</span>
                                <span style={{ ...font(9, 400), color: C.textMuted }}>{formatDate(row.last_played)}</span>
                              </div>
                            );
                          })}
                        </div>
                        {historyPageCount > 1 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 10, borderTop: `1px solid ${C.borderRack}` }}>
                            <Btn color={C.textDim} disabled={historyPage === 0} onClick={() => setHistoryPage((p) => p - 1)}>&#9664;</Btn>
                            <span style={{ ...font(10, 400), color: C.textDim }}>{historyPage + 1} / {historyPageCount}</span>
                            <Btn color={C.textDim} disabled={historyPage >= historyPageCount - 1} onClick={() => setHistoryPage((p) => p + 1)}>&#9654;</Btn>
                          </div>
                        )}
                      </RackPanel>
                    </div>
                    {selectedTrack && (
                      <div style={{ width: 300, flexShrink: 0 }}>
                        <RackPanel label="TRACK DETAIL" style={{ position: "sticky", top: 0 }}>
                          {selectedTrack.art_filename && (
                            <img
                              src={`http://127.0.0.1:${apiPort}/art/cache/${selectedTrack.art_filename}`}
                              alt="Album art"
                              style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 4, marginBottom: 14, background: C.bgInset }}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          )}
                          <div style={{ ...font(13, 600), color: C.textPrimary, marginBottom: 2 }}>{selectedTrack.artist}</div>
                          <div style={{ ...font(12, 400), color: C.textDim, marginBottom: 14 }}>{selectedTrack.title}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px" }}>
                            {selectedTrack.label && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Label</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedTrack.label}</span></>)}
                            {selectedTrack.year && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Year</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedTrack.year}</span></>)}
                            {selectedTrack.genre && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Genre</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedTrack.genre}</span></>)}
                            {selectedTrack.bpm && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>BPM</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedTrack.bpm}</span></>)}
                            {selectedTrack.key_name && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Key</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedTrack.key_name}</span></>)}
                            <span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Plays</span><span style={{ ...font(10, 600), color: C.cyan }}>{selectedTrack.play_count}</span>
                            <span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>First</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{formatDate(selectedTrack.first_played)}</span>
                            <span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Last</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{formatDate(selectedTrack.last_played)}</span>
                          </div>
                          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.borderRack}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Led color={selectedTrack.enrichment_status === "complete" ? C.green : selectedTrack.enrichment_status === "failed" ? C.red : C.amber} size={6} />
                              <span style={{ ...font(9, 400), color: C.textMuted }}>
                                {selectedTrack.enrichment_status === "complete" ? "Enriched via Beatport" : selectedTrack.enrichment_status === "failed" ? "Enrichment failed" : "Pending enrichment"}
                              </span>
                            </div>
                          </div>
                        </RackPanel>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── SESSIONS SUB-TAB ─── */}
                {historySubTab === "sessions" && (
                  <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
                    {/* ── Left: Session List ── */}
                    <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                      <RackPanel
                        label="SESSIONS"
                        labelRight={`${sessionTotal}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
                      >
                        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                          {sessionRows.length === 0 && (
                            <div style={{ ...font(11, 400), color: C.textMuted, padding: "24px 4px", textAlign: "center" }}>
                              No sessions yet
                            </div>
                          )}
                          {sessionRows.map((row) => {
                            const isSelected = selectedSession?.id === row.id;
                            return (
                              <div
                                key={row.id}
                                onClick={() => { setSelectedSession(isSelected ? null : row); setSelectedSessionTrack(null); }}
                                style={{
                                  padding: "8px 8px",
                                  cursor: "pointer",
                                  background: isSelected ? `${C.cyan}12` : "transparent",
                                  borderLeft: isSelected ? `2px solid ${C.cyan}` : "2px solid transparent",
                                  borderBottom: `1px solid ${C.borderRack}30`,
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = C.bgInsetHover; }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                              >
                                <div style={{ ...font(10, 500), color: C.textPrimary }}>{formatDateTime(row.started_at)}</div>
                                <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2 }}>
                                  {row.track_count} track{row.track_count !== 1 ? "s" : ""} {row.ended_at ? `\u00B7 ${formatDuration(row.started_at, row.ended_at)}` : "\u00B7 in progress"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {sessionPageCount > 1 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 10, borderTop: `1px solid ${C.borderRack}` }}>
                            <Btn color={C.textDim} disabled={sessionPage === 0} onClick={() => setSessionPage((p) => p - 1)}>&#9664;</Btn>
                            <span style={{ ...font(10, 400), color: C.textDim }}>{sessionPage + 1} / {sessionPageCount}</span>
                            <Btn color={C.textDim} disabled={sessionPage >= sessionPageCount - 1} onClick={() => setSessionPage((p) => p + 1)}>&#9654;</Btn>
                          </div>
                        )}
                      </RackPanel>
                    </div>

                    {/* ── Middle: Session Tracklist ── */}
                    {selectedSession && (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
                        <RackPanel
                          label="TRACKLIST"
                          labelRight={`${selectedSession.track_count} track${selectedSession.track_count !== 1 ? "s" : ""}`}
                          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
                        >
                          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                            {selectedSessionTracks.length === 0 && (
                              <div style={{ ...font(10, 400), color: C.textMuted, padding: "12px 0", textAlign: "center" }}>No tracks</div>
                            )}
                            {selectedSessionTracks.map((t, i) => {
                              const isTrackSelected = selectedSessionTrack?.id === t.id;
                              return (
                                <div
                                  key={t.id}
                                  onClick={() => setSelectedSessionTrack(isTrackSelected ? null : t)}
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "flex-start",
                                    padding: "6px 4px",
                                    cursor: "pointer",
                                    background: isTrackSelected ? `${C.cyan}12` : "transparent",
                                    borderLeft: isTrackSelected ? `2px solid ${C.cyan}` : "2px solid transparent",
                                    borderBottom: `1px solid ${C.borderRack}30`,
                                    transition: "background 0.15s",
                                  }}
                                  onMouseEnter={(e) => { if (!isTrackSelected) e.currentTarget.style.background = C.bgInsetHover; }}
                                  onMouseLeave={(e) => { if (!isTrackSelected) e.currentTarget.style.background = "transparent"; }}
                                >
                                  <span style={{ ...font(9, 600), color: C.textMuted, width: 20, flexShrink: 0, textAlign: "right" }}>{i + 1}.</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ ...font(10, 500), color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {t.artist} - {t.title}
                                    </div>
                                    {(t.label || t.year) && (
                                      <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 1 }}>
                                        {[t.label, t.year].filter(Boolean).join(" \u00B7 ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </RackPanel>
                      </div>
                    )}

                    {/* ── Right: Track Detail (appears on track click) ── */}
                    {selectedSessionTrack && (
                      <div style={{ width: 300, flexShrink: 0 }}>
                        <RackPanel label="TRACK DETAIL" style={{ position: "sticky", top: 0 }}>
                          {selectedSessionTrack.art_filename && (
                            <img
                              src={`http://127.0.0.1:${apiPort}/art/cache/${selectedSessionTrack.art_filename}`}
                              alt="Album art"
                              style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 4, marginBottom: 14, background: C.bgInset }}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          )}
                          <div style={{ ...font(13, 600), color: C.textPrimary, marginBottom: 2 }}>{selectedSessionTrack.artist}</div>
                          <div style={{ ...font(12, 400), color: C.textDim, marginBottom: 14 }}>{selectedSessionTrack.title}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px" }}>
                            {selectedSessionTrack.label && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Label</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedSessionTrack.label}</span></>)}
                            {selectedSessionTrack.year && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Year</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedSessionTrack.year}</span></>)}
                            {selectedSessionTrack.genre && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Genre</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedSessionTrack.genre}</span></>)}
                            {selectedSessionTrack.bpm && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>BPM</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedSessionTrack.bpm}</span></>)}
                            {selectedSessionTrack.key_name && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Key</span><span style={{ ...font(10, 400), color: C.textPrimary }}>{selectedSessionTrack.key_name}</span></>)}
                            {selectedSessionTrack.play_count != null && (<><span style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Plays</span><span style={{ ...font(10, 600), color: C.cyan }}>{selectedSessionTrack.play_count}</span></>)}
                          </div>
                          {selectedSessionTrack.enrichment_status && (
                            <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.borderRack}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Led color={selectedSessionTrack.enrichment_status === "complete" ? C.green : selectedSessionTrack.enrichment_status === "failed" ? C.red : C.amber} size={6} />
                                <span style={{ ...font(9, 400), color: C.textMuted }}>
                                  {selectedSessionTrack.enrichment_status === "complete" ? "Enriched via Beatport" : selectedSessionTrack.enrichment_status === "failed" ? "Enrichment failed" : "Pending enrichment"}
                                </span>
                              </div>
                            </div>
                          )}
                        </RackPanel>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── STYLE TAB ─── */}
            {activeTab === "style" && (() => {
              const s = overlayStyle;
              const gfontHref = GFONTS_SET.has(s.font_family)
                ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.font_family)}:wght@400;700&display=swap`
                : "";
              const previewArtist = currentTrack?.artist || "Artist Name";
              const previewTitle = currentTrack?.title || "Track Title";
              const shadowCss = s.drop_shadow_on
                ? `drop-shadow(${s.drop_shadow_x}px ${s.drop_shadow_y}px ${s.drop_shadow_blur}px ${s.drop_shadow_color})`
                : "none";
              const BG_CYCLE = ["#000000", "#ffffff", "#333333"];
              const BG_LABELS = ["BLK", "WHT", "GRY"];

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
                  {/* Google Fonts link for preview */}
                  {gfontHref && <link rel="stylesheet" href={gfontHref} />}

                  {/* Live Preview Panel */}
                  <RackPanel label="PREVIEW" labelRight={
                    <div style={{ display: "flex", gap: 4 }}>
                      {BG_CYCLE.map((bg, i) => (
                        <button
                          key={bg}
                          onClick={() => setPreviewBg(bg)}
                          style={{
                            ...font(8, previewBg === bg ? 700 : 500),
                            letterSpacing: 1,
                            padding: "2px 6px",
                            border: `1px solid ${previewBg === bg ? C.cyan : C.borderRack}`,
                            borderRadius: 3,
                            background: previewBg === bg ? `${C.cyan}18` : "transparent",
                            color: previewBg === bg ? C.cyan : C.textMuted,
                            cursor: "pointer",
                          }}
                        >
                          {BG_LABELS[i]}
                        </button>
                      ))}
                    </div>
                  } style={{ flexShrink: 0 }}>
                    <div
                      style={{
                        height: 140,
                        background: previewBg,
                        transition: "background 0.2s ease",
                        borderRadius: 4,
                        padding: 20,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      <div style={{ display: "inline-block", maxWidth: "100%", overflow: "hidden" }} ref={(wrap) => {
                        if (!wrap) return;
                        const els = wrap.querySelectorAll(".preview-text");
                        els.forEach((el) => {
                          el.style.transform = "scaleX(1)";
                          const cw = wrap.offsetWidth;
                          const sw = el.scrollWidth;
                          if (sw > cw && cw > 0) {
                            el.style.transform = `scaleX(${Math.max(0.5, cw / sw)})`;
                          }
                        });
                      }}>
                        <div
                          className="preview-text"
                          style={{
                            fontFamily: `"${s.font_family}", Arial, sans-serif`,
                            fontSize: s.font_size,
                            color: s.font_color,
                            textTransform: s.text_transform,
                            letterSpacing: `${s.letter_spacing}em`,
                            filter: shadowCss,
                            whiteSpace: "nowrap",
                            transformOrigin: "left center",
                          }}
                        >
                          {previewArtist}
                        </div>
                        <div
                          className="preview-text"
                          style={{
                            fontFamily: `"${s.font_family}", Arial, sans-serif`,
                            fontSize: s.font_size,
                            color: s.font_color,
                            textTransform: s.text_transform,
                            letterSpacing: `${s.letter_spacing}em`,
                            filter: shadowCss,
                            whiteSpace: "nowrap",
                            transformOrigin: "left center",
                            marginTop: s.line_gap,
                          }}
                        >
                          {previewTitle}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, ...font(9, 400), color: C.textMuted }}>
                      Long text auto-shrinks to fit. Changes reflect in OBS within 2 seconds.
                    </div>
                  </RackPanel>

                  {/* Controls Panel */}
                  <RackPanel label="OVERLAY STYLE" style={{ flex: 1, overflowY: "auto" }}>
                    {/* Font Family */}
                    <div style={{ display: "flex", alignItems: "center", padding: "6px 0", gap: 10 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 120 }}>Font</span>
                      <select
                        value={s.font_family}
                        onChange={(e) => handleStyleChange("font_family", e.target.value)}
                        style={{
                          flex: 1,
                          background: C.bgInset,
                          color: C.textPrimary,
                          border: `1px solid ${C.borderRack}`,
                          borderRadius: 4,
                          padding: "6px 8px",
                          ...font(11, 400),
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    {/* Uppercase */}
                    <Toggle
                      label="Uppercase"
                      on={s.text_transform === "uppercase"}
                      onChange={(on) => handleStyleChange("text_transform", on ? "uppercase" : "none")}
                    />

                    {/* Font Size */}
                    <SliderControl
                      label="Font Size"
                      value={s.font_size}
                      min={24} max={72} step={1} unit="px"
                      onChange={(v) => handleStyleChange("font_size", v)}
                    />

                    {/* Letter Spacing */}
                    <SliderControl
                      label="Letter Spacing"
                      value={s.letter_spacing}
                      min={0} max={0.3} step={0.01} unit="em"
                      onChange={(v) => handleStyleChange("letter_spacing", v)}
                    />

                    {/* Font Color */}
                    <div style={{ display: "flex", alignItems: "center", padding: "6px 0", gap: 10 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 120 }}>Font Color</span>
                      <input
                        type="color"
                        value={s.font_color}
                        onChange={(e) => handleStyleChange("font_color", e.target.value)}
                        style={{ width: 36, height: 28, border: `1px solid ${C.borderRack}`, borderRadius: 4, background: "transparent", cursor: "pointer", padding: 0 }}
                      />
                      <span style={{ ...font(10, 500), color: C.textPrimary }}>{s.font_color}</span>
                    </div>

                    {/* Line Gap */}
                    <SliderControl
                      label="Line Gap"
                      value={s.line_gap}
                      min={0} max={30} step={1} unit="px"
                      onChange={(v) => handleStyleChange("line_gap", v)}
                    />

                    {/* Drop Shadow section header */}
                    <div style={{ marginTop: 12, marginBottom: 4, borderTop: `1px solid ${C.borderRack}`, paddingTop: 10 }}>
                      <Toggle
                        label="Drop Shadow"
                        on={s.drop_shadow_on}
                        onChange={(on) => handleStyleChange("drop_shadow_on", on)}
                      />
                    </div>
                    {s.drop_shadow_on && (
                      <div style={{ paddingLeft: 12 }}>
                        <SliderControl label="Distance" value={s.drop_shadow_x} min={0} max={20} step={1} unit="px" onChange={(v) => {
                          setOverlayStyle((prev) => ({ ...prev, drop_shadow_x: v, drop_shadow_y: v }));
                          if (styleDebounceRef.current) clearTimeout(styleDebounceRef.current);
                          styleDebounceRef.current = setTimeout(async () => {
                            const res = await callCore("set_style", { drop_shadow_x: v, drop_shadow_y: v });
                            if (!res?.ok) addToast("Style update failed", "error");
                          }, 200);
                        }} />
                        <SliderControl label="Blur" value={s.drop_shadow_blur} min={0} max={20} step={1} unit="px" onChange={(v) => handleStyleChange("drop_shadow_blur", v)} />
                        <div style={{ display: "flex", alignItems: "center", padding: "6px 0", gap: 10 }}>
                          <span style={{ ...font(11, 500), color: C.textDim, minWidth: 120 }}>Shadow Color</span>
                          <input
                            type="color"
                            value={s.drop_shadow_color}
                            onChange={(e) => handleStyleChange("drop_shadow_color", e.target.value)}
                            style={{ width: 36, height: 28, border: `1px solid ${C.borderRack}`, borderRadius: 4, background: "transparent", cursor: "pointer", padding: 0 }}
                          />
                          <span style={{ ...font(10, 500), color: C.textPrimary }}>{s.drop_shadow_color}</span>
                        </div>
                      </div>
                    )}

                    {/* Reset */}
                    <div style={{ marginTop: 16, borderTop: `1px solid ${C.borderRack}`, paddingTop: 12 }}>
                      <Btn color={C.amber} onClick={handleResetStyle}>RESET DEFAULTS</Btn>
                    </div>
                  </RackPanel>
                </div>
              );
            })()}

            {/* ─── SETTINGS TAB ─── */}
            {activeTab === "settings" && (
              <RackPanel label="SETTINGS" style={{ maxWidth: 560 }}>
                {/* Output */}
                <div style={{ marginBottom: 20 }}>
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    OUTPUT
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ ...font(11, 500), color: C.textDim, minWidth: 110 }}>Output Directory</span>
                    <div
                      style={{
                        flex: 1,
                        ...font(10, 400),
                        color: C.textPrimary,
                        background: C.bgInset,
                        border: `1px solid ${C.borderRack}`,
                        borderRadius: 3,
                        padding: "7px 10px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {outputDir || "%USERPROFILE%\\TRACKR"}
                    </div>
                    <Btn color={C.blue} onClick={handleBrowseOutputDir} disabled={isRunning}>
                      BROWSE
                    </Btn>
                  </div>
                </div>

                {/* Startup */}
                <div
                  style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 16, marginBottom: 20 }}
                >
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    STARTUP
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <Toggle label="Start in system tray" on={startInTray} onChange={handleStartInTrayChange} />
                    <Toggle label="Start with Windows" on={startWithWindows} onChange={handleStartWithWindowsChange} />
                  </div>
                </div>

                {/* API */}
                <div
                  style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 16, marginBottom: 20 }}
                >
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    API
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <Toggle label="Enable local API" on={apiEnabled} onChange={handleApiEnabledChange} />
                    <Toggle label="Share play count via API" on={sharePlayCount} onChange={handleSharePlayCountChange} disabled={!apiEnabled} />
                    <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2, marginBottom: 14 }}>
                      When disabled, TRACKR does not expose local endpoints.
                    </div>

                    {/* OBS Overlay URL */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 80 }}>OBS Overlay</span>
                      <div
                        style={{
                          flex: 1,
                          ...font(10, 400),
                          color: apiEnabled ? C.textPrimary : C.textMuted,
                          background: C.bgInset,
                          border: `1px solid ${C.borderRack}`,
                          borderRadius: 3,
                          padding: "7px 10px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {`http://127.0.0.1:${apiPort}/trackr-current.html`}
                      </div>
                      <Btn
                        color={C.blue}
                        disabled={!apiEnabled}
                        onClick={() => {
                          navigator.clipboard.writeText(`http://127.0.0.1:${apiPort}/trackr-current.html`);
                          addToast("OBS overlay URL copied to clipboard", "success");
                        }}
                      >
                        COPY
                      </Btn>
                    </div>

                    {/* API URL */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 80 }}>API</span>
                      <div
                        style={{
                          flex: 1,
                          ...font(10, 400),
                          color: apiEnabled ? C.cyan : C.textMuted,
                          background: C.bgInset,
                          border: `1px solid ${C.cyanDim}40`,
                          borderRadius: 3,
                          padding: "7px 10px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {`http://${lanIp}:${apiPort}`}
                      </div>
                      <Btn
                        color={C.blue}
                        disabled={!apiEnabled}
                        onClick={() => {
                          navigator.clipboard.writeText(`http://${lanIp}:${apiPort}`);
                          addToast("API URL copied to clipboard", "success");
                        }}
                      >
                        COPY
                      </Btn>
                    </div>
                  </div>
                </div>

                {/* Beatport Enrichment */}
                <div
                  style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 16, marginBottom: 20 }}
                >
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    BEATPORT ENRICHMENT
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <Toggle label="Enable metadata enrichment" on={enrichmentEnabled} onChange={handleEnrichmentToggle} />
                    <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2, marginBottom: 14 }}>
                      Fetches year, label, genre, BPM, key, and album art from Beatport for each published track.
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: enrichmentEnabled ? 1 : 0.4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...font(11, 500), color: C.textDim, minWidth: 80 }}>Username</span>
                        <input
                          type="text"
                          value={beatportUsername}
                          onChange={(e) => setBeatportUsername(e.target.value)}
                          onBlur={handleBeatportCredentialsSave}
                          disabled={!enrichmentEnabled}
                          placeholder="Beatport username"
                          style={{
                            flex: 1,
                            ...font(10, 400),
                            color: C.textPrimary,
                            background: C.bgInset,
                            border: `1px solid ${C.borderRack}`,
                            borderRadius: 3,
                            padding: "7px 10px",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...font(11, 500), color: C.textDim, minWidth: 80 }}>Password</span>
                        <input
                          type="password"
                          value={beatportPassword}
                          onChange={(e) => setBeatportPassword(e.target.value)}
                          onBlur={handleBeatportCredentialsSave}
                          disabled={!enrichmentEnabled}
                          placeholder="Beatport password"
                          style={{
                            flex: 1,
                            ...font(10, 400),
                            color: C.textPrimary,
                            background: C.bgInset,
                            border: `1px solid ${C.borderRack}`,
                            borderRadius: 3,
                            padding: "7px 10px",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                        <Btn
                          color={C.cyan}
                          disabled={!enrichmentEnabled || !beatportUsername || !beatportPassword || beatportConnStatus === "testing"}
                          onClick={handleTestBeatportConnection}
                        >
                          {beatportConnStatus === "testing" ? "TESTING..." : "TEST CONNECTION"}
                        </Btn>
                        {beatportConnStatus && beatportConnStatus !== "testing" && (
                          <span style={{ ...font(9, 400), color: beatportConnStatus.ok ? C.green : C.red }}>
                            {beatportConnStatus.message}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 14, borderTop: `1px solid ${C.borderRack}30`, paddingTop: 10 }}>
                      <Toggle
                        label="Album art overlay"
                        on={artOverlayEnabled}
                        onChange={handleArtOverlayToggle}
                        disabled={!enrichmentEnabled}
                      />
                      <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2 }}>
                        Writes album art to overlay/albumart.jpg for OBS. Off by default.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data */}
                <div
                  style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 16, marginBottom: 20 }}
                >
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    DATA
                  </span>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                    <Btn
                      color={C.red}
                      onClick={() =>
                        setConfirmDialog({
                          type: "reset-counts",
                          message: "ARE YOU SURE YOU WANT TO RESET ALL PLAY COUNTS?",
                        })
                      }
                    >
                      RESET PLAY COUNTS
                    </Btn>
                    <span style={{ ...font(9, 400), color: C.textMuted }}>
                      Deletes all per-track play count history
                    </span>
                  </div>
                </div>

                {/* About */}
                <div style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 16 }}>
                  <span
                    style={{
                      ...font(8, 700),
                      color: C.textMuted,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    ABOUT
                  </span>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ ...font(12, 600), color: C.textPrimary, letterSpacing: 2 }}>TRACKR</div>
                    <div style={{ ...font(10, 400), color: C.textDim, marginTop: 4 }}>
                      Pro DJ Link track publisher for OBS
                    </div>
                    <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2 }}>
                      Pioneer CDJ → trackr-2-line.txt → OBS overlay
                    </div>
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <Btn
                        color={C.blue}
                        onClick={() => checkForUpdate(setUpdateStatus)}
                        disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"}
                      >
                        {updateStatus.state === "checking" ? "CHECKING..." :
                         updateStatus.state === "downloading" ? `DOWNLOADING ${Math.round((updateStatus.progress || 0) * 100)}%` :
                         updateStatus.state === "ready" ? "RESTARTING..." :
                         "CHECK FOR UPDATES"}
                      </Btn>
                      {updateStatus.state === "available" && (
                        <span style={{ ...font(9, 400), color: C.green }}>
                          v{updateStatus.version} available — downloading...
                        </span>
                      )}
                      {updateStatus.state === "up-to-date" && (
                        <span style={{ ...font(9, 400), color: C.textDim }}>
                          Up to date
                        </span>
                      )}
                      {updateStatus.state === "error" && (
                        <span style={{ ...font(9, 400), color: C.red }}>
                          {updateStatus.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </RackPanel>
            )}
          </div>
        </div>
      </div>

      {confirmDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 96,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: C.bgPanel,
              border: `1px solid ${C.borderRack}`,
              borderRadius: 6,
              padding: 18,
              boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 2.2, textTransform: "uppercase" }}>
              {confirmDialog.type === "reset-counts" ? "DATA RESET" : "SESSION CONFIRMATION"}
            </div>
            <div style={{ ...font(14, 600), color: C.textPrimary, marginTop: 8 }}>{confirmDialog.message}</div>
            <div style={{ ...font(11, 400), color: C.textDim, marginTop: 8 }}>
              {confirmDialog.type === "reset-counts"
                ? "This permanently deletes all per-track play counts. This cannot be undone."
                : "This action clears the running session tracklist view for the current session."}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn color={C.amber} onClick={handleConfirmCancel}>
                CANCEL
              </Btn>
              <Btn color={C.red} onClick={handleConfirmProceed}>
                CONFIRM
              </Btn>
            </div>
          </div>
        </div>
      )}

      {outputRootChoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 95,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: C.bgPanel,
              border: `1px solid ${C.borderRack}`,
              borderRadius: 6,
              padding: 18,
              boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ ...font(9, 700), color: C.textMuted, letterSpacing: 2.2, textTransform: "uppercase" }}>
              OUTPUT FOLDER CHOICE
            </div>
            <div style={{ ...font(14, 600), color: C.textPrimary, marginTop: 8 }}>
              Legacy output folder detected
            </div>
            <div style={{ ...font(11, 400), color: C.textDim, marginTop: 8 }}>
              Choose where TRACKR should write outputs. You can change this later in Settings.
            </div>
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <div style={{ ...font(10, 500), color: C.textMuted }}>
                Legacy: {outputRootChoice.legacy}
              </div>
              <div style={{ ...font(10, 500), color: C.textMuted }}>
                TRACKR: {outputRootChoice.trackr}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn color={C.amber} onClick={() => handleOutputRootChoice("legacy")}>
                USE LEGACY FOLDER
              </Btn>
              <Btn color={C.green} onClick={() => handleOutputRootChoice("trackr")}>
                SWITCH TO TRACKR
              </Btn>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          zIndex: 100,
        }}
      >
        {toasts.map((toast) => {
          const borderColor =
            toast.severity === "success"
              ? C.green
              : toast.severity === "error"
              ? C.red
              : toast.severity === "warning"
              ? C.amber
              : C.blue;
          return (
            <div
              key={toast.id}
              style={{
                ...font(10, 500),
                color: C.textPrimary,
                background: C.bgPanel,
                border: `1px solid ${C.borderRack}`,
                borderLeft: `3px solid ${borderColor}`,
                borderRadius: 4,
                padding: "10px 16px",
                minWidth: 240,
                maxWidth: 360,
                animation: "toastIn 0.25s ease",
                boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Led color={borderColor} size={6} />
              {toast.msg}
              <span
                style={{
                  marginLeft: "auto",
                  cursor: "pointer",
                  color: C.textMuted,
                  ...font(10),
                }}
                onClick={() => setToasts((t) => t.filter((x) => x.id !== toast.id))}
              >
                ✕
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
