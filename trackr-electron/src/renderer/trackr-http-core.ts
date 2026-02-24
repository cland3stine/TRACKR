type AnyObj = Record<string, unknown>;

export type CoreResult = {
  ok: boolean;
  data?: AnyObj;
  error?: { code: string; message: string };
};

type EventCallback = (event: AnyObj) => void;

const EM_DASH = "\u2014";
const DEFAULT_OUTPUT_ROOT = "%USERPROFILE%\\TRACKR";

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:transparent;font-family:Segoe UI,sans-serif;">
  <div id="current">\u2014</div>
  <div id="previous">\u2014</div>
</body>
</html>`;

const DEFAULT_CONFIG: AnyObj = {
  output_root: DEFAULT_OUTPUT_ROOT,
  migration_prompt_seen: true,
  delay_seconds: 3,
  timestamps_enabled: true,
  api_enabled: true,
  api_access_mode: "lan",
  share_play_count_via_api: false,
  api_port: 8755,
};

type JsonResponse = {
  ok: boolean;
  status: number;
  data: AnyObj;
  message?: string;
};

function nowUtcIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function formatElapsedMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ok(data: AnyObj = {}): CoreResult {
  return { ok: true, data };
}

function err(code: string, message: string): CoreResult {
  return { ok: false, error: { code, message } };
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function asObject(value: unknown): AnyObj {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as AnyObj;
}

function healthOk(response: JsonResponse): boolean {
  return response.ok && response.data.ok === true;
}

async function fetchJson(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  timeoutMs = 1500,
): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    const parsed = text ? asObject(JSON.parse(text)) : {};
    return {
      ok: response.ok,
      status: response.status,
      data: parsed,
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "network_error";
    return { ok: false, status: 0, data: {}, message };
  } finally {
    clearTimeout(timer);
  }
}

function responseToCoreResult(response: JsonResponse, unwrapEnvelope = false): CoreResult {
  const payload = asObject(response.data);

  if (response.ok) {
    if (unwrapEnvelope && typeof payload.ok === "boolean") {
      if (!payload.ok) {
        const backendError = asObject(payload.error);
        return err(
          asString(backendError.code, "request_failed"),
          asString(backendError.message, "request failed"),
        );
      }
      return ok(asObject(payload.data));
    }
    return ok(payload);
  }

  const backendError = asObject(payload.error);
  if (backendError.code || backendError.message) {
    return err(
      asString(backendError.code, response.status === 0 ? "backend_offline" : "request_failed"),
      asString(backendError.message, response.message || "request failed"),
    );
  }

  return err(
    response.status === 0 ? "backend_offline" : "request_failed",
    response.message || "request failed",
  );
}

class TrackrHttpCore {
  private readonly apiBaseUrl: string;
  private readonly subscribers = new Map<number, EventCallback>();
  private nextSubscriptionId = 1;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private config: AnyObj = { ...DEFAULT_CONFIG };
  private template = DEFAULT_TEMPLATE;

  private backendConnected = false;
  private backendRunning = false;
  private sessionFileName: string | null = null;
  private deviceCount = 0;
  private currentLine = EM_DASH;
  private previousLine = EM_DASH;
  private lastPublishedLine: string | null = null;
  private appState = "stopped";
  private statusText = "Backend Offline";
  private apiBindHost = "127.0.0.1";
  private apiPort = 8755;
  private apiEnabled = true;
  private apiAccessMode = "localhost";
  private sharePlayCount = false;
  private outputRoot = DEFAULT_OUTPUT_ROOT;
  private migrationPromptSeen = false;
  private runningTracklist: Array<{ time: string; line: string; play_count: number }> = [];
  private playCount = 0;
  private lastAppendedTrackLine: string | null = null;
  private sessionStartedAtMs: number | null = null;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async start(config: AnyObj): Promise<CoreResult> {
    this.config = { ...this.config, ...asObject(config) };
    await this.set_config(this.config);

    const response = await fetchJson(this.apiBaseUrl, "/control/start", {
      method: "POST",
      body: JSON.stringify(this.config),
    });
    const result = responseToCoreResult(response, true);
    await this.refreshBackendState();
    return result.ok ? ok({ status: this.snapshotStatus() }) : result;
  }

  async stop(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/control/stop", { method: "POST" });
    const result = responseToCoreResult(response, true);
    await this.refreshBackendState();
    return result.ok ? ok({ status: this.snapshotStatus() }) : result;
  }

  async refresh(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/control/refresh", { method: "POST" });
    const result = responseToCoreResult(response, true);
    if (result.ok) {
      // Refresh starts a new session, so reset local running-session UI state.
      this.runningTracklist = [];
      this.lastPublishedLine = null;
      this.lastAppendedTrackLine = null;
      this.playCount = 0;
      this.sessionStartedAtMs = Date.now();
    }
    await this.refreshBackendState();
    return result.ok ? ok({ status: this.snapshotStatus() }) : result;
  }

  async getStatus(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/status", { method: "GET" });
    if (!response.ok) {
      this.backendConnected = false;
      this.backendRunning = false;
      this.appState = "stopped";
      this.statusText = "Backend Offline";
      return ok(this.snapshotStatus());
    }

    this.applyStatus(asObject(response.data));
    this.backendConnected = true;
    return ok(this.snapshotStatus());
  }

  async get_status(): Promise<CoreResult> {
    return this.getStatus();
  }

  subscribe_events(callback: EventCallback): CoreResult {
    const subscriptionId = this.nextSubscriptionId++;
    this.subscribers.set(subscriptionId, callback);
    this.ensurePolling();
    const unsubscribe = () => {
      this.subscribers.delete(subscriptionId);
      if (this.subscribers.size === 0 && this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    };
    return ok({ subscription_id: subscriptionId, unsubscribe });
  }

  get_running_tracklist(): CoreResult {
    return ok({ items: this.runningTracklist.map((item) => ({ ...item })) });
  }

  async get_config(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/config", { method: "GET" });
    const result = responseToCoreResult(response, false);
    if (result.ok && result.data) this.config = { ...this.config, ...result.data };
    return result;
  }

  async set_config(config: AnyObj): Promise<CoreResult> {
    this.config = { ...this.config, ...asObject(config) };
    const response = await fetchJson(this.apiBaseUrl, "/config", {
      method: "POST",
      body: JSON.stringify(this.config),
    });
    const result = responseToCoreResult(response, false);
    if (result.ok && result.data) this.config = { ...this.config, ...result.data };
    return result;
  }

  async get_template(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/template", { method: "GET" });
    const result = responseToCoreResult(response, false);
    if (result.ok) {
      this.template = asString(result.data?.template, this.template);
      return ok({ template: this.template });
    }
    return result;
  }

  async set_template(templateHtml: string): Promise<CoreResult> {
    const next = asString(templateHtml);
    if (!next) return err("invalid_template", "template_html must be non-empty");

    const response = await fetchJson(this.apiBaseUrl, "/template", {
      method: "POST",
      body: JSON.stringify({ template: next }),
    });
    const result = responseToCoreResult(response, false);
    if (result.ok) {
      this.template = asString(result.data?.template, next);
      return ok({ template: this.template });
    }
    return result;
  }

  async reset_template(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/template/reset", { method: "POST" });
    const result = responseToCoreResult(response, false);
    if (result.ok) {
      this.template = asString(result.data?.template, DEFAULT_TEMPLATE);
      return ok({ template: this.template });
    }
    return result;
  }

  async resolveOutputRoot(config?: AnyObj): Promise<CoreResult> {
    if (config && typeof config === "object") {
      this.config = { ...this.config, ...asObject(config) };
    }
    const response = await fetchJson(this.apiBaseUrl, "/output-root/resolve", { method: "GET" });
    const result = responseToCoreResult(response, false);
    if (result.ok && result.data?.chosen_output_root) {
      this.outputRoot = asString(result.data.chosen_output_root, this.outputRoot);
      this.config = { ...this.config, output_root: this.outputRoot };
    }
    return result;
  }

  async resolve_output_root(config?: AnyObj): Promise<CoreResult> {
    return this.resolveOutputRoot(config);
  }

  async chooseOutputRoot(choice: string): Promise<CoreResult> {
    const normalized = asString(choice).toLowerCase();
    if (normalized !== "legacy" && normalized !== "trackr") {
      return err("invalid_choice", "choice must be 'legacy' or 'trackr'");
    }

    const response = await fetchJson(this.apiBaseUrl, "/output-root/choose", {
      method: "POST",
      body: JSON.stringify({ choice: normalized }),
    });
    const result = responseToCoreResult(response, false);
    if (result.ok) {
      const chosen = asString(result.data?.output_root, "");
      if (chosen) {
        this.outputRoot = chosen;
        this.config = { ...this.config, output_root: chosen, migration_prompt_seen: true };
      }
      await this.refreshBackendState();
    }
    return result;
  }

  async set_output_root_choice(choice: string): Promise<CoreResult> {
    return this.chooseOutputRoot(choice);
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.refreshBackendState();
    }, 2000);
  }

  private emit(eventType: string, payload: AnyObj): void {
    const event: AnyObj = {
      event_type: eventType,
      timestamp_utc: nowUtcIso(),
      payload,
    };
    for (const callback of this.subscribers.values()) {
      try {
        callback(event);
      } catch {
        // Keep poll loop stable.
      }
    }
  }

  private applyStatus(status: AnyObj): void {
    const previousState = this.appState;
    const previousSessionFileName = this.sessionFileName;
    this.appState = asString(status.app_state, this.appState || "stopped");
    this.statusText = asString(status.status_text, this.statusText);
    this.deviceCount = asNumber(status.device_count, this.deviceCount);
    const reportedLastPublished = asString(status.last_published_line, "");
    if (reportedLastPublished) {
      this.lastPublishedLine = reportedLastPublished;
    }
    this.sessionFileName = asString(status.session_file_name, "") || null;
    this.apiBindHost = asString(status.api_effective_bind_host, this.apiBindHost);
    this.apiPort = asNumber(status.api_port, this.apiPort);
    this.apiEnabled = asBool(status.api_enabled, this.apiEnabled);
    this.apiAccessMode = asString(status.api_access_mode, this.apiAccessMode);
    this.sharePlayCount = asBool(status.share_play_count_via_api, this.sharePlayCount);
    this.outputRoot = asString(status.output_root, this.outputRoot);
    this.migrationPromptSeen = asBool(status.migration_prompt_seen, this.migrationPromptSeen);
    this.backendRunning = this.appState === "running";
    const sessionChanged =
      !!previousSessionFileName &&
      !!this.sessionFileName &&
      previousSessionFileName !== this.sessionFileName;
    if (sessionChanged) {
      this.runningTracklist = [];
      this.lastAppendedTrackLine = null;
      this.sessionStartedAtMs = Date.now();
    }
    if (this.appState === "stopped" || this.appState === "error") {
      this.runningTracklist = [];
      this.lastPublishedLine = null;
      this.lastAppendedTrackLine = null;
      this.sessionStartedAtMs = null;
    }
    if (this.appState === "running" && this.sessionStartedAtMs === null) {
      this.sessionStartedAtMs = Date.now();
    }

    if (previousState !== this.appState) {
      this.emit("state_changed", { app_state: this.appState });
    }
  }

  private async refreshBackendState(): Promise<void> {
    const healthResponse = await fetchJson(this.apiBaseUrl, "/health", { method: "GET" });
    this.backendConnected = healthOk(healthResponse);
    if (!this.backendConnected) {
      this.backendRunning = false;
      this.appState = "stopped";
      this.statusText = "Backend Offline";
      return;
    }

    const statusResponse = await fetchJson(this.apiBaseUrl, "/status", { method: "GET" });
    if (statusResponse.ok) {
      this.applyStatus(asObject(statusResponse.data));
    }

    const nowPlayingResponse = await fetchJson(this.apiBaseUrl, "/trackr", { method: "GET" });
    if (nowPlayingResponse.ok) {
      const payload = asObject(nowPlayingResponse.data);
      this.currentLine = asString(payload.current, EM_DASH);
      this.previousLine = asString(payload.previous, EM_DASH);
      this.sessionFileName = asString(payload.session_file, "") || this.sessionFileName;
      this.deviceCount = asNumber(payload.device_count, this.deviceCount);
      this.playCount = asNumber(payload.play_count, this.playCount);
      this.appendTrackIfNew(this.currentLine);
    }
  }

  private appendTrackIfNew(line: string): void {
    const cleaned = asString(line);
    if (!cleaned || cleaned === EM_DASH) return;
    if (!this.lastPublishedLine || cleaned !== this.lastPublishedLine) return;
    if (cleaned === this.lastAppendedTrackLine) return;
    this.lastAppendedTrackLine = cleaned;
    if (this.sessionStartedAtMs === null) {
      this.sessionStartedAtMs = Date.now();
    }
    const elapsedSeconds =
      this.runningTracklist.length === 0
        ? 0
        : Math.max(0, (Date.now() - this.sessionStartedAtMs) / 1000);
    const nextPlayCount =
      this.playCount > 0
        ? this.playCount
        : (this.runningTracklist[this.runningTracklist.length - 1]?.play_count || 0) + 1;
    const item = { time: formatElapsedMmSs(elapsedSeconds), line: cleaned, play_count: nextPlayCount };
    this.runningTracklist.push(item);
    this.emit("tracklist_appended", item);
    this.emit("publish_succeeded", { line: cleaned, play_count: nextPlayCount });
  }

  private snapshotStatus(): AnyObj {
    return {
      app_state: this.appState,
      status_text: this.backendConnected ? this.statusText : "Backend Offline",
      device_count: this.deviceCount,
      last_published_line: this.lastPublishedLine,
      session_file_name: this.sessionFileName,
      api_effective_bind_host: this.apiBindHost,
      api_port: this.apiPort,
      api_enabled: this.apiEnabled,
      api_access_mode: this.apiAccessMode,
      share_play_count_via_api: this.sharePlayCount,
      output_root: this.outputRoot,
      migration_prompt_seen: this.migrationPromptSeen,
      backend_connected: this.backendConnected,
      current: this.currentLine,
      previous: this.previousLine,
      is_running: this.backendRunning,
    };
  }
}

function readApiBaseUrl(): string {
  const fromStorage = localStorage.getItem("trackr.apiBaseUrl");
  const fromEnv = (import.meta.env.VITE_TRACKR_API_BASE as string | undefined) || "";
  // Dev mode: Vite proxy forwards /api/* to backend, so use relative path.
  // Production: no proxy, must use the actual backend URL.
  const defaultUrl = import.meta.env.DEV ? "/api" : "http://127.0.0.1:8755";
  const raw = asString(fromStorage, asString(fromEnv, defaultUrl)).replace(/\/+$/, "");
  if (import.meta.env.DEV && (raw === "http://127.0.0.1:8755" || raw === "http://localhost:8755")) {
    return "/api";
  }
  return raw;
}

export function installTrackrHttpBridge(): TrackrHttpCore {
  const bridge = new TrackrHttpCore(readApiBaseUrl());
  const globalWindow = window as unknown as { trackrCore?: TrackrHttpCore };
  globalWindow.trackrCore = bridge;
  return bridge;
}

export async function pollBackendHealthOnce(): Promise<boolean> {
  const response = await fetchJson(readApiBaseUrl(), "/health", { method: "GET" }, 1200);
  return healthOk(response);
}
