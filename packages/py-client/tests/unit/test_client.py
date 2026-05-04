from __future__ import annotations

import pytest
import httpx
from pytest_httpx import HTTPXMock

from ollama_models import OllamaModelsClient
from ollama_models.client import DEFAULT_BASE_URL

# ─── fixtures ─────────────────────────────────────────────────────────────────

MOCK_SEARCH = {
    "pages": [
        {"http_url": "https://ollama.com/library/qwen3", "model_id": "library/qwen3"},
        {
            "http_url": "https://ollama.com/library/mistral",
            "model_id": "library/mistral",
        },
    ],
    "page_range": 1,
    "keyword": "qwen3",
}

MOCK_MODEL = {
    "page_url": "https://ollama.com/library/qwen3",
    "id": "library/qwen3",
    "tags": ["qwen3:latest", "qwen3:4b"],
    "default_tag": "qwen3:latest",
}

MOCK_HEALTH = {
    "ok": True,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "checks": {
        "search": {"ok": True, "count": 20},
        "model": {"ok": True, "count": 15},
    },
}


# ─── DEFAULT_BASE_URL ─────────────────────────────────────────────────────────


def test_default_base_url_is_official_instance():
    """Verifies DEFAULT_BASE_URL points to the official production Workers endpoint."""
    assert DEFAULT_BASE_URL == "https://ollama-models-api.devcomfort.workers.dev"


def test_client_uses_default_base_url(httpx_mock: HTTPXMock):
    """Verifies the client targets DEFAULT_BASE_URL when instantiated with no arguments."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("qwen3")
    request = httpx_mock.get_requests()[0]
    assert DEFAULT_BASE_URL in str(request.url)


# ─── search() (sync) ──────────────────────────────────────────────────────────


def test_search_returns_search_result(httpx_mock: HTTPXMock):
    """Verifies that search() deserializes the API response into a SearchResult with correct fields."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = OllamaModelsClient().search("qwen3", page=1)
    assert result.keyword == "qwen3"
    assert result.page_range == 1
    assert len(result.pages) == 2
    assert result.pages[0].http_url == "https://ollama.com/library/qwen3"
    assert result.pages[0].model_id == "library/qwen3"


def test_search_sends_keyword_and_page_params(httpx_mock: HTTPXMock):
    """Verifies that keyword and page are forwarded as q and page query parameters."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("mistral", page=2)
    request = httpx_mock.get_requests()[0]
    assert "q=mistral" in str(request.url)
    assert "page=2" in str(request.url)


def test_search_omits_q_param_when_keyword_is_empty(httpx_mock: HTTPXMock):
    """Verifies that an empty keyword does not append a q param to the URL."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("", page=1)
    request = httpx_mock.get_requests()[0]
    assert "q=" not in str(request.url)


def test_search_hits_search_endpoint(httpx_mock: HTTPXMock):
    """Verifies that search() calls the /search endpoint."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "/search" in str(request.url)


def test_search_raises_on_http_error(httpx_mock: HTTPXMock):
    """Verifies that a non-2xx response raises httpx.HTTPStatusError."""
    httpx_mock.add_response(status_code=500)
    with pytest.raises(httpx.HTTPStatusError):
        OllamaModelsClient().search("qwen3")


# ─── search_async() ───────────────────────────────────────────────────────────


async def test_search_async_returns_search_result(httpx_mock: HTTPXMock):
    """Async variant: verifies correct SearchResult deserialization."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = await OllamaModelsClient().search_async("qwen3", page=1)
    assert result.keyword == "qwen3"
    assert len(result.pages) == 2


async def test_search_async_sends_keyword_and_page_params(httpx_mock: HTTPXMock):
    """Async variant: verifies keyword and page are forwarded as query parameters."""
    httpx_mock.add_response(json=MOCK_SEARCH)
    await OllamaModelsClient().search_async("qwen3", page=3)
    request = httpx_mock.get_requests()[0]
    assert "q=qwen3" in str(request.url)
    assert "page=3" in str(request.url)


async def test_search_async_raises_on_http_error(httpx_mock: HTTPXMock):
    """Async variant: verifies HTTPStatusError is raised on non-2xx responses."""
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        await OllamaModelsClient().search_async("qwen3")


# ─── get_model() (sync) ───────────────────────────────────────────────────────


def test_get_model_returns_model_list(httpx_mock: HTTPXMock):
    """Verifies get_model() deserializes the API response into a ModelTags with correct fields."""
    httpx_mock.add_response(json=MOCK_MODEL)
    result = OllamaModelsClient().get_model("qwen3")
    assert result.page_url == "https://ollama.com/library/qwen3"
    assert result.id == "library/qwen3"
    assert result.tags == ["qwen3:latest", "qwen3:4b"]
    assert result.default_tag == "qwen3:latest"


def test_get_model_sends_name_param(httpx_mock: HTTPXMock):
    """Verifies the model name is forwarded as the name query parameter."""
    httpx_mock.add_response(json=MOCK_MODEL)
    OllamaModelsClient().get_model("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "name=qwen3" in str(request.url)


def test_get_model_hits_model_endpoint(httpx_mock: HTTPXMock):
    """Verifies that get_model() calls the /model endpoint."""
    httpx_mock.add_response(json=MOCK_MODEL)
    OllamaModelsClient().get_model("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "/model" in str(request.url)


def test_get_model_raises_on_http_error(httpx_mock: HTTPXMock):
    """Verifies that a non-2xx response raises httpx.HTTPStatusError."""
    httpx_mock.add_response(status_code=404)
    with pytest.raises(httpx.HTTPStatusError):
        OllamaModelsClient().get_model("nonexistent")


# ─── get_model_async() ────────────────────────────────────────────────────────


async def test_get_model_async_returns_model_list(httpx_mock: HTTPXMock):
    """Async variant: verifies correct ModelTags deserialization."""
    httpx_mock.add_response(json=MOCK_MODEL)
    result = await OllamaModelsClient().get_model_async("qwen3")
    assert result.page_url == "https://ollama.com/library/qwen3"
    assert result.tags == ["qwen3:latest", "qwen3:4b"]


async def test_get_model_async_sends_name_param(httpx_mock: HTTPXMock):
    """Async variant: verifies the model name is forwarded as the name query parameter."""
    httpx_mock.add_response(json=MOCK_MODEL)
    await OllamaModelsClient().get_model_async("mistral")
    request = httpx_mock.get_requests()[0]
    assert "name=mistral" in str(request.url)


async def test_get_model_async_raises_on_http_error(httpx_mock: HTTPXMock):
    """Async variant: verifies HTTPStatusError is raised on non-2xx responses."""
    httpx_mock.add_response(status_code=404)
    with pytest.raises(httpx.HTTPStatusError):
        await OllamaModelsClient().get_model_async("nonexistent")


# ─── health() (sync) ──────────────────────────────────────────────────────────


def test_health_returns_health_status(httpx_mock: HTTPXMock):
    """Verifies health() deserializes the API response into a HealthStatus with nested CheckResults."""
    httpx_mock.add_response(json=MOCK_HEALTH)
    result = OllamaModelsClient().health()
    assert result.ok is True
    assert result.timestamp == "2025-01-01T00:00:00.000Z"
    assert result.search.ok is True
    assert result.search.count == 20
    assert result.model.ok is True
    assert result.model.count == 15


def test_health_hits_health_endpoint(httpx_mock: HTTPXMock):
    """Verifies that health() calls the /health endpoint."""
    httpx_mock.add_response(json=MOCK_HEALTH)
    OllamaModelsClient().health()
    request = httpx_mock.get_requests()[0]
    assert "/health" in str(request.url)


def test_health_raises_on_http_error(httpx_mock: HTTPXMock):
    """Verifies that a non-2xx response raises httpx.HTTPStatusError."""
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        OllamaModelsClient().health()


def test_health_captures_failed_check(httpx_mock: HTTPXMock):
    """Verifies HealthStatus correctly captures a failed check with ok=False and an error message."""
    httpx_mock.add_response(
        json={
            "ok": False,
            "timestamp": "2025-01-01T00:00:00.000Z",
            "checks": {
                "search": {"ok": False, "error": "timeout"},
                "model": {"ok": True, "count": 15},
            },
        }
    )
    result = OllamaModelsClient().health()
    assert result.ok is False
    assert result.search.ok is False
    assert result.search.error == "timeout"
    assert result.model.ok is True


# ─── health_async() ───────────────────────────────────────────────────────────


async def test_health_async_returns_health_status(httpx_mock: HTTPXMock):
    """Async variant: verifies correct HealthStatus deserialization."""
    httpx_mock.add_response(json=MOCK_HEALTH)
    result = await OllamaModelsClient().health_async()
    assert result.ok is True
    assert result.search.ok is True


async def test_health_async_raises_on_http_error(httpx_mock: HTTPXMock):
    """Async variant: verifies HTTPStatusError is raised on non-2xx responses."""
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        await OllamaModelsClient().health_async()
