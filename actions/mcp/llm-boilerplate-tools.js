/*
 * Boilerplate MCP tools: HTTP POST to sibling `recommend` / `spotlight` web actions, Markdown for chat
 * surfaces, deep links + ChatGPT widget metadata (see SecurBank reference app — generalized here).
 */

'use strict'

const { z } = require('zod')
const experienceRoutes = require('./experience-routes.json')
const resolveWeb = require('./resolve-web-base.js')
const {
  resolveLlmAppWebBase,
  resolveLlmClientWebBase,
  resolveChatgptFrameDomains,
  buildExperienceViewUrl,
  callJsonEndpoint
} = resolveWeb
const { formatLlmUiAsMarkdown, recommendNextActionsFromUi } = require('./markdown-ui.js')
const { mergeOpenAiWebappResultMeta } = require('./chatgpt-webapp-support.js')

/** @param {any} server - McpServer */
function registerLlmAppTools (server, params = {}) {
  const brand =
    typeof params.BRAND_DISPLAY_NAME === 'string' && params.BRAND_DISPLAY_NAME.trim()
      ? params.BRAND_DISPLAY_NAME.trim()
      : 'llm-app'

  server.tool(
    'recommend',
    [
      'Return travel / stay recommendations as Markdown in chat plus structured `{ ui }` for the web app.',
      'When the user wants **full details** on one card, call **`spotlight`** with `topic` from `structuredContent.next_actions` (or matching card label).',
      'Includes HTTP URLs for the REST actions and an optional `experienceUrl` hash deep link when the gateway origin resolves.'
    ].join(' '),
    {
      location: z.string().describe('City, region, or country to recommend stays for.')
    },
    { readOnlyHint: true },
    async ({ location = '' }) => {
      try {
        const { status, data } = await callJsonEndpoint('recommend', { location }, params)
        const ui = Array.isArray(data?.ui) ? data.ui : []

        if (!ui.length) {
          const fallbackText =
            (typeof data?.error === 'string' && data.error) ||
            `We could not load recommendations for “${location}” right now. Try again later.`

          return {
            content: [{ type: 'text', text: fallbackText }],
            _meta: { tool: 'recommend', httpStatus: status }
          }
        }

        const clientApiBase = resolveLlmClientWebBase(params).replace(/\/$/, '')
        const experienceUrl = buildExperienceViewUrl('recommend', { location }, params)
        const nextActions = recommendNextActionsFromUi(ui)
        const markdown = formatLlmUiAsMarkdown(ui, {
          brand,
          subtitle: `Ideas for *${location}* (${brand}).`,
          experienceUrl,
          params,
          recommendNextActions: nextActions
        })
        const linkMeta = {
          tool: 'recommend',
          httpStatus: status,
          experienceUrl: experienceUrl || undefined,
          recommendHttpPostUrl: `${clientApiBase}/recommend`,
          uiContract: 'UIBlock[]',
          spaToolPath: experienceRoutes.recommend
        }
        const openAiWeb = mergeOpenAiWebappResultMeta(experienceUrl, experienceRoutes.recommend)
        const assistantOrchestration =
          nextActions.length > 0
            ? 'When the user wants full details on one card, call spotlight with topic exactly matching structuredContent.next_actions[].topic (or next_action.topic). Prefer a short chat acknowledgment when the user explicitly asks for details.'
            : undefined
        const nextStructured =
          nextActions.length > 0
            ? {
                next_actions: nextActions,
                next_action: nextActions[0],
                ...(assistantOrchestration ? { assistant_orchestration: assistantOrchestration } : {})
              }
            : {}

        return {
          content: [{ type: 'text', text: markdown }],
          structuredContent: {
            ui,
            ...nextStructured,
            ...linkMeta,
            ...openAiWeb
          },
          _meta: { ...linkMeta, ...openAiWeb }
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Could not reach the recommend action: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          _meta: { tool: 'recommend', error: String(error) }
        }
      }
    }
  )

  server.tool(
    'spotlight',
    [
      'Show a detailed spotlight for one campaign, season, or topic.',
      'Use after **recommend** when the user asks for deeper details, or when following `structuredContent.next_actions` from recommend.'
    ].join(' '),
    {
      topic: z.string().describe('Campaign, season, or audience label to spotlight.')
    },
    { readOnlyHint: true },
    async ({ topic = '' }) => {
      try {
        const { status, data } = await callJsonEndpoint('spotlight', { topic }, params)
        const ui = Array.isArray(data?.ui) ? data.ui : []

        if (!ui.length) {
          const fallbackText =
            (typeof data?.error === 'string' && data.error) ||
            `We could not load a spotlight for “${topic}” right now. Try again later.`

          return {
            content: [{ type: 'text', text: fallbackText }],
            _meta: { tool: 'spotlight', httpStatus: status }
          }
        }

        const clientApiBase = resolveLlmClientWebBase(params).replace(/\/$/, '')
        const experienceUrl = buildExperienceViewUrl('spotlight', { topic }, params)
        const markdown = formatLlmUiAsMarkdown(ui, {
          brand,
          subtitle: `Spotlight: *${topic}* (${brand}).`,
          experienceUrl,
          params
        })
        const linkMeta = {
          tool: 'spotlight',
          httpStatus: status,
          experienceUrl: experienceUrl || undefined,
          spotlightHttpPostUrl: `${clientApiBase}/spotlight`,
          uiContract: 'UIBlock[]',
          spaToolPath: experienceRoutes.spotlight
        }
        const openAiWeb = mergeOpenAiWebappResultMeta(experienceUrl, experienceRoutes.spotlight)

        return {
          content: [{ type: 'text', text: markdown }],
          structuredContent: { ui, ...linkMeta, ...openAiWeb },
          _meta: { ...linkMeta, ...openAiWeb }
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Could not reach the spotlight action: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          _meta: { tool: 'spotlight', error: String(error) }
        }
      }
    }
  )
}

module.exports = {
  registerLlmAppTools,
  resolveLlmAppWebBase,
  resolveLlmClientWebBase,
  resolveLlmExperienceOrigin: resolveWeb.resolveLlmExperienceOrigin,
  resolveChatgptFrameDomains,
  formatLlmUiAsMarkdown,
  buildExperienceViewUrl,
  recommendNextActionsFromUi
}
