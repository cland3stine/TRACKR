import { useState, useEffect, useRef, useCallback } from "react";
import { checkForUpdate } from "./updater";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bgDeep: "#0a0a0a",
  bgPanel: "#131315",
  bgInset: "#18181b",
  bgInsetHover: "#1e1e22",
  borderRack: "#252528",
  borderFocus: "#333338",
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
      border: `1px solid ${C.borderRack}`,
      borderRadius: 6,
      padding: 16,
      position: "relative",
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
        width: 36,
        height: 18,
        borderRadius: 9,
        background: on ? `${C.green}30` : C.bgInset,
        border: `1px solid ${on ? C.green + "60" : C.borderRack}`,
        position: "relative",
        transition: "all 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: on ? C.green : C.textMuted,
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          transition: "all 0.2s ease",
          boxShadow: on ? `0 0 6px ${C.green}40` : "none",
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
        background: disabled ? C.bgInset : hover ? color + "cc" : color,
        border: `1px solid ${disabled ? C.borderRack : color}`,
        borderRadius: 4,
        padding: "10px 20px",
        cursor: disabled ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.4 : 1,
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
    running: { bg: C.green + "20", border: C.green + "50", color: C.green, text: "RUNNING", pulse: true },
    stopped: { bg: C.bgInset, border: C.borderRack, color: C.textMuted, text: "STOPPED", pulse: false },
    starting: { bg: C.amber + "15", border: C.amber + "40", color: C.amber, text: "STARTING...", pulse: true },
    stopping: { bg: C.amber + "15", border: C.amber + "40", color: C.amber, text: "STOPPING...", pulse: true },
    error: { bg: C.red + "20", border: C.red + "50", color: C.red, text: "ERROR", pulse: false },
  };
  const c = configs[state] || configs.stopped;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 12px",
        borderRadius: 4,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <Led color={c.color} size={6} pulse={c.pulse} />
      <span style={{ ...font(10, 700), color: c.color, letterSpacing: 2 }}>{c.text}</span>
    </div>
  );
};

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const EM_DASH = "—";

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      background: transparent;
      margin: 0;
      padding: 16px;
      font-family: 'Segoe UI', sans-serif;
    }
    #trackr {
      color: #ffffff;
      font-size: 18px;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    }
    .previous {
      color: #999999;
      font-size: 14px;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div id="trackr">Loading...</div>
  <div class="previous"></div>
  <script>
    async function poll() {
      try {
        const r = await fetch('trackr-2-line.txt?_=' + Date.now());
        const t = await r.text();
        const lines = t.trim().split('\\n');
        document.getElementById('trackr')
          .textContent = lines[0] || '—';
        document.querySelector('.previous')
          .textContent = lines[1] || '';
      } catch(e) {}
      setTimeout(poll, 2000);
    }
    poll();
  </script>
</body>
</html>`;

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
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [savedTemplate, setSavedTemplate] = useState(DEFAULT_TEMPLATE);
  const [startInTray, setStartInTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [outputDir, setOutputDir] = useState("");
  const [migrationPromptSeen, setMigrationPromptSeen] = useState(false);
  const [outputRootChoice, setOutputRootChoice] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [apiEnabled, setApiEnabled] = useState(true);
  const [apiAccessMode, setApiAccessMode] = useState("lan");
  const [apiBindHost, setApiBindHost] = useState("0.0.0.0");
  const [apiPort] = useState(8755);
  const [lanIp, setLanIp] = useState("127.0.0.1");
  const [toasts, setToasts] = useState([]);
  const [publishedAgo, setPublishedAgo] = useState(0);
  const [tracks, setTracks] = useState([]);
  const [sessionLabel, setSessionLabel] = useState(EM_DASH);
  const [deviceCount, setDeviceCount] = useState(0);
  const [devices, setDevices] = useState([]);
  const [updateStatus, setUpdateStatus] = useState({ state: "idle" });
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
  const templateDirty = template !== savedTemplate;

  // Auto-increment "published ago"
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setPublishedAgo((p) => p + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    return undefined;
  }, [isRunning]);

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
    if (status.api_access_mode) setApiAccessMode(status.api_access_mode);
    if (typeof status.api_enabled === "boolean") setApiEnabled(status.api_enabled);
    if (typeof status.strip_mix_labels === "boolean") setStripMixLabels(status.strip_mix_labels);
    if (status.lan_ip) setLanIp(status.lan_ip);
    if (typeof status.share_play_count_via_api === "boolean") setSharePlayCount(status.share_play_count_via_api);
    if (typeof status.migration_prompt_seen === "boolean") setMigrationPromptSeen(status.migration_prompt_seen);
    if (typeof status.start_with_windows === "boolean") setStartWithWindows(status.start_with_windows);
    if (typeof status.start_in_tray === "boolean") setStartInTray(status.start_in_tray);
    if (status.api_effective_bind_host) setApiBindHost(status.api_effective_bind_host);
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

  const reloadTemplate = useCallback(async () => {
    const res = await callCore("get_template");
    if (!res?.ok) return;
    const next = res.data?.template || DEFAULT_TEMPLATE;
    setTemplate(next);
    setSavedTemplate(next);
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
      await reloadTemplate();

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

    return () => {
      mounted = false;
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      if (typeof unsubscribeRef.current === "function") unsubscribeRef.current();
    };
  }, [applyOutputRootResolution, callCore, refreshFromCore, reloadTemplate, reloadTracklist]);

  const buildConfig = useCallback(
    () => ({
      output_root: outputDir || null,
      migration_prompt_seen: migrationPromptSeen,
      delay_seconds: delay,
      timestamps_enabled: timestamps,
      strip_mix_labels: stripMixLabels,
      api_enabled: apiEnabled,
      api_access_mode: apiAccessMode,
      share_play_count_via_api: sharePlayCount,
      api_port: apiPort,
    }),
    [outputDir, migrationPromptSeen, delay, timestamps, apiEnabled, apiAccessMode, sharePlayCount, apiPort]
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
    }
  }, [confirmDialog, performStop, performRefresh]);

  const handleSaveTemplate = useCallback(async () => {
    const res = await callCore("set_template", template);
    if (!res?.ok) {
      addToast(`Template save failed: ${res?.error?.message || "Unknown error"}`, "error");
      return;
    }
    const next = res.data?.template || template;
    setTemplate(next);
    setSavedTemplate(next);
    addToast("Template saved & applied", "success");
  }, [template, callCore, addToast]);

  const handleRestoreTemplate = useCallback(async () => {
    const res = await callCore("reset_template");
    if (!res?.ok) {
      addToast(`Template reset failed: ${res?.error?.message || "Unknown error"}`, "error");
      return;
    }
    const next = res.data?.template || DEFAULT_TEMPLATE;
    setTemplate(next);
    setSavedTemplate(next);
    addToast("Default template restored", "info");
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

  const handleApiAccessModeChange = useCallback(
    (mode) => {
      setApiAccessMode(mode);
      setApiBindHost(mode === "localhost" ? "127.0.0.1" : "0.0.0.0");
      if (isRunning) addToast("API setting will apply on next refresh/start", "info");
    },
    [isRunning, addToast]
  );

  const formatAgo = (s) => (s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`);

  // ─── TABS ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "live", label: "LIVE" },
    { id: "template", label: templateDirty ? "TEMPLATE •" : "TEMPLATE" },
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
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bgInset}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderRack}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.borderFocus}; }
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
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{ flexShrink: 0, zIndex: 10 }}>
        {/* Row 1: Status bar */}
        <div
          style={{
            height: 44,
            background: C.bgPanel,
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
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {["─", "□", "✕"].map((icon, i) => (
              <span
                key={i}
                style={{
                  ...font(12, 400),
                  color: i === 2 ? C.textDim : C.textMuted,
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: 2,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.target.style.color = i === 2 ? C.red : C.textPrimary)}
                onMouseLeave={(e) => (e.target.style.color = i === 2 ? C.textDim : C.textMuted)}
              >
                {icon}
              </span>
            ))}
          </div>
        </div>

        {/* Row 2: Now Playing strip */}
        <div
          style={{
            minHeight: 36,
            background: C.bgDeep,
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
              <span style={{ ...font(9, 400), color: C.textMuted, flexShrink: 0 }}>
                Deck B · {formatAgo(publishedAgo)}
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
            gap: 8,
            padding: 8,
            overflowY: "auto",
            borderRight: `1px solid ${C.borderRack}`,
          }}
        >
          {/* Status Panel */}
          <RackPanel label="STATUS">
            {/* State row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Led color={isRunning ? C.green : appState === "error" ? C.red : C.textMuted} size={7} pulse={isRunning} />
              <span
                style={{
                  ...font(11, 600),
                  color: isRunning ? C.green : appState === "error" ? C.red : C.textDim,
                  letterSpacing: 1,
                }}
              >
                {appState.toUpperCase()}
              </span>
            </div>

            {/* Devices row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Led color={deviceCount > 0 ? C.green : C.red} size={6} />
              <span style={{ ...font(10, 400), color: C.textDim }}>
                {deviceLabel} Online
              </span>
            </div>

            {/* Output */}
            <div style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 12 }}>
              <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2.5, textTransform: "uppercase" }}>
                OUTPUT
              </span>
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    ...font(9, 400),
                    color: C.textDim,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  📁 {outputDir || "%USERPROFILE%\\TRACKR"}
                </div>
                <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2 }}>
                  Session: {sessionLabel}
                </div>
              </div>
            </div>
          </RackPanel>

          {/* Control Panel */}
          <RackPanel label="CONTROLS" style={{ flex: 0 }}>
            {/* Start/Stop */}
            <Btn
              fullWidth
              color={isRunning ? C.red : C.green}
              onClick={handleStartStop}
              disabled={isTransitioning}
              style={{ marginBottom: 8 }}
            >
              {appState === "starting"
                ? "⏳ STARTING..."
                : appState === "stopping"
                ? "⏳ STOPPING..."
                : isRunning
                ? "■  STOP"
                : "▶  START"}
            </Btn>

            {/* Refresh */}
            <Btn
              fullWidth
              color={C.amber}
              onClick={handleRefresh}
              disabled={!isRunning || isTransitioning}
              style={{ marginBottom: 16 }}
            >
              ↻  REFRESH
            </Btn>

            {/* Parameters */}
            <div style={{ borderTop: `1px solid ${C.borderRack}`, paddingTop: 12 }}>
              <span style={{ ...font(8, 700), color: C.textMuted, letterSpacing: 2.5, textTransform: "uppercase" }}>
                PARAMETERS
              </span>

              {/* Delay */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0 6px",
                  opacity: isRunning ? 0.35 : 1,
                }}
              >
                <span style={{ ...font(11, 500), color: C.textDim }}>Publish Delay</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => !isRunning && setDelay(Math.max(1, delay - 1))}
                    disabled={isRunning}
                    style={{
                      ...font(11, 700),
                      width: 22,
                      height: 22,
                      border: `1px solid ${C.borderRack}`,
                      borderRadius: 3,
                      background: C.bgInset,
                      color: C.textDim,
                      cursor: isRunning ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      ...font(12, 600),
                      color: C.textPrimary,
                      minWidth: 28,
                      textAlign: "center",
                      background: C.bgInset,
                      border: `1px solid ${C.borderRack}`,
                      borderRadius: 3,
                      padding: "2px 6px",
                    }}
                  >
                    {delay}
                  </span>
                  <button
                    onClick={() => !isRunning && setDelay(Math.min(30, delay + 1))}
                    disabled={isRunning}
                    style={{
                      ...font(11, 700),
                      width: 22,
                      height: 22,
                      border: `1px solid ${C.borderRack}`,
                      borderRadius: 3,
                      background: C.bgInset,
                      color: C.textDim,
                      cursor: isRunning ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    +
                  </button>
                  <span style={{ ...font(9, 400), color: C.textMuted, marginLeft: 2 }}>sec</span>
                </div>
              </div>

              <Toggle label="Timestamps" on={timestamps} onChange={setTimestamps} disabled={isRunning} />
              <Toggle label="Strip Original/Extended" on={stripMixLabels} onChange={setStripMixLabels} disabled={isRunning} />
            </div>
          </RackPanel>
        </div>

        {/* ─── RIGHT CONTENT ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              gap: 0,
              padding: "0 8px",
              background: C.bgPanel,
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
                    background: "transparent",
                    border: "none",
                    borderBottom: active ? `2px solid ${C.cyan}` : "2px solid transparent",
                    padding: "12px 20px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    textTransform: "uppercase",
                  }}
                  onMouseEnter={(e) => !active && (e.target.style.color = C.textDim)}
                  onMouseLeave={(e) => !active && (e.target.style.color = C.textMuted)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden", padding: 8 }}>
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

            {/* ─── TEMPLATE TAB ─── */}
            {activeTab === "template" && (
              <RackPanel
                label="OVERLAY TEMPLATE"
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                {/* Editor */}
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    marginBottom: 14,
                    borderRadius: 4,
                    overflow: "hidden",
                    border: `1px solid ${C.borderRack}`,
                  }}
                >
                  <textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    spellCheck={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      background: C.bgInset,
                      color: C.textPrimary,
                      ...font(11, 400),
                      border: "none",
                      outline: "none",
                      resize: "none",
                      padding: "14px 16px",
                      lineHeight: 1.7,
                      tabSize: 2,
                    }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Btn
                    color={C.green}
                    onClick={handleSaveTemplate}
                    style={templateDirty ? { boxShadow: `0 0 8px ${C.green}30` } : {}}
                  >
                    ✓ SAVE
                  </Btn>
                  <Btn color={C.amber} onClick={handleRestoreTemplate}>
                    ↩ RESTORE DEFAULT
                  </Btn>
                  <div style={{ flex: 1 }} />
                  <span style={{ ...font(9, 400), color: C.textMuted }}>
                    {templateDirty ? (
                      <span style={{ color: C.amber }}>● Unsaved changes</span>
                    ) : (
                      "Template: OK"
                    )}
                  </span>
                </div>
              </RackPanel>
            )}

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

                    {/* API Access Mode */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 70 }}>API Access</span>
                      <div
                        style={{
                          display: "flex",
                          borderRadius: 4,
                          overflow: "hidden",
                          border: `1px solid ${C.borderRack}`,
                          opacity: apiEnabled ? 1 : 0.35,
                          pointerEvents: apiEnabled ? "auto" : "none",
                        }}
                      >
                        {[
                          { id: "localhost", label: "Localhost" },
                          { id: "lan", label: "LAN" },
                        ].map((opt) => {
                          const active = apiAccessMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                handleApiAccessModeChange(opt.id);
                              }}
                              style={{
                                ...font(9, active ? 700 : 500),
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                padding: "5px 16px",
                                border: "none",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                background: active ? `${C.cyan}18` : C.bgInset,
                                color: active ? C.cyan : C.textMuted,
                                borderRight: opt.id === "localhost" ? `1px solid ${C.borderRack}` : "none",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ ...font(9, 400), color: C.textMuted, marginBottom: 14, paddingLeft: 78 }}>
                      {apiAccessMode === "localhost"
                        ? "Only this PC can access the API."
                        : "Other PCs on the same network can access the API."}
                    </div>

                    {/* Local URL */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: apiAccessMode === "lan" ? 8 : 0 }}>
                      <span style={{ ...font(11, 500), color: C.textDim, minWidth: 70 }}>Local URL</span>
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
                        {`http://127.0.0.1:${apiPort}`}
                      </div>
                      <Btn
                        color={C.blue}
                        disabled={!apiEnabled}
                        onClick={() => {
                          navigator.clipboard.writeText(`http://127.0.0.1:${apiPort}`);
                          addToast("Local URL copied to clipboard", "success");
                        }}
                      >
                        COPY
                      </Btn>
                    </div>

                    {/* LAN URL (only when LAN mode) */}
                    {apiAccessMode === "lan" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...font(11, 500), color: C.textDim, minWidth: 70 }}>LAN URL</span>
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
                            addToast("LAN URL copied to clipboard", "success");
                          }}
                        >
                          COPY
                        </Btn>
                      </div>
                    )}
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
              SESSION CONFIRMATION
            </div>
            <div style={{ ...font(14, 600), color: C.textPrimary, marginTop: 8 }}>{confirmDialog.message}</div>
            <div style={{ ...font(11, 400), color: C.textDim, marginTop: 8 }}>
              This action clears the running session tracklist view for the current session.
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
