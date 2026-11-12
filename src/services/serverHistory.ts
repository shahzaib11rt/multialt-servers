import { invoke } from "@tauri-apps/api/core";
import type { SessionRecord } from "../types";

/**
 * Histórico de servidores (Job IDs) do MultiAlt Servers.
 *
 * Fonte dos jogos/horários: `get_session_history` (o que o app já grava, por
 * conta). Aqui só ficam, no próprio app (localStorage), as coisas que o
 * histórico não guarda: região de cada Job ID, nota/estrela e o "limpar".
 */

export interface HistoryEntry {
  userId: number;
  placeId: number;
  jobId: string;
  startedAt: number;
  endedAt: number | null;
}

export interface JobSummary {
  jobId: string;
  placeId: number;
  /** Quantas vezes entrou neste servidor. */
  times: number;
  firstAt: number;
  lastAt: number;
  /** Tempo total jogado neste servidor, em ms. */
  totalMs: number;
  userIds: number[];
}

export interface JobMeta {
  note?: string;
  fav?: boolean;
}

const KEY_REGIONS = "msv_regions";
const KEY_META = "msv_meta";
const KEY_CLEARED = "msv_cleared_at";
const CHANGED_EVENT = "msv-changed";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage cheio ou bloqueado: a tela segue sem guardar.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export const SERVER_HISTORY_CHANGED_EVENT = CHANGED_EVENT;

export function loadRegions(): Record<string, string> {
  return readJson<Record<string, string>>(KEY_REGIONS, {});
}

/** Guarda a região de um Job ID (só se mudou). */
export function recordRegion(jobId: string, region: string) {
  if (!jobId || !region) return;
  const all = loadRegions();
  if (all[jobId] === region) return;
  all[jobId] = region;
  writeJson(KEY_REGIONS, all);
}

export function loadMeta(): Record<string, JobMeta> {
  return readJson<Record<string, JobMeta>>(KEY_META, {});
}

export function updateMeta(jobId: string, patch: JobMeta) {
  const all = loadMeta();
  const next: JobMeta = { ...all[jobId], ...patch };
  if (!next.note) delete next.note;
  if (!next.fav) delete next.fav;
  if (Object.keys(next).length === 0) delete all[jobId];
  else all[jobId] = next;
  writeJson(KEY_META, all);
}

export function getClearedAt(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY_CLEARED));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * "Limpar histórico": esconde tudo o que veio antes de agora e apaga regiões,
 * notas e estrelas. Não mexe nos arquivos de histórico do app (a página
 * Session/Account history continua com os dados dela).
 */
export function clearServerHistory() {
  try {
    window.localStorage.setItem(KEY_CLEARED, String(Date.now()));
    window.localStorage.removeItem(KEY_REGIONS);
    window.localStorage.removeItem(KEY_META);
  } catch {
    // Sem storage não há o que limpar.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Link que abre aquele servidor exato (placeId + Job ID). */
export function joinLink(placeId: number, jobId: string): string {
  return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${encodeURIComponent(jobId)}`;
}

export async function loadHistory(userIds: number[]): Promise<HistoryEntry[]> {
  const clearedAt = getClearedAt();
  const lists = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const list = await invoke<SessionRecord[]>("get_session_history", { userId });
        return (Array.isArray(list) ? list : []).map((s) => ({ userId, s }));
      } catch {
        return [];
      }
    })
  );
  const out: HistoryEntry[] = [];
  for (const { userId, s } of lists.flat()) {
    if (!s.jobId || !s.placeId) continue;
    if (s.startedAt <= clearedAt) continue;
    out.push({ userId, placeId: s.placeId, jobId: s.jobId, startedAt: s.startedAt, endedAt: s.endedAt });
  }
  return out;
}

/** Junta as entradas por Job ID: vezes jogadas, último acesso e tempo. */
export function groupByJob(entries: HistoryEntry[], now = Date.now()): JobSummary[] {
  const map = new Map<string, JobSummary>();
  for (const e of entries) {
    const end = e.endedAt ?? now;
    const ms = Math.max(0, end - e.startedAt);
    const cur = map.get(e.jobId);
    if (!cur) {
      map.set(e.jobId, {
        jobId: e.jobId,
        placeId: e.placeId,
        times: 1,
        firstAt: e.startedAt,
        lastAt: e.startedAt,
        totalMs: ms,
        userIds: [e.userId],
      });
    } else {
      cur.times += 1;
      cur.firstAt = Math.min(cur.firstAt, e.startedAt);
      cur.lastAt = Math.max(cur.lastAt, e.startedAt);
      cur.totalMs += ms;
      if (!cur.userIds.includes(e.userId)) cur.userIds.push(e.userId);
    }
  }
  return [...map.values()];
}

export function sortJobs(list: JobSummary[], order: "recent" | "oldest"): JobSummary[] {
  const dir = order === "recent" ? -1 : 1;
  return [...list].sort((a, b) => dir * (a.lastAt - b.lastAt));
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "<1m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function shortJob(jobId: string): string {
  return jobId.length <= 26 ? jobId : `${jobId.slice(0, 12)}…${jobId.slice(-10)}`;
}

export type AliveState = "alive" | "gone" | "unknown";

/**
 * O servidor ainda existe? Procura o Job ID na lista pública do jogo (até
 * `MAX_PAGES` páginas). Servidor privado/VIP não aparece nessa lista, então
 * quando não acha, diz "gone" só para servidor público; o chamador mostra
 * "não encontrado" (não é garantia).
 */
export async function checkServerAlive(
  placeId: number,
  jobId: string,
  userId: number | null
): Promise<AliveState> {
  const MAX_PAGES = 15;
  let cursor: string | null = null;
  try {
    for (let i = 0; i < MAX_PAGES; i++) {
      const page: { data: { id: string }[]; nextPageCursor: string | null } = await invoke("get_servers", {
        placeId,
        serverType: "Public",
        cursor,
        userId,
      });
      if (page.data.some((s) => s.id === jobId)) return "alive";
      if (!page.nextPageCursor) return "gone";
      cursor = page.nextPageCursor;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}
