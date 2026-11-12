import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Star } from "lucide-react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { useCurrentSessions } from "../../hooks/useCurrentSessions";
import { useGameIdentity, loadGameIdentity } from "../../hooks/useGameIdentity";
import { useServerHistory } from "../../hooks/useServerHistory";
import { useConfirm } from "../../hooks/usePrompt";
import { useJoinOnlineWarning } from "../../hooks/useJoinOnlineWarning";
import { accountLabel } from "../../utils/accountName";
import { isWindowsPlatform } from "../../utils/platform";
import { copyText } from "../python/copyText";
import { RowMenu, type RowMenuItem } from "../servers/RowMenu";
import {
  checkServerAlive,
  clearServerHistory,
  formatDuration,
  joinLink,
  shortJob,
  sortJobs,
  updateMeta,
  type AliveState,
  type JobSummary,
} from "../../services/serverHistory";
import type { CurrentSession } from "../../types";
import { PageShell } from "./PageShell";

interface MenuState {
  x: number;
  y: number;
  items: RowMenuItem[];
}

function useAgo() {
  const t = useTr();
  return (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return t("{{count}}d ago", { count: days });
    if (hours > 0) return t("{{count}}h ago", { count: hours });
    if (mins > 0) return t("{{count}}m ago", { count: mins });
    return t("just now");
  };
}

/** Agora: cada conta que está num jogo, com região e Job ID inteiro. */
function NowRow({ session, onMenu }: { session: CurrentSession; onMenu: (m: MenuState) => void }) {
  const t = useTr();
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const identity = useGameIdentity(session.placeId, session.userId);
  const game = identity?.name ?? t("Place {{placeId}}", { placeId: session.placeId });
  const account = store.accounts.find((a) => a.UserID === session.userId);
  const name = accountLabel(account, store, session.userId);
  const region = store.clientHealth.get(session.userId)?.server?.region ?? null;
  const jobId = session.jobId;

  async function copy(text: string, toast = true) {
    if (await copyText(text)) {
      if (toast) store.addToast(t("Copied"));
      return true;
    }
    return false;
  }

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    if (!jobId) return;
    const items: RowMenuItem[] = [
      { label: t("Copy Job ID"), onClick: () => void copy(jobId) },
      { label: t("Copy server link"), onClick: () => void copy(joinLink(session.placeId, jobId)) },
    ];
    if (region) items.push({ label: t("Copy region"), onClick: () => void copy(region) });
    onMenu({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <li
      data-testid={`servers-row-${session.userId}`}
      onContextMenu={openMenu}
      className="rounded-lg border theme-border bg-[var(--panel-soft)] px-4 py-3 flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
        <span className="font-medium text-[var(--panel-fg)]">{name}</span>
        <span aria-hidden="true" className="text-[var(--panel-muted)]">·</span>
        <span className="text-[var(--panel-muted)] truncate" title={game}>
          {game}
        </span>
      </div>
      <div className="text-[13px] text-[var(--panel-fg)]">
        <span className="text-[var(--panel-muted)]">{t("Server")}: </span>
        {region ?? t("Unknown region")}
      </div>
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="text-[var(--panel-muted)] shrink-0">{t("JobId")} =</span>
        {jobId ? (
          <>
            <span className="font-mono select-all break-all text-[var(--panel-fg)]">{jobId}</span>
            <button
              type="button"
              onClick={() => {
                void copy(jobId, false).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
              aria-label={t("Copy JobId")}
              className="shrink-0 rounded p-1 text-[var(--panel-muted)] hover:text-[var(--panel-fg)] hover:bg-[var(--row-hover)] transition-colors"
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            </button>
          </>
        ) : (
          <span className="text-[var(--panel-muted)]">{t("Not known yet")}</span>
        )}
      </div>
    </li>
  );
}

function aliveText(state: AliveState | "checking" | undefined, t: ReturnType<typeof useTr>): string | null {
  if (!state) return null;
  if (state === "checking") return t("Checking…");
  if (state === "alive") return t("Still open");
  if (state === "gone") return t("Not found (probably closed)");
  return t("Could not check");
}

function HistoryRow({
  job,
  gameName,
  region,
  note,
  fav,
  alive,
  accountNames,
  onMenu,
  onToggleFav,
  onRejoin,
}: {
  job: JobSummary;
  gameName: string;
  region: string | undefined;
  note: string | undefined;
  fav: boolean;
  alive: AliveState | "checking" | undefined;
  accountNames: string[];
  onMenu: (e: React.MouseEvent) => void;
  onToggleFav: () => void;
  onRejoin: () => void;
}) {
  const t = useTr();
  const ago = useAgo();
  const aliveLabel = aliveText(alive, t);
  return (
    <li
      data-testid={`servers-history-${job.jobId}`}
      onContextMenu={onMenu}
      className="rounded-lg border theme-border bg-[var(--panel-soft)] px-4 py-2.5 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-medium text-[var(--panel-fg)] truncate" title={gameName}>
          {gameName}
        </span>
        <span aria-hidden="true" className="text-[var(--panel-muted)]">·</span>
        <span className="text-[var(--panel-muted)] shrink-0">{region ?? t("Unknown region")}</span>
        <span className="ml-auto text-[12px] text-[var(--panel-muted)] shrink-0">{ago(job.lastAt)}</span>
        <button
          type="button"
          onClick={onToggleFav}
          aria-label={fav ? t("Remove from favorites") : t("Add to favorites")}
          className={`shrink-0 rounded p-1 hover:bg-[var(--row-hover)] ${fav ? "text-amber-400" : "text-[var(--panel-muted)]"}`}
        >
          <Star size={14} fill={fav ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRejoin}
          className="shrink-0 rounded px-2 py-0.5 text-[12px] border theme-border text-[var(--panel-fg)] hover:bg-[var(--row-hover)]"
        >
          {t("Rejoin")}
        </button>
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-[var(--panel-muted)] shrink-0">{t("JobId")} =</span>
        <span className="font-mono select-all text-[var(--panel-fg)] truncate" title={job.jobId}>
          {shortJob(job.jobId)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--panel-muted)]">
        <span>{t("Played {{count}}x", { count: job.times })}</span>
        <span>{t("Time: {{time}}", { time: formatDuration(job.totalMs) })}</span>
        {accountNames.length > 0 ? <span>{accountNames.join(", ")}</span> : null}
        {aliveLabel ? <span>{aliveLabel}</span> : null}
      </div>
      {note ? <div className="text-[12px] text-[var(--panel-fg)]">{note}</div> : null}
    </li>
  );
}

export function ServersPage({ active, onLeave }: { active: boolean; onLeave: () => void }) {
  const t = useTr();
  const store = useStore();
  const confirm = useConfirm();
  const confirmJoinOnline = useJoinOnlineWarning();
  const isWindows = isWindowsPlatform(store.platformCapabilities);
  const runningKey = Array.from(store.launchedByProgram).join(",");
  const sessions = useCurrentSessions(active && isWindows, runningKey);
  const userIds = useMemo(() => store.accounts.map((a) => a.UserID), [store.accounts]);
  const { jobs, regions, meta } = useServerHistory(userIds, active && isWindows);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [order, setOrder] = useState<"recent" | "oldest">("recent");
  const [favOnly, setFavOnly] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [alive, setAlive] = useState<Record<string, AliveState | "checking">>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  // Nome dos jogos do histórico (cache compartilhado com o resto do app).
  const placeKey = useMemo(() => [...new Set(jobs.map((j) => j.placeId))].sort().join(","), [jobs]);
  useEffect(() => {
    if (!active || !placeKey) return;
    let live = true;
    for (const id of placeKey.split(",").map(Number)) {
      void loadGameIdentity(id, userIds[0] ?? null).then((g) => {
        if (live && g.name) setNames((prev) => (prev[id] === g.name ? prev : { ...prev, [id]: g.name as string }));
      });
    }
    return () => {
      live = false;
    };
  }, [active, placeKey, userIds]);

  if (!active) return null;

  const nameOf = (placeId: number) => names[placeId] ?? t("Place {{placeId}}", { placeId });
  const accountName = (userId: number) =>
    accountLabel(store.accounts.find((a) => a.UserID === userId), store, userId);

  const regionOptions = [...new Set(Object.values(regions))].sort();
  const q = search.trim().toLowerCase();
  const shown = sortJobs(
    jobs.filter((j) => {
      if (favOnly && !meta[j.jobId]?.fav) return false;
      if (regionFilter && regions[j.jobId] !== regionFilter) return false;
      if (!q) return true;
      const hay = [nameOf(j.placeId), String(j.placeId), j.jobId, regions[j.jobId] ?? "", meta[j.jobId]?.note ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    }),
    order
  );
  // Favoritos primeiro, dentro da mesma ordem.
  shown.sort((a, b) => Number(!!meta[b.jobId]?.fav) - Number(!!meta[a.jobId]?.fav));

  const totalMs = jobs.reduce((sum, j) => sum + j.totalMs, 0);

  async function copy(text: string) {
    if (await copyText(text)) store.addToast(t("Copied"));
  }

  async function rejoin(job: JobSummary) {
    const userId =
      job.userIds.find((id) => userIds.includes(id)) ?? store.selectedAccount?.UserID ?? userIds[0] ?? null;
    if (userId === null) {
      store.addToast(t("No account selected"));
      return;
    }
    if (!(await confirmJoinOnline([userId]))) return;
    const attempt = await store.joinServer(userId, { placeId: String(job.placeId), jobId: job.jobId });
    if (attempt === "failed") store.addToast(t("Could not join this server again"), "error");
  }

  async function check(job: JobSummary) {
    setAlive((p) => ({ ...p, [job.jobId]: "checking" }));
    const userId = job.userIds.find((id) => userIds.includes(id)) ?? userIds[0] ?? null;
    const state = await checkServerAlive(job.placeId, job.jobId, userId);
    setAlive((p) => ({ ...p, [job.jobId]: state }));
  }

  async function clearAll() {
    const ok = await confirm(
      t("Clear the server history? Games, Job IDs, regions, notes and stars are removed from this list and cannot be recovered."),
      true
    );
    if (ok) clearServerHistory();
  }

  function openHistoryMenu(e: React.MouseEvent, job: JobSummary) {
    e.preventDefault();
    const region = regions[job.jobId];
    const fav = !!meta[job.jobId]?.fav;
    const items: RowMenuItem[] = [
      { label: t("Copy Job ID"), onClick: () => void copy(job.jobId) },
      { label: t("Copy server link"), onClick: () => void copy(joinLink(job.placeId, job.jobId)) },
    ];
    if (region) items.push({ label: t("Copy region"), onClick: () => void copy(region) });
    items.push(
      { label: t("Rejoin"), onClick: () => void rejoin(job), divider: true },
      { label: t("Check if still open"), onClick: () => void check(job) },
      {
        label: fav ? t("Remove from favorites") : t("Add to favorites"),
        onClick: () => updateMeta(job.jobId, { fav: !fav }),
      },
      {
        label: meta[job.jobId]?.note ? t("Edit note") : t("Add note"),
        onClick: () => {
          setDraftNote(meta[job.jobId]?.note ?? "");
          setEditing(job.jobId);
        },
      }
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  const nowRows = Array.from(sessions.values());
  const inputCls =
    "rounded-md border theme-border bg-[var(--panel-soft)] px-2 py-1 text-[12.5px] text-[var(--panel-fg)] outline-none";

  return (
    <PageShell
      title={t("Servers")}
      description={t("The server each open account is in right now, and the servers you played before. Right-click a server to copy its Job ID or link.")}
      onLeave={onLeave}
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--panel-muted)] mb-2">
        {t("Now")}
      </h2>
      {nowRows.length === 0 ? (
        <p className="text-[13px] text-[var(--panel-muted)] mb-6">
          {t("No account is in a game right now. Join a game and its server shows up here.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 mb-6">
          {nowRows.map((session) => (
            <NowRow key={session.userId} session={session} onMenu={setMenu} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--panel-muted)]">
          {t("History")}
        </h2>
        <span className="text-[12px] text-[var(--panel-muted)]">
          {t("{{count}} servers · {{time}} played", { count: jobs.length, time: formatDuration(totalMs) })}
        </span>
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={jobs.length === 0}
          className="ml-auto text-[12px] text-[var(--panel-muted)] hover:text-red-400 disabled:opacity-40 disabled:hover:text-[var(--panel-muted)]"
        >
          {t("Clear history")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search game, Job ID, region or note")}
          className={`${inputCls} flex-1 min-w-[180px]`}
        />
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className={inputCls}>
          <option value="">{t("All regions")}</option>
          {regionOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value as "recent" | "oldest")} className={inputCls}>
          <option value="recent">{t("Recent")}</option>
          <option value="oldest">{t("Oldest")}</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--panel-fg)]">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
          {t("Favorites only")}
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-[var(--panel-muted)]">
          {jobs.length === 0 ? t("No servers in the history yet.") : t("Nothing matches this filter.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((job) => (
            <div key={job.jobId}>
              <HistoryRow
                job={job}
                gameName={nameOf(job.placeId)}
                region={regions[job.jobId]}
                note={meta[job.jobId]?.note}
                fav={!!meta[job.jobId]?.fav}
                alive={alive[job.jobId]}
                accountNames={store.accounts.length > 1 ? job.userIds.map(accountName) : []}
                onMenu={(e) => openHistoryMenu(e, job)}
                onToggleFav={() => updateMeta(job.jobId, { fav: !meta[job.jobId]?.fav })}
                onRejoin={() => void rejoin(job)}
              />
              {editing === job.jobId ? (
                <div className="flex gap-2 mt-1.5">
                  <input
                    autoFocus
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value.slice(0, 80))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateMeta(job.jobId, { note: draftNote.trim() });
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder={t("Note, e.g. good farm")}
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateMeta(job.jobId, { note: draftNote.trim() });
                      setEditing(null);
                    }}
                    className="rounded-md border theme-border px-3 text-[12.5px] text-[var(--panel-fg)] hover:bg-[var(--row-hover)]"
                  >
                    {t("Save")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </ul>
      )}

      {menu ? <RowMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </PageShell>
  );
}
