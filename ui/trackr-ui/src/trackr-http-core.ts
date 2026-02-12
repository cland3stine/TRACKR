type AnyObj = Record<string, unknown>;

export type CoreResult = {
  ok: boolean;
  data?: AnyObj;
  error?: { code: string; message: string };
};

type EventCallback = (event: AnyObj) => void;

const EM_DASH = "—";
const DEFAULT_OUTPUT_ROOT = "%USERPROFILE%\\TRACKR";
const LEGACY_OUTPUT_ROOT = "%USERPROFILE%\\NowPlayingLite";
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:transparent;font-family:Segoe UI,sans-serif;">
  <div id="current">—</div>
  <div id="previous">—</div>
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

function nowUtcIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
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

async function fetchJson(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  timeoutMs = 1500,
): Promise<{ ok: boolean; status: number; data: AnyObj; message?: string }> {
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
    const parsed = text ? (JSON.parse(text) as AnyObj) : {};
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

class TrackrHttpCore {
  private readonly apiBaseUrl: string;
  private readonly subscribers = new Map<number, EventCallback>();
  private nextSubscriptionId = 1;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private config: AnyObj = { ...DEFAULT_CONFIG };
  private template = DEFAULT_TEMPLATE;

  private backendConnected = false;
  private backendRunning = false;
  private mockRunning = false;
  private sessionFileName: string | null = null;
  private deviceCount = 0;
  private currentLine = EM_DASH;
  private lastPublishedLine: string | null = null;
  private runningTracklist: Array<{ time: string; line: string; play_count: number }> = [];
  private playCount = 0;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async start(config: AnyObj): Promise<CoreResult> {
    this.config = { ...this.config, ...config };
    await this.set_config(this.config);

    const response = await fetchJson(this.apiBaseUrl, "/control/start", {
      method: "POST",
      body: JSON.stringify(this.config),
    });
    if (response.ok) {
      this.mockRunning = false;
      await this.refreshBackendState();
      return ok({ status: this.snapshotStatus() });
    }

    // TODO: remove fallback once /control/start is implemented server-side.
    this.mockRunning = true;
    this.emit("state_changed", { app_state: "running", mocked: true });
    return ok({ mocked: true, status: this.snapshotStatus() });
  }

  async stop(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/control/stop", {
      method: "POST",
    });
    if (response.ok) {
      this.mockRunning = false;
      await this.refreshBackendState();
      return ok({ status: this.snapshotStatus() });
    }

    // TODO: remove fallback once /control/stop is implemented server-side.
    this.mockRunning = false;
    this.emit("state_changed", { app_state: "stopped", mocked: true });
    return ok({ mocked: true, status: this.snapshotStatus() });
  }

  async refresh(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/control/refresh", {
      method: "POST",
    });
    if (response.ok) {
      this.runningTracklist = [];
      this.lastPublishedLine = null;
      await this.refreshBackendState();
      return ok({ status: this.snapshotStatus() });
    }

    // TODO: remove fallback once /control/refresh is implemented server-side.
    this.runningTracklist = [];
    this.lastPublishedLine = null;
    this.emit("status_message", { status_text: "refresh mocked (endpoint missing)" });
    return ok({ mocked: true, status: this.snapshotStatus() });
  }

  async get_status(): Promise<CoreResult> {
    await this.refreshBackendState();
    return ok(this.snapshotStatus());
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
    if (response.ok) {
      this.config = { ...this.config, ...response.data };
      return ok({ ...this.config });
    }

    // TODO: remove fallback once /config is implemented server-side.
    return ok({ ...this.config, mocked: true });
  }

  async set_config(config: AnyObj): Promise<CoreResult> {
    this.config = { ...this.config, ...config };
    const response = await fetchJson(this.apiBaseUrl, "/config", {
      method: "POST",
      body: JSON.stringify(this.config),
    });
    if (response.ok) {
      this.config = { ...this.config, ...response.data };
      return ok({ ...this.config });
    }

    // TODO: remove fallback once /config is implemented server-side.
    return ok({ ...this.config, mocked: true });
  }

  async get_template(): Promise<CoreResult> {
    const response = await fetchJson(this.apiBaseUrl, "/template", { method: "GET" });
    if (response.ok) {
      const value = asString((response.data as AnyObj).template, this.template);
      this.template = value || this.template;
      return ok({ template: this.template });
    }

    // TODO: remove fallback once /template is implemented server-side.
    return ok({ template: this.template, mocked: true });
  }

  async set_template(templateHtml: string): Promise<CoreResult> {
    const next = asString(templateHtml);
    if (!next) return err("invalid_template", "template_html must be non-empty");
    this.template = next;
    const response = await fetchJson(this.apiBaseUrl, "/template", {
      method: "POST",
      body: JSON.stringify({ template: next }),
    });
    if (response.ok) return ok({ template: next });

    // TODO: remove fallback once /template is implemented server-side.
    return ok({ template: next, mocked: true });
  }

  async reset_template(): Promise<CoreResult> {
    return this.set_template(DEFAULT_TEMPLATE);
  }

  async resolve_output_root(config?: AnyObj): Promise<CoreResult> {
    if (config && typeof config === "object") {
      this.config = { ...this.config, ...config };
    }
    const outputRoot = asString(this.config.output_root, DEFAULT_OUTPUT_ROOT);
    return ok({
      state: "resolved",
      needs_user_choice: false,
      output_root: outputRoot,
      legacy_output_root: LEGACY_OUTPUT_ROOT,
      trackr_output_root: DEFAULT_OUTPUT_ROOT,
      migration_prompt_seen: true,
    });
  }

  async set_output_root_choice(choice: string): Promise<CoreResult> {
    const nextRoot = choice === "legacy" ? LEGACY_OUTPUT_ROOT : DEFAULT_OUTPUT_ROOT;
    this.config = {
      ...this.config,
      output_root: nextRoot,
      migration_prompt_seen: true,
    };
    await this.set_config(this.config);
    return ok({
      state: "resolved",
      needs_user_choice: false,
      output_root: nextRoot,
      legacy_output_root: LEGACY_OUTPUT_ROOT,
      trackr_output_root: DEFAULT_OUTPUT_ROOT,
      migration_prompt_seen: true,
      status: this.snapshotStatus(),
    });
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
        // Swallow subscriber errors to keep UI polling stable.
      }
    }
  }

  private async refreshBackendState(): Promise<void> {
    const previousAppState = asString(this.snapshotStatus().app_state, "stopped");
    const healthResponse = await fetchJson(this.apiBaseUrl, "/health", { method: "GET" });
    this.backendConnected = healthResponse.ok;
    if (healthResponse.ok) {
      this.backendRunning = asBool((healthResponse.data as AnyObj).is_running, false);
    }

    const nowPlayingResponse = await fetchJson(this.apiBaseUrl, "/nowplaying", { method: "GET" });
    if (nowPlayingResponse.ok) {
      const payload = nowPlayingResponse.data as AnyObj;
      this.currentLine = asString(payload.current, EM_DASH);
      this.sessionFileName = asString(payload.session_file, "") || null;
      this.deviceCount = asNumber(payload.device_count, 0);
      this.playCount = asNumber(payload.play_count, this.playCount);
      this.appendTrackIfNew(this.currentLine);
    }

    const currentAppState = asString(this.snapshotStatus().app_state, "stopped");
    if (previousAppState !== currentAppState) {
      this.emit("state_changed", { app_state: currentAppState });
    }
  }

  private appendTrackIfNew(line: string): void {
    const cleaned = asString(line);
    if (!cleaned || cleaned === EM_DASH) return;
    if (cleaned === this.lastPublishedLine) return;

    this.lastPublishedLine = cleaned;
    const nextPlayCount =
      this.playCount > 0 ? this.playCount : (this.runningTracklist[this.runningTracklist.length - 1]?.play_count || 0) + 1;
    const item = { time: "", line: cleaned, play_count: nextPlayCount };
    this.runningTracklist.push(item);
    this.emit("tracklist_appended", item);
    this.emit("publish_succeeded", { line: cleaned, play_count: nextPlayCount });
  }

  private snapshotStatus(): AnyObj {
    const appState = this.backendRunning || this.mockRunning ? "running" : "stopped";
    return {
      app_state: appState,
      status_text: this.backendConnected ? "connected" : "backend disconnected",
      device_count: this.deviceCount,
      last_published_line: this.lastPublishedLine,
      session_file_name: this.sessionFileName,
      api_effective_bind_host: "127.0.0.1",
      api_port: asNumber(this.config.api_port, 8755),
      api_enabled: asBool(this.config.api_enabled, true),
      api_access_mode: asString(this.config.api_access_mode, "localhost"),
      share_play_count_via_api: asBool(this.config.share_play_count_via_api, false),
      output_root: asString(this.config.output_root, DEFAULT_OUTPUT_ROOT),
      migration_prompt_seen: true,
      backend_connected: this.backendConnected,
    };
  }
}

function readApiBaseUrl(): string {
  const fromStorage = localStorage.getItem("trackr.apiBaseUrl");
  const fromEnv = (import.meta.env.VITE_TRACKR_API_BASE as string | undefined) || "";
  const raw = asString(fromStorage, asString(fromEnv, "http://127.0.0.1:8755"));
  return raw.replace(/\/+$/, "");
}

export function installTrackrHttpBridge(): TrackrHttpCore {
  const bridge = new TrackrHttpCore(readApiBaseUrl());
  const globalWindow = window as unknown as { trackrCore?: TrackrHttpCore };
  globalWindow.trackrCore = bridge;
  return bridge;
}

export async function pollBackendHealthOnce(): Promise<boolean> {
  const response = await fetchJson(readApiBaseUrl(), "/health", { method: "GET" }, 1200);
  return response.ok && asBool((response.data as AnyObj).ok, true);
}
