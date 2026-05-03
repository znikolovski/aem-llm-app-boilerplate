import { useCallback, useRef, useState } from "react";
import brand from "../brand.json";
import { useExperienceSessions } from "../context/ExperienceSessionsContext.jsx";
import { toolRouteByName } from "../lib/toolRouting.js";
import { chatStream } from "../services/api.js";

function resolveSessionId(item, outputIndex, idByOutputIndex) {
  if (item?.call_id && String(item.call_id).trim()) {
    return String(item.call_id).trim();
  }
  const key = `o:${outputIndex}`;
  if (!idByOutputIndex.current[key]) {
    idByOutputIndex.current[key] =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random()}`;
  }
  return idByOutputIndex.current[key];
}

function parseFunctionCallArgs(item) {
  const raw = typeof item.arguments === "string" ? item.arguments : "";
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function Chat() {
  const { beginSession, setSessionParams } = useExperienceSessions();
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const streamBuf = useRef("");
  const idByOutputIndex = useRef({});

  const handleEvent = useCallback(
    (event) => {
      if (!event || typeof event !== "object") {
        return;
      }

      if (event.type === "response.output_text.delta") {
        const piece = typeof event.delta === "string" ? event.delta : "";
        streamBuf.current += piece;
        setStreamingText(streamBuf.current);
        return;
      }

      if (event.type === "response.output_item.added") {
        const item = event.item;
        if (item?.type === "function_call" && toolRouteByName(brand.toolRoutes, item.name)) {
          const id = resolveSessionId(item, event.output_index, idByOutputIndex);
          beginSession(id, item.name);
        }
        return;
      }

      if (event.type === "response.output_item.done") {
        const item = event.item;
        if (item?.type === "function_call" && toolRouteByName(brand.toolRoutes, item.name)) {
          const id = resolveSessionId(item, event.output_index, idByOutputIndex);
          const params = parseFunctionCallArgs(item);
          setSessionParams(id, item.name, params);
        }
        return;
      }

      if (event.type === "response.output_tool_call") {
        const name = typeof event.name === "string" ? event.name : "";
        if (name && toolRouteByName(brand.toolRoutes, name)) {
          const id = resolveSessionId({ call_id: event.call_id }, event.output_index ?? 0, idByOutputIndex);
          beginSession(id, name);
        }
        return;
      }

      if (event.type === "response.completed") {
        const output = event.response?.output;
        if (!Array.isArray(output)) {
          return;
        }
        for (const item of output) {
          if (item?.type !== "function_call" || !toolRouteByName(brand.toolRoutes, item.name)) {
            continue;
          }
          const id = item.call_id && String(item.call_id).trim() ? String(item.call_id).trim() : null;
          if (!id) {
            continue;
          }
          const params = parseFunctionCallArgs(item);
          setSessionParams(id, item.name, params);
        }
        return;
      }

      if (event.type === "stream.error") {
        setError(event.error || "Stream error.");
      }
    },
    [beginSession, setSessionParams]
  );

  async function onSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) {
      return;
    }

    setError("");
    setDraft("");
    setBusy(true);
    idByOutputIndex.current = {};
    setTurns((t) => [...t, { role: "user", text }]);
    streamBuf.current = "";
    setStreamingText("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await chatStream(text, { signal: ac.signal, onEvent: handleEvent });
      const finalText = streamBuf.current;
      setStreamingText("");
      setTurns((t) => [...t, { role: "assistant", text: finalText }]);
    } catch (err) {
      if (err.name === "AbortError") {
        setTurns((t) => [...t, { role: "assistant", text: "(Cancelled.)" }]);
      } else {
        setError(err instanceof Error ? err.message : "Request failed.");
      }
    } finally {
      streamBuf.current = "";
      setStreamingText("");
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onStop() {
    abortRef.current?.abort();
  }

  return (
    <section className="chat-wrap">
      <div className="split-pane-title">
        <span className="kicker">Chat</span>
        <span className="muted" style={{ fontSize: 13 }}>
          Stream + tool calls
        </span>
      </div>
      <div className="messages">
        {turns.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "user" : ""}`}>
            {m.text}
          </div>
        ))}
        {streamingText ? <div className="bubble">{streamingText}</div> : null}
      </div>
      {error ? <div className="err">{error}</div> : null}
      <form className="chat-form" onSubmit={onSubmit}>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Try: Find hotels in Fiji. Or: Spotlight our summer campaign for families."
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
