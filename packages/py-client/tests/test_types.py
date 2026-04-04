from __future__ import annotations

from ollama_models.types import (
    ModelTags,
    ModelPage,
    PageRangeDetail,
    SearchResult,
)


def test_model_page_stores_url():
    page = ModelPage(http_url="https://ollama.com/library/qwen3")
    assert page.http_url == "https://ollama.com/library/qwen3"


def test_search_result_stores_fields():
    result = SearchResult(
        pages=[ModelPage(http_url="https://ollama.com/library/qwen3")],
        page_range=2,
        keyword="qwen3",
    )
    assert result.page_range == 2
    assert result.keyword == "qwen3"
    assert len(result.pages) == 1
    assert result.pages[0].http_url == "https://ollama.com/library/qwen3"


def test_search_result_stores_page_range_detail():
    result = SearchResult(
        pages=[],
        page_range=PageRangeDetail(from_page=1, to=3),
        keyword="qwen3",
    )
    assert isinstance(result.page_range, PageRangeDetail)
    assert result.page_range.from_page == 1
    assert result.page_range.to == 3


def test_model_list_stores_fields():
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
    model_list = ModelTags(
        page_url="https://ollama.com/library/qwen3",
        id="library/qwen3",
        tags=["qwen3:4b"],
        default_tag=None,
    )
    assert model_list.default_tag is None
