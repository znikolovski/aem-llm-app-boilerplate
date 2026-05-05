/**
 * Shared UI contract: tools and LLM structured output should emit these blocks only.
 * Styling and layout live in the SPA (see web-src renderers), not in model text.
 */
export type UIBlock =
  | { type: "text"; content: string; skeleton?: boolean; role?: "sectionHeading" }
  | {
      type: "card";
      title: string;
      body: string;
      skeleton?: boolean;
      variant?: "spotlightHero" | "recommendHero" | "recommendTile";
      badge?: string;
      ctaLabel?: string;
      learnMoreLabel?: string;
      /** Value passed to the `spotlight` tool and deep-link query `topic`. */
      spotlightTopic?: string;
      /** @deprecated Use `spotlightTopic`; kept for migrated apps. */
      spotlightProduct?: string;
      href?: string;
      kicker?: string;
      imageUrl?: string;
      imageAlt?: string;
    }
  | { type: "table"; columns: string[]; rows: string[][]; skeleton?: boolean };

export interface RecommendToolResponse {
  ui: UIBlock[];
}
