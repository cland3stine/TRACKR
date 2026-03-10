import { useState, useEffect, useRef, useCallback } from "react";
import { checkForUpdate } from "./updater";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bgDeep: "#06060a",
  bgPanel: "#0e0e1a",
  bgPanelSolid: "#0e0e1a",
  bgCard: "#12121f",
  bgInset: "#0a0a11",
  bgInsetHover: "#161624",
  borderRack: "rgba(255, 255, 255, 0.05)",
  borderLight: "rgba(255, 255, 255, 0.07)",
  borderFocus: "rgba(255, 255, 255, 0.14)",
  textPrimary: "#dadadf",
  textSecondary: "#a0a0a8",
  textDim: "#5e5e6a",
  textMuted: "#38383f",
  textGhost: "#222228",
  green: "#34d058",
  greenDim: "#1a5c25",
  amber: "#f5c842",
  amberDim: "#5c4a10",
  red: "#e8413a",
  redDim: "#5c1a18",
  blue: "#4a9eff",
  cyan: "#6ee7c0",
  cyanDim: "#1e4a3e",
  // Glossy tinted glass — smooth depth via layered inset box-shadows
  glass: "rgba(255, 255, 255, 0.025)",
  glassHover: "rgba(255, 255, 255, 0.05)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  glassHighlight: "rgba(255, 255, 255, 0.16)",
  // Shadow presets — outer glow + inset top-light + inner diffuse glow
  panelShadow: "0 2px 4px rgba(0,0,0,0.5), 0 12px 40px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.015), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 40px 60px -30px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.02)",
  cardShadow: "0 2px 8px rgba(0,0,0,0.3), 0 0 12px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 30px 50px -25px rgba(255,255,255,0.02)",
  blur: "blur(24px)",
  blurLight: "blur(14px)",
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
      boxShadow: `0 0 ${size * 0.5}px ${color}, 0 0 ${size}px ${color}70, 0 0 ${size * 2.5}px ${color}25`,
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
      border: `1px solid ${C.glassBorder}`,
      borderTop: `1px solid ${C.glassHighlight}`,
      borderRadius: C.radius,
      padding: 16,
      position: "relative",
      boxShadow: C.panelShadow,
      transition: "box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.4s ease, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
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
            background: `linear-gradient(135deg, ${C.textDim}, ${C.textMuted})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
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
        background: on ? `${C.green}20` : C.bgInset,
        border: `1px solid ${on ? C.green + "45" : C.glassBorder}`,
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        flexShrink: 0,
        boxShadow: on
          ? `0 0 14px ${C.green}18, 0 0 4px ${C.green}10, inset 0 1px 2px rgba(0,0,0,0.2)`
          : "inset 0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.1)",
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
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: on
            ? `0 0 10px ${C.green}60, 0 1px 3px rgba(0,0,0,0.3)`
            : "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  </div>
);

// ─── BUTTON ──────────────────────────────────────────────────────────────────
const Btn = ({ children, color, onClick, disabled, fullWidth, style = {} }) => {
  const [hover, setHover] = useState(false);
  const isDestructive = color === C.red;
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
        color: disabled ? C.textMuted : isDestructive ? "#fff" : C.bgDeep,
        background: disabled
          ? C.bgInset
          : hover
            ? `linear-gradient(135deg, ${color}ee, ${color}cc)`
            : `linear-gradient(135deg, ${color}, ${color}dd)`,
        border: `1px solid ${disabled ? C.glassBorder : hover ? color : color + "cc"}`,
        borderRadius: C.radiusSm,
        padding: "10px 20px",
        cursor: disabled ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.4 : 1,
        boxShadow: disabled ? "none" : hover
          ? `0 4px 20px ${color}35, 0 0 24px ${color}18, inset 0 1px 0 rgba(255,255,255,0.15)`
          : `0 2px 10px ${color}20, inset 0 1px 0 rgba(255,255,255,0.1)`,
        transform: hover && !disabled ? "translateY(-1px)" : "translateY(0)",
        backgroundSize: hover && !disabled ? "200% 100%" : "100% 100%",
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
    running: { bg: C.green + "14", border: C.green + "38", color: C.green, text: "RUNNING", pulse: true },
    stopped: { bg: C.bgInset, border: C.glassBorder, color: C.textMuted, text: "STOPPED", pulse: false },
    starting: { bg: C.amber + "10", border: C.amber + "30", color: C.amber, text: "STARTING...", pulse: true },
    stopping: { bg: C.amber + "10", border: C.amber + "30", color: C.amber, text: "STOPPING...", pulse: true },
    error: { bg: C.red + "14", border: C.red + "38", color: C.red, text: "ERROR", pulse: false },
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
        boxShadow: state === "running"
          ? `0 0 20px ${C.green}12, inset 0 1px 0 rgba(255,255,255,0.05)`
          : state === "starting" || state === "stopping"
            ? `0 0 16px ${C.amber}10`
            : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        animation: state === "starting" ? "scanLine 2s ease-in-out infinite" : "none",
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
  // Overlays tab
  const [overlaysConfig, setOverlaysConfig] = useState(null);
  const [overlayThemes, setOverlayThemes] = useState([]);
  const [overlayCopied, setOverlayCopied] = useState(null);  // "main" | "tiktok" | null
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

      // Load overlay config + themes
      try {
        const [oCfg, oThemes] = await Promise.all([
          window.electronAPI.invoke("overlays:get-config"),
          window.electronAPI.invoke("overlays:get-themes"),
        ]);
        if (oCfg) setOverlaysConfig(oCfg);
        if (oThemes) setOverlayThemes(oThemes);
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

      });

      if (subRes?.ok && subRes.data?.unsubscribe) {
        unsubscribeRef.current = subRes.data.unsubscribe;
      }

      statusPollRef.current = setInterval(() => {
        refreshFromCore();
      }, 2000);
    };

    bind();

    // Direct IPC listeners — store unsubscribe functions for targeted cleanup
    const offSession = window.electronAPI.on("trackr:session-started", () => {
      setTracks([]);
      setPublishedAgo(0);
      setLiveEnrichment(null);
    });
    const offEnrichment = window.electronAPI.on("trackr:enrichment-update", (data) => {
      setLiveEnrichment(data || null);
    });
    const offPublished = window.electronAPI.on("trackr:track-published", () => {
      setLiveEnrichment(null); // clear until enrichment arrives
    });

    return () => {
      mounted = false;
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      if (typeof unsubscribeRef.current === "function") unsubscribeRef.current();
      offSession();
      offEnrichment();
      offPublished();
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
    const offEnrichment = window.electronAPI.on("trackr:enrichment-update", handler);
    const offPublished = window.electronAPI.on("trackr:track-published", handler);
    return () => {
      offEnrichment();
      offPublished();
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
    { id: "overlays", label: "OVERLAYS" },
    { id: "settings", label: "SETTINGS" },
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: `radial-gradient(ellipse at 30% 20%, rgba(20, 20, 30, 1) 0%, ${C.bgDeep} 60%), ${C.bgDeep}`,
        color: C.textPrimary,
        display: "flex",
        flexDirection: "column",
        ...font(12),
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Noise texture removed — clean glass surfaces */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* Scrollbar — ultra-thin, fades */
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.06);
          border-radius: 3px;
          transition: background 0.3s ease;
        }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

        /* Input refinements */
        input[type="text"], input[type="password"], input[type="number"] {
          border-radius: ${C.radiusXs}px !important;
          transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease !important;
        }
        input[type="text"]:focus, input[type="password"]:focus {
          border-color: ${C.cyan}35 !important;
          box-shadow: 0 0 16px ${C.cyan}0c, 0 0 4px ${C.cyan}08, inset 0 0 8px ${C.cyan}05 !important;
          background: rgba(20, 20, 28, 0.8) !important;
        }
        input[type="range"] {
          height: 3px;
          border-radius: 2px;
          appearance: none;
          background: ${C.borderRack};
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${C.cyan};
          cursor: pointer;
          box-shadow: 0 0 8px ${C.cyan}40;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          box-shadow: 0 0 14px ${C.cyan}60;
          transform: scale(1.15);
        }
        select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235e5e6a'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          padding-right: 24px !important;
        }

        /* ─── KEYFRAMES ─── */
        @keyframes ledPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(30px) scale(0.96); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes flashCyan {
          0% { border-left-color: ${C.cyan}; }
          100% { border-left-color: transparent; }
        }
        @keyframes glassShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes scanLine {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes subtleBreathe {
          0%, 100% { box-shadow: 0 0 12px ${C.cyan}08; }
          50% { box-shadow: 0 0 20px ${C.cyan}14; }
        }
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ flexShrink: 0, zIndex: 10 }}>
        {/* Row 1: Status bar */}
        <div
          style={{
            height: 48,
            background: "#0a0a14",
            borderBottom: `1px solid ${C.glassBorder}`,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 24,
            boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(0,0,0,0.3)",
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{
              ...font(14, 700),
              letterSpacing: 5,
              background: `linear-gradient(135deg, ${C.textPrimary}, ${C.textSecondary})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>TRACKR</span>
            <span style={{ ...font(9, 300), color: C.textMuted, letterSpacing: 1 }}>v1.0</span>
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
                ...font(10, 300),
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
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {["─", "□", "✕"].map((icon, i) => (
              <span
                key={i}
                style={{
                  ...font(11, 400),
                  color: i === 2 ? C.textDim : C.textMuted,
                  cursor: "pointer",
                  padding: "4px 7px",
                  borderRadius: C.radiusXs,
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = i === 2 ? C.red : C.textPrimary;
                  e.target.style.background = i === 2 ? `${C.red}18` : C.glassHover;
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
            backgroundColor: "#07070c",
            borderBottom: `1px solid ${C.borderRack}`,
            display: "flex",
            alignItems: "center",
            padding: "6px 20px",
            gap: 14,
            position: "relative",
            boxShadow: isRunning && currentTrack
              ? `inset 0 -1px 0 ${C.cyan}15, 0 2px 12px rgba(0,0,0,0.2)`
              : "0 2px 12px rgba(0,0,0,0.2)",
            transition: "box-shadow 0.6s ease",
          }}
        >
          {/* NOW label */}
          <span
            style={{
              ...font(9, 700),
              color: isRunning && currentTrack ? C.cyan : C.textMuted,
              letterSpacing: 2.5,
              flexShrink: 0,
              animation: isRunning && currentTrack ? "pulseGlow 3s ease-in-out infinite" : "none",
              textShadow: isRunning && currentTrack ? `0 0 12px ${C.cyan}40` : "none",
              transition: "color 0.4s ease, text-shadow 0.4s ease",
            }}
          >
            NOW
          </span>

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: C.borderRack, flexShrink: 0 }} />

          {/* Current track */}
          {isRunning && currentTrack ? (
            <span style={{
              ...font(12, 600),
              color: C.textPrimary,
              textShadow: `0 0 20px rgba(255,255,255,0.06)`,
            }}>
              {renderTrackText(currentTrack)}
            </span>
          ) : (
            <span style={{ ...font(12, 300), color: C.textMuted }}>—</span>
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
            borderRight: `1px solid ${C.glassBorder}`,
            background: "#09090f",
            boxShadow: "inset -1px 0 0 rgba(255,255,255,0.03), 4px 0 20px rgba(0,0,0,0.25), inset 0 0 40px rgba(255,255,255,0.008)",
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
            <RackPanel label="NOW PLAYING" style={{ flex: 0, animation: "fadeIn 0.4s ease" }}>
              {liveEnrichment?.art_filename ? (
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <img
                    src={`http://127.0.0.1:${apiPort}/art/cache/${liveEnrichment.art_filename}`}
                    alt=""
                    style={{
                      width: "100%", aspectRatio: "1/1", objectFit: "cover",
                      borderRadius: 8, background: C.bgInset, display: "block",
                      boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 30px rgba(110, 231, 192, 0.06)`,
                    }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  {/* Reflection */}
                  <div style={{
                    position: "absolute", bottom: -4, left: "10%", right: "10%",
                    height: 16, borderRadius: "50%",
                    background: `radial-gradient(ellipse, rgba(110,231,192,0.08), transparent 70%)`,
                    filter: "blur(8px)", pointerEvents: "none",
                  }} />
                </div>
              ) : liveEnrichment?.artFilename ? (
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <img
                    src={`http://127.0.0.1:${apiPort}/art/cache/${liveEnrichment.artFilename}`}
                    alt=""
                    style={{
                      width: "100%", aspectRatio: "1/1", objectFit: "cover",
                      borderRadius: 8, background: C.bgInset, display: "block",
                      boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 30px rgba(110, 231, 192, 0.06)`,
                    }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <div style={{
                    position: "absolute", bottom: -4, left: "10%", right: "10%",
                    height: 16, borderRadius: "50%",
                    background: `radial-gradient(ellipse, rgba(110,231,192,0.08), transparent 70%)`,
                    filter: "blur(8px)", pointerEvents: "none",
                  }} />
                </div>
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
                <div style={{ ...font(9, 300), color: C.textMuted, textAlign: "center", padding: "8px 0", letterSpacing: 1 }}>
                  Enriching...
                </div>
              )}
              {!liveEnrichment && !enrichmentEnabled && (
                <div style={{ ...font(9, 300), color: C.textGhost, textAlign: "center", padding: "4px 0", letterSpacing: 1 }}>
                  Enrichment disabled
                </div>
              )}
            </RackPanel>
          )}

          {/* ── Output info ── */}
          <div style={{
            ...font(9, 300), color: C.textMuted, padding: "8px 8px",
            marginTop: "auto", borderTop: `1px solid ${C.borderRack}`,
          }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outputDir || "%USERPROFILE%\\TRACKR"}
            </div>
            <div style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textGhost }}>
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
              gap: 2,
              padding: "6px 10px",
              background: "#0b0b12",
              borderBottom: `1px solid ${C.borderRack}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              flexShrink: 0,
              position: "relative",
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...font(10, active ? 700 : 400),
                    letterSpacing: 2,
                    color: active ? C.cyan : C.textMuted,
                    background: active ? `${C.cyan}0c` : "transparent",
                    border: active ? `1px solid ${C.cyan}18` : "1px solid transparent",
                    borderRadius: C.radiusXs,
                    padding: "8px 20px",
                    cursor: "pointer",
                    transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    textTransform: "uppercase",
                    boxShadow: active ? `0 0 16px ${C.cyan}08, inset 0 1px 0 ${C.cyan}0a` : "none",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.target.style.color = C.textSecondary;
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
          <div style={{ flex: 1, overflow: "hidden", padding: 10, animation: "fadeIn 0.3s ease" }}>
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
                    borderRadius: C.radiusSm,
                    padding: 0,
                    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), inset 0 0 12px rgba(255,255,255,0.008)",
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
                        gap: 14,
                        padding: 40,
                      }}
                    >
                      <Led color={C.textMuted} size={10} pulse />
                      <span style={{ ...font(11, 300), color: C.textMuted, letterSpacing: 1 }}>Waiting for first track...</span>
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
                            background: isLast ? `linear-gradient(90deg, ${C.green}08, transparent 60%)` : "transparent",
                            animation: "slideIn 0.3s ease",
                            transition: "background 0.4s ease, border-color 0.4s ease",
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
                              background: `linear-gradient(135deg, ${C.cyan}0e, ${C.cyan}06)`,
                              border: `1px solid ${C.cyan}1a`,
                              borderRadius: 10,
                              padding: "2px 8px",
                              marginLeft: 12,
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                              boxShadow: `0 0 8px ${C.cyan}06`,
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
                <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                  {[{ id: "tracks", label: "TRACKS" }, { id: "sessions", label: "SESSIONS" }].map((st) => {
                    const active = historySubTab === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => { setHistorySubTab(st.id); setSelectedTrack(null); setSelectedSession(null); }}
                        style={{
                          ...font(9, active ? 700 : 400),
                          letterSpacing: 2,
                          textTransform: "uppercase",
                          color: active ? C.cyan : C.textMuted,
                          background: active ? `${C.cyan}0c` : "transparent",
                          border: active ? `1px solid ${C.cyan}18` : "1px solid transparent",
                          borderRadius: C.radiusXs,
                          padding: "8px 20px",
                          cursor: "pointer",
                          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: active ? `0 0 12px ${C.cyan}06` : "none",
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
                      <div style={{ width: 300, flexShrink: 0, animation: "fadeIn 0.3s ease" }}>
                        <RackPanel label="TRACK DETAIL" style={{ position: "sticky", top: 0 }}>
                          {selectedTrack.art_filename && (
                            <div style={{ position: "relative", marginBottom: 14 }}>
                              <img
                                src={`http://127.0.0.1:${apiPort}/art/cache/${selectedTrack.art_filename}`}
                                alt="Album art"
                                style={{
                                  width: "100%", aspectRatio: "1/1", objectFit: "cover",
                                  borderRadius: 8, background: C.bgInset, display: "block",
                                  boxShadow: `0 4px 20px rgba(0,0,0,0.5)`,
                                }}
                                onError={(e) => { e.target.style.display = "none"; }}
                              />
                              <div style={{
                                position: "absolute", bottom: -4, left: "10%", right: "10%",
                                height: 12, borderRadius: "50%",
                                background: `radial-gradient(ellipse, rgba(0,0,0,0.3), transparent 70%)`,
                                filter: "blur(6px)", pointerEvents: "none",
                              }} />
                            </div>
                          )}
                          <div style={{ ...font(13, 600), color: C.textPrimary, marginBottom: 2 }}>{selectedTrack.artist}</div>
                          <div style={{ ...font(12, 300), color: C.textDim, marginBottom: 14 }}>{selectedTrack.title}</div>
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
                      <div style={{ width: 300, flexShrink: 0, animation: "fadeIn 0.3s ease" }}>
                        <RackPanel label="TRACK DETAIL" style={{ position: "sticky", top: 0 }}>
                          {selectedSessionTrack.art_filename && (
                            <div style={{ position: "relative", marginBottom: 14 }}>
                              <img
                                src={`http://127.0.0.1:${apiPort}/art/cache/${selectedSessionTrack.art_filename}`}
                                alt="Album art"
                                style={{
                                  width: "100%", aspectRatio: "1/1", objectFit: "cover",
                                  borderRadius: 8, background: C.bgInset, display: "block",
                                  boxShadow: `0 4px 20px rgba(0,0,0,0.5)`,
                                }}
                                onError={(e) => { e.target.style.display = "none"; }}
                              />
                              <div style={{
                                position: "absolute", bottom: -4, left: "10%", right: "10%",
                                height: 12, borderRadius: "50%",
                                background: `radial-gradient(ellipse, rgba(0,0,0,0.3), transparent 70%)`,
                                filter: "blur(6px)", pointerEvents: "none",
                              }} />
                            </div>
                          )}
                          <div style={{ ...font(13, 600), color: C.textPrimary, marginBottom: 2 }}>{selectedSessionTrack.artist}</div>
                          <div style={{ ...font(12, 300), color: C.textDim, marginBottom: 14 }}>{selectedSessionTrack.title}</div>
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
                        transition: "background 0.3s ease",
                        borderRadius: C.radiusSm,
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

            {/* ─── OVERLAYS TAB ─── */}
            {activeTab === "overlays" && overlaysConfig && (() => {
              const updateOverlayCanvas = async (canvas, key, value) => {
                const updated = {
                  ...overlaysConfig,
                  [canvas]: { ...overlaysConfig[canvas], [key]: value },
                };
                setOverlaysConfig(updated);
                try { await window.electronAPI.invoke("overlays:set-config", updated); } catch (_) {}
              };
              const updateOverlayTrigger = async (key, value) => {
                const updated = {
                  ...overlaysConfig,
                  triggers: { ...overlaysConfig.triggers, [key]: value },
                };
                setOverlaysConfig(updated);
                try { await window.electronAPI.invoke("overlays:set-config", updated); } catch (_) {}
              };
              const landscapeThemes = overlayThemes.filter(t => t.canvas === "landscape" || t.canvas === "both");
              const portraitThemes = overlayThemes.filter(t => t.canvas === "portrait" || t.canvas === "both");
              const getTransitionsForTheme = (themeId) => {
                const theme = overlayThemes.find(t => t.id === themeId);
                return theme?.transitions || [];
              };
              const copyUrl = (canvas) => {
                const port = apiPort || 8755;
                navigator.clipboard.writeText(`http://${lanIp}:${port}/overlay/${canvas}`);
                setOverlayCopied(canvas);
                setTimeout(() => setOverlayCopied(null), 2000);
              };
              const testOverlay = async () => {
                try { await window.electronAPI.invoke("overlays:test"); } catch (_) {}
              };

              const selectStyle = {
                ...font(10, 500), color: C.textPrimary, background: C.bgInset,
                border: `1px solid ${C.borderLight}`, padding: "6px 10px",
                borderRadius: C.radiusXs, outline: "none", cursor: "pointer",
              };
              const inputStyle = {
                ...font(10, 500), color: C.textPrimary, background: C.bgInset,
                border: `1px solid ${C.borderLight}`, padding: "6px 10px",
                borderRadius: C.radiusXs, outline: "none",
              };
              const port = apiPort || 8755;
              const mainCfg = overlaysConfig.main;
              const tikCfg = overlaysConfig.tiktok;
              const trig = overlaysConfig.triggers;

              const Checkbox = ({ checked, label, onClick }) => (
                <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                  <div style={{
                    width: 13, height: 13, borderRadius: 3,
                    background: checked ? C.cyan : "transparent",
                    border: `1px solid ${checked ? C.cyan : C.borderLight}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s ease",
                  }}>
                    {checked && <span style={{ ...font(8, 700), color: C.bgDeep, lineHeight: 1 }}>✓</span>}
                  </div>
                  {label && <span style={{ ...font(9, 500), color: checked ? C.textPrimary : C.textDim }}>{label}</span>}
                </div>
              );

              const PreviewIframe = ({ canvas, config }) => (
                <iframe
                  key={`${config.theme}-${config.transition}-${config.showLabel}-${config.showYear}-${config.showArt}`}
                  src={`http://localhost:${port}/overlay/${canvas}?preview=true`}
                  style={{
                    position: "absolute", top: 0, left: 0,
                    width: "133.33%", height: "133.33%",
                    transform: "scale(0.75)", transformOrigin: "top left",
                    border: "none",
                  }}
                  title={`${canvas} preview`}
                />
              );

              const ControlsGrid = ({ canvas, config, themeList }) => {
                const currentTheme = overlayThemes.find(t => t.id === config.theme);
                const transitions = currentTheme?.transitions || [];
                const positions = canvas === "tiktok"
                  ? [["bottom-center", "Bottom Center"], ["bottom-left", "Bottom Left"], ["bottom-right", "Bottom Right"]]
                  : [["bottom-left", "Bottom Left"], ["bottom-right", "Bottom Right"], ["top-left", "Top Left"], ["top-right", "Top Right"], ["bottom-center", "Bottom Center"]];
                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px 10px", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ ...font(9, 500), color: C.textSecondary }}>Theme</span>
                      <select value={config.theme} onChange={(e) => {
                        const nid = e.target.value;
                        updateOverlayCanvas(canvas, "theme", nid);
                        const t = overlayThemes.find(x => x.id === nid);
                        if (t && !t.transitions.includes(config.transition)) updateOverlayCanvas(canvas, "transition", t.defaultTransition);
                      }} style={selectStyle}>
                        {themeList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>

                      <span style={{ ...font(9, 500), color: C.textSecondary }}>Transition</span>
                      <select value={config.transition} onChange={(e) => updateOverlayCanvas(canvas, "transition", e.target.value)} style={selectStyle}>
                        {transitions.map(t => <option key={t} value={t}>{t.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}</option>)}
                      </select>

                      <span style={{ ...font(9, 500), color: C.textSecondary }}>Position</span>
                      <select value={config.position} onChange={(e) => updateOverlayCanvas(canvas, "position", e.target.value)} style={selectStyle}>
                        {positions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>

                      <span style={{ ...font(9, 500), color: C.textSecondary }}>Duration</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="number" min="0" max="120" value={config.displayDuration}
                          onChange={(e) => updateOverlayCanvas(canvas, "displayDuration", Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ ...inputStyle, width: 54 }} />
                        <span style={{ ...font(8, 400), color: C.textDim }}>{config.displayDuration === 0 ? "always" : "sec"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                      {[["showLabel", "Label"], ["showYear", "Year"], ["showArt", "Art"]].map(([k, l]) => (
                        <Checkbox key={k} checked={config[k]} label={l} onClick={() => updateOverlayCanvas(canvas, k, !config[k])} />
                      ))}
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px", background: C.bgDeep,
                      border: `1px solid ${C.borderRack}`, borderRadius: C.radiusXs,
                    }}>
                      <span style={{ ...font(7, 600), color: C.textMuted, letterSpacing: 1 }}>OBS</span>
                      <span style={{ ...font(9, 400), color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lanIp}:{port}/overlay/{canvas}
                      </span>
                      <Btn color={C.cyan} onClick={() => copyUrl(canvas)} style={{ padding: "2px 8px", ...font(8, 600) }}>
                        {overlayCopied === canvas ? "COPIED" : "COPY"}
                      </Btn>
                    </div>
                  </>
                );
              };

              return (
                <RackPanel label="OVERLAYS">
                  {/* ── Unified Preview ── */}
                  <div style={{
                    display: "flex",
                    borderRadius: C.radiusSm,
                    border: `1px solid ${C.borderRack}`,
                    overflow: "hidden",
                    marginBottom: 14,
                    backgroundColor: "#0a0a10",
                    backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%)",
                    backgroundSize: "12px 12px",
                  }}>
                    {/* Main preview (landscape) */}
                    <div style={{ flex: "1.5 1 0", position: "relative", minHeight: 0 }}>
                      <div style={{ ...font(7, 700), color: "rgba(255,255,255,0.12)", letterSpacing: 2, textTransform: "uppercase", position: "absolute", top: 8, left: 10, zIndex: 1 }}>MAIN</div>
                      <div style={{ position: "relative", width: "100%", paddingBottom: "52%", overflow: "hidden" }}>
                        {PreviewIframe({ canvas: "main", config: mainCfg })}
                      </div>
                    </div>
                    {/* Divider */}
                    <div style={{ width: 1, background: C.borderRack, flexShrink: 0 }} />
                    {/* TikTok preview (portrait) */}
                    <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
                      <div style={{ ...font(7, 700), color: "rgba(255,255,255,0.12)", letterSpacing: 2, textTransform: "uppercase", position: "absolute", top: 8, left: 10, zIndex: 1 }}>TIKTOK</div>
                      <div style={{ position: "relative", width: "45%", paddingBottom: "80%", overflow: "hidden" }}>
                        {PreviewIframe({ canvas: "tiktok", config: tikCfg })}
                      </div>
                    </div>
                  </div>

                  {/* ── Settings: two columns ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    {/* Left column — Main + Twitch Chat */}
                    <div style={{
                      background: C.bgCard,
                      border: `1px solid ${C.glassBorder}`, borderTop: `1px solid ${C.glassHighlight}`,
                      borderRadius: C.radiusSm, padding: 14,
                      boxShadow: C.cardShadow,
                    }}>
                      <div style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.borderRack}` }}>
                        MAIN CANVAS
                      </div>
                      {ControlsGrid({ canvas: "main", config: mainCfg, themeList: landscapeThemes })}

                      {/* Twitch Chat */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.borderRack}` }}>
                        <div style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10 }}>
                          TWITCH CHAT
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px 10px", alignItems: "center" }}>
                          <span style={{ ...font(9, 500), color: C.textSecondary }}>Channel</span>
                          <input type="text" value={trig.twitchChannel}
                            onChange={(e) => updateOverlayTrigger("twitchChannel", e.target.value)}
                            placeholder="your_channel" style={inputStyle} />
                          <span style={{ ...font(9, 500), color: C.textSecondary }}>Command</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Checkbox checked={trig.chatCommand} onClick={() => updateOverlayTrigger("chatCommand", !trig.chatCommand)} />
                            <input type="text" value={trig.chatCommandName}
                              onChange={(e) => updateOverlayTrigger("chatCommandName", e.target.value)}
                              style={{ ...inputStyle, padding: "4px 8px", width: 80 }} />
                          </div>
                          <span style={{ ...font(9, 500), color: C.textSecondary }}>Cooldown</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="number" min="0" max="300" value={trig.chatCommandCooldown}
                              onChange={(e) => updateOverlayTrigger("chatCommandCooldown", Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ ...inputStyle, width: 54 }} />
                            <span style={{ ...font(8, 400), color: C.textDim }}>sec</span>
                          </div>
                        </div>
                        {trig.chatCommand && !trig.twitchChannel && (
                          <div style={{ ...font(8, 400), color: C.amber, marginTop: 6 }}>
                            Enter your Twitch channel to enable chat commands
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right column — TikTok */}
                    <div style={{
                      background: C.bgCard,
                      border: `1px solid ${C.glassBorder}`, borderTop: `1px solid ${C.glassHighlight}`,
                      borderRadius: C.radiusSm, padding: 14,
                      boxShadow: C.cardShadow,
                    }}>
                      <div style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.borderRack}` }}>
                        TIKTOK CANVAS
                      </div>
                      {ControlsGrid({ canvas: "tiktok", config: tikCfg, themeList: portraitThemes })}
                    </div>
                  </div>

                  {/* ── Footer: Auto-show + Test ── */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Checkbox checked={trig.autoShowOnTrackChange} label="Auto-show on track change"
                      onClick={() => updateOverlayTrigger("autoShowOnTrackChange", !trig.autoShowOnTrackChange)} />
                    <Btn color={C.cyan} onClick={testOverlay}>
                      TEST OVERLAY
                    </Btn>
                  </div>
                </RackPanel>
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
                        {`http://${lanIp}:${apiPort}/trackr-current.html`}
                      </div>
                      <Btn
                        color={C.blue}
                        disabled={!apiEnabled}
                        onClick={() => {
                          navigator.clipboard.writeText(`http://${lanIp}:${apiPort}/trackr-current.html`);
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
                      Resets all per-track play counts to zero
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
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 96,
            padding: 16,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: C.bgPanel,
              border: `1px solid ${C.glassHighlight}`,
              borderRadius: C.radius,
              padding: 24,
              boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(0,0,0,0.3), 0 0 25px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.10)`,
              backdropFilter: C.blur,
              WebkitBackdropFilter: C.blur,
              animation: "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 95,
            padding: 16,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: C.bgPanel,
              border: `1px solid ${C.glassHighlight}`,
              borderRadius: C.radius,
              padding: 24,
              boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(0,0,0,0.3), 0 0 25px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.10)`,
              backdropFilter: C.blur,
              WebkitBackdropFilter: C.blur,
              animation: "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
                background: "rgba(16, 16, 22, 0.92)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: `1px solid ${C.glassBorder}`,
                borderLeft: `3px solid ${borderColor}`,
                borderRadius: C.radiusSm,
                padding: "10px 16px",
                minWidth: 240,
                maxWidth: 360,
                animation: "toastIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 16px ${borderColor}08, 0 0 12px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.05)`,
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
                  transition: "color 0.2s ease",
                }}
                onClick={() => setToasts((t) => t.filter((x) => x.id !== toast.id))}
                onMouseEnter={(e) => { e.target.style.color = C.textDim; }}
                onMouseLeave={(e) => { e.target.style.color = C.textMuted; }}
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
