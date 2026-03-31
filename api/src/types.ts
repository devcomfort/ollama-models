export interface ModelPage {
  http_url: string;
}

export interface SearchResult {
  pages: ModelPage[];
  page_id: number;
  keyword: string;
}

export interface ModelWeight {
  http_url: string;
  id: string;
}

export interface ModelList {
  model_list: ModelWeight[];
  default_model_id: string;
}
