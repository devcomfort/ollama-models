from __future__ import annotations

from ollama_models.types import (
    ModelTags,
    ModelPage,
    PageRangeDetail,
    SearchResult,
    CheckResult,
    HealthStatus,
)


def test_model_page_stores_url():
    """Verifies that ModelPage stores http_url and model_id exactly as provided."""
    page = ModelPage(
        http_url="https://ollama.com/library/qwen3", model_id="library/qwen3"
    )
    assert page.http_url == "https://ollama.com/library/qwen3"
    assert page.model_id == "library/qwen3"


def test_search_result_stores_fields():
    """Verifies that SearchResult stores pages, a plain integer page_range, and keyword correctly."""
    result = SearchResult(
        pages=[
            ModelPage(
                http_url="https://ollama.com/library/qwen3", model_id="library/qwen3"
            )
        ],
        page_range=2,
        keyword="qwen3",
    )
    assert result.page_range == 2
    assert result.keyword == "qwen3"
    assert len(result.pages) == 1
    assert result.pages[0].http_url == "https://ollama.com/library/qwen3"
    assert result.pages[0].model_id == "library/qwen3"


def test_search_result_stores_page_range_detail():
    """Verifies that SearchResult accepts a PageRangeDetail for page_range and preserves from_page and to."""
    result = SearchResult(
        pages=[],
        page_range=PageRangeDetail(from_page=1, to=3),
        keyword="qwen3",
    )
    assert isinstance(result.page_range, PageRangeDetail)
    assert result.page_range.from_page == 1
    assert result.page_range.to == 3


def test_model_list_stores_fields():
    """Verifies that ModelTags stores page_url, id, tags list, and default_tag correctly."""
    model_list = ModelTags(
        page_url="https://ollama.com/library/qwen3",
        id="library/qwen3",
        tags=["qwen3:latest", "qwen3:4b"],
        default_tag="qwen3:latest",
    )
    assert model_list.page_url == "https://ollama.com/library/qwen3"
    assert model_list.id == "library/qwen3"
    assert model_list.tags == ["qwen3:latest", "qwen3:4b"]
    assert model_list.default_tag == "qwen3:latest"


def test_model_list_allows_null_default_tag():
    """Verifies that ModelTags accepts None for default_tag when the model has no 'latest' tag."""
    model_list = ModelTags(
        page_url="https://ollama.com/library/qwen3",
        id="library/qwen3",
        tags=["qwen3:4b"],
        default_tag=None,
    )
    assert model_list.default_tag is None


def test_check_result_stores_ok():
    """Verifies that CheckResult stores ok and count on a passing check; error defaults to None."""
    check = CheckResult(ok=True, count=20)
    assert check.ok is True
    assert check.count == 20
    assert check.error is None


def test_check_result_stores_error():
    """Verifies that CheckResult stores ok=False and the error message on a failing check; count defaults to None."""
    check = CheckResult(ok=False, error="timeout")
    assert check.ok is False
    assert check.error == "timeout"
    assert check.count is None


def test_health_status_stores_fields():
    """Verifies that HealthStatus stores ok, timestamp, and nested CheckResult data for search and model."""
    status = HealthStatus(
        ok=True,
        timestamp="2025-01-01T00:00:00.000Z",
        search=CheckResult(ok=True, count=20),
        model=CheckResult(ok=True, count=15),
    )
    assert status.ok is True
    assert status.timestamp == "2025-01-01T00:00:00.000Z"
    assert status.search.count == 20
    assert status.model.count == 15
