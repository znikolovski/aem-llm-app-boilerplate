/**
 * ChatGPT Apps / MCP Apps — tool / view bridge from the embedded SPA (see OpenAI Apps SDK).
 *
 * - `window.openai.callTool(…)` runs a tool in the host when available; otherwise JSON-RPC `tools/call`.
 * - Recommend → spotlight: same `topic` the REST `spotlight` action expects.
 *
 * @see https://developers.openai.com/apps-sdk/reference (`window.openai`)
 */

let rpcSeq = 0;
/** @type {Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>} */
const pending = new Map();

let messageListenerAttached = false;

/** @type {Promise<void> | null} */
let initPromise = null;

const MCP_APP_INFO = { name: "aem-llm-app-boilerplate", version: "0.1.0" };

export function isEmbeddedInChatHost() {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

function getOpenAiGlobals() {
  try {
    return typeof window !== "undefined" ? window.openai : undefined;
  } catch {
    return undefined;
  }
}

function attachParentMessageListener() {
  if (messageListenerAttached) {
    return;
  }
  messageListenerAttached = true;
  window.addEventListener(
    "message",
    (event) => {
      if (event.source !== window.parent) {
        return;
      }
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0") {
        return;
      }
      if (typeof msg.id !== "number") {
        return;
      }
      const slot = pending.get(msg.id);
      if (!slot) {
        return;
      }
      pending.delete(msg.id);
      clearTimeout(slot.timer);
      if (msg.error) {
        slot.reject(msg.error);
      } else {
        slot.resolve(msg.result);
      }
    },
    { passive: true }
  );
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {number} timeoutMs
 */
function rpcRequest(method, params, timeoutMs = 12_000) {
  attachParentMessageListener();
  const id = ++rpcSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP Apps RPC timeout (${method})`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}

function rpcNotify(method, params) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

async function ensureUiInitialized() {
  if (!isEmbeddedInChatHost()) {
    throw new Error("Not embedded");
  }
  if (!initPromise) {
    initPromise = rpcRequest("ui/initialize", {
      appInfo: MCP_APP_INFO,
      appCapabilities: {},
      protocolVersion: "2026-01-26"
    })
      .then(() => {
        rpcNotify("ui/notifications/initialized", {});
      })
      .catch((e) => {
        initPromise = null;
        throw e;
      });
  }
  return initPromise;
}

/**
 * Start MCP Apps handshake early so the first button click does not wait on `ui/initialize`.
 */
export function warmupMcpAppsBridge() {
  if (!isEmbeddedInChatHost()) {
    return;
  }
  attachParentMessageListener();
  ensureUiInitialized().catch(() => {});
}

/**
 * Invoke MCP tool from embedded UI.
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
export async function hostInvokeTool(name, args) {
  const openai = getOpenAiGlobals();
  if (typeof openai?.callTool === "function") {
    try {
      return await withTimeout(
        Promise.resolve(openai.callTool(name, args)),
        12_000,
        `openai.callTool(${name})`
      );
    } catch {
      /* fall through */
    }
  }
  attachParentMessageListener();
  await ensureUiInitialized();
  return rpcRequest("tools/call", { name, arguments: args }, 15_000);
}

/**
 * Recommend → spotlight (“See details”): prefer host `callTool`, then SPA navigation to `POST /spotlight`.
 * @param {string} topic
 * @param {() => void} navigateFallback
 */
export function invokeSpotlightFromRecommendOrNavigate(topic, navigateFallback) {
  const t = typeof topic === "string" ? topic.trim() : "";
  if (!t) {
    navigateFallback();
    return;
  }

  if (isEmbeddedInChatHost()) {
    const openai = getOpenAiGlobals();
    if (typeof openai?.callTool === "function") {
      void (async () => {
        try {
          await withTimeout(
            Promise.resolve(openai.callTool("spotlight", { topic: t })),
            12_000,
            "openai.callTool(spotlight)"
          );
        } catch (err) {
          console.warn(
            "[LLM app] openai.callTool(spotlight) failed; SPA route still loads spotlight via web action.",
            err
          );
        }
      })();
    } else {
      void (async () => {
        try {
          await withTimeout(hostInvokeTool("spotlight", { topic: t }), 28_000, "MCP tools/call(spotlight)");
        } catch (err) {
          console.warn("[LLM app] MCP tools/call(spotlight) failed; SPA route still loads spotlight.", err);
        }
      })();
    }
  }

  navigateFallback();
}
