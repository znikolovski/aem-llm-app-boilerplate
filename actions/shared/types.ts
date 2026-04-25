export interface RuntimeParams {
  __ow_method?: string;
  __ow_headers?: Record<string, string>;
  __ow_body?: string | object;
  __ow_path?: string;
  [key: string]: unknown;
}

export interface RuntimeResponse {
  statusCode: number;
  headers: Record<string, string>;
  /**
   * For web actions, OpenWhisk's `resultAsHttp` path handles JSON more reliably when `body`
   * is a structured JSON value (object/array) than when it is a string with `Content-Type:
   * application/json`. Non-JSON responses should use a string (e.g. HTML or plain text).
   */
  body?: unknown;
}

export interface AppConfig {
  siteIndexUrl: URL;
  siteBaseUrl: URL;
  homepagePath: string;
  indexCacheTtlMs: number;
  conversationUrlTemplate?: string;
}

export interface RawIndexRecord {
  [key: string]: unknown;
}

export interface ProductSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  image?: string;
  url: string;
  path: string;
  lastModified?: string;
}

export interface ProductDetail extends ProductSummary {
  sections: ContentSection[];
  facts: KeyFact[];
  ctaLinks: LinkItem[];
  deepLinks: LinkItem[];
  source: {
    index: string;
    page: string;
  };
}

export interface HomepageSummary {
  title: string;
  description: string;
  hero?: ContentSection;
  sections: ContentSection[];
  highlights: LinkItem[];
  sourceLinks: LinkItem[];
  source: {
    index: string;
    page: string;
  };
}

export interface ContentSection {
  title: string;
  text: string;
}

export interface KeyFact {
  label: string;
  value: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

export interface ProductListOptions {
  category?: string;
  query?: string;
  limit?: number;
}

export interface ToolResult<T> {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
  _meta?: Record<string, unknown>;
}
