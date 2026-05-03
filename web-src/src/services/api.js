import brand from "../brand.json";

/**
 * API base for extensionless dev and deployed hosts. Override with Parcel define or
 * `window.__LLM_API_BASE__` when the SPA and API live on different origins.
 */
export function apiBaseUrl() {
  if (typeof window !== "undefined" && window.__LLM_API_BASE__) {
    return String(window.__LLM_API_BASE__).replace(/\/$/, "");
  }
  return "";
}

export function apiUrl(segment) {
  const base = apiBaseUrl();
  const path = `${brand.apiVersionPath}/${segment}`.replace(/\/+/g, "/");
  return `${base}${path}`;
}

/**
 * POST /v1/chat — SSE stream of OpenAI Responses events (JSON `data:` lines).
 */
export async function chatStream(message, { signal, onEvent } = {}) {
  const res = await fetch(apiUrl("chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ message }),
    signal
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error || text;
    } catch {
      // keep text
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }

  await readSseStream(res.body, onEvent);
}

export async function spotlight(params, { signal } = {}) {
  const res = await fetch(apiUrl("spotlight"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
    signal
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Spotlight response was not JSON.");
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function recommend(params, { signal } = {}) {
  const res = await fetch(apiUrl("recommend"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
    signal
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Recommend response was not JSON.");
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function readSseStream(body, onEvent) {
  if (!body || typeof body.getReader !== "function") {
    throw new Error("Streaming response body is not readable.");
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") {
          continue;
        }
        try {
          onEvent(JSON.parse(raw));
        } catch {
          // ignore malformed SSE payloads
        }
      }
    }

    if (done) {
      break;
    }
  }
}
