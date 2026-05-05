'use strict'

const { buildExperienceViewUrl } = require('./resolve-web-base.js')

function escapeMdTableCell (value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

/**
 * Spotlight deep-link query key used by the SPA (`DeepLinkSessionSync`) and `spotlight` REST action.
 * Cards may set `spotlightTopic` (or legacy `spotlightProduct`) to enable recommend → spotlight handoff.
 */
function spotlightQueryValue (block) {
  const t =
    typeof block.spotlightTopic === 'string' && block.spotlightTopic.trim()
      ? block.spotlightTopic.trim()
      : typeof block.spotlightProduct === 'string' && block.spotlightProduct.trim()
        ? block.spotlightProduct.trim()
        : ''
  return t
}

/**
 * Chat hosts often show tool `content` as plain chat. Turn `{ ui: UIBlock[] }` into Markdown;
 * `structuredContent` remains for widget-capable hosts.
 */
function formatLlmUiAsMarkdown (
  ui,
  { brand, subtitle = '', experienceUrl = '', webAppHint = true, params = {}, recommendNextActions } = {}
) {
  const lines = []
  lines.push(`## ${brand}`)
  if (subtitle) {
    lines.push('')
    lines.push(subtitle)
  }
  lines.push('')

  for (const block of ui) {
    if (!block || typeof block !== 'object') continue
    const t = block.type
    if (t === 'text' && typeof block.content === 'string' && block.content.trim()) {
      lines.push(block.content.trim())
      lines.push('')
    } else if (t === 'card' && (block.title || block.body)) {
      const kicker = typeof block.kicker === 'string' && block.kicker.trim() ? `*${block.kicker.trim()}* — ` : ''
      const title = String(block.title || 'Card').trim()
      const body = String(block.body || '').trim()
      lines.push(`### ${kicker}${title}`)
      lines.push('')
      if (typeof block.imageUrl === 'string' && block.imageUrl.trim()) {
        const alt = typeof block.imageAlt === 'string' && block.imageAlt.trim() ? block.imageAlt.trim() : 'Card'
        lines.push(`![${alt}](${block.imageUrl.trim()})`)
        lines.push('')
      }
      if (body) {
        lines.push(body)
        lines.push('')
      }
      const spot = spotlightQueryValue(block)
      if (spot) {
        const spotlightUrl = buildExperienceViewUrl('spotlight', { topic: spot }, params)
        if (spotlightUrl) {
          lines.push(`[View full details](${spotlightUrl})`)
          lines.push('')
        }
      } else if (typeof block.href === 'string' && block.href.trim()) {
        lines.push(`[View full details](${block.href.trim()})`)
        lines.push('')
      }
    } else if (t === 'table' && Array.isArray(block.columns) && Array.isArray(block.rows)) {
      const cols = block.columns.map((c) => escapeMdTableCell(c))
      if (!cols.length) continue
      lines.push(`| ${cols.join(' | ')} |`)
      lines.push(`| ${cols.map(() => '---').join(' | ')} |`)
      for (const row of block.rows) {
        const cells = cols.map((_, i) => escapeMdTableCell((row && row[i]) ?? ''))
        lines.push(`| ${cells.join(' | ')} |`)
      }
      lines.push('')
    }
  }

  let out = lines.join('\n').trim()
  if (!out) {
    out = `_No display content was returned for ${brand}._`
  }

  if (experienceUrl) {
    out +=
      '\n\n---\n\n' +
      `**Branded streaming UI:** [Open the ${brand} web app](${experienceUrl})\n\n` +
      'Uses the same `{ ui }` blocks with full layout and theme from `web-src` (not the chat surface).'
  } else if (webAppHint) {
    out +=
      '\n\n---\n\n' +
      '> **Branded layout:** Use the App Builder **web-src** app (streaming chat + themed panels). ' +
      'If there is no deep link above, the gateway origin could not be inferred—fix action URL resolution or set **LLM_EXPERIENCE_ORIGIN** when the SPA uses a different host.'
  }

  if (Array.isArray(recommendNextActions) && recommendNextActions.length > 0) {
    const rows = recommendNextActions
      .map((a) => {
        const title =
          typeof a.card_title === 'string' && a.card_title.trim() ? a.card_title.trim() : a.topic
        const topic = typeof a.topic === 'string' ? a.topic.trim() : ''
        if (!topic) {
          return ''
        }
        return `- **${title}** → call tool **spotlight** with \`topic\`: \`${topic.replace(/`/g, "'")}\``
      })
      .filter(Boolean)
    if (rows.length) {
      out +=
        '\n\n---\n\n' +
        '### Follow-up (assistant)\n\n' +
        'If the user asks for **full details** on one of these cards, or names a card, invoke the **`spotlight`** tool with the matching `topic` below. ' +
        'You may **reply briefly in chat** when doing so so the user sees acknowledgment in the transcript ' +
        '(the embedded app alone cannot author transcript lines).\n\n' +
        rows.join('\n')
    }
  }

  return out.trim()
}

function recommendNextActionsFromUi (ui) {
  if (!Array.isArray(ui)) {
    return []
  }
  const seen = new Set()
  const out = []
  for (const b of ui) {
    if (!b || typeof b !== 'object' || b.type !== 'card') {
      continue
    }
    const variant = b.variant
    if (variant !== 'recommendHero' && variant !== 'recommendTile') {
      continue
    }
    const topic = spotlightQueryValue(b)
    if (!topic) {
      continue
    }
    const dedupeKey = topic.toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    const cardTitle = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : topic
    out.push({
      type: 'spotlight',
      topic,
      card_title: cardTitle,
      variant,
      assistant_message: `To show full details for **${cardTitle}**, call the spotlight tool with \`topic\`: "${topic}".`
    })
  }
  return out
}

module.exports = {
  escapeMdTableCell,
  formatLlmUiAsMarkdown,
  recommendNextActionsFromUi,
  spotlightQueryValue
}
