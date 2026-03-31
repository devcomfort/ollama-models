from __future__ import annotations

from ollama_models.types import ModelList, ModelPage, ModelWeight, SearchResult


def test_model_page_stores_url():
    page = ModelPage(http_url="https://ollama.com/library/qwen3")
    assert page.http_url == "https://ollama.com/library/qwen3"


def test_search_result_stores_fields():
    result = SearchResult(
        pages=[ModelPage(http_url="https://ollama.com/library/qwen3")],
        page_id=2,
        keyword="qwen3",
    )
    assert result.page_id == 2
    assert result.keyword == "qwen3"
    assert len(result.pages) == 1
    assert result.pages[0].http_url == "https://ollama.com/library/qwen3"


def test_model_weight_stores_fields():
    weight = ModelWeight(
        http_url="https://ollama.com/library/qwen3",
        id="qwen3:4b",
    )
    assert weight.http_url == "https://ollama.com/library/qwen3"
    assert weight.id == "qwen3:4b"


def test_model_list_stores_fields():
    model_list = ModelList(
        model_list=[
            ModelWeight(http_url="https://ollama.com/library/qwen3", id="qwen3:latest"),
            ModelWeight(http_url="https://ollama.com/library/qwen3", id="qwen3:4b"),
        ],
        default_model_id="qwen3:latest",
    )
    assert model_list.default_model_id == "qwen3:latest"
    assert len(model_list.model_list) == 2
    assert model_list.model_list[0].id == "qwen3:latest"
    assert model_list.model_list[1].id == "qwen3:4b"
