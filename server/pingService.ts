import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { alertService } from './alertService.ts';
import type {
  AccessPoint,
  AgentPingItem,
  ApInput,
  ApStatus,
  MonitorSnapshot,
  MonitorSummary,
  PingRecord,
} from '../src/types/ap.ts';

const execFileAsync = promisify(execFile);

export const PING_INTERVAL_MS = 30 * 1000; // 30 segundos
export const PING_INTERVAL_SECONDS = 30;
const AGENT_FRESHNESS_MS = 90 * 1000; // 90s de vigencia del agente LAN
const MAX_HISTORY_PER_AP = 120; // Última hora (120 ciclos de 30s)
const MAX_OUTAGES_PER_AP = 30;
const STATE_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'monitor-state.json');

interface PersistedSeed {
  id: string;
  model: string;
  floor: string;
  sector: string;
  ip: string;
  portId: string;
}

export const DEFAULT_APS_SEED: PersistedSeed[] = [
  {
    id: 'ap-1',
    model: 'MR 33',
    floor: '4 Piso',
    sector: 'Sala de reuniones',
    ip: '10.25.5.18',
    portId: '6340401',
  },
  {
    id: 'ap-2',
    model: 'MR 28',
    floor: '3 Piso',
    sector: 'Oficina Puentes',
    ip: '10.25.5.12',
    portId: '6340302',
  },
  {
    id: 'ap-3',
    model: 'MR 33',
    floor: '3 Piso',
    sector: 'Auditoria',
    ip: '10.25.5.11',
    portId: '6340302',
  },
  {
    id: 'ap-4',
    model: 'MR 36',
    floor: '3 Piso',
    sector: 'Direccion Gral',
    ip: '10.25.5.15',
    portId: '6340301',
  },
  {
    id: 'ap-5',
    model: 'MR 33',
    floor: '2 Piso',
    sector: 'Oficina Gabriel',
    ip: '10.25.5.13',
    portId: '6340201',
  },
  {
    id: 'ap-6',
    model: 'MR 36',
    floor: '2 Piso',
    sector: 'Fiisca-Calzada',
    ip: '10.25.5.17',
    portId: '6340202',
  },
  {
    id: 'ap-7',
    model: 'MR36',
    floor: '1 Piso',
    sector: 'Pasillo DH-Emergencia',
    ip: '10.25.5.8',
    portId: '6340102',
  },
  {
    id: 'ap-8',
    model: 'MR 33',
    floor: '1 Piso',
    sector: 'Oficina Paola',
    ip: '10.25.5.14',
    portId: '6340101',
  },
  {
    id: 'ap-9',
    model: 'MR 33',
    floor: '1 Piso',
    sector: 'Delegacion Gremial',
    ip: '10.25.5.16',
    portId: '6340101',
  },
];

function createInitialAp(seed: PersistedSeed): AccessPoint {
  return {
    id: seed.id,
    model: seed.model,
    floor: seed.floor,
    sector: seed.sector,
    ip: seed.ip,
    portId: seed.portId,
    status: 'pending',
    latencyMs: null,
    minMs: null,
    maxMs: null,
    jitterMs: null,
    packetLoss: null,
    lastCheckedAt: null,
    lastOnlineAt: null,
    speedMbps: null,
    uploadMbps: null,
    speedCheckedAt: null,
    totalChecks: 0,
    successfulChecks: 0,
    uptimePercent: null,
    outageCount: 0,
    offlineSince: null,
    activeOutageStartedAt: null,
    lastOutageAt: null,
    lastOutageDurationSec: null,
    outages: [],
    detail: 'Pendiente de verificación',
    history: [],
  };
}

export function isValidTargetHost(host: string): boolean {
  const trimmed = host.trim();
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const hostnameRegex =
    /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return ipv4Regex.test(trimmed) || hostnameRegex.test(trimmed);
}

function isPrivateIp(host: string): boolean {
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function detectCloudEnvironment(): boolean {
  if (process.env.K_SERVICE || process.env.CLOUD_RUN_JOB) return true;
  if (process.env.APP_URL && process.env.APP_URL.includes('.run.app')) return true;

  // Check if host has any 10.25.x.x interface; if not and running in GCP metadata/container
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('10.25.')) {
        return false;
      }
    }
  }
  return Boolean(process.env.APP_URL?.startsWith('https://'));
}

interface PersistedState {
  aps: AccessPoint[];
  lastCycleAt: string | null;
  slowThresholdMs: number;
  agentToken?: string;
  lastAgentReportAt?: string | null;
}

class PingMonitorService {
  private aps: AccessPoint[] = DEFAULT_APS_SEED.map(createInitialAp);
  private lastCycleAt: string | null = null;
  private nextCycleAt: number = Date.now() + PING_INTERVAL_MS;
  private slowThresholdMs = 100;
  private isScanning = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private agentToken: string = crypto.randomBytes(16).toString('hex');
  private lastAgentReportAt: string | null = null;
  private readonly isCloudHost: boolean = detectCloudEnvironment();

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (Array.isArray(parsed.aps) && parsed.aps.length > 0) {
          this.aps = parsed.aps.map((ap) => ({
            ...ap,
            speedMbps: typeof ap.speedMbps === 'number' ? ap.speedMbps : null,
            uploadMbps: typeof ap.uploadMbps === 'number' ? ap.uploadMbps : null,
            speedCheckedAt: typeof ap.speedCheckedAt === 'string' ? ap.speedCheckedAt : null,
            totalChecks: typeof ap.totalChecks === 'number' ? ap.totalChecks : 0,
            successfulChecks: typeof ap.successfulChecks === 'number' ? ap.successfulChecks : 0,
            uptimePercent: typeof ap.uptimePercent === 'number' ? ap.uptimePercent : null,
            outageCount: typeof ap.outageCount === 'number' ? ap.outageCount : 0,
            offlineSince:
              typeof ap.offlineSince === 'string'
                ? ap.offlineSince
                : ap.status === 'offline'
                  ? (typeof ap.activeOutageStartedAt === 'string'
                      ? ap.activeOutageStartedAt
                      : typeof ap.lastCheckedAt === 'string'
                        ? ap.lastCheckedAt
                        : null)
                  : null,
            activeOutageStartedAt:
              typeof ap.activeOutageStartedAt === 'string' ? ap.activeOutageStartedAt : null,
            lastOutageAt: typeof ap.lastOutageAt === 'string' ? ap.lastOutageAt : null,
            lastOutageDurationSec:
              typeof ap.lastOutageDurationSec === 'number' ? ap.lastOutageDurationSec : null,
            outages: Array.isArray(ap.outages) ? ap.outages.slice(0, MAX_OUTAGES_PER_AP) : [],
          }));
        }
        if (typeof parsed.lastCycleAt === 'string' || parsed.lastCycleAt === null) {
          this.lastCycleAt = parsed.lastCycleAt;
        }
        if (
          typeof parsed.slowThresholdMs === 'number' &&
          parsed.slowThresholdMs >= 20 &&
          parsed.slowThresholdMs <= 2000
        ) {
          this.slowThresholdMs = parsed.slowThresholdMs;
        }
        if (typeof parsed.agentToken === 'string' && parsed.agentToken.length >= 12) {
          this.agentToken = parsed.agentToken;
        }
        if (typeof parsed.lastAgentReportAt === 'string') {
          this.lastAgentReportAt = parsed.lastAgentReportAt;
        }
      }
    } catch {
      // Fallback safely to in-memory seed
    }
  }

  private saveState(): void {
    try {
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      const payload: PersistedState = {
        aps: this.aps,
        lastCycleAt: this.lastCycleAt,
        slowThresholdMs: this.slowThresholdMs,
        agentToken: this.agentToken,
        lastAgentReportAt: this.lastAgentReportAt,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only filesystems
    }
  }

  public getAgentToken(): string {
    return this.agentToken;
  }

  private isAgentActive(): boolean {
    if (!this.lastAgentReportAt) return false;
    const ageMs = Date.now() - new Date(this.lastAgentReportAt).getTime();
    return ageMs >= 0 && ageMs <= AGENT_FRESHNESS_MS;
  }

  public start(): void {
    this.scheduleNextInterval();
    void this.runPingAll();
  }

  private scheduleNextInterval(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.nextCycleAt = Date.now() + PING_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.nextCycleAt = Date.now() + PING_INTERVAL_MS;
      void this.runPingAll();
    }, PING_INTERVAL_MS);
  }

  public getSnapshot(): MonitorSnapshot {
    const agentActive = this.isAgentActive();
    const allPrivateOffline =
      this.aps.length > 0 &&
      this.aps.every((ap) => isPrivateIp(ap.ip) && ap.status === 'offline');

    return {
      aps: this.aps,
      summary: this.computeSummary(),
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: new Date(this.nextCycleAt).toISOString(),
      intervalSeconds: PING_INTERVAL_SECONDS,
      slowThresholdMs: this.slowThresholdMs,
      isScanning: this.isScanning,
      telemetrySource: agentActive ? 'agent' : 'server',
      lastAgentReportAt: this.lastAgentReportAt,
      isCloudHost: this.isCloudHost,
      privateSubnetUnreachable: !agentActive && this.isCloudHost && allPrivateOffline,
    };
  }

  private computeSummary(): MonitorSummary {
    let online = 0;
    let slow = 0;
    let offline = 0;
    let pending = 0;
    const latencies: number[] = [];

    for (const ap of this.aps) {
      if (ap.status === 'online') online += 1;
      else if (ap.status === 'slow') slow += 1;
      else if (ap.status === 'offline') offline += 1;
      else pending += 1;

      if (ap.latencyMs !== null && (ap.status === 'online' || ap.status === 'slow')) {
        latencies.push(ap.latencyMs);
      }
    }

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round((latencies.reduce((acc, v) => acc + v, 0) / latencies.length) * 10) / 10
        : null;

    return {
      total: this.aps.length,
      online,
      slow,
      offline,
      pending,
      avgLatencyMs,
    };
  }

  private parsePingOutput(stdout: string, stderr: string): {
    reachable: boolean;
    latencyMs: number | null;
    minMs: number | null;
    maxMs: number | null;
    jitterMs: number | null;
    packetLoss: number;
    detail: string;
  } {
    const combined = `${stdout}\n${stderr}`;

    let packetLoss = 100;
    const lossMatch = combined.match(/(\d+(?:\.\d+)?)%\s*(?:packet loss|loss|perdidos)/i);
    if (lossMatch) {
      packetLoss = Math.round(Number.parseFloat(lossMatch[1]));
    }

    const unixRttMatch = combined.match(
      /(?:rtt|round-trip)\s+min\/avg\/max\/(?:mdev|stddev)\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/i,
    );
    if (unixRttMatch) {
      const minMs = Math.round(Number.parseFloat(unixRttMatch[1]) * 10) / 10;
      const latencyMs = Math.round(Number.parseFloat(unixRttMatch[2]) * 10) / 10;
      const maxMs = Math.round(Number.parseFloat(unixRttMatch[3]) * 10) / 10;
      const jitterMs = Math.round((maxMs - minMs) * 10) / 10;
      return {
        reachable: packetLoss < 100,
        latencyMs,
        minMs,
        maxMs,
        jitterMs,
        packetLoss,
        detail:
          packetLoss > 0
            ? `Respuesta parcial (${packetLoss}% pérdida)`
            : 'Respuesta ICMP correcta',
      };
    }

    const winRttMatch = combined.match(
      /(?:Minimum|M[ií]nimo)\s*=\s*(\d+)\s*ms,\s*(?:Maximum|M[aá]ximo)\s*=\s*(\d+)\s*ms,\s*(?:Average|Media)\s*=\s*(\d+)\s*ms/i,
    );
    if (winRttMatch) {
      const minMs = Number.parseInt(winRttMatch[1], 10);
      const maxMs = Number.parseInt(winRttMatch[2], 10);
      const latencyMs = Number.parseInt(winRttMatch[3], 10);
      const jitterMs = maxMs - minMs;
      return {
        reachable: packetLoss < 100,
        latencyMs,
        minMs,
        maxMs,
        jitterMs,
        packetLoss,
        detail:
          packetLoss > 0
            ? `Respuesta parcial (${packetLoss}% pérdida)`
            : 'Respuesta ICMP correcta',
      };
    }

    const individualTimes = Array.from(
      combined.matchAll(/(?:time|tiempo)\s*([=<])\s*([\d.]+)\s*ms/gi),
    ).map((m) => (m[1] === '<' ? 0.5 : Number.parseFloat(m[2])));

    if (individualTimes.length > 0) {
      const minMs = Math.round(Math.min(...individualTimes) * 10) / 10;
      const maxMs = Math.round(Math.max(...individualTimes) * 10) / 10;
      const avg =
        individualTimes.reduce((acc, v) => acc + v, 0) / individualTimes.length;
      const latencyMs = Math.round(avg * 10) / 10;
      const jitterMs = Math.round((maxMs - minMs) * 10) / 10;
      return {
        reachable: true,
        latencyMs,
        minMs,
        maxMs,
        jitterMs,
        packetLoss: packetLoss < 100 ? packetLoss : 0,
        detail: 'Respuesta ICMP correcta',
      };
    }

    if (
      /Destination Host Unreachable|Red de destino inaccesible|Host de destino inaccesible/i.test(
        combined,
      )
    ) {
      return {
        reachable: false,
        latencyMs: null,
        minMs: null,
        maxMs: null,
        jitterMs: null,
        packetLoss: 100,
        detail: 'Host inaccesible desde este origen',
      };
    }

    return {
      reachable: false,
      latencyMs: null,
      minMs: null,
      maxMs: null,
      jitterMs: null,
      packetLoss: 100,
      detail: 'Sin respuesta ICMP (Timeout)',
    };
  }

  private async probeTcpPort(host: string, port: number, timeoutMs = 1500): Promise<number | null> {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const socket = new net.Socket();
      let settled = false;

      const finish = (latency: number | null) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(latency);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        const elapsed = Math.round((performance.now() - startedAt) * 10) / 10;
        finish(elapsed);
      });
      socket.once('timeout', () => finish(null));
      socket.once('error', () => finish(null));

      socket.connect(port, host);
    });
  }

  private evaluateStatus(
    reachable: boolean,
    latencyMs: number | null,
    packetLoss: number,
  ): ApStatus {
    if (!reachable || latencyMs === null || packetLoss >= 100) {
      return 'offline';
    }
    if (latencyMs >= this.slowThresholdMs || packetLoss > 0) {
      return 'slow';
    }
    return 'online';
  }

  private async executePing(host: string): Promise<PingRecord> {
    const timestamp = new Date().toISOString();
    if (!isValidTargetHost(host)) {
      return {
        timestamp,
        status: 'offline',
        latencyMs: null,
        minMs: null,
        maxMs: null,
        jitterMs: null,
        packetLoss: 100,
        detail: 'Dirección IP inválida',
        source: 'server',
      };
    }

    const args =
      process.platform === 'win32'
        ? ['-n', '2', '-w', '1500', host]
        : ['-c', '2', '-W', '1', host];

    try {
      const { stdout, stderr } = await execFileAsync('ping', args, {
        timeout: 4500,
      });
      const parsed = this.parsePingOutput(stdout, stderr);
      if (parsed.reachable) {
        const status = this.evaluateStatus(true, parsed.latencyMs, parsed.packetLoss);
        const detail =
          status === 'slow' && parsed.packetLoss === 0 && parsed.latencyMs !== null
            ? `Latencia elevada (${parsed.latencyMs} ms ≥ ${this.slowThresholdMs} ms)`
            : parsed.detail;

        return {
          timestamp,
          status,
          latencyMs: parsed.latencyMs,
          minMs: parsed.minMs,
          maxMs: parsed.maxMs,
          jitterMs: parsed.jitterMs,
          packetLoss: parsed.packetLoss,
          detail,
          source: 'server',
        };
      }
    } catch (error) {
      const errObj = error as { stdout?: string; stderr?: string };
      const stdout = errObj.stdout ?? '';
      const stderr = errObj.stderr ?? '';
      if (stdout || stderr) {
        const parsed = this.parsePingOutput(stdout, stderr);
        if (parsed.reachable) {
          const status = this.evaluateStatus(true, parsed.latencyMs, parsed.packetLoss);
          return {
            timestamp,
            status,
            latencyMs: parsed.latencyMs,
            minMs: parsed.minMs,
            maxMs: parsed.maxMs,
            jitterMs: parsed.jitterMs,
            packetLoss: parsed.packetLoss,
            detail: parsed.detail,
            source: 'server',
          };
        }
      }
    }

    // Fallback TCP (80/443) en caso de que el AP bloquee ICMP pero responda HTTP/HTTPS local
    for (const port of [80, 443]) {
      const tcpMs = await this.probeTcpPort(host, port, 1200);
      if (tcpMs !== null) {
        const status = this.evaluateStatus(true, tcpMs, 0);
        return {
          timestamp,
          status,
          latencyMs: tcpMs,
          minMs: tcpMs,
          maxMs: tcpMs,
          jitterMs: 0,
          packetLoss: 0,
          detail:
            status === 'slow'
              ? `Latencia TCP/${port} elevada (${tcpMs} ms)`
              : `Operativa vía TCP/${port} (ICMP filtrado)`,
          source: 'server',
        };
      }
    }

    return {
      timestamp,
      status: 'offline',
      latencyMs: null,
      minMs: null,
      maxMs: null,
      jitterMs: null,
      packetLoss: 100,
      detail:
        this.isCloudHost && isPrivateIp(host)
          ? 'Red privada 10.25.5.x no alcanzable desde la nube'
          : 'Sin respuesta ICMP/TCP (Timeout)',
      source: 'server',
    };
  }

  private applyPingRecord(ap: AccessPoint, record: PingRecord): AccessPoint {
    const history = [record, ...ap.history].slice(0, MAX_HISTORY_PER_AP);
    const isReachable = record.status === 'online' || record.status === 'slow';
    const isCloudBlockedPrivate =
      this.isCloudHost &&
      record.source !== 'agent' &&
      isPrivateIp(ap.ip) &&
      record.status === 'offline';

    let totalChecks = ap.totalChecks ?? 0;
    let successfulChecks = ap.successfulChecks ?? 0;
    let uptimePercent = ap.uptimePercent ?? null;
    let outageCount = ap.outageCount ?? 0;
    let activeOutageStartedAt = ap.activeOutageStartedAt ?? null;
    let lastOutageAt = ap.lastOutageAt ?? null;
    let lastOutageDurationSec = ap.lastOutageDurationSec ?? null;
    let outages = Array.isArray(ap.outages) ? [...ap.outages] : [];

    if (!isCloudBlockedPrivate) {
      totalChecks += 1;
      if (isReachable) {
        successfulChecks += 1;
      }
      uptimePercent = Math.round((successfulChecks / totalChecks) * 1000) / 10;

      if (!isReachable) {
        if (!activeOutageStartedAt) {
          activeOutageStartedAt = record.timestamp;
          outageCount += 1;
          lastOutageAt = record.timestamp;
          outages = [
            {
              startedAt: record.timestamp,
              endedAt: null,
              durationSeconds: null,
              source: record.source ?? 'server',
            },
            ...outages,
          ].slice(0, MAX_OUTAGES_PER_AP);
        }
      } else if (activeOutageStartedAt) {
        const durationSeconds = Math.max(
          1,
          Math.round(
            (new Date(record.timestamp).getTime() -
              new Date(activeOutageStartedAt).getTime()) /
              1000,
          ),
        );
        lastOutageDurationSec = durationSeconds;
        if (outages.length > 0 && outages[0].endedAt === null) {
          outages[0] = {
            ...outages[0],
            endedAt: record.timestamp,
            durationSeconds,
          };
        }
        activeOutageStartedAt = null;
      }
    }

    const offlineSince = isReachable
      ? null
      : activeOutageStartedAt ?? ap.offlineSince ?? record.timestamp;

    return {
      ...ap,
      status: record.status,
      latencyMs: record.latencyMs,
      minMs: record.minMs,
      maxMs: record.maxMs,
      jitterMs: record.jitterMs,
      packetLoss: record.packetLoss,
      lastCheckedAt: record.timestamp,
      lastOnlineAt: isReachable ? record.timestamp : ap.lastOnlineAt,
      totalChecks,
      successfulChecks,
      uptimePercent,
      outageCount,
      offlineSince,
      activeOutageStartedAt,
      lastOutageAt,
      lastOutageDurationSec,
      outages,
      detail: record.detail,
      history,
    };
  }

  public async runPingAll(forceServer = false): Promise<MonitorSnapshot> {
    if (this.isScanning) {
      return this.getSnapshot();
    }

    // Si hay un Agente Local EMUI activo desde la LAN y el servidor está en la nube,
    // nunca pisamos sus lecturas reales con timeouts externos del servidor cloud.
    if (this.isCloudHost && this.isAgentActive()) {
      if (forceServer) {
        this.scheduleNextInterval();
      }
      return this.getSnapshot();
    }

    this.isScanning = true;
    try {
      const results = await Promise.all(
        this.aps.map(async (ap) => {
          const record = await this.executePing(ap.ip);
          return this.applyPingRecord(ap, record);
        }),
      );
      this.aps = results;
      this.lastCycleAt = new Date().toISOString();
      this.scheduleNextInterval();
      this.saveState();
      const snapshot = this.getSnapshot();
      void alertService.evaluateSnapshot(snapshot);
      return snapshot;
    } finally {
      this.isScanning = false;
    }
  }

  public applyAgentReport(items: AgentPingItem[]): MonitorSnapshot {
    const now = new Date().toISOString();
    const byIp = new Map<string, AgentPingItem>();
    for (const item of items) {
      if (item && typeof item.ip === 'string') {
        byIp.set(item.ip.trim(), item);
      }
    }

    this.aps = this.aps.map((ap) => {
      const report = byIp.get(ap.ip);
      if (!report) return ap;

      const reachable = Boolean(report.reachable);
      const latencyMs =
        reachable && typeof report.latencyMs === 'number' && Number.isFinite(report.latencyMs)
          ? Math.max(0.1, Math.round(report.latencyMs * 10) / 10)
          : null;
      const minMs =
        reachable && typeof report.minMs === 'number' && Number.isFinite(report.minMs)
          ? Math.round(report.minMs * 10) / 10
          : latencyMs;
      const maxMs =
        reachable && typeof report.maxMs === 'number' && Number.isFinite(report.maxMs)
          ? Math.round(report.maxMs * 10) / 10
          : latencyMs;
      const jitterMs =
        minMs !== null && maxMs !== null
          ? Math.round(Math.max(0, maxMs - minMs) * 10) / 10
          : null;
      const packetLoss =
        typeof report.packetLoss === 'number' && Number.isFinite(report.packetLoss)
          ? Math.max(0, Math.min(100, Math.round(report.packetLoss)))
          : reachable
            ? 0
            : 100;

      const status = this.evaluateStatus(reachable, latencyMs, packetLoss);
      const detail =
        typeof report.detail === 'string' && report.detail.trim()
          ? report.detail.trim().slice(0, 120)
          : status === 'online'
            ? 'Operativa (Agente LAN EMUI)'
            : status === 'slow'
              ? `Latencia elevada (${latencyMs ?? '?'} ms)`
              : 'Sin respuesta ICMP en red local';

      const record: PingRecord = {
        timestamp: now,
        status,
        latencyMs,
        minMs,
        maxMs,
        jitterMs,
        packetLoss,
        detail,
        source: 'agent',
      };
      return this.applyPingRecord(ap, record);
    });

    this.lastAgentReportAt = now;
    this.lastCycleAt = now;
    this.scheduleNextInterval();
    this.saveState();
    const snapshot = this.getSnapshot();
    void alertService.evaluateSnapshot(snapshot);
    return snapshot;
  }

  public async pingOne(id: string): Promise<{ ap: AccessPoint; snapshot: MonitorSnapshot } | null> {
    const index = this.aps.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const target = this.aps[index];
    if (this.isCloudHost && isPrivateIp(target.ip) && this.isAgentActive()) {
      return {
        ap: target,
        snapshot: this.getSnapshot(),
      };
    }

    const record = await this.executePing(target.ip);
    const updated = this.applyPingRecord(target, record);
    this.aps[index] = updated;
    this.saveState();

    return {
      ap: updated,
      snapshot: this.getSnapshot(),
    };
  }

  public async addAp(input: ApInput): Promise<AccessPoint> {
    const cleanIp = input.ip.trim();
    if (!isValidTargetHost(cleanIp)) {
      throw new Error('La dirección IP o host ingresado no es válido.');
    }
    const newAp = createInitialAp({
      id: `ap-${Date.now()}`,
      model: input.model.trim(),
      floor: input.floor.trim(),
      sector: input.sector.trim(),
      ip: cleanIp,
      portId: input.portId.trim(),
    });
    const record = await this.executePing(newAp.ip);
    const evaluated = this.applyPingRecord(newAp, record);
    this.aps = [...this.aps, evaluated];
    this.saveState();
    return evaluated;
  }

  public async updateAp(id: string, input: ApInput): Promise<AccessPoint | null> {
    const index = this.aps.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const cleanIp = input.ip.trim();
    if (!isValidTargetHost(cleanIp)) {
      throw new Error('La dirección IP o host ingresado no es válido.');
    }

    const current = this.aps[index];
    const ipChanged = current.ip !== cleanIp;
    const updatedBase: AccessPoint = {
      ...current,
      model: input.model.trim(),
      floor: input.floor.trim(),
      sector: input.sector.trim(),
      ip: cleanIp,
      portId: input.portId.trim(),
    };

    if (ipChanged) {
      const record = await this.executePing(cleanIp);
      this.aps[index] = this.applyPingRecord(updatedBase, record);
    } else {
      this.aps[index] = updatedBase;
    }

    this.saveState();
    return this.aps[index];
  }

  public deleteAp(id: string): boolean {
    const prevLength = this.aps.length;
    this.aps = this.aps.filter((item) => item.id !== id);
    if (this.aps.length !== prevLength) {
      this.saveState();
      return true;
    }
    return false;
  }

  public async resetToDefaultAps(): Promise<MonitorSnapshot> {
    this.aps = DEFAULT_APS_SEED.map(createInitialAp);
    this.saveState();
    return this.runPingAll(true);
  }

  public updateSlowThreshold(ms: number): MonitorSnapshot {
    const bounded = Math.max(20, Math.min(2000, Math.round(ms)));
    this.slowThresholdMs = bounded;
    this.aps = this.aps.map((ap) => {
      if (ap.status === 'pending' || ap.status === 'offline' || ap.latencyMs === null) {
        return ap;
      }
      const loss = ap.packetLoss ?? 0;
      const newStatus = this.evaluateStatus(true, ap.latencyMs, loss);
      const detail =
        newStatus === 'slow'
          ? loss > 0
            ? `Respuesta parcial (${loss}% pérdida)`
            : `Latencia elevada (${ap.latencyMs} ms ≥ ${this.slowThresholdMs} ms)`
          : 'Respuesta ICMP correcta';
      return {
        ...ap,
        status: newStatus,
        detail,
      };
    });
    this.saveState();
    return this.getSnapshot();
  }

  public recordSpeed(
    id: string,
    downloadMbps: number | null,
    uploadMbps: number | null,
  ): { ap: AccessPoint; snapshot: MonitorSnapshot } | null {
    const index = this.aps.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const cleanDown =
      downloadMbps !== null && Number.isFinite(downloadMbps) && downloadMbps > 0
        ? Math.min(10000, Math.round(downloadMbps * 10) / 10)
        : null;
    const cleanUp =
      uploadMbps !== null && Number.isFinite(uploadMbps) && uploadMbps > 0
        ? Math.min(10000, Math.round(uploadMbps * 10) / 10)
        : null;

    const updated: AccessPoint = {
      ...this.aps[index],
      speedMbps: cleanDown,
      uploadMbps: cleanDown !== null ? cleanUp : null,
      speedCheckedAt: cleanDown !== null ? new Date().toISOString() : null,
    };

    this.aps[index] = updated;
    this.saveState();

    return {
      ap: updated,
      snapshot: this.getSnapshot(),
    };
  }

  public resetUptimeStats(): MonitorSnapshot {
    this.aps = this.aps.map((ap) => ({
      ...ap,
      totalChecks: 0,
      successfulChecks: 0,
      uptimePercent: null,
      outageCount: 0,
      offlineSince: ap.status === 'offline' ? new Date().toISOString() : null,
      activeOutageStartedAt: null,
      lastOutageAt: null,
      lastOutageDurationSec: null,
      outages: [],
      history: [],
    }));
    this.saveState();
    return this.getSnapshot();
  }
}

export const pingMonitor = new PingMonitorService();
