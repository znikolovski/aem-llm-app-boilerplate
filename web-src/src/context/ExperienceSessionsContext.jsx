import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import brand from "../brand.json";
import { listToolRoutes, toolRouteByName } from "../lib/toolRouting.js";

const Ctx = createContext(null);

const initial = { sessions: [] };

function reducer(state, action) {
  switch (action.type) {
    case "begin": {
      const { id, tool } = action;
      if (!id || !tool || !toolRouteByName(brand.toolRoutes, tool)) {
        return state;
      }
      if (state.sessions.some((s) => s.id === id)) {
        return state;
      }
      return {
        sessions: [...state.sessions, { id, tool, phase: "skeleton", params: null, blocks: null, error: null }]
      };
    }
    case "args": {
      const { id, tool, params, error: argError } = action;
      if (argError) {
        return {
          sessions: state.sessions.map((s) => {
            if (id && s.id === id) {
              return { ...s, phase: "error", error: argError, params: null };
            }
            if (!id && tool && s.tool === tool && s.phase === "skeleton") {
              return { ...s, phase: "error", error: argError, params: null };
            }
            return s;
          })
        };
      }
      if (!params) {
        const msg = "Could not parse tool arguments.";
        return {
          sessions: state.sessions.map((s) => {
            if (id && s.id === id) {
              return { ...s, phase: "error", error: msg };
            }
            if (!id && tool && s.tool === tool && s.phase === "skeleton") {
              return { ...s, phase: "error", error: msg };
            }
            return s;
          })
        };
      }
      return {
        sessions: state.sessions.map((s) => {
          if (id && s.id === id) {
            return { ...s, tool: tool || s.tool, params, phase: "fetching" };
          }
          if (!id && tool && s.tool === tool && s.phase === "skeleton") {
            return { ...s, params, phase: "fetching" };
          }
          return s;
        })
      };
    }
    case "result": {
      const { id, blocks, error } = action;
      return {
        sessions: state.sessions.map((s) => {
          if (s.id !== id) {
            return s;
          }
          if (error) {
            return { ...s, phase: "error", error, blocks: null };
          }
          return { ...s, phase: "ready", blocks: blocks || [], error: null };
        })
      };
    }
    case "dismiss": {
      return { sessions: state.sessions.filter((s) => s.id !== action.id) };
    }
    case "clear": {
      return initial;
    }
    default:
      return state;
  }
}

export function ExperienceSessionsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const beginSession = useCallback((id, tool) => {
    dispatch({ type: "begin", id, tool });
  }, []);

  const setSessionParams = useCallback((id, tool, params, error) => {
    dispatch({ type: "args", id: id || null, tool, params, error });
  }, []);

  const setSessionResult = useCallback((id, blocks, error) => {
    dispatch({ type: "result", id, blocks, error });
  }, []);

  const dismiss = useCallback((id) => {
    dispatch({ type: "dismiss", id });
  }, []);

  const value = useMemo(
    () => ({
      sessions: state.sessions,
      beginSession,
      setSessionParams,
      setSessionResult,
      dismiss,
      toolRoutes: listToolRoutes(brand.toolRoutes)
    }),
    [state.sessions, beginSession, setSessionParams, setSessionResult, dismiss]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExperienceSessions() {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useExperienceSessions must be used within ExperienceSessionsProvider");
  }
  return v;
}
