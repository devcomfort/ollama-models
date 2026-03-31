from __future__ import annotations

import pytest
import httpx
from pytest_httpx import HTTPXMock

from ollama_models import OllamaModelsClient
from ollama_models.client import DEFAULT_BASE_URL

# ─── fixtures ─────────────────────────────────────────────────────────────────

MOCK_SEARCH = {
    "pages": [
        {"http_url": "https://ollama.com/library/qwen3"},
        {"http_url": "https://ollama.com/library/mistral"},
    ],
    "page_id": 1,
    "keyword": "qwen3",
}

MOCK_MODEL = {
    "model_list": [
        {"http_url": "https://ollama.com/library/qwen3", "id": "qwen3:latest"},
        {"http_url": "https://ollama.com/library/qwen3", "id": "qwen3:4b"},
    ],
    "default_model_id": "qwen3:latest",
}


# ─── DEFAULT_BASE_URL ─────────────────────────────────────────────────────────


def test_default_base_url_is_official_instance():
    assert DEFAULT_BASE_URL == "https://ollama-models-api.devcomfort.workers.dev"


def test_client_uses_default_base_url(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("qwen3")
    request = httpx_mock.get_requests()[0]
    assert DEFAULT_BASE_URL in str(request.url)


# ─── search() (sync) ──────────────────────────────────────────────────────────


def test_search_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = OllamaModelsClient().search("qwen3", page=1)
    assert result.keyword == "qwen3"
    assert result.page_id == 1
    assert len(result.pages) == 2
    assert result.pages[0].http_url == "https://ollama.com/library/qwen3"


def test_search_sends_keyword_and_page_params(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("mistral", page=2)
    request = httpx_mock.get_requests()[0]
    assert "q=mistral" in str(request.url)
    assert "page=2" in str(request.url)


def test_search_omits_q_param_when_keyword_is_empty(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("", page=1)
    request = httpx_mock.get_requests()[0]
    assert "q=" not in str(request.url)


def test_search_hits_search_endpoint(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    OllamaModelsClient().search("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "/search" in str(request.url)


def test_search_raises_on_http_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(status_code=500)
    with pytest.raises(httpx.HTTPStatusError):
        OllamaModelsClient().search("qwen3")


# ─── search_async() ───────────────────────────────────────────────────────────


async def test_search_async_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = await OllamaModelsClient().search_async("qwen3", page=1)
    assert result.keyword == "qwen3"
    assert len(result.pages) == 2


async def test_search_async_sends_keyword_and_page_params(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    await OllamaModelsClient().search_async("qwen3", page=3)
    request = httpx_mock.get_requests()[0]
    assert "q=qwen3" in str(request.url)
    assert "page=3" in str(request.url)


async def test_search_async_raises_on_http_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        await OllamaModelsClient().search_async("qwen3")


# ─── get_model() (sync) ───────────────────────────────────────────────────────


def test_get_model_returns_model_list(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_MODEL)
    result = OllamaModelsClient().get_model("qwen3")
    assert result.default_model_id == "qwen3:latest"
    assert len(result.model_list) == 2
    assert result.model_list[0].id == "qwen3:latest"
    assert result.model_list[1].id == "qwen3:4b"


def test_get_model_sends_name_param(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_MODEL)
    OllamaModelsClient().get_model("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "name=qwen3" in str(request.url)


def test_get_model_hits_model_endpoint(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_MODEL)
    OllamaModelsClient().get_model("qwen3")
    request = httpx_mock.get_requests()[0]
    assert "/model" in str(request.url)


def test_get_model_raises_on_http_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(status_code=404)
    with pytest.raises(httpx.HTTPStatusError):
        OllamaModelsClient().get_model("nonexistent")


# ─── get_model_async() ────────────────────────────────────────────────────────


async def test_get_model_async_returns_model_list(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_MODEL)
    result = await OllamaModelsClient().get_model_async("qwen3")
    assert result.default_model_id == "qwen3:latest"
    assert len(result.model_list) == 2


async def test_get_model_async_sends_name_param(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_MODEL)
    await OllamaModelsClient().get_model_async("mistral")
    request = httpx_mock.get_requests()[0]
    assert "name=mistral" in str(request.url)


async def test_get_model_async_raises_on_http_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(status_code=404)
    with pytest.raises(httpx.HTTPStatusError):
        await OllamaModelsClient().get_model_async("nonexistent")
