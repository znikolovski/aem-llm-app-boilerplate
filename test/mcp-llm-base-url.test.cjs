'use strict'

const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const {
  resolveLlmAppWebBase,
  resolveLlmExperienceOrigin,
  resolveChatgptFrameDomains,
  resolveLlmClientWebBase
} = require('../actions/mcp/llm-boilerplate-tools.js')

const saved = {}

function saveEnv(keys) {
  for (const k of keys) {
    saved[k] = process.env[k]
  }
}

function restoreEnv(keys) {
  for (const k of keys) {
    if (saved[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = saved[k]
    }
  }
}

const KEYS = [
  'LLM_APP_BASE_URL',
  '__LLM_APP_BASE_URL',
  'LLM_EXPERIENCE_ORIGIN',
  '__OW_ACTION_NAME',
  '__OW_API_HOST',
  '__OW_NAMESPACE',
  'AIO_runtime_apihost',
  'AIO_runtime_namespace',
  'LLM_APP_OW_PACKAGE'
]

afterEach(() => {
  restoreEnv(KEYS)
})

test('resolveLlmAppWebBase: explicit LLM_APP_BASE_URL wins', () => {
  saveEnv(KEYS)
  process.env.LLM_APP_BASE_URL = 'https://example.test/prefix/'
  const b = resolveLlmAppWebBase({
    __ow_path: '/api/v1/web/ns/pkg/mcp',
    __ow_headers: { host: 'localhost:9080' }
  })
  assert.equal(b, 'https://example.test/prefix/')
})

test('resolveLlmAppWebBase: derives from __ow_path and Host (local dev shape)', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  delete process.env.__LLM_APP_BASE_URL
  const b = resolveLlmAppWebBase({
    __ow_path: '/api/v1/web/28538-demo/llm-app-pkg/mcp',
    __ow_headers: { host: 'localhost:9080' }
  })
  assert.equal(b, 'http://localhost:9080/api/v1/web/28538-demo/llm-app-pkg/')
})

test('resolveLlmExperienceOrigin uses X-Forwarded-Host instead of internal __OW_API_HOST', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  delete process.env.LLM_EXPERIENCE_ORIGIN
  process.env.__OW_ACTION_NAME = '/28538-demo/llm-app-pkg/mcp'
  process.env.__OW_API_HOST =
    'https://controller-gw-ns-team-ioruntime-prd-delivery-facade.int.ethos652-prod-aus3.ethos.adobe.net'
  const o = resolveLlmExperienceOrigin({
    __ow_headers: {
      'x-forwarded-host': 'my-app.project.adobeio-static.net',
      'x-forwarded-proto': 'https'
    }
  })
  assert.equal(o, 'https://my-app.project.adobeio-static.net')
})

test('resolveLlmExperienceOrigin: LLM_APP_BASE_URL still wins over forwarded headers', () => {
  saveEnv(KEYS)
  process.env.LLM_APP_BASE_URL = 'https://public.example.com/api/v1/web/ns/pkg/'
  const o = resolveLlmExperienceOrigin({
    __ow_headers: {
      'x-forwarded-host': 'other.example.com',
      'x-forwarded-proto': 'https'
    }
  })
  assert.equal(o, 'https://public.example.com')
})

test('resolveChatgptFrameDomains excludes internal Adobe gateway but keeps public adobeioruntime', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  delete process.env.LLM_EXPERIENCE_ORIGIN
  process.env.__OW_ACTION_NAME = '/28538-demo/llm-app-pkg/mcp'
  process.env.__OW_API_HOST =
    'https://controller-gw-ns-team-ioruntime-prd-delivery-facade.int.ethos652-prod-aus3.ethos.adobe.net'
  const list = resolveChatgptFrameDomains({
    __ow_headers: {
      'x-forwarded-host': '28538-llmappstudio.adobeioruntime.net',
      'x-forwarded-proto': 'https'
    }
  })
  assert.ok(list.some((o) => o === 'https://28538-llmappstudio.adobeioruntime.net'))
  assert.ok(!list.some((o) => o.includes('ethos.adobe.net')))
})

test('resolveLlmExperienceOrigin never falls back to internal gateway host', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  delete process.env.LLM_EXPERIENCE_ORIGIN
  process.env.__OW_ACTION_NAME = '/28538-llmappstudio/llm-app-f45e67040e2d/mcp'
  process.env.__OW_API_HOST =
    'https://controller-gw-ns-team-ioruntime-prd-delivery-facade.int.ethos652-prod-aus3.ethos.adobe.net'
  assert.equal(resolveLlmExperienceOrigin({}), '')
})

test('resolveLlmExperienceOrigin uses LLM_EXPERIENCE_ORIGIN when OpenWhisk host is internal', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  process.env.LLM_EXPERIENCE_ORIGIN = 'https://28538-llmappstudio.adobeio-static.net'
  process.env.__OW_ACTION_NAME = '/28538-llmappstudio/llm-app-f45e67040e2d/mcp'
  process.env.__OW_API_HOST =
    'https://controller-gw-ns-team-ioruntime-prd-delivery-facade.int.ethos652-prod-aus3.ethos.adobe.net'
  assert.equal(resolveLlmExperienceOrigin({}), 'https://28538-llmappstudio.adobeio-static.net')
})

test('resolveLlmClientWebBase rewrites internal gateway to public origin from LLM_EXPERIENCE_ORIGIN', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  process.env.__OW_ACTION_NAME = '/28538-llmappstudio/llm-app-f45e67040e2d/mcp'
  process.env.__OW_API_HOST =
    'https://controller-gw-ns-team-ioruntime-prd-delivery-facade.int.ethos652-prod-aus3.ethos.adobe.net'
  process.env.LLM_EXPERIENCE_ORIGIN = 'https://28538-llmappstudio.adobeioruntime.net'
  const internal = resolveLlmAppWebBase({})
  assert.ok(String(internal).includes('ethos.adobe.net'))
  const client = resolveLlmClientWebBase({})
  assert.equal(
    client,
    'https://28538-llmappstudio.adobeioruntime.net/api/v1/web/28538-llmappstudio/llm-app-f45e67040e2d/'
  )
})

test('resolveLlmAppWebBase: OpenWhisk __OW_ACTION_NAME + __OW_API_HOST', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  process.env.__OW_ACTION_NAME = '/28538-demo/llm-app-pkg/mcp'
  process.env.__OW_API_HOST = 'https://adobeioruntime.net'
  const b = resolveLlmAppWebBase({})
  assert.equal(b, 'https://adobeioruntime.net/api/v1/web/28538-demo/llm-app-pkg/')
})

test('resolveLlmAppWebBase: single-segment action name uses __OW_NAMESPACE + LLM_APP_OW_PACKAGE', () => {
  saveEnv(KEYS)
  delete process.env.LLM_APP_BASE_URL
  process.env.__OW_ACTION_NAME = 'mcp'
  process.env.__OW_NAMESPACE = '28538-demo'
  process.env.LLM_APP_OW_PACKAGE = 'llm-app-pkg'
  process.env.__OW_API_HOST = 'adobeioruntime.net'
  const b = resolveLlmAppWebBase({})
  assert.equal(b, 'https://adobeioruntime.net/api/v1/web/28538-demo/llm-app-pkg/')
})
