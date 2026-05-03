/**
 * Shared UI contract: tools and LLM structured output should emit these blocks only.
 * Styling and layout live in the SPA (see web-src renderers), not in model text.
 */
export type UIBlock =
  | { type: "text"; content: string; skeleton?: boolean }
  | { type: "card"; title: string; body: string; skeleton?: boolean }
  | { type: "table"; columns: string[]; rows: string[][]; skeleton?: boolean };

export interface RecommendToolResponse {
  ui: UIBlock[];
}
