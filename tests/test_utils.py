from __future__ import annotations

import shutil
import socket
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json


@contextmanager
def repo_temp_dir() -> Iterator[Path]:
    root = Path(__file__).resolve().parent / ".tmp"
    root.mkdir(parents=True, exist_ok=True)
    temp_dir = root / f"case-{uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=False)
    try:
        yield temp_dir
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def get_json(url: str) -> dict:
    with urlopen(url, timeout=2.0) as response:
        return json.loads(response.read().decode("utf-8"))


def request_json(
    url: str,
    method: str = "GET",
    payload: dict | None = None,
    timeout_seconds: float = 2.0,
) -> tuple[int, dict]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url=url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return int(response.status), parsed
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        parsed = json.loads(body) if body else {}
        return int(exc.code), parsed


def wait_get_json(url: str, timeout_seconds: float = 2.0) -> dict:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            return get_json(url)
        except URLError as exc:
            last_error = exc
            time.sleep(0.05)
    if last_error is not None:
        raise last_error
    raise RuntimeError("wait_get_json timed out")


def wait_until(
    predicate: Callable[[], bool],
    timeout_seconds: float = 2.0,
    interval_seconds: float = 0.02,
) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval_seconds)
    return bool(predicate())
