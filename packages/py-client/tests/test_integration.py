from __future__ import annotations

import os
import subprocess
import time
import socket
from typing import Generator

import httpx
import pytest

from ollama_models import OllamaModelsClient


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _port_is_open(host: str, port: int) -> bool:
    """Return True if a TCP connection to host:port succeeds, False otherwise."""
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def _wait_for_port(host: str, port: int, timeout: float = 15.0) -> None:
    """Poll host:port until the port becomes reachable or timeout expires.

    Raises RuntimeError if the port does not open within `timeout` seconds.
    Used to synchronise test execution with the Node.js mock server startup.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _port_is_open(host, port):
            return
        time.sleep(0.2)
    raise RuntimeError(f"Port {port} on {host} did not open within {timeout}s")


# ─── Session fixture ─────────────────────────────────────────────────────────

CI_PORT = 8788  # Differs from wrangler dev (8787) to avoid port conflicts in local development.


@pytest.fixture(scope="session")
def mock_api_url() -> Generator[str, None, None]:
    """Start the Node.js mock server and yield its base URL."""
    if os.environ.get("SKIP_INTEGRATION"):
        pytest.skip("SKIP_INTEGRATION is set — skipping integration tests")

    repo_root = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
    script = os.path.join(repo_root, "api", "scripts", "ci-server.ts")

    proc = subprocess.Popen(
        ["pnpm", "exec", "tsx", script],
        env={**os.environ, "PORT": str(CI_PORT)},
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )

    try:
        # Wait for the server to signal readiness.
        _wait_for_port("127.0.0.1", CI_PORT)
        yield f"http://127.0.0.1:{CI_PORT}"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


# ─── Tests ───────────────────────────────────────────────────────────────────


def test_search_returns_search_result(mock_api_url: str) -> None:
    """Client parses a SearchResult from the live mock server."""
    result = OllamaModelsClient(mock_api_url).search("qwen3")
    assert result.keyword == "qwen3"
    assert len(result.pages) >= 1
    assert result.pages[0].http_url.startswith("https://ollama.com/")
    assert "/" in result.pages[0].model_id


def test_search_page_range_is_integer(mock_api_url: str) -> None:
    """page_range is an integer when a single page is requested."""
    result = OllamaModelsClient(mock_api_url).search("", page=1)
    assert isinstance(result.page_range, int)


def test_get_model_returns_model_tags(mock_api_url: str) -> None:
    """Client parses a ModelTags response from the live mock server."""
    result = OllamaModelsClient(mock_api_url).get_model("library/qwen3")
    assert result.id == "library/qwen3"
    assert len(result.tags) >= 1
    assert result.default_tag is not None


def test_get_model_raises_on_missing_name(mock_api_url: str) -> None:
    """Client raises HTTPStatusError when name is missing (400 from server)."""
    with pytest.raises(httpx.HTTPStatusError):
        # Pass an empty string; the server returns 400.
        OllamaModelsClient(mock_api_url).get_model("   ")


def test_health_returns_health_status(mock_api_url: str) -> None:
    """Client parses a HealthStatus with nested CheckResults."""
    status = OllamaModelsClient(mock_api_url).health()
    assert status.ok is True
    assert isinstance(status.timestamp, str)
    assert status.search.ok is True
    assert status.model.ok is True


async def test_search_async_returns_search_result(mock_api_url: str) -> None:
    """Async variant: client parses SearchResult from the live mock server."""
    result = await OllamaModelsClient(mock_api_url).search_async("qwen3")
    assert len(result.pages) >= 1


async def test_get_model_async_returns_model_tags(mock_api_url: str) -> None:
    """Async variant: client parses ModelTags from the live mock server."""
    result = await OllamaModelsClient(mock_api_url).get_model_async("library/qwen3")
    assert result.id == "library/qwen3"


async def test_health_async_returns_health_status(mock_api_url: str) -> None:
    """Async variant: client parses HealthStatus from the live mock server."""
    status = await OllamaModelsClient(mock_api_url).health_async()
    assert status.ok is True
    assert status.search.ok is True
