'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  buildExperienceViewUrl,
  resolveLlmExperienceOrigin,
  resolveLlmSpaBasename,
  upgradeLocalAioDevTlsOrigin
} = require('../actions/mcp/llm-boilerplate-tools.js')

const pkgParams = {
  LLM_EXPERIENCE_ORIGIN: 'https://app.example/',
  LLM_APP_BASE_URL: 'https://app.example/api/v1/web/ns/llm-app/'
}

test('resolveLlmExperienceOrigin upgrades http://localhost:9080 to https', () => {
  const o = resolveLlmExperienceOrigin({ LLM_EXPERIENCE_ORIGIN: 'http://localhost:9080' })
  assert.equal(o, 'https://localhost:9080')
})

test('upgradeLocalAioDevTlsOrigin upgrades http localhost:9080', () => {
  assert.equal(upgradeLocalAioDevTlsOrigin('http://localhost:9080'), 'https://localhost:9080')
})

test('resolveLlmSpaBasename derives /package from LLM_APP_BASE_URL', () => {
  assert.equal(resolveLlmSpaBasename(pkgParams), '/llm-app')
})

test('buildExperienceViewUrl path routing includes SPA basename (Model B)', () => {
  const url = buildExperienceViewUrl('recommend', { location: 'Fiji' }, pkgParams)
  assert.ok(url.startsWith('https://app.example/llm-app/recommendation'), url)
  assert.ok(url.includes('location'))
  assert.ok(url.includes('Fiji'))
  assert.ok(!url.includes('#'))
})

test('buildExperienceViewUrl hash uses index.html before fragment (Model B)', () => {
  const url = buildExperienceViewUrl(
    'recommend',
    { location: 'x' },
    {
      ...pkgParams,
      LLM_EXPERIENCE_USE_HASH_ROUTES: '1'
    }
  )
  assert.ok(url.includes('/llm-app/index.html#/recommendation'), url)
  assert.ok(url.includes('location=x'))
})

test('buildExperienceViewUrl hash Model A (no basename) uses /index.html', () => {
  const url = buildExperienceViewUrl(
    'recommend',
    { location: 'y' },
    {
      LLM_EXPERIENCE_ORIGIN: 'https://flat.example/',
      LLM_EXPERIENCE_USE_HASH_ROUTES: '1',
      LLM_STATIC_WEB_AT_ROOT: '1'
    }
  )
  assert.ok(url.startsWith('https://flat.example/index.html#/'), url)
  assert.ok(url.includes('recommendation'))
})

test('buildExperienceViewUrl hash + localhost:9080 + no basename stays on 9080 (Model A local)', () => {
  const url = buildExperienceViewUrl(
    'recommend',
    { location: 'a' },
    {
      LLM_EXPERIENCE_ORIGIN: 'https://localhost:9080',
      LLM_EXPERIENCE_USE_HASH_ROUTES: '1',
      LLM_STATIC_WEB_AT_ROOT: '1'
    }
  )
  assert.ok(url.startsWith('https://localhost:9080/index.html#/'), url)
})

test('buildExperienceViewUrl hash + localhost:9080 + basename uses Parcel port 9090', () => {
  const url = buildExperienceViewUrl(
    'recommend',
    { location: 'z' },
    {
      LLM_EXPERIENCE_ORIGIN: 'https://localhost:9080',
      LLM_APP_BASE_URL: 'https://localhost:9080/api/v1/web/ns/llm-app/',
      LLM_EXPERIENCE_USE_HASH_ROUTES: '1'
    }
  )
  assert.ok(url.startsWith('https://localhost:9090/llm-app/index.html'), url)
})

test('buildExperienceViewUrl hash + localhost:9080 + custom LLM_EXPERIENCE_DEV_PORT', () => {
  const url = buildExperienceViewUrl(
    'spotlight',
    { topic: 't' },
    {
      LLM_EXPERIENCE_ORIGIN: 'https://localhost:9080',
      LLM_APP_BASE_URL: 'https://localhost:9080/api/v1/web/ns/llm-app/',
      LLM_EXPERIENCE_USE_HASH_ROUTES: '1',
      LLM_EXPERIENCE_DEV_PORT: '9191'
    }
  )
  assert.ok(url.startsWith('https://localhost:9191/llm-app/index.html'), url)
})
