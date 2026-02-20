import { useState, useEffect, useRef } from "react";

interface SplashScreenProps {
  status: string;
  visible: boolean;
}

export default function SplashScreen({ status, visible }: SplashScreenProps) {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setFading(true);
      timeoutRef.current = setTimeout(() => setMounted(false), 450);
    } else {
      setFading(false);
      setMounted(true);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible]);

  if (!mounted) return null;

  return (
    <>
      <style>{splashStyles}</style>
      <div
        className={`trackr-splash ${fading ? "trackr-splash--fading" : ""}`}
        aria-live="polite"
        aria-label="Application loading"
      >
        <div className="trackr-splash__texture" />

        <div className="trackr-splash__panel">
          <div className="trackr-splash__screw trackr-splash__screw--tl" />
          <div className="trackr-splash__screw trackr-splash__screw--tr" />
          <div className="trackr-splash__screw trackr-splash__screw--bl" />
          <div className="trackr-splash__screw trackr-splash__screw--br" />

          <div className="trackr-splash__power-led" />

          <h1 className="trackr-splash__wordmark">TRACKR</h1>
          <p className="trackr-splash__subtitle">DJ SET TRACK PUBLISHER</p>

          <div className="trackr-splash__meter" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="trackr-splash__segment"
                style={{ animationDelay: `${i * 0.07}s` }}
              />
            ))}
          </div>

          <div className="trackr-splash__status">
            <span className="trackr-splash__caret" aria-hidden="true" />
            <span className="trackr-splash__status-text">{status}</span>
          </div>
        </div>
      </div>
    </>
  );
}

const splashStyles = `
.trackr-splash {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  opacity: 1;
  transition: opacity 400ms ease-out;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.trackr-splash--fading {
  opacity: 0;
  pointer-events: none;
}

.trackr-splash__texture {
  position: absolute;
  inset: 0;
  opacity: 0.025;
  background-image:
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 1px,
      rgba(255,255,255,0.03) 1px,
      rgba(255,255,255,0.03) 2px
    ),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(255,255,255,0.015) 2px,
      rgba(255,255,255,0.015) 4px
    );
  pointer-events: none;
}

.trackr-splash__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 48px 72px 40px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 4px;
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,0.02) 0%,
      rgba(0,0,0,0) 40%,
      rgba(0,0,0,0.15) 100%
    );
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.04),
    inset 0 -1px 0 rgba(0,0,0,0.4),
    0 0 80px rgba(0,212,255,0.03);
}

.trackr-splash__screw {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background:
    radial-gradient(
      circle at 35% 35%,
      rgba(255,255,255,0.1) 0%,
      rgba(40,40,40,1) 50%,
      rgba(20,20,20,1) 100%
    );
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.6);
}
.trackr-splash__screw::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 1px;
  background: rgba(0,0,0,0.5);
  transform: translate(-50%, -50%) rotate(35deg);
  border-radius: 1px;
}
.trackr-splash__screw--tl { top: 10px; left: 10px; }
.trackr-splash__screw--tr { top: 10px; right: 10px; }
.trackr-splash__screw--bl { bottom: 10px; left: 10px; }
.trackr-splash__screw--br { bottom: 10px; right: 10px; }

.trackr-splash__power-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00d4ff;
  box-shadow:
    0 0 4px #00d4ff,
    0 0 12px rgba(0,212,255,0.4),
    0 0 24px rgba(0,212,255,0.15);
  margin-bottom: 28px;
  animation: trackr-led-pulse 2.4s ease-in-out infinite;
}

@keyframes trackr-led-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #00d4ff, 0 0 12px rgba(0,212,255,0.4), 0 0 24px rgba(0,212,255,0.15); }
  50%      { opacity: 0.6; box-shadow: 0 0 2px #00d4ff, 0 0 6px rgba(0,212,255,0.2), 0 0 12px rgba(0,212,255,0.08); }
}

.trackr-splash__wordmark {
  margin: 0;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 0.38em;
  color: #e8e8e8;
  text-indent: 0.38em;
  line-height: 1;
  text-shadow:
    0 0 30px rgba(0,212,255,0.12),
    0 1px 0 rgba(0,0,0,0.6);
}

.trackr-splash__subtitle {
  margin: 10px 0 0;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: rgba(255,255,255,0.22);
  text-transform: uppercase;
}

.trackr-splash__meter {
  display: flex;
  gap: 3px;
  margin-top: 36px;
  padding: 6px 8px;
  background: rgba(0,0,0,0.35);
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.03);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
}

.trackr-splash__segment {
  width: 6px;
  height: 18px;
  border-radius: 1px;
  background: rgba(0,212,255,0.08);
  animation: trackr-segment-sweep 1.6s ease-in-out infinite;
}

@keyframes trackr-segment-sweep {
  0%   { background: rgba(0,212,255,0.08); box-shadow: none; }
  20%  { background: rgba(0,212,255,0.9);  box-shadow: 0 0 6px rgba(0,212,255,0.5), 0 0 2px rgba(0,212,255,0.8); }
  45%  { background: rgba(0,212,255,0.08); box-shadow: none; }
  100% { background: rgba(0,212,255,0.08); box-shadow: none; }
}

.trackr-splash__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 24px;
  min-height: 18px;
}

.trackr-splash__caret {
  display: inline-block;
  width: 2px;
  height: 12px;
  background: #00d4ff;
  animation: trackr-caret-blink 0.9s step-end infinite;
  flex-shrink: 0;
}

@keyframes trackr-caret-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.trackr-splash__status-text {
  font-size: 11px;
  font-weight: 400;
  color: rgba(0,212,255,0.7);
  letter-spacing: 0.06em;
  white-space: nowrap;
}
`;
