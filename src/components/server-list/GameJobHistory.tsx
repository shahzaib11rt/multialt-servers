import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { useServerHistory } from "../../hooks/useServerHistory";
import { copyText } from "../python/copyText";
import { RowMenu, type RowMenuItem } from "../servers/RowMenu";
import { formatDuration, joinLink, shortJob, sortJobs } from "../../services/serverHistory";

/**
 * Lado direito da aba Recent: ao clicar num jogo à esquerda, mostra os Job IDs
 * em que se jogou aquele jogo (vezes, tempo, região), do mais novo ao mais
 * velho ou o contrário. Clique direito copia o Job ID ou o link.
 */
export function GameJobHistory({
  placeId,
  onSelectJob,
}: {
  placeId: number | null;
  onSelectJob: (placeId: number | null, raw: string) => void;
}) {
  const t = useTr();
  const store = useStore();
  const userIds = useMemo(() => store.accounts.map((a) => a.UserID), [store.accounts]);
  const { jobs, regions, meta } = useServerHistory(userIds);
  const [order, setOrder] = useState<"recent" | "oldest">("recent");
  const [menu, setMenu] = useState<{ x: number; y: number; items: RowMenuItem[] } | null>(null);

  if (placeId === null) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center">
        <p className="text-xs text-zinc-600">{t("Click a game to see the servers you played in it.")}</p>
      </div>
    );
  }

  const list = sortJobs(
    jobs.filter((j) => j.placeId === placeId),
    order
  );
  const totalMs = list.reduce((sum, j) => sum + j.totalMs, 0);

  function ago(ts: number) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return t("{{count}}d ago", { count: days });
    if (hours > 0) return t("{{count}}h ago", { count: hours });
    if (mins > 0) return t("{{count}}m ago", { count: mins });
    return t("just now");
  }

  async function copy(text: string) {
    if (await copyText(text)) store.addToast(t("Copied"));
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-[11px] text-zinc-500">
          {t("{{count}} servers · {{time}} played", { count: list.length, time: formatDuration(totalMs) })}
        </span>
        <select
          value={order}
          onChange={(e) => setOrder(e.target.value as "recent" | "oldest")}
          className="rounded border border-zinc-700/60 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none"
          aria-label={t("Sort")}
        >
          <option value="recent">{t("Recent")}</option>
          <option value="oldest">{t("Oldest")}</option>
        </select>
      </div>

      {list.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-zinc-700">{t("No servers in the history yet.")}</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-1 px-1">
            {list.map((job) => {
              const region = regions[job.jobId];
              const note = meta[job.jobId]?.note;
              return (
                <button
                  key={job.jobId}
                  type="button"
                  title={job.jobId}
                  onClick={() => onSelectJob(job.placeId, job.jobId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const items: RowMenuItem[] = [
                      { label: t("Copy Job ID"), onClick: () => void copy(job.jobId) },
                      { label: t("Copy server link"), onClick: () => void copy(joinLink(job.placeId, job.jobId)) },
                    ];
                    if (region) items.push({ label: t("Copy region"), onClick: () => void copy(region) });
                    setMenu({ x: e.clientX, y: e.clientY, items });
                  }}
                  className="flex flex-col gap-0.5 rounded-lg p-2 text-left hover:bg-zinc-800/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-200">
                      {meta[job.jobId]?.fav ? "★ " : ""}
                      {shortJob(job.jobId)}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-600">{ago(job.lastAt)}</span>
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {[
                      region ?? t("Unknown region"),
                      t("Played {{count}}x", { count: job.times }),
                      t("Time: {{time}}", { time: formatDuration(job.totalMs) }),
                    ].join(" · ")}
                  </span>
                  {note ? <span className="text-[11px] text-zinc-400 truncate">{note}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {menu ? <RowMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
