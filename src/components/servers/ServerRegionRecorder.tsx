import { useEffect } from "react";
import { useStore } from "../../store";
import { useCurrentSessions } from "../../hooks/useCurrentSessions";
import { isWindowsPlatform } from "../../utils/platform";
import { recordRegion } from "../../services/serverHistory";

/**
 * Sem tela: enquanto o app roda, guarda a região de cada servidor em que uma
 * conta entra (o log do Roblox só diz a região enquanto a conta está lá), para
 * o histórico mostrar a região depois.
 */
export function ServerRegionRecorder() {
  const store = useStore();
  const isWindows = isWindowsPlatform(store.platformCapabilities);
  const runningKey = Array.from(store.launchedByProgram).join(",");
  const sessions = useCurrentSessions(isWindows, runningKey);

  useEffect(() => {
    for (const session of sessions.values()) {
      if (!session.jobId) continue;
      const region = store.clientHealth.get(session.userId)?.server?.region;
      if (region) recordRegion(session.jobId, region);
    }
  }, [sessions, store.clientHealth]);

  return null;
}
