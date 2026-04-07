from dataclasses import dataclass
from typing import List, Optional, Union


@dataclass
class PageRangeDetail:
    """An inclusive from/to page range returned by the API.

    Used when the API response contains a range object instead of a single
    page number, e.g. ``{"from": 1, "to": 5}``.
    """

    from_page: int
    to: int


# A single 1-based page number, or an inclusive from/to page range.
PageRange = Union[int, PageRangeDetail]


@dataclass
class ModelPage:
    """A single Ollama model page entry returned inside a search result."""

    http_url: str
    model_id: str


@dataclass
class SearchResult:
    """Response payload of ``GET /search``.

    Attributes:
        pages: Model pages found on the requested search page.
        page_range: The page number (or range) that was requested.
        keyword: The search keyword used for the request.
    """

    pages: List[ModelPage]
    page_range: PageRange
    keyword: str


@dataclass
class ModelTags:
    """Response payload of ``GET /model``.

    Attributes:
        page_url: The canonical URL of the model's Ollama page.
        id: Model identifier, e.g. ``"library/qwen3"`` or ``"user/model"``.
        tags: All available pull-ready tags, e.g. ``["qwen3:latest", "qwen3:4b"]``.
        default_tag: The ``latest`` tag if it exists, otherwise ``None``.
    """

    page_url: str
    id: str
    tags: List[str]
    default_tag: Optional[str]


@dataclass
class CheckResult:
    """Result of a single scraper probe returned inside :class:`HealthStatus`."""

    ok: bool
    count: Optional[int] = None
    error: Optional[str] = None


@dataclass
class HealthStatus:
    """Response payload returned by the ``GET /health`` endpoint.

    The wire format nests ``search`` and ``model`` under a ``checks`` key::

        {
            "ok": True,
            "timestamp": "2025-01-01T00:00:00.000Z",
            "checks": {
                "search": {"ok": True, "count": 20},
                "model": {"ok": True, "count": 15}
            }
        }

    This class intentionally flattens the ``checks`` wrapper so callers can
    write ``status.search.ok`` instead of ``status.checks["search"].ok``.
    The :func:`~ollama_models.client._parse_health_status` parser bridges the
    gap transparently.
    """

    ok: bool
    timestamp: str
    search: CheckResult
    model: CheckResult
