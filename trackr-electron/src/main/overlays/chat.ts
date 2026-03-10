/**
 * TRACKR Overlay — Lightweight Twitch IRC Listener
 *
 * Anonymous read-only IRC connection to Twitch chat.
 * Listens for a configurable command (e.g., "!trackid") and emits
 * a show_card SSE event when detected (with cooldown).
 *
 * No OAuth needed — anonymous IRC is read-only.
 */

import WebSocket from 'ws';
import { emitShowCard } from './sse';

let _ws: WebSocket | null = null;
let _channel = '';
let _commandName = '!trackid';
let _cooldownMs = 30000;
let _lastTrigger = 0;
let _enabled = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

function connect(): void {
  if (_ws) {
    try { _ws.close(); } catch (_) {}
    _ws = null;
  }
  if (!_enabled || !_channel) return;

  const ws = new WebSocket(IRC_URL);

  ws.on('open', () => {
    console.log(`[chat] Connected to Twitch IRC, joining #${_channel}`);
    ws.send('CAP REQ :twitch.tv/tags');
    ws.send('PASS SCHMOOPIIE');        // anonymous auth
    ws.send('NICK justinfan12345');    // anonymous username
    ws.send(`JOIN #${_channel}`);
  });

  ws.on('message', (raw: Buffer) => {
    const msg = raw.toString('utf8');

    // Respond to PING to stay alive
    if (msg.startsWith('PING')) {
      ws.send('PONG :tmi.twitch.tv');
      return;
    }

    // Parse PRIVMSG lines
    const lines = msg.split('\r\n').filter(Boolean);
    for (const line of lines) {
      if (!line.includes('PRIVMSG')) continue;

      // Extract username and message text
      const privmsgMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (!privmsgMatch) continue;

      const [, username, text] = privmsgMatch;
      const trimmed = text.trim().toLowerCase();

      if (trimmed === _commandName.toLowerCase() || trimmed.startsWith(_commandName.toLowerCase() + ' ')) {
        const now = Date.now();
        if (now - _lastTrigger < _cooldownMs) {
          console.log(`[chat] !trackid from ${username} — cooldown active (${Math.ceil((_cooldownMs - (now - _lastTrigger)) / 1000)}s remaining)`);
          return;
        }
        _lastTrigger = now;
        console.log(`[chat] !trackid triggered by ${username}`);
        emitShowCard({ trigger: 'chat_command', user: username });
      }
    }
  });

  ws.on('close', () => {
    console.log('[chat] Disconnected from Twitch IRC');
    _ws = null;
    if (_enabled && _channel) {
      _reconnectTimer = setTimeout(connect, 5000);
    }
  });

  ws.on('error', (err) => {
    console.warn('[chat] WebSocket error:', err.message);
    // close event will handle reconnect
  });

  _ws = ws;
}

export function startChatListener(channel: string, commandName: string, cooldownSeconds: number): void {
  _channel = channel.replace(/^#/, '').toLowerCase();
  _commandName = commandName || '!trackid';
  _cooldownMs = (cooldownSeconds || 30) * 1000;
  _enabled = true;

  if (!_channel) {
    console.log('[chat] No Twitch channel configured — chat listener disabled');
    return;
  }

  connect();
}

export function stopChatListener(): void {
  _enabled = false;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    try { _ws.close(); } catch (_) {}
    _ws = null;
  }
  console.log('[chat] Stopped');
}

export function updateChatConfig(channel: string, commandName: string, cooldownSeconds: number): void {
  const newChannel = channel.replace(/^#/, '').toLowerCase();
  const needsReconnect = newChannel !== _channel;

  _commandName = commandName || '!trackid';
  _cooldownMs = (cooldownSeconds || 30) * 1000;

  if (needsReconnect) {
    _channel = newChannel;
    if (_enabled) connect();
  }
}

export function isChatConnected(): boolean {
  return _ws !== null && _ws.readyState === WebSocket.OPEN;
}
