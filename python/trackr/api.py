from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlparse
from typing import Any, Callable

RouteHandler = Callable[[dict[str, Any] | None], tuple[int, dict[str, Any]]]


class _TrackrHttpServer(ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        route_handlers: dict[tuple[str, str], RouteHandler],
    ) -> None:
        self.route_handlers = dict(route_handlers)
        super().__init__(server_address, _TrackrApiHandler)


class _TrackrApiHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET", None)

    def do_POST(self) -> None:  # noqa: N802
        body = self._read_json_body()
        if isinstance(body, tuple):
            status, payload = body
            self._send_json(status, payload)
            return
        self._dispatch("POST", body)

    def _dispatch(self, method: str, body: dict[str, Any] | None) -> None:
        path = urlparse(self.path).path
        key = (method.upper(), path)
        handler = self.server.route_handlers.get(key)  # type: ignore[attr-defined]
        if handler is None:
            self._send_json(404, {"ok": False, "error": {"code": "not_found", "message": "route not found"}})
            return
        try:
            status, payload = handler(body)
        except Exception as exc:
            self._send_json(
                500,
                {"ok": False, "error": {"code": "internal_error", "message": str(exc)}},
            )
            return
        self._send_json(status, payload)

    def log_message(self, _format: str, *_args: Any) -> None:
        # Keep tests and normal runtime quiet.
        return

    def _read_json_body(self) -> dict[str, Any] | tuple[int, dict[str, Any]]:
        length_raw = self.headers.get("Content-Length")
        if not length_raw:
            return {}
        try:
            length = int(length_raw)
        except ValueError:
            return 400, {
                "ok": False,
                "error": {"code": "invalid_request", "message": "invalid content length"},
            }
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except Exception:
            return 400, {
                "ok": False,
                "error": {"code": "invalid_json", "message": "request body must be valid JSON"},
            }
        if not isinstance(parsed, dict):
            return 400, {
                "ok": False,
                "error": {"code": "invalid_request", "message": "request body must be a JSON object"},
            }
        return dict(parsed)

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
        route_handlers: dict[tuple[str, str], RouteHandler],
    ) -> None:
        self._bind_host = bind_host
        self._port = int(port)
        self._route_handlers = dict(route_handlers)
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
            route_handlers=self._route_handlers,
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
