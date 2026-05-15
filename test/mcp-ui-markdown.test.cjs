'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { formatLlmUiAsMarkdown, recommendNextActionsFromUi } = require('../actions/mcp/llm-boilerplate-tools.js')

test('formatLlmUiAsMarkdown renders text, cards, and table', () => {
  const md = formatLlmUiAsMarkdown(
    [
      { type: 'text', content: 'Here are some options.' },
      { type: 'card', title: 'Harbor View', body: 'Waterfront.\nGreat for families.' },
      {
        type: 'table',
        columns: ['Stay', 'Key points'],
        rows: [['Harbor View', 'Waterfront.']]
      }
    ],
    { brand: 'Demo Brand', subtitle: 'For *Fiji*.' }
  )

  assert.ok(md.includes('## Demo Brand'))
  assert.ok(md.includes('For *Fiji*.'))
  assert.ok(md.includes('Here are some options.'))
  assert.ok(md.includes('### Harbor View'))
  assert.ok(md.includes('Waterfront.'))
  assert.ok(md.includes('| Stay | Key points |'))
  assert.ok(md.includes('| Harbor View | Waterfront. |'))
  assert.ok(md.includes('LLM_EXPERIENCE_ORIGIN') || md.includes('gateway origin'))
})

test('formatLlmUiAsMarkdown includes experience link when URL set (path routing)', () => {
  const md = formatLlmUiAsMarkdown([{ type: 'text', content: 'Hello.' }], {
    brand: 'Demo Brand',
    experienceUrl: 'http://localhost:9080/recommendation?location=test'
  })
  assert.ok(md.includes('Branded streaming UI'))
  assert.ok(md.includes('http://localhost:9080/recommendation'))
  assert.ok(!md.includes('LLM_EXPERIENCE_ORIGIN'))
})

test('formatLlmUiAsMarkdown uses spotlight deep link when spotlightTopic set', () => {
  const params = { LLM_EXPERIENCE_ORIGIN: 'https://app.example/' }
  const md = formatLlmUiAsMarkdown(
    [
      {
        type: 'card',
        title: 'Harbor View',
        body: 'A great stay.',
        spotlightTopic: 'Harbor View'
      }
    ],
    { brand: 'Demo Brand', params }
  )
  assert.ok(md.includes('[View full details]('))
  assert.ok(md.includes('https://app.example/spotlight'))
  assert.ok(md.includes('topic'))
})

test('buildExperienceViewUrl joins origin and query (path routing for BrowserRouter + basename)', () => {
  const { buildExperienceViewUrl } = require('../actions/mcp/llm-boilerplate-tools.js')
  const url = buildExperienceViewUrl('recommend', { location: 'Fiji' }, {
    LLM_EXPERIENCE_ORIGIN: 'https://app.example/',
    LLM_APP_BASE_URL: 'https://app.example/api/v1/web/ns/llm-app/'
  })
  assert.ok(url.startsWith('https://app.example/llm-app/recommendation'), url)
  assert.ok(url.includes('location'))
  assert.ok(url.includes('Fiji'))
  assert.ok(!url.includes('#'))
})

test('buildExperienceViewUrl uses index.html + hash when LLM_EXPERIENCE_USE_HASH_ROUTES=1', () => {
  const { buildExperienceViewUrl } = require('../actions/mcp/llm-boilerplate-tools.js')
  const url = buildExperienceViewUrl('recommend', { location: 'x' }, {
    LLM_EXPERIENCE_ORIGIN: 'https://deploy.example.com/',
    LLM_APP_BASE_URL: 'https://deploy.example.com/api/v1/web/ns/llm-app/',
    LLM_EXPERIENCE_USE_HASH_ROUTES: '1'
  })
  assert.ok(url.includes('/llm-app/index.html#/recommendation'), url)
})

test('buildExperienceViewUrl uses same origin as LLM_APP_BASE_URL when experience unset', () => {
  const { buildExperienceViewUrl, resolveLlmExperienceOrigin } = require('../actions/mcp/llm-boilerplate-tools.js')
  const params = {
    LLM_APP_BASE_URL: 'https://deploy.example.com/api/v1/web/ns1/pkg1/'
  }
  assert.equal(resolveLlmExperienceOrigin(params), 'https://deploy.example.com')
  const url = buildExperienceViewUrl('recommend', { location: 'x' }, params)
  assert.ok(url.startsWith('https://deploy.example.com/pkg1/recommendation?'), url)
})

test('formatLlmUiAsMarkdown markdown profile emphasizes chat-first follow-up', () => {
  const md = formatLlmUiAsMarkdown(
    [{ type: 'card', title: 'A', body: 'B', spotlightTopic: 'Topic One' }],
    {
      brand: 'Demo',
      experienceUrl: 'https://app.example/r',
      mcpUiProfile: 'markdown',
      recommendNextActions: recommendNextActionsFromUi([
        { type: 'card', title: 'A', body: 'B', variant: 'recommendHero', spotlightTopic: 'Topic One' }
      ])
    }
  )
  assert.ok(md.includes('Continue in chat'))
  assert.ok(md.includes('Optional: full browser layout'))
  assert.ok(md.includes('spotlight'))
  assert.ok(!md.includes('Branded streaming UI'))
})
