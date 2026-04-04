from dataclasses import dataclass
from typing import List, Optional, Union


@dataclass
class PageRangeDetail:
    from_page: int
    to: int


# A single 1-based page number, or an inclusive from/to page range.
PageRange = Union[int, PageRangeDetail]


@dataclass
class ModelPage:
    http_url: str


@dataclass
class SearchResult:
    pages: List[ModelPage]
    page_range: PageRange
    keyword: str


@dataclass
class ModelTags:
    page_url: str
    id: str
    tags: List[str]
    default_tag: Optional[str]
