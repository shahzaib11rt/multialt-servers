import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  SERVER_HISTORY_CHANGED_EVENT,
  groupByJob,
  loadHistory,
  loadMeta,
  loadRegions,
  type HistoryEntry,
  type JobMeta,
  type JobSummary,
} from "../services/serverHistory";

/**
 * Histórico de servidores das contas dadas, já agrupado por Job ID. Relê
 * quando o backend grava uma sessão (`session-history-changed`) e quando a
 * região/nota/limpeza muda aqui (`msv-changed`).
 */
export function useServerHistory(userIds: number[], enabled = true) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [regions, setRegions] = useState<Record<string, string>>(loadRegions);
  const [meta, setMeta] = useState<Record<string, JobMeta>>(loadMeta);
  const idsKey = userIds.join(",");

  const reload = useCallback(() => {
    setRegions(loadRegions());
    setMeta(loadMeta());
    if (!enabled) return;
    void loadHistory(idsKey ? idsKey.split(",").map(Number) : []).then(setEntries);
  }, [idsKey, enabled]);

  useEffect(() => {
    reload();
    const unlisten = listen("session-history-changed", reload);
    window.addEventListener(SERVER_HISTORY_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener(SERVER_HISTORY_CHANGED_EVENT, reload);
      void unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [reload]);

  const jobs: JobSummary[] = useMemo(() => groupByJob(entries), [entries]);
  return { entries, jobs, regions, meta, reload };
}
