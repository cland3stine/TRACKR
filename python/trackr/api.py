from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any, Callable

JsonProvider = Callable[[], dict[str, Any]]


class _TrackrHttpServer(ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        nowplaying_provider: JsonProvider,
        health_provider: JsonProvider,
    ) -> None:
        self.nowplaying_provider = nowplaying_provider
        self.health_provider = health_provider
        super().__init__(server_address, _TrackrApiHandler)


class _TrackrApiHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            payload = self.server.health_provider()  # type: ignore[attr-defined]
            self._send_json(200, payload)
            return

        if self.path == "/nowplaying":
            payload = self.server.nowplaying_provider()  # type: ignore[attr-defined]
            self._send_json(200, payload)
            return

        self._send_json(404, {"error": "not_found"})

    def log_message(self, _format: str, *_args: Any) -> None:
        # Keep tests and normal runtime quiet.
        return

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class TrackrApiServer:
    def __init__(
        self,
        bind_host: str,
        port: int,
        nowplaying_provider: JsonProvider,
        health_provider: JsonProvider,
    ) -> None:
        self._bind_host = bind_host
        self._port = int(port)
        self._nowplaying_provider = nowplaying_provider
        self._health_provider = health_provider
        self._server: _TrackrHttpServer | None = None
        self._thread: Thread | None = None

    @property
    def bind_host(self) -> str:
        return self._bind_host

    @property
    def port(self) -> int:
        return self._port

    def start(self) -> None:
        if self._server is not None:
            return
        self._server = _TrackrHttpServer(
            (self._bind_host, self._port),
            nowplaying_provider=self._nowplaying_provider,
            health_provider=self._health_provider,
        )
        self._thread = Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        self._thread = None
        self._server = None
