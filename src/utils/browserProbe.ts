import type { AccessPoint, AgentPingItem } from '../types/ap';

export interface BrowserProbeReport {
  items: AgentPingItem[];
  blockedByBrowserCount: number;
  reachableCount: number;
}

async function probeSingleUrl(url: string, timeoutMs = 2000): Promise<{
  ok: boolean;
  latencyMs: number | null;
  blocked: boolean;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    const elapsed = Math.round((performance.now() - start) * 10) / 10;
    clearTimeout(timer);
    return { ok: true, latencyMs: elapsed, blocked: false };
  } catch (err) {
    const elapsed = Math.round((performance.now() - start) * 10) / 10;
    clearTimeout(timer);
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    // Immediate (< 50ms) TypeError in browser on HTTPS -> private IP indicates Mixed Content / PNA block
    return {
      ok: false,
      latencyMs: null,
      blocked: !isAbort && elapsed < 50,
    };
  }
}

export async function probeApsFromBrowser(aps: AccessPoint[]): Promise<BrowserProbeReport> {
  let blockedByBrowserCount = 0;
  let reachableCount = 0;

  const items = await Promise.all(
    aps.map(async (ap): Promise<AgentPingItem> => {
      const httpsTry = await probeSingleUrl(`https://${ap.ip}`, 1800);
      if (httpsTry.ok) {
        reachableCount += 1;
        return {
          ip: ap.ip,
          reachable: true,
          latencyMs: httpsTry.latencyMs,
          packetLoss: 0,
          detail: 'Operativa (sondeo HTTPS desde navegador)',
        };
      }

      const httpTry = await probeSingleUrl(`http://${ap.ip}`, 1800);
      if (httpTry.ok) {
        reachableCount += 1;
        return {
          ip: ap.ip,
          reachable: true,
          latencyMs: httpTry.latencyMs,
          packetLoss: 0,
          detail: 'Operativa (sondeo HTTP desde navegador)',
        };
      }

      if (httpsTry.blocked || httpTry.blocked) {
        blockedByBrowserCount += 1;
      }

      return {
        ip: ap.ip,
        reachable: false,
        latencyMs: null,
        packetLoss: 100,
        detail:
          httpsTry.blocked || httpTry.blocked
            ? 'Bloqueado por seguridad del navegador (HTTPS → IP privada)'
            : 'Sin respuesta desde el navegador',
      };
    }),
  );

  return {
    items,
    blockedByBrowserCount,
    reachableCount,
  };
}
