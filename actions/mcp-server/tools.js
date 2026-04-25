/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
*/

const { z } = require("zod");

const DEMO_WIDGET_URI = "ui://widget/hello.html";

/**
 * Safe single binary-operation calculator (no eval).
 * @param {string} expression
 */
function safeBinaryCalc(expression) {
  const t = String(expression || "").replace(/\s/g, "");
  const m = t.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
  if (!m) {
    throw new Error('Use one operator with two numbers, e.g. "12+30" or "3.5*2".');
  }
  const a = Number(m[1]);
  const op = m[2];
  const b = Number(m[3]);
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) {
        throw new Error("Division by zero");
      }
      return a / b;
    default:
      throw new Error("Invalid operator");
  }
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerTools(server) {
  server.tool(
    "echo",
    "Echo a message back (connectivity check).",
    {
      message: z.string().describe("Message to echo")
    },
    async ({ message = "No message provided" }) => ({
      content: [{ type: "text", text: `Echo: ${message}` }]
    })
  );

  server.tool(
    "calculator",
    "Add, subtract, multiply, or divide two numbers (one binary operation only).",
    {
      expression: z.string().describe('Expression like "2+3", "10/4", "-5*2"')
    },
    async ({ expression = "" }) => {
      try {
        const result = safeBinaryCalc(expression);
        return {
          content: [
            {
              type: "text",
              text: `Result: ${result}\n\nExpression: ${expression}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Calculation error: ${error.message}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    "weather",
    "Mock weather for a city (replace with a real API for production).",
    {
      city: z.string().describe("City name")
    },
    async ({ city = "Unknown" }) => {
      const temperature = Math.round((15 + Math.random() * 10) * 10) / 10;
      const text = `Weather (mock) for ${city}: ~${temperature}°C. Replace this tool with a real provider when needed.`;
      return {
        content: [{ type: "text", text }]
      };
    }
  );

  server.tool(
    "demo_rich_card",
    "Return structured data plus an HTML widget for OpenAI Apps / ChatGPT rich UI (MCP Apps profile).",
    {
      title: z.string().optional().describe("Card title")
    },
    async ({ title = "Adobe I/O MCP" }) => {
      const structuredContent = {
        title,
        updatedAt: new Date().toISOString()
      };
      return {
        content: [{ type: "text", text: "Rendering rich UI card…" }],
        structuredContent,
        _meta: {
          ui: { resourceUri: DEMO_WIDGET_URI },
          "openai/outputTemplate": DEMO_WIDGET_URI,
          "openai/widgetAccessible": true
        }
      };
    }
  );
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerResources(server) {
  server.resource(
    "demo-hello-widget",
    DEMO_WIDGET_URI,
    {
      name: "Hello card widget",
      description: "Sample MCP Apps HTML surface",
      mimeType: "text/html;profile=mcp-app"
    },
    async () => ({
      contents: [
        {
          uri: DEMO_WIDGET_URI,
          mimeType: "text/html;profile=mcp-app",
          text: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>MCP MVP</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.25rem; line-height: 1.5; }
    code { background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Rich UI MVP</h1>
  <p>This document is served as <code>text/html;profile=mcp-app</code> from Adobe I/O Runtime.</p>
  <p>Pair it with the <strong>demo_rich_card</strong> tool (<code>structuredContent</code> + <code>_meta.openai/outputTemplate</code>).</p>
</body>
</html>`,
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://www.adobe.com", "https://developer.adobe.com"]
              }
            }
          }
        }
      ]
    })
  );

  server.resource(
    "readme-plain",
    "example://readme",
    {
      name: "Readme",
      description: "Plain text readme resource",
      mimeType: "text/plain"
    },
    async () => ({
      contents: [
        {
          uri: "example://readme",
          text: "MVP MCP server based on adobe/generator-app-remote-mcp-server-generic.",
          mimeType: "text/plain"
        }
      ]
    })
  );
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerPrompts(server) {
  server.prompt(
    "about-server",
    "Describe what this MCP server demonstrates",
    {
      audience: z.string().optional().describe("Who the explanation is for")
    },
    async ({ audience = "developers" }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarize this Adobe App Builder MCP MVP for ${audience}: tools echo/calculator/weather/demo_rich_card, streamable HTTP, OpenWhisk-safe responses, and an HTML widget resource.`
          }
        }
      ]
    })
  );
}

module.exports = {
  registerTools,
  registerResources,
  registerPrompts,
  DEMO_WIDGET_URI
};
