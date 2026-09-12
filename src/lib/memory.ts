// Browser-local memory for the concierge: the running transcript plus durable
// facts the agent has learned about this person. Nothing leaves the device
// except as prompt context on the next turn.

export type StoredMsg = { id: number; role: "you" | "concierge"; text: string };

const MSG_KEY = "ec.transcript.v1";
const MEM_KEY = "ec.memory.v1";
const MAX_MSGS = 30;
export const MAX_MEMORY = 25;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — memory is best-effort */
  }
}

export const loadMessages = () => read<StoredMsg[]>(MSG_KEY, []);
export const saveMessages = (msgs: StoredMsg[]) => write(MSG_KEY, msgs.slice(-MAX_MSGS));

export const loadMemory = () => read<string[]>(MEM_KEY, []);
export const saveMemory = (facts: string[]) => write(MEM_KEY, facts.slice(-MAX_MEMORY));

/** Merge newly learned facts, case-insensitively de-duplicated, newest last. */
export function mergeMemory(existing: string[], learned: string[]): string[] {
  const out = [...existing];
  for (const raw of learned) {
    const fact = raw.trim().replace(/\s+/g, " ");
    if (!fact || fact.length > 160) continue;
    const dupe = out.findIndex((f) => f.toLowerCase() === fact.toLowerCase());
    if (dupe >= 0) out.splice(dupe, 1);
    out.push(fact);
  }
  return out.slice(-MAX_MEMORY);
}

export function forgetAll() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MSG_KEY);
    window.localStorage.removeItem(MEM_KEY);
  } catch {
    /* ignore */
  }
}
