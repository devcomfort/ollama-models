from __future__ import annotations

from typing import Dict

import httpx

from .types import (
    ModelTags,
    ModelPage,
    PageRange,
    PageRangeDetail,
    SearchResult,
)

DEFAULT_BASE_URL = "https://ollama-models-api.devcomfort.workers.dev"


class OllamaModelsClient:
    """Sync/async client for the ollama-models Cloudflare Workers API.

    Usage (sync)::

        client = OllamaModelsClient()
        result = client.search("qwen3", page=1)
        model  = client.get_model("qwen3")

    Usage (async)::

        result = await client.search_async("qwen3", page=1)
        model  = await client.get_model_async("qwen3")
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL) -> None:
        self._base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, keyword: str = "", page: int = 1) -> SearchResult:
        params: Dict[str, str] = {"page": str(page)}
        if keyword:
            params["q"] = keyword
        with httpx.Client() as client:
            res = client.get(f"{self._base_url}/search", params=params)
            res.raise_for_status()
            data = res.json()
        return _parse_search_result(data)

    async def search_async(self, keyword: str = "", page: int = 1) -> SearchResult:
        params: Dict[str, str] = {"page": str(page)}
        if keyword:
            params["q"] = keyword
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self._base_url}/search", params=params)
            res.raise_for_status()
            data = res.json()
        return _parse_search_result(data)

    # ------------------------------------------------------------------
    # Model
    # ------------------------------------------------------------------

    def get_model(self, name: str) -> ModelTags:
        with httpx.Client() as client:
            res = client.get(f"{self._base_url}/model", params={"name": name})
            res.raise_for_status()
            data = res.json()
        return _parse_model_tags(data)

    async def get_model_async(self, name: str) -> ModelTags:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self._base_url}/model", params={"name": name})
            res.raise_for_status()
            data = res.json()
        return _parse_model_tags(data)


# ------------------------------------------------------------------
# Internal parsers
# ------------------------------------------------------------------


def _parse_search_result(data: dict) -> SearchResult:
    raw_range = data["page_range"]
    if isinstance(raw_range, int):
        page_range: PageRange = raw_range
    else:
        page_range = PageRangeDetail(
            from_page=int(raw_range["from"]), to=int(raw_range["to"])
        )
    return SearchResult(
        pages=[ModelPage(http_url=p["http_url"]) for p in data["pages"]],
        page_range=page_range,
        keyword=str(data["keyword"]),
    )


def _parse_model_tags(data: dict) -> ModelTags:
    return ModelTags(
        page_url=str(data["page_url"]),
        id=str(data["id"]),
        tags=[str(t) for t in data["tags"]],
        default_tag=str(data["default_tag"])
        if data["default_tag"] is not None
        else None,
    )
