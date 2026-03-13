/**
 * TRACKR Overlay — Shared transition CSS
 *
 * All 6 transitions as CSS @keyframes strings.
 * Each theme imports and includes the transitions it supports.
 * Resting transform is injected per-theme via template parameter.
 * Scaled for 4K canvas rendering (OBS downscales for sharpness).
 */

export interface TransitionMeta {
  id: string;
  name: string;
  enterDuration: number;  // ms
  exitDuration: number;   // ms
}

export const TRANSITION_META: Record<string, TransitionMeta> = {
  'slide':       { id: 'slide',       name: 'Clean Slide',     enterDuration: 700, exitDuration: 500 },
  'digital':     { id: 'digital',     name: 'Digital Flicker', enterDuration: 450, exitDuration: 350 },
  'materialize': { id: 'materialize', name: 'Materialize',     enterDuration: 600, exitDuration: 450 },
  'scale-pop':   { id: 'scale-pop',   name: 'Scale Pop',       enterDuration: 500, exitDuration: 350 },
  'blur':        { id: 'blur',        name: 'Blur Resolve',    enterDuration: 700, exitDuration: 500 },
  'edge-wipe':   { id: 'edge-wipe',   name: 'Edge Wipe',       enterDuration: 700, exitDuration: 600 },
};

/**
 * Generate transition CSS for a given resting transform.
 * @param rest - CSS transform string for the card's resting state (e.g., "rotateY(18deg)")
 * @param transitions - which transition IDs to include
 */
export function buildTransitionCSS(rest: string, transitions: string[]): string {
  const parts: string[] = [];

  if (transitions.includes('slide')) {
    parts.push(`
      /* ── Clean Slide ── */
      .slide-in {
        animation: slideIn 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .slide-out {
        animation: slideOut 500ms cubic-bezier(0.55, 0, 1, 0.45) forwards;
      }
      @keyframes slideIn {
        0%   { transform: ${rest} translateX(-200px) scale(0.88) rotateY(28deg); opacity: 0; filter: drop-shadow(0 0 0 transparent); }
        100% { transform: ${rest} translateX(0) scale(1); opacity: 1; }
      }
      @keyframes slideOut {
        0%   { transform: ${rest} translateX(0) scale(1); opacity: 1; }
        100% { transform: ${rest} translateX(160px) scale(0.92); opacity: 0; }
      }
    `);
  }

  if (transitions.includes('digital')) {
    parts.push(`
      /* ── Digital Flicker ── */
      .digital-in {
        animation: digitalIn 450ms steps(1) forwards;
      }
      .digital-out {
        animation: digitalOut 350ms steps(1) forwards;
      }
      @keyframes digitalIn {
        0%    { transform: ${rest} translateX(-30px); opacity: 0; }
        10%   { transform: ${rest} translateX(-24px); opacity: 0.85; }
        20%   { transform: ${rest} translateX(-18px);  opacity: 0.15; }
        35%   { transform: ${rest} translateX(-12px);  opacity: 0.9; }
        50%   { transform: ${rest} translateX(-6px);  opacity: 0.3; }
        70%   { transform: ${rest} translateX(-2px);  opacity: 0.85; }
        85%   { transform: ${rest} translateX(0);     opacity: 0.88; }
        100%  { transform: ${rest} translateX(0);     opacity: 1; }
      }
      @keyframes digitalOut {
        0%    { transform: ${rest} translateX(0);    opacity: 1; }
        15%   { transform: ${rest} translateX(6px);  opacity: 0.85; }
        30%   { transform: ${rest} translateX(12px);  opacity: 0.15; }
        50%   { transform: ${rest} translateX(18px);  opacity: 0.9; }
        70%   { transform: ${rest} translateX(24px); opacity: 0.3; }
        85%   { transform: ${rest} translateX(28px); opacity: 0.1; }
        100%  { transform: ${rest} translateX(30px); opacity: 0; }
      }
      .digital-in::after, .digital-out::after {
        content: '';
        position: absolute;
        inset: -8px;
        background: radial-gradient(ellipse at center, rgba(0,212,255,0.15) 0%, transparent 70%);
        border-radius: inherit;
        pointer-events: none;
        animation: cyanFlash 300ms ease-out;
      }
      @keyframes cyanFlash {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
    `);
  }

  if (transitions.includes('materialize')) {
    parts.push(`
      /* ── Materialize ── */
      .materialize-in {
        animation: materializeIn 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .materialize-out {
        animation: materializeOut 450ms cubic-bezier(0.55, 0, 1, 0.45) forwards;
      }
      @keyframes materializeIn {
        0%   { transform: ${rest} scaleY(0.01) scaleX(0.8); opacity: 0.6; }
        60%  { transform: ${rest} scaleY(1.02) scaleX(1); opacity: 1; }
        100% { transform: ${rest} scaleY(1) scaleX(1); opacity: 1; }
      }
      @keyframes materializeOut {
        0%   { transform: ${rest} scaleY(1) scaleX(1); opacity: 1; }
        100% { transform: ${rest} scaleY(0.01) scaleX(0.8); opacity: 0.6; }
      }
      .materialize-in::before, .materialize-out::before {
        content: '';
        position: absolute;
        left: 0; right: 0;
        top: 50%; height: 4px;
        background: #00d4ff;
        box-shadow: 0 0 16px #00d4ff, 0 0 40px rgba(0,212,255,0.4);
        transform: translateY(-50%);
        pointer-events: none;
        animation: matLine 600ms ease-out forwards;
      }
      @keyframes matLine {
        0%   { opacity: 1; left: 40%; right: 40%; }
        40%  { opacity: 1; left: 0; right: 0; }
        100% { opacity: 0; left: 0; right: 0; }
      }
    `);
  }

  if (transitions.includes('scale-pop')) {
    parts.push(`
      /* ── Scale Pop ── */
      .scale-pop-in {
        animation: scalePopIn 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .scale-pop-out {
        animation: scalePopOut 350ms cubic-bezier(0.55, 0, 1, 0.45) forwards;
      }
      @keyframes scalePopIn {
        0%   { transform: ${rest} scale(0.55); opacity: 0; }
        70%  { transform: ${rest} scale(1.04); opacity: 1; }
        100% { transform: ${rest} scale(1); opacity: 1; }
      }
      @keyframes scalePopOut {
        0%   { transform: ${rest} scale(1); opacity: 1; }
        100% { transform: ${rest} scale(0.82); opacity: 0; }
      }
      .scale-pop-in::after {
        content: '';
        position: absolute;
        inset: 20px;
        border: 2px solid rgba(0,212,255,0.3);
        border-radius: inherit;
        pointer-events: none;
        animation: shockwave 500ms ease-out forwards;
      }
      @keyframes shockwave {
        0%   { inset: 20px; opacity: 0.6; border-color: rgba(0,212,255,0.4); }
        100% { inset: -28px; opacity: 0; border-color: rgba(0,212,255,0); }
      }
    `);
  }

  if (transitions.includes('blur')) {
    parts.push(`
      /* ── Blur Resolve ── */
      .blur-in {
        animation: blurIn 700ms ease-out forwards;
      }
      .blur-out {
        animation: blurOut 500ms ease-in forwards;
      }
      @keyframes blurIn {
        0%   { transform: ${rest}; filter: blur(20px) brightness(1.3); opacity: 0; }
        30%  { filter: blur(12px) brightness(1.2); opacity: 0.4; }
        60%  { filter: blur(4px) brightness(1.05); opacity: 0.8; }
        80%  { filter: blur(1px) brightness(1.01); opacity: 0.95; }
        100% { transform: ${rest}; filter: blur(0px) brightness(1); opacity: 1; }
      }
      @keyframes blurOut {
        0%   { transform: ${rest}; filter: blur(0px) brightness(1); opacity: 1; }
        30%  { filter: blur(6px) brightness(1.05); opacity: 0.7; }
        60%  { filter: blur(14px) brightness(1.15); opacity: 0.4; }
        100% { transform: ${rest}; filter: blur(22px) brightness(1.3); opacity: 0; }
      }
    `);
  }

  if (transitions.includes('edge-wipe')) {
    parts.push(`
      /* ── Edge Wipe ── */
      .edge-wipe-in {
        animation: edgeWipeIn 700ms ease-out forwards;
        clip-path: inset(0 100% 0 0);
      }
      .edge-wipe-out {
        animation: edgeWipeOut 600ms ease-in forwards;
      }
      @keyframes edgeWipeIn {
        0%   { clip-path: inset(0 100% 0 0); }
        100% { clip-path: inset(0 0% 0 0); }
      }
      @keyframes edgeWipeOut {
        0%   { clip-path: inset(0 0 0 0%); }
        100% { clip-path: inset(0 0 0 100%); }
      }
      .edge-wipe-in::before, .edge-wipe-out::before {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        width: 4px;
        background: #00d4ff;
        box-shadow: 0 0 16px #00d4ff, 0 0 40px rgba(0,212,255,0.4);
        pointer-events: none;
        z-index: 10;
      }
      .edge-wipe-in::before {
        animation: scanLineIn 700ms ease-out forwards;
      }
      .edge-wipe-out::before {
        animation: scanLineOut 600ms ease-in forwards;
      }
      @keyframes scanLineIn {
        0%   { left: 0; opacity: 1; }
        90%  { left: 98%; opacity: 0.8; }
        100% { left: 100%; opacity: 0; }
      }
      @keyframes scanLineOut {
        0%   { left: 0; opacity: 1; }
        90%  { left: 98%; opacity: 0.8; }
        100% { left: 100%; opacity: 0; }
      }
    `);
  }

  return parts.join('\n');
}
