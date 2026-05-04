/*
 * Boilerplate tools layered on the Adobe MCP generator (recommend / spotlight).
 * UI blocks mirror actions/shared/demo-payloads.ts for parity with REST actions.
 */

const { z } = require('zod')

function buildRecommendUiBlocks (location, brand) {
    const place = location.replace(/</g, '')
    return [
        {
            type: 'text',
            content: `Sample results for “${place}” (${brand} boilerplate — wire your own data source).`
        },
        {
            type: 'card',
            title: `${place} — Harbor View`,
            body: 'Waterfront rooms, rooftop lounge, and easy airport access. Replace with real catalog data.'
        },
        {
            type: 'card',
            title: `${place} — Garden Inn`,
            body: 'Quiet courtyard, family suites, complimentary breakfast. Demo card for UI contract testing.'
        },
        {
            type: 'table',
            columns: ['Property', 'Neighborhood', 'Notes'],
            rows: [
                ['Harbor View', 'Waterfront', 'Demo row'],
                ['Garden Inn', 'Old Town', 'Demo row']
            ]
        }
    ]
}

function buildSpotlightUiBlocks (topic, brand) {
    const safe = topic.replace(/</g, '')
    return [
        {
            type: 'text',
            content: `Spotlight for “${safe}” (${brand} boilerplate). Swap this action for real merchandising or editorial APIs.`
        },
        {
            type: 'card',
            title: 'Hero placement',
            body: `Primary slot aligned to: ${safe}. CTA and imagery should come from your headless source, not the LLM.`
        },
        {
            type: 'card',
            title: 'Supporting tiles',
            body: 'Secondary promo tiles, A/B variants, or loyalty hooks — keep them as structured blocks like this.'
        }
    ]
}

/** @param {any} server - McpServer from @modelcontextprotocol/sdk */
function registerLlmAppTools (server, params = {}) {
    const brand =
        typeof params.BRAND_DISPLAY_NAME === 'string' && params.BRAND_DISPLAY_NAME.trim()
            ? params.BRAND_DISPLAY_NAME.trim()
            : 'llm-app'

    server.tool(
        'recommend',
        'Return structured UI blocks (cards, tables) for hotels and travel options in a location.',
        {
            location: z.string().describe('City, region, or country.')
        },
        async ({ location = '' }) => {
            const ui = buildRecommendUiBlocks(location, brand)
            return {
                content: [
                    {
                        type: 'text',
                        text: `Structured UI blocks for “${location}”. Use structuredContent.ui in the host.`
                    }
                ],
                structuredContent: { ui }
            }
        }
    )

    server.tool(
        'spotlight',
        'Return structured UI blocks for a marketing or editorial spotlight.',
        {
            topic: z.string().describe('Campaign, season, or audience label.')
        },
        async ({ topic = '' }) => {
            const ui = buildSpotlightUiBlocks(topic, brand)
            return {
                content: [{ type: 'text', text: `Structured spotlight blocks for “${topic}”.` }],
                structuredContent: { ui }
            }
        }
    )
}

module.exports = { registerLlmAppTools }
