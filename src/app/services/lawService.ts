import { buildQueryString, request } from "./apiClient";

export interface LawTreeNode {
  id: string;
  title: string;
  nodeType: "folder" | "record";
  pathLabels: string[];
  children?: LawTreeNode[];
  recordId?: string;
  recordCount: number;
}

export interface LawOverview {
  tree: LawTreeNode[];
  totalRecords: number;
  topCategoryCount: number;
  lastUpdated: string;
  initialNodeId: string;
}

export interface LawContentItem {
  id: string;
  sourceLawId: number;
  topCategoryId: number;
  topCategoryTitle: string;
  bookTitle: string;
  title: string;
  displayTitle: string;
  customTitle: string;
  pathLabels: string[];
  pathString: string;
  isPublished: boolean;
  isPinned: boolean;
  manualSortOrder: number;
  tags: string[];
  operatorNote: string;
  updatedAt: string;
  content: string;
}

export interface LawContentPayload {
  nodeId: string;
  nodeType: "folder" | "record";
  nodeTitle: string;
  pathLabels: string[];
  items: LawContentItem[];
  total: number;
}

export interface LawSearchResult extends Omit<LawContentItem, "content"> {
  snippet: string;
}

export const lawService = {
  getOverview: () => request<LawOverview>("/api/user/laws/overview"),
  getContent: (nodeId: string) => request<LawContentPayload>(`/api/user/laws/content${buildQueryString({ nodeId })}`),
  search: (keyword: string) => request<LawSearchResult[]>(`/api/user/laws/search${buildQueryString({ keyword })}`),
};
