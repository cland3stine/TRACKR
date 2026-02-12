import { useState, useEffect, useRef, useCallback } from "react";

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
const MOCK_TRACKS = [
  { time: "00:00", artist: "Marsh", title: "Eu Quero", plays: 4 },
  { time: "05:32", artist: "Yotto", title: "The One You Left Behind", plays: 1 },
  { time: "12:18", artist: "Tinlicker", title: "About You (Dosem Remix)", plays: 7 },
  { time: "18:45", artist: "Joris Voorn", title: "Antigone", plays: 12 },
  { time: "24:10", artist: "Stephan Bodzin", title: "Powers of Ten", plays: 3 },
  { time: "29:44", artist: "Adriatique", title: "Nude", plays: 9 },
  { time: "35:20", artist: "Tale Of Us", title: "Endless (Patrice Bäumel Remix)", plays: 2 },
  { time: "41:05", artist: "ARTBAT", title: "Talavera", plays: 15 },
  { time: "46:38", artist: "Rufus Du Sol", title: "Innerbloom (What So Not Remix)", plays: 6 },
  { time: "52:30", artist: "Ben Böhmer", title: "Beyond Beliefs", plays: 2 },
];

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
    #nowplaying {
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
  <div id="nowplaying">Loading...</div>
  <div class="previous"></div>
  <script>
    async function poll() {
      try {
        const r = await fetch('nowplaying.txt?_=' + Date.now());
        const t = await r.text();
        const lines = t.trim().split('\\n');
        document.getElementById('nowplaying')
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
  const [appState, setAppState] = useState("stopped"); // stopped, starting, running, stopping, error
  const [activeTab, setActiveTab] = useState("live");
  const [timestamps, setTimestamps] = useState(true);
  const [sharePlayCount, setSharePlayCount] = useState(false);
  const [delay, setDelay] = useState(3);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [savedTemplate, setSavedTemplate] = useState(DEFAULT_TEMPLATE);
  const [startInTray, setStartInTray] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [outputDir, setOutputDir] = useState("C:\\DJ\\TRACKR\\output");
  const [apiEnabled, setApiEnabled] = useState(true);
  const [apiAccessMode, setApiAccessMode] = useState("lan");
  const [apiBindHost, setApiBindHost] = useState("0.0.0.0");
  const [apiPort] = useState(8755);
  const [lanIp, setLanIp] = useState("192.168.1.50");
  const [toasts, setToasts] = useState([]);
  const [publishedAgo, setPublishedAgo] = useState(42);
  const [tracks, setTracks] = useState(MOCK_TRACKS);
  const [sessionIndex, setSessionIndex] = useState(1);
  const tracklistRef = useRef(null);
  const timerRef = useRef(null);

  const isRunning = appState === "running";
  const isTransitioning = appState === "starting" || appState === "stopping";
  const currentTrack = tracks[tracks.length - 1];
  const previousTrack = tracks.length >= 2 ? tracks[tracks.length - 2] : null;
  const deviceCount = isRunning ? 2 : appState === "starting" ? 0 : 0;
  const connectionState = isRunning ? "online" : appState === "starting" ? "scanning" : "offline";
  const templateDirty = template !== savedTemplate;

  // Auto-increment "published ago"
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setPublishedAgo((p) => p + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [isRunning]);

  const addToast = useCallback((msg, severity = "info") => {
    const id = Date.now();
    setToasts((t) => [...t.slice(-2), { id, msg, severity }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  const handleStartStop = () => {
    if (appState === "stopped" || appState === "error") {
      setAppState("starting");
      setTimeout(() => {
        setAppState("running");
        setPublishedAgo(0);
        addToast("Connected — 2 CDJs online", "success");
      }, 1800);
    } else if (appState === "running") {
      setAppState("stopping");
      setTimeout(() => {
        setAppState("stopped");
        addToast("TRACKR stopped", "info");
      }, 1200);
    }
  };

  const handleRefresh = () => {
    if (!isRunning) return;
    setAppState("stopping");
    setTimeout(() => {
      setTracks([]);
      setSessionIndex((i) => i + 1);
      setAppState("starting");
      setTimeout(() => {
        setAppState("running");
        setPublishedAgo(0);
        setTracks(MOCK_TRACKS.slice(0, 3));
        addToast("New session started", "success");
      }, 1200);
    }, 800);
  };

  const handleSaveTemplate = () => {
    setSavedTemplate(template);
    addToast("Template saved & applied", "success");
  };

  const handleRestoreTemplate = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setSavedTemplate(DEFAULT_TEMPLATE);
    addToast("Default template restored", "info");
  };

  const formatAgo = (s) => (s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`);

  // ─── TABS ────────────────────────────────────────────────────────────────
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
              {deviceCount} CDJ{deviceCount !== 1 ? "s" : ""}
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
              {currentTrack.artist} — {currentTrack.title}
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
                {previousTrack.artist} — {previousTrack.title}
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
                {deviceCount} CDJ{deviceCount !== 1 ? "s" : ""} Online
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
                  📁 {outputDir}
                </div>
                <div style={{ ...font(9, 400), color: C.textMuted, marginTop: 2 }}>
                  Session: 2026-02-11({sessionIndex})
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
                labelRight={`2026-02-11(${sessionIndex}) — ${tracks.length} tracks`}
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
                            {track.artist}{" "}
                            <span style={{ color: C.textMuted }}>—</span>{" "}
                            {track.title}
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
                      {outputDir}
                    </div>
                    <Btn color={C.blue} onClick={() => addToast("Folder picker (native dialog)", "info")}>
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
                    <Toggle label="Start in system tray" on={startInTray} onChange={setStartInTray} />
                    <Toggle label="Start with Windows" on={startWithWindows} onChange={setStartWithWindows} />
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
                    <Toggle label="Enable local API" on={apiEnabled} onChange={setApiEnabled} />
                    <Toggle label="Share play count via API" on={sharePlayCount} onChange={setSharePlayCount} disabled={!apiEnabled} />
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
                                setApiAccessMode(opt.id);
                                setApiBindHost(opt.id === "localhost" ? "127.0.0.1" : "0.0.0.0");
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
                      Pioneer CDJ → nowplaying.txt → OBS overlay
                    </div>
                  </div>
                </div>
              </RackPanel>
            )}
          </div>
        </div>
      </div>

      {/* ═══ TOASTS ═══ */}
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
