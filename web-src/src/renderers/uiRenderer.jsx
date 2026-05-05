import { Link } from "react-router-dom";
import brand from "../brand.json";
import { RecommendSpotlightCta } from "../components/RecommendSpotlightCta.jsx";
import { toolRouteByName } from "../lib/toolRouting.js";

/**
 * UI contract: only structured blocks from tools / server — never raw HTML from the model.
 * @param {Array<Record<string, unknown>>} blocks
 * @param {{ tool?: string }} [options]
 */
export function renderUI(blocks, options = {}) {
  const { tool } = options;

  if (!Array.isArray(blocks)) {
    return null;
  }

  const nodes = blocks.map((block, i) => {
    if (!block || typeof block !== "object") {
      return null;
    }

    switch (block.type) {
      case "text": {
        if (
          tool === "spotlight" &&
          blocks.some((b) => b?.type === "card" && b?.variant === "spotlightHero")
        ) {
          return null;
        }
        const isSpotlightMeta = tool === "spotlight" && i === 0;
        const isRecommendSection = tool === "recommend" && block.role === "sectionHeading";
        return (
          <p
            key={i}
            className={`ub-text muted${isSpotlightMeta ? " ub-text--spotlight-intro" : ""}${isRecommendSection ? " ub-text--recommend-section" : ""}`}
          >
            {block.content}
          </p>
        );
      }
      case "card": {
        const kicker = block.kicker || brand.kicker || "Brand";
        const raw = block.body || "";
        const parts = raw
          .split(/\n\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const hasMedia = Boolean(block.imageUrl) && !block.skeleton;
        const spotlightPath = toolRouteByName(brand.toolRoutes, "spotlight")?.path;
        const spotlightTopic =
          (typeof block.spotlightTopic === "string" && block.spotlightTopic.trim()
            ? block.spotlightTopic.trim()
            : typeof block.spotlightProduct === "string" && block.spotlightProduct.trim()
              ? block.spotlightProduct.trim()
              : "") || "";
        const showSpotlightCta = Boolean(spotlightTopic && spotlightPath && !block.skeleton);
        const isSpotlightHero = block.variant === "spotlightHero" && !block.skeleton;
        const isRecommendHero = block.variant === "recommendHero" && !block.skeleton;
        const isRecommendTile = block.variant === "recommendTile" && !block.skeleton;
        const isMarketingHero = isSpotlightHero || isRecommendHero;
        const hideAccent = isSpotlightHero || isRecommendHero || isRecommendTile;
        const ctaText =
          typeof block.ctaLabel === "string" && block.ctaLabel.trim() ? block.ctaLabel.trim() : "View full details";
        const learnMoreText =
          typeof block.learnMoreLabel === "string" && block.learnMoreLabel.trim()
            ? block.learnMoreLabel.trim()
            : "Learn more";
        const showExternalCta = Boolean(
          block.href && !block.skeleton && !showSpotlightCta && !isRecommendHero && !isRecommendTile
        );
        const showRecommendLearnMore =
          (isRecommendHero || isRecommendTile) && Boolean(block.href) && !block.skeleton;

        const copyBlock = (() => {
          if (isSpotlightHero && parts.length > 1) {
            const [lede, ...bullets] = parts;
            return (
              <>
                <p className="ub-spotlight-lede">{lede}</p>
                <ul className="ub-spotlight-bullets">
                  {bullets.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </>
            );
          }
          if (isRecommendHero && parts.length > 1) {
            const [lede, ...bullets] = parts;
            return (
              <>
                <p className="ub-recommend-hero-lede">{lede}</p>
                <ul className="ub-recommend-hero-bullets">
                  {bullets.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </>
            );
          }
          if (isRecommendHero && parts.length <= 1) {
            return <p className="ub-recommend-hero-lede">{raw}</p>;
          }
          if (isRecommendTile && parts.length > 1) {
            const [lede, ...bullets] = parts;
            return (
              <>
                <p className="ub-recommend-tile-lede">{lede}</p>
                <ul className="ub-recommend-tile-bullets">
                  {bullets.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </>
            );
          }
          if (isRecommendTile && parts.length <= 1) {
            return <p className="ub-recommend-tile-lede">{raw}</p>;
          }
          if (parts.length <= 1) {
            return <p className={isSpotlightHero ? "ub-spotlight-lede" : "ub-card-body"}>{raw}</p>;
          }
          return (
            <ul className={isSpotlightHero ? "ub-spotlight-bullets" : "ub-card-highlights"}>
              {parts.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          );
        })();

        const innerSplitClass =
          isSpotlightHero && hasMedia
            ? " ub-card-inner--spotlight-split"
            : isRecommendHero && hasMedia
              ? " ub-card-inner--recommend-hero-split"
              : isRecommendTile && hasMedia
                ? " ub-card-inner--recommend-tile-stack"
                : "";

        const primaryCtaClass =
          isSpotlightHero
            ? "ub-card-cta ub-card-cta--spotlight-pill"
            : isRecommendHero
              ? "ub-card-cta ub-card-cta--recommend-hero-pill"
              : isRecommendTile
                ? "ub-card-cta ub-card-cta--recommend-tile-pill"
                : "ub-card-cta";

        const titleClassName = isSpotlightHero
          ? "ub-spotlight-heading"
          : isRecommendHero
            ? "ub-recommend-hero-heading"
            : "ub-card-title";

        const heroSplitMediaRight = (isSpotlightHero || isRecommendHero) && hasMedia;

        const mediaNode = hasMedia ? (
          <div className="ub-card-media">
            <img
              src={block.imageUrl}
              alt={block.imageAlt || block.title || "Card"}
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null;

        const copyNode = (
          <div className="ub-card-copy">
            {block.badge ? (
              <span className={isMarketingHero ? "ub-spotlight-badge" : "ub-card-kicker"}>{block.badge}</span>
            ) : isRecommendTile ? null : (
              <span className="ub-card-kicker">{kicker}</span>
            )}
            <h3 className={titleClassName}>{block.title}</h3>
            {copyBlock}
            {showSpotlightCta ? (
              <div
                className={`ub-card-cta-row${isRecommendHero ? " ub-card-cta-row--recommend-hero" : ""}${isRecommendTile ? " ub-card-cta-row--recommend-tile" : ""}`}
              >
                {tool === "recommend" ? (
                  <RecommendSpotlightCta
                    className={primaryCtaClass}
                    spotlightPath={spotlightPath}
                    topic={spotlightTopic}
                  >
                    {ctaText}
                  </RecommendSpotlightCta>
                ) : (
                  <Link
                    className={primaryCtaClass}
                    to={`/${spotlightPath}?${new URLSearchParams({ topic: spotlightTopic }).toString()}`}
                  >
                    {ctaText}
                  </Link>
                )}
                {showRecommendLearnMore ? (
                  <a
                    className="ub-card-learn-more"
                    href={block.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {learnMoreText}
                  </a>
                ) : null}
              </div>
            ) : null}
            {showExternalCta ? (
              <a
                className={isSpotlightHero ? "ub-card-cta ub-card-cta--spotlight-pill" : "ub-card-cta"}
                href={block.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {isSpotlightHero ? ctaText : "View full details"}
              </a>
            ) : null}
          </div>
        );

        return (
          <article
            key={i}
            className={`ub-card card${block.skeleton ? " skeleton" : ""}${hasMedia ? " ub-card--hero" : ""}${isSpotlightHero ? " ub-card--spotlight-hero" : ""}${isRecommendHero ? " ub-card--recommend-hero" : ""}${isRecommendTile ? " ub-card--recommend-tile" : ""}`}
          >
            {!hideAccent ? <div className="ub-card-accent" aria-hidden /> : null}
            <div className={`ub-card-inner${hasMedia ? " ub-card-inner--with-media" : ""}${innerSplitClass}`}>
              {heroSplitMediaRight ? (
                <>
                  {copyNode}
                  {mediaNode}
                </>
              ) : (
                <>
                  {mediaNode}
                  {copyNode}
                </>
              )}
            </div>
          </article>
        );
      }
      case "table":
        return (
          <div
            key={i}
            className={`table-wrap ub-table-wrap${tool === "spotlight" ? " ub-table-wrap--spotlight" : ""}`}
          >
            <table className="ub-table">
              <thead>
                <tr>
                  {(block.columns || []).map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(block.rows || []).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });

  return nodes;
}
