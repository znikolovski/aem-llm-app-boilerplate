import type { UIBlock } from "./ui-blocks";

export function buildRecommendUiBlocks(location: string, brand: string): UIBlock[] {
  const place = location.replace(/</g, "");
  return [
    {
      type: "text",
      content: `Sample results for “${place}” (${brand} boilerplate — wire your own data source).`,
      role: "sectionHeading"
    },
    {
      type: "card",
      variant: "recommendHero",
      badge: "Top pick",
      title: `${place} — Harbor View`,
      body: "Waterfront rooms, rooftop lounge, and easy airport access.\n\n• Rooftop lounge\n• Airport shuttle",
      spotlightTopic: `${place} — Harbor View`,
      ctaLabel: "View spotlight",
      kicker: brand
    },
    {
      type: "card",
      title: `${place} — Garden Inn`,
      body: "Quiet courtyard, family suites, complimentary breakfast. Demo card for UI contract testing."
    },
    {
      type: "table",
      columns: ["Property", "Neighborhood", "Notes"],
      rows: [
        ["Harbor View", "Waterfront", "Demo row"],
        ["Garden Inn", "Old Town", "Demo row"]
      ]
    }
  ];
}

export function buildSpotlightUiBlocks(topic: string, brand: string): UIBlock[] {
  const safe = topic.replace(/</g, "");
  return [
    {
      type: "text",
      content: `Spotlight for “${safe}” (${brand} boilerplate). Swap this action for real merchandising or editorial APIs.`
    },
    {
      type: "card",
      title: "Hero placement",
      body: `Primary slot aligned to: ${safe}. CTA and imagery should come from your headless source, not the LLM.`
    },
    {
      type: "card",
      title: "Supporting tiles",
      body: "Secondary promo tiles, A/B variants, or loyalty hooks — keep them as structured blocks like this."
    }
  ];
}
