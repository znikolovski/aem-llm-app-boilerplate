'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { main: mcpMain } = require('../actions/mcp/index.js')

function runtimeJsonBody (r) {
    const b = r.body
    if (b === undefined || b === null) {
        return {}
    }
    if (typeof b === 'string') {
        return JSON.parse(b.length ? b : '{}')
    }
    return b
}

function mcpParams (body, extra = {}) {
    return {
        __ow_method: 'POST',
        __ow_body: JSON.stringify(body),
        __ow_headers: {
            host: 'localhost',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream'
        },
        __ow_path: '/v1/mcp',
        BRAND_DISPLAY_NAME: 'TestBrand',
        LOG_LEVEL: 'error',
        ...extra
    }
}

test('MCP GET without event-stream returns health JSON', async () => {
    const response = await mcpMain({
        __ow_method: 'GET',
        __ow_headers: { host: 'localhost', accept: 'application/json' },
        __ow_path: '/v1/mcp',
        BRAND_DISPLAY_NAME: 'TestBrand',
        LOG_LEVEL: 'error'
    })
    assert.equal(response.statusCode, 200)
    const data = runtimeJsonBody(response)
    assert.equal(data.status, 'healthy')
    assert.equal(data.server, 'llm-app')
})

test('MCP GET with text/event-stream returns graceful SSE error line', async () => {
    const response = await mcpMain({
        __ow_method: 'GET',
        __ow_headers: { host: 'localhost', accept: 'text/event-stream' },
        __ow_path: '/v1/mcp',
        LOG_LEVEL: 'error'
    })
    assert.equal(response.statusCode, 200)
    const text =
        typeof response.body === 'string'
            ? response.body
            : Buffer.isBuffer(response.body)
                ? response.body.toString('utf8')
                : JSON.stringify(response.body)
    assert.ok(text.includes('event: error'), text)
    assert.ok(text.includes('SSE not supported'), text)
})

test('MCP initialize returns 200 and server metadata in body', async () => {
    const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'node-test', version: '1.0.0' }
        }
    }
    const response = await mcpMain(mcpParams(body))
    assert.ok(response.statusCode >= 200 && response.statusCode < 300, `status ${response.statusCode}`)
    assert.ok(response.body != null, `missing body status=${response.statusCode}`)
    const ct = String(response.headers['Content-Type'] || response.headers['content-type'] || '')
    assert.ok(
        ct.includes('application/json') || ct.includes('text/event-stream'),
        `unexpected content-type: ${ct}`
    )
    const text =
        typeof response.body === 'string'
            ? response.body
            : Buffer.isBuffer(response.body)
                ? response.body.toString('utf8')
                : JSON.stringify(runtimeJsonBody(response))
    assert.ok(text.includes('llm-app'), `expected server name in body, got: ${text.slice(0, 500)}`)
    assert.ok(
        text.includes('protocolVersion') || text.includes('capabilities'),
        'expected initialize payload markers'
    )
})
