import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import brand from "../brand.json";
import { chatStream } from "../services/api.js";

function parseRecommendArgs(argumentsStr) {
  if (typeof argumentsStr !== "string" || !argumentsStr.trim()) {
    return null;
  }
  try {
    const args = JSON.parse(argumentsStr);
    if (args && typeof args.location === "string" && args.location.trim()) {
      return args.location.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function extractRecommendLocation(output) {
  if (!Array.isArray(output)) {
    return null;
  }
  for (const item of output) {
    if (item && item.type === "function_call" && item.name === "recommend") {
      const loc = parseRecommendArgs(typeof item.arguments === "string" ? item.arguments : "");
      if (loc) {
        return loc;
      }
    }
  }
  return null;
}

export function Chat() {
  const navigate = useNavigate();
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const streamBuf = useRef("");

  const recommendPath = brand.toolRoutes?.recommend || "/recommendation";

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
        if (item?.type === "function_call" && item.name === "recommend") {
          navigate(recommendPath, { state: { phase: "skeleton" } });
        }
        return;
      }

      if (event.type === "response.output_item.done") {
        const item = event.item;
        if (item?.type === "function_call" && item.name === "recommend") {
          const loc = parseRecommendArgs(typeof item.arguments === "string" ? item.arguments : "");
          if (loc) {
            navigate(recommendPath, { replace: true, state: { phase: "ready", location: loc } });
          }
        }
        return;
      }

      if (event.type === "response.output_tool_call") {
        if (event.name === "recommend") {
          navigate(recommendPath, { state: { phase: "skeleton" } });
        }
        return;
      }

      if (event.type === "response.completed") {
        const loc = extractRecommendLocation(event.response?.output);
        if (loc) {
          navigate(recommendPath, { replace: true, state: { phase: "ready", location: loc } });
        }
        return;
      }

      if (event.type === "stream.error") {
        setError(event.error || "Stream error.");
      }
    },
    [navigate, recommendPath]
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
      <div className="kicker">Chat</div>
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
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Try: Find hotels in Fiji"
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
