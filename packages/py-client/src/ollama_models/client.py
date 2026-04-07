from __future__ import annotations

from typing import Dict

import httpx

from .types import (
    ModelTags,
    ModelPage,
    PageRange,
    PageRangeDetail,
    SearchResult,
    CheckResult,
    HealthStatus,
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
        """Initialize the client.

        Args:
            base_url: Root URL of the ollama-models API. Trailing slashes are
                stripped automatically. Defaults to the public Cloudflare Workers
                deployment.
        """
        self._base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, keyword: str = "", page: int = 1) -> SearchResult:
        """Search Ollama models by keyword (sync).

        Args:
            keyword: Search term. Pass an empty string to list all models.
            page: 1-based page number of the search results.

        Returns:
            A :class:`~ollama_models.types.SearchResult` containing the
            model pages found on the requested page.

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
        params: Dict[str, str] = {"page": str(page)}
        if keyword:
            params["q"] = keyword
        with httpx.Client() as client:
            res = client.get(f"{self._base_url}/search", params=params)
            res.raise_for_status()
            data = res.json()
        return _parse_search_result(data)

    async def search_async(self, keyword: str = "", page: int = 1) -> SearchResult:
        """Search Ollama models by keyword (async).

        Args:
            keyword: Search term. Pass an empty string to list all models.
            page: 1-based page number of the search results.

        Returns:
            A :class:`~ollama_models.types.SearchResult` containing the
            model pages found on the requested page.

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
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
        """Fetch tag information for a specific model (sync).

        Args:
            name: Model identifier. Accepted formats:
                - ``"qwen3"`` or ``"library/qwen3"`` for official models
                - ``"username/model-name"`` for community models

        Returns:
            A :class:`~ollama_models.types.ModelTags` with the full tag list
            and the default tag (``None`` when no ``latest`` tag exists).

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
        with httpx.Client() as client:
            res = client.get(f"{self._base_url}/model", params={"name": name})
            res.raise_for_status()
            data = res.json()
        return _parse_model_tags(data)

    async def get_model_async(self, name: str) -> ModelTags:
        """Fetch tag information for a specific model (async).

        Args:
            name: Model identifier. Accepted formats:
                - ``"qwen3"`` or ``"library/qwen3"`` for official models
                - ``"username/model-name"`` for community models

        Returns:
            A :class:`~ollama_models.types.ModelTags` with the full tag list
            and the default tag (``None`` when no ``latest`` tag exists).

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self._base_url}/model", params={"name": name})
            res.raise_for_status()
            data = res.json()
        return _parse_model_tags(data)

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> HealthStatus:
        """Check the health of both scrapers (sync).

        Returns:
            A :class:`~ollama_models.types.HealthStatus` with per-scraper
            probe results. ``status.ok`` is ``True`` only when both the search
            and model scrapers succeed.

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
        with httpx.Client() as client:
            res = client.get(f"{self._base_url}/health")
            res.raise_for_status()
            data = res.json()
        return _parse_health_status(data)

    async def health_async(self) -> HealthStatus:
        """Check the health of both scrapers (async).

        Returns:
            A :class:`~ollama_models.types.HealthStatus` with per-scraper
            probe results. ``status.ok`` is ``True`` only when both the search
            and model scrapers succeed.

        Raises:
            httpx.HTTPStatusError: If the API returns a 4xx or 5xx response.
        """
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self._base_url}/health")
            res.raise_for_status()
            data = res.json()
        return _parse_health_status(data)


# ------------------------------------------------------------------
# Internal parsers
# ------------------------------------------------------------------


def _parse_search_result(data: dict) -> SearchResult:
    """Deserialize a raw /search JSON response into a SearchResult.

    Handles both integer page_range values (single page) and object values
    ({"from": int, "to": int} range).

    Raises:
        KeyError: If a required field is missing from the response.
    """
    raw_range = data["page_range"]
    if isinstance(raw_range, int):
        page_range: PageRange = raw_range
    else:
        page_range = PageRangeDetail(
            from_page=int(raw_range["from"]), to=int(raw_range["to"])
        )
    return SearchResult(
        pages=[
            ModelPage(http_url=p["http_url"], model_id=p["model_id"])
            for p in data["pages"]
        ],
        page_range=page_range,
        keyword=str(data["keyword"]),
    )


def _parse_model_tags(data: dict) -> ModelTags:
    """Deserialize a raw /model JSON response into a ModelTags.

    Converts ``default_tag: null`` in the response to ``None`` in the
    returned dataclass.

    Raises:
        KeyError: If a required field is missing from the response.
    """
    return ModelTags(
        page_url=str(data["page_url"]),
        id=str(data["id"]),
        tags=[str(t) for t in data["tags"]],
        default_tag=str(data["default_tag"])
        if data["default_tag"] is not None
        else None,
    )


def _parse_health_status(data: dict) -> HealthStatus:
    """Deserialize a raw /health JSON response into a HealthStatus.

    Flattens the ``checks`` wrapper so callers access ``status.search.ok``
    directly rather than ``status.checks["search"].ok``.

    Raises:
        KeyError: If a required field is missing from the response.
    """

    def _parse_check(c: dict) -> CheckResult:
        return CheckResult(
            ok=bool(c["ok"]),
            count=int(c["count"]) if c.get("count") is not None else None,
            error=str(c["error"]) if c.get("error") is not None else None,
        )

    checks = data["checks"]
    return HealthStatus(
        ok=bool(data["ok"]),
        timestamp=str(data["timestamp"]),
        search=_parse_check(checks["search"]),
        model=_parse_check(checks["model"]),
    )
