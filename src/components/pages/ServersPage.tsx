import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { useCurrentSessions } from "../../hooks/useCurrentSessions";
import { useGameIdentity } from "../../hooks/useGameIdentity";
import { accountLabel } from "../../utils/accountName";
import { isWindowsPlatform } from "../../utils/platform";
import { copyText } from "../python/copyText";
import type { CurrentSession } from "../../types";
import { PageShell } from "./PageShell";

/**
 * Página Servers: mostra, para cada conta que está num jogo, a região do
 * servidor e o Job ID inteiro. Só lê o que o app já sabe (sessão atual do
 * histórico + região lida do log do cliente); quando a conta troca de
 * servidor, as duas fontes atualizam e a linha acompanha sozinha.
 */
function ServerRow({ session }: { session: CurrentSession }) {
  const t = useTr();
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const identity = useGameIdentity(session.placeId, session.userId);
  const game = identity?.name ?? t("Place {{placeId}}", { placeId: session.placeId });
  const account = store.accounts.find((a) => a.UserID === session.userId);
  const name = accountLabel(account, store, session.userId);
  const region = store.clientHealth.get(session.userId)?.server?.region ?? null;
  const jobId = session.jobId;

  async function copy() {
    if (!jobId) return;
    if (await copyText(jobId)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <li
      data-testid={`servers-row-${session.userId}`}
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
              onClick={() => void copy()}
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

export function ServersPage({ active, onLeave }: { active: boolean; onLeave: () => void }) {
  const t = useTr();
  const store = useStore();
  const isWindows = isWindowsPlatform(store.platformCapabilities);
  const runningKey = Array.from(store.launchedByProgram).join(",");
  const sessions = useCurrentSessions(active && isWindows, runningKey);
  if (!active) return null;

  const rows = Array.from(sessions.values());

  return (
    <PageShell
      title={t("Servers")}
      description={t("The server each open account is in right now: region and Job ID. It updates when an account changes server.")}
      onLeave={onLeave}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--panel-muted)]">
          {t("No account is in a game right now. Join a game and its server shows up here.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((session) => (
            <ServerRow key={session.userId} session={session} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
