import { useState } from "react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { useCurrentSessions } from "../../hooks/useCurrentSessions";
import { useGameIdentity } from "../../hooks/useGameIdentity";
import { isWindowsPlatform } from "../../utils/platform";
import { copyText } from "../python/copyText";
import { RowMenu, type RowMenuItem } from "../servers/RowMenu";
import { joinLink } from "../../services/serverHistory";
import type { CurrentSession } from "../../types";

export interface CurrentServerInfo {
  session: CurrentSession;
  region: string | null;
}

/** O servidor em que a conta escolhida está agora (ou `null`). */
export function useCurrentServer(userId: number | null, enabled: boolean): CurrentServerInfo | null {
  const store = useStore();
  const isWindows = isWindowsPlatform(store.platformCapabilities);
  const runningKey = Array.from(store.launchedByProgram).join(",");
  const sessions = useCurrentSessions(enabled && isWindows, runningKey);
  if (userId === null) return null;
  const session = sessions.get(userId);
  if (!session) return null;
  return { session, region: store.clientHealth.get(userId)?.server?.region ?? null };
}

/** Faixa no topo da lista: servidor atual; clique direito copia Job ID/link. */
export function CurrentServerBanner({ current }: { current: CurrentServerInfo | null }) {
  const t = useTr();
  const store = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number; items: RowMenuItem[] } | null>(null);
  const identity = useGameIdentity(current?.session.placeId ?? null, current?.session.userId ?? null);

  if (!current) {
    return (
      <div className="mx-1 mb-3 rounded-lg border border-zinc-800/60 px-3 py-2 text-[12px] text-zinc-600">
        {t("Not in a game right now.")}
      </div>
    );
  }

  const { session, region } = current;
  const jobId = session.jobId;
  const game = identity?.name ?? t("Place {{placeId}}", { placeId: session.placeId });

  async function copy(text: string) {
    if (await copyText(text)) store.addToast(t("Copied"));
  }

  return (
    <div
      data-testid="current-server-banner"
      onContextMenu={(e) => {
        e.preventDefault();
        if (!jobId) return;
        const items: RowMenuItem[] = [
          { label: t("Copy Job ID"), onClick: () => void copy(jobId) },
          { label: t("Copy server link"), onClick: () => void copy(joinLink(session.placeId, jobId)) },
        ];
        if (region) items.push({ label: t("Copy region"), onClick: () => void copy(region) });
        setMenu({ x: e.clientX, y: e.clientY, items });
      }}
      className="mx-1 mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
    >
      <div className="flex items-center gap-2 text-[12px]">
        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
          {t("You are here")}
        </span>
        <span className="truncate text-zinc-200">{game}</span>
        <span aria-hidden="true" className="text-zinc-600">·</span>
        <span className="shrink-0 text-zinc-300">{region ?? t("Unknown region")}</span>
      </div>
      <div className="mt-1 text-[12px] text-zinc-500">
        {t("JobId")} ={" "}
        {jobId ? <span className="font-mono select-all break-all text-zinc-300">{jobId}</span> : t("Not known yet")}
      </div>
      {menu ? <RowMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
