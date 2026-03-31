from dataclasses import dataclass
from typing import List


@dataclass
class ModelPage:
    http_url: str


@dataclass
class SearchResult:
    pages: List[ModelPage]
    page_id: int
    keyword: str


@dataclass
class ModelWeight:
    http_url: str
    id: str


@dataclass
class ModelList:
    model_list: List[ModelWeight]
    default_model_id: str
