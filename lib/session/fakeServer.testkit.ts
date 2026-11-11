/**
 * In-memory stand-in for the Supabase RPC surface, for controller tests only.
 * Never imported by app code. Every call is logged in order so a test can
 * compare the whole conversation with the database as one string.
 */

type Row = {
  id: string;
  status: string;
  version: number;
  current_state: unknown;
  distance_mm_requested: number | null;
};

export type FakeServer = {
  calls: [string, unknown][];
  sessions: Map<string, Row>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown; status: number }>;
  /** Writes a session row directly, as the other device would. */
  write: (sessionId: string, status: string, currentState: unknown) => void;
};

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function createFakeServer(): FakeServer {
  const calls: [string, unknown][] = [];
  const sessions = new Map<string, Row>();
  let counter = 0;
  const next = (): string => {
    counter += 1;
    return uuid(counter);
  };
  const ok = (data: unknown) => Promise.resolve({ data, error: null, status: 200 });
  const fail = (code: string) => Promise.resolve({ data: null, error: { code, message: code }, status: 400 });

  const view = (row: Row) => ({
    id: row.id,
    status: row.status,
    version: row.version,
    current_state: row.current_state,
    distance_mm_requested: row.distance_mm_requested,
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
  });

  return {
    calls,
    sessions,
    write(sessionId, status, currentState) {
      const row = sessions.get(sessionId);
      if (row === undefined) {
        throw new Error(`no session ${sessionId}`);
      }
      row.status = status;
      row.current_state = currentState;
      row.version += 1;
    },
    rpc(name, args) {
      calls.push([name, JSON.parse(JSON.stringify(args)) as unknown]);
      const sessionId = args.p_session_id as string | undefined;
      const row = sessionId === undefined ? undefined : sessions.get(sessionId);
      switch (name) {
        case "vcp_create_session": {
          const id = next();
          sessions.set(id, {
            id,
            status: "created",
            version: 1,
            current_state: {},
            distance_mm_requested: args.p_distance_mm_requested as number,
          });
          return ok(id);
        }
        case "vcp_get_session":
          return row === undefined ? fail("V0001") : ok(view(row));
        case "vcp_get_answered_trials":
          return ok([]);
        case "vcp_pair_session":
        case "vcp_set_session_state": {
          if (row === undefined) {
            return fail("V0001");
          }
          if (args.p_expected_version !== row.version) {
            return fail("V0002");
          }
          row.status = name === "vcp_pair_session" ? "paired" : (args.p_status as string);
          if (name === "vcp_set_session_state") {
            row.current_state = args.p_current_state;
          }
          row.version += 1;
          return ok({ status: row.status, version: row.version });
        }
        case "vcp_submit_response":
          return ok({
            id: next(),
            response_kind: args.p_response_kind,
            response_letter: args.p_response_letter,
            duplicate: false,
          });
        case "vcp_record_distance_readings":
          return ok((args.p_readings as unknown[]).length);
        default:
          return ok(next());
      }
    },
  };
}

/** Minimal browser globals for a controller running under node. */
export function installBrowserGlobals(search: string, pathname: string): {
  storage: Map<string, string>;
  documentListeners: Map<string, Set<() => void>>;
  setVisibility: (state: "visible" | "hidden") => void;
  replacedTo: string[];
} {
  const storage = new Map<string, string>();
  const documentListeners = new Map<string, Set<() => void>>();
  const replacedTo: string[] = [];
  let visibility: "visible" | "hidden" = "visible";
  const location = {
    search,
    pathname,
    origin: "https://vision.example",
    replace: (url: string) => {
      replacedTo.push(url);
    },
  };
  const history = {
    state: null as unknown,
    pushState: (_state: unknown, _title: string, url: string) => {
      const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
      location.search = query;
    },
    replaceState: (_state: unknown, _title: string, url: string) => {
      const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
      location.search = query;
    },
  };
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
  const g = globalThis as Record<string, unknown>;
  g.window = {
    location,
    history,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    isSecureContext: true,
  };
  g.document = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (type: string, listener: () => void) => {
      const set = documentListeners.get(type) ?? new Set();
      set.add(listener);
      documentListeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => {
      documentListeners.get(type)?.delete(listener);
    },
  };
  g.sessionStorage = store;
  g.localStorage = store;
  return {
    storage,
    documentListeners,
    replacedTo,
    setVisibility: (state) => {
      visibility = state;
    },
  };
}

/** Deterministic Math.random: a fixed linear congruential sequence. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
