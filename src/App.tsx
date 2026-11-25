import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ApHistoryModal } from './components/ApHistoryModal';
import { ApTable } from './components/ApTable';
import { EmailAlertsModal } from './components/EmailAlertsModal';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LanAgentModal } from './components/LanAgentModal';
import { Legend } from './components/Legend';
import { ManageApsModal } from './components/ManageApsModal';
import { SummaryCards } from './components/SummaryCards';
import { Toolbar } from './components/Toolbar';
import { UpdateBar } from './components/UpdateBar';
import {
  buildAlertEmailContent,
  DEFAULT_ALERT_RECIPIENT,
  getAlertScheduleStatus,
  sendGmailAlertEmail,
} from './services/gmailAlert';
import {
  formatFirebaseAuthError,
  getCachedGmailAccessToken,
  initGmailAuthListener,
  invalidateGmailAccessToken,
  signInWithGmail,
  signOutGmail,
} from './services/gmailAuth';
import type {
  AccessPoint,
  AgentPingItem,
  ApInput,
  ApStatus,
  ColumnFilters,
  EmailAlertConfig,
  EmailAlertLogEntry,
  MonitorSnapshot,
  SortColumn,
  SortConfig,
} from './types/ap';
import { LOCAL_BRIDGE_URL } from './utils/batGenerator';
import { exportApsToExcelCsv } from './utils/exportExcel';

const EMPTY_SNAPSHOT: MonitorSnapshot = {
  aps: [],
  summary: {
    total: 0,
    online: 0,
    slow: 0,
    offline: 0,
    pending: 0,
    avgLatencyMs: null,
  },
  lastCycleAt: null,
  nextCycleAt: new Date(Date.now() + 30 * 1000).toISOString(),
  intervalSeconds: 30,
  slowThresholdMs: 100,
  isScanning: false,
  telemetrySource: 'server',
  lastAgentReportAt: null,
  isCloudHost: false,
  privateSubnetUnreachable: false,
};

const INITIAL_COLUMN_FILTERS: ColumnFilters = {
  model: 'all',
  floor: 'all',
  sector: '',
  ip: '',
  portId: 'all',
  latency: 'all',
  speed: 'all',
  status: 'all',
};

const ALERT_CONFIG_STORAGE_KEY = 'emui_wifi_alert_config_v1';

const DEFAULT_ALERT_CONFIG: EmailAlertConfig = {
  recipientEmail: DEFAULT_ALERT_RECIPIENT,
  autoEnabled: true,
  cooldownMinutes: 30,
};

function loadAlertConfig(): EmailAlertConfig {
  try {
    const raw = localStorage.getItem(ALERT_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<EmailAlertConfig>;
    return {
      recipientEmail:
        typeof parsed.recipientEmail === 'string' && parsed.recipientEmail.trim()
          ? parsed.recipientEmail.trim()
          : DEFAULT_ALERT_RECIPIENT,
      autoEnabled: typeof parsed.autoEnabled === 'boolean' ? parsed.autoEnabled : true,
      cooldownMinutes:
        typeof parsed.cooldownMinutes === 'number' && Number.isFinite(parsed.cooldownMinutes)
          ? parsed.cooldownMinutes
          : 30,
    };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

function normalizeModel(model: string): string {
  return model.replace(/\s+/g, ' ').trim().toUpperCase().replace(/^MR(\d+)/, 'MR $1');
}

function compareIps(a: string, b: string): number {
  const partsA = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 4; i += 1) {
    if ((partsA[i] ?? 0) !== (partsB[i] ?? 0)) {
      return (partsA[i] ?? 0) - (partsB[i] ?? 0);
    }
  }
  return a.localeCompare(b);
}

export default function App() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pingingIds, setPingingIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(INITIAL_COLUMN_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: 'asc',
  });
  const [historyApId, setHistoryApId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState<boolean>(false);
  const [agentModalOpen, setAgentModalOpen] = useState<boolean>(false);
  const [emailAlertsModalOpen, setEmailAlertsModalOpen] = useState<boolean>(false);
  const [localBridgeConnected, setLocalBridgeConnected] = useState<boolean>(false);
  const [gmailUser, setGmailUser] = useState<User | null>(null);
  const [hasActiveToken, setHasActiveToken] = useState<boolean>(() =>
    Boolean(getCachedGmailAccessToken()),
  );
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<EmailAlertConfig>(() => loadAlertConfig());
  const [alertLogs, setAlertLogs] = useState<EmailAlertLogEntry[]>([]);

  const agentTokenRef = useRef<string | null>(null);
  const lastAlertedAtRef = useRef<Record<string, number>>({});
  const autoSendInFlightRef = useRef<boolean>(false);

  const ensureAgentToken = useCallback(async (): Promise<string | null> => {
    if (agentTokenRef.current) return agentTokenRef.current;
    try {
      const res = await fetch('/api/monitor/agent-config');
      if (!res.ok) return null;
      const cfg = (await res.json()) as { token?: string };
      if (cfg.token) {
        agentTokenRef.current = cfg.token;
        return cfg.token;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const syncWithLocalBridge = useCallback(
    async (ipsToProbe: string[]): Promise<boolean> => {
      if (ipsToProbe.length === 0) return false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `${LOCAL_BRIDGE_URL}/ping?ips=${encodeURIComponent(ipsToProbe.join(','))}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        clearTimeout(timeout);
        if (!res.ok) {
          setLocalBridgeConnected(false);
          return false;
        }
        const payload = (await res.json()) as { ok?: boolean; results?: AgentPingItem[] };
        if (!payload.ok || !Array.isArray(payload.results)) {
          setLocalBridgeConnected(false);
          return false;
        }

        setLocalBridgeConnected(true);
        const token = await ensureAgentToken();
        if (!token) return true;

        const reportRes = await fetch('/api/monitor/agent-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-token': token,
          },
          body: JSON.stringify({ token, results: payload.results }),
        });
        if (reportRes.ok) {
          const data = (await reportRes.json()) as { snapshot: MonitorSnapshot };
          setSnapshot(data.snapshot);
          setErrorBanner(null);
        }
        return true;
      } catch {
        clearTimeout(timeout);
        setLocalBridgeConnected(false);
        return false;
      }
    },
    [ensureAgentToken],
  );

  const fetchSnapshot = useCallback(async (): Promise<MonitorSnapshot | null> => {
    try {
      const res = await fetch('/api/monitor');
      if (!res.ok) {
        throw new Error('No se pudo obtener el estado de monitoreo');
      }
      const data = (await res.json()) as MonitorSnapshot;
      setSnapshot(data);
      setErrorBanner(null);
      return data;
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Error de conexión con el servidor de monitoreo',
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const initial = await fetchSnapshot();
      if (initial && initial.aps.length > 0) {
        await syncWithLocalBridge(initial.aps.map((ap) => ap.ip));
      }
    })();

    const serverPollId = setInterval(() => {
      void fetchSnapshot();
    }, 5000);

    return () => clearInterval(serverPollId);
  }, [fetchSnapshot, syncWithLocalBridge]);

  useEffect(() => {
    if (snapshot.aps.length === 0) return;
    const bridgeInterval = setInterval(() => {
      void syncWithLocalBridge(snapshot.aps.map((ap) => ap.ip));
    }, 30000);
    return () => clearInterval(bridgeInterval);
  }, [snapshot.aps, syncWithLocalBridge]);

  useEffect(() => {
    const unsubscribe = initGmailAuthListener((user) => {
      setGmailUser(user);
      if (!user) {
        setHasActiveToken(false);
      } else {
        setHasActiveToken(Boolean(getCachedGmailAccessToken()));
      }
    });
    return unsubscribe;
  }, []);

  const handleAlertConfigChange = useCallback((next: EmailAlertConfig) => {
    setAlertConfig(next);
    try {
      localStorage.setItem(ALERT_CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const appendAlertLog = useCallback((entry: EmailAlertLogEntry) => {
    setAlertLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const handleGmailSignIn = useCallback(async (): Promise<boolean> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { user } = await signInWithGmail();
      setGmailUser(user);
      setHasActiveToken(true);
      return true;
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleGmailSignOut = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOutGmail();
      setGmailUser(null);
      setHasActiveToken(false);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSendTestEmail = useCallback(
    async (recipientEmail: string): Promise<{ ok: boolean; message: string }> => {
      const token = getCachedGmailAccessToken();
      if (!token) {
        setHasActiveToken(false);
        return {
          ok: false,
          message: 'La sesión de Gmail expiró o no está activa. Volvé a conectar tu cuenta.',
        };
      }

      const scheduleStatus = getAlertScheduleStatus();
      const effectiveSource: 'server' | 'agent' = localBridgeConnected
        ? 'agent'
        : snapshot.telemetrySource;
      const offlineAps = snapshot.aps.filter((ap) => ap.status === 'offline');

      const { subject, htmlBody, apSummary } = buildAlertEmailContent({
        kind: 'test',
        recipientEmail,
        senderEmail: gmailUser?.email,
        offlineAps,
        allAps: snapshot.aps,
        telemetrySource: effectiveSource,
        scheduleStatus,
      });

      try {
        const res = await sendGmailAlertEmail({
          accessToken: token,
          recipientEmail,
          subject,
          htmlBody,
        });
        const msg = `Correo de prueba enviado correctamente a ${recipientEmail} (ID: ${res.id}).`;
        appendAlertLog({
          id: `${Date.now()}-test`,
          timestamp: new Date().toISOString(),
          kind: 'test',
          recipient: recipientEmail,
          subject,
          apSummary,
          success: true,
          message: msg,
        });
        return { ok: true, message: msg };
      } catch (err) {
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: number }).status
            : undefined;
        if (status === 401 || status === 403) {
          invalidateGmailAccessToken();
          setHasActiveToken(false);
        }
        const errMsg =
          err instanceof Error ? err.message : 'No se pudo enviar el correo de prueba.';
        appendAlertLog({
          id: `${Date.now()}-test-err`,
          timestamp: new Date().toISOString(),
          kind: 'test',
          recipient: recipientEmail,
          subject,
          apSummary,
          success: false,
          message: errMsg,
        });
        return { ok: false, message: errMsg };
      }
    },
    [
      appendAlertLog,
      gmailUser?.email,
      localBridgeConnected,
      snapshot.aps,
      snapshot.telemetrySource,
    ],
  );

  // Automatic down-alert evaluator: Mon-Fri 09:00-16:00 Buenos Aires, only when real telemetry is active
  useEffect(() => {
    if (snapshot.aps.length === 0) return;

    // Reset cooldown when an AP recovers to online or slow
    for (const ap of snapshot.aps) {
      if (ap.status === 'online' || ap.status === 'slow') {
        delete lastAlertedAtRef.current[ap.id];
      }
    }

    const telemetryReachable = localBridgeConnected || !snapshot.privateSubnetUnreachable;
    if (!telemetryReachable || !alertConfig.autoEnabled || !hasActiveToken) return;

    const recipient = alertConfig.recipientEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return;

    const scheduleStatus = getAlertScheduleStatus();
    if (!scheduleStatus.isWithinWindow) return;

    const token = getCachedGmailAccessToken();
    if (!token) {
      setHasActiveToken(false);
      return;
    }

    const nowMs = Date.now();
    const cooldownMs =
      alertConfig.cooldownMinutes > 0
        ? alertConfig.cooldownMinutes * 60 * 1000
        : Number.POSITIVE_INFINITY;

    const apsToAlert = snapshot.aps.filter((ap) => {
      if (ap.status !== 'offline') return false;
      const lastSent = lastAlertedAtRef.current[ap.id];
      if (lastSent === undefined) return true;
      return nowMs - lastSent >= cooldownMs;
    });

    if (apsToAlert.length === 0 || autoSendInFlightRef.current) return;

    autoSendInFlightRef.current = true;
    const effectiveSource: 'server' | 'agent' = localBridgeConnected
      ? 'agent'
      : snapshot.telemetrySource;

    const { subject, htmlBody, apSummary } = buildAlertEmailContent({
      kind: 'auto',
      recipientEmail: recipient,
      senderEmail: gmailUser?.email,
      offlineAps: apsToAlert,
      allAps: snapshot.aps,
      telemetrySource: effectiveSource,
      scheduleStatus,
    });

    // Stamp before async call to prevent duplicate sends across rapid re-renders
    for (const ap of apsToAlert) {
      lastAlertedAtRef.current[ap.id] = nowMs;
    }

    void sendGmailAlertEmail({
      accessToken: token,
      recipientEmail: recipient,
      subject,
      htmlBody,
    })
      .then((res) => {
        appendAlertLog({
          id: `${Date.now()}-auto`,
          timestamp: new Date().toISOString(),
          kind: 'auto',
          recipient,
          subject,
          apSummary,
          success: true,
          message: `Alarma automática enviada (ID: ${res.id}).`,
        });
      })
      .catch((err) => {
        // Roll back timestamps on failure so next cycle can retry
        for (const ap of apsToAlert) {
          delete lastAlertedAtRef.current[ap.id];
        }
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: number }).status
            : undefined;
        if (status === 401 || status === 403) {
          invalidateGmailAccessToken();
          setHasActiveToken(false);
        }
        appendAlertLog({
          id: `${Date.now()}-auto-err`,
          timestamp: new Date().toISOString(),
          kind: 'auto',
          recipient,
          subject,
          apSummary,
          success: false,
          message:
            err instanceof Error ? err.message : 'Error al enviar la alarma automática.',
        });
      })
      .finally(() => {
        autoSendInFlightRef.current = false;
      });
  }, [
    alertConfig.autoEnabled,
    alertConfig.cooldownMinutes,
    alertConfig.recipientEmail,
    appendAlertLog,
    gmailUser?.email,
    hasActiveToken,
    localBridgeConnected,
    snapshot.aps,
    snapshot.privateSubnetUnreachable,
    snapshot.telemetrySource,
  ]);

  const handlePingAll = async () => {
    setSnapshot((prev) => ({ ...prev, isScanning: true }));
    try {
      const usedBridge = await syncWithLocalBridge(snapshot.aps.map((ap) => ap.ip));
      if (usedBridge) {
        setSnapshot((prev) => ({ ...prev, isScanning: false }));
        return;
      }

      const res = await fetch('/api/monitor/ping-all', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Error al ejecutar ping general');
      }
      const data = (await res.json()) as MonitorSnapshot;
      setSnapshot(data);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'No se pudo completar el ping general',
      );
      setSnapshot((prev) => ({ ...prev, isScanning: false }));
    }
  };

  const handlePingOne = async (id: string) => {
    const targetAp = snapshot.aps.find((ap) => ap.id === id);
    setPingingIds((prev) => ({ ...prev, [id]: true }));
    try {
      if (targetAp && localBridgeConnected) {
        const usedBridge = await syncWithLocalBridge([targetAp.ip]);
        if (usedBridge) return;
      }

      const res = await fetch(`/api/monitor/ping/${encodeURIComponent(id)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('No se pudo verificar el Access Point');
      }
      const data = (await res.json()) as { snapshot: MonitorSnapshot };
      setSnapshot(data.snapshot);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Error al realizar ping individual',
      );
    } finally {
      setPingingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAddAp = async (input: ApInput) => {
    const res = await fetch('/api/aps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo agregar el Access Point');
    }
    setSnapshot(data.snapshot as MonitorSnapshot);
  };

  const handleUpdateAp = async (id: string, input: ApInput) => {
    const res = await fetch(`/api/aps/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo actualizar el Access Point');
    }
    setSnapshot(data.snapshot as MonitorSnapshot);
  };

  const handleDeleteAp = async (id: string) => {
    const res = await fetch(`/api/aps/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (res.ok) {
      setSnapshot(data.snapshot as MonitorSnapshot);
    }
  };

  const handleResetDefaults = async () => {
    const res = await fetch('/api/aps/reset', { method: 'POST' });
    const data = (await res.json()) as MonitorSnapshot;
    if (res.ok) {
      setSnapshot(data);
    }
  };

  const handleUpdateThreshold = async (ms: number) => {
    const res = await fetch('/api/monitor/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slowThresholdMs: ms }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo actualizar el umbral');
    }
    setSnapshot(data as MonitorSnapshot);
  };

  const handleSaveSpeed = async (
    id: string,
    downloadMbps: number | null,
    uploadMbps: number | null,
  ) => {
    const res = await fetch(`/api/aps/${encodeURIComponent(id)}/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadMbps, uploadMbps }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo guardar la velocidad');
    }
    setSnapshot(data.snapshot as MonitorSnapshot);
  };

  const handleColumnFilterChange = <K extends keyof ColumnFilters>(
    key: K,
    value: ColumnFilters[K],
  ) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSortColumn = (column: SortColumn) => {
    setSortConfig((prev) => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: null, direction: 'asc' };
    });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setColumnFilters(INITIAL_COLUMN_FILTERS);
    setSortConfig({ column: null, direction: 'asc' });
  };

  const models = useMemo(() => {
    return Array.from(new Set(snapshot.aps.map((ap) => normalizeModel(ap.model)))).sort();
  }, [snapshot.aps]);

  const floors = useMemo(() => {
    return Array.from(new Set(snapshot.aps.map((ap) => ap.floor)));
  }, [snapshot.aps]);

  const portIds = useMemo(() => {
    return Array.from(
      new Set(snapshot.aps.map((ap) => ap.portId).filter(Boolean)),
    ).sort();
  }, [snapshot.aps]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      columnFilters.model !== 'all' ||
      columnFilters.floor !== 'all' ||
      columnFilters.sector.trim() !== '' ||
      columnFilters.ip.trim() !== '' ||
      columnFilters.portId !== 'all' ||
      columnFilters.latency !== 'all' ||
      columnFilters.speed !== 'all' ||
      columnFilters.status !== 'all'
    );
  }, [searchQuery, columnFilters]);

  const filteredAndSortedAps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sectorFilter = columnFilters.sector.trim().toLowerCase();
    const ipFilter = columnFilters.ip.trim().toLowerCase();

    const filtered = snapshot.aps.filter((ap) => {
      if (
        columnFilters.model !== 'all' &&
        normalizeModel(ap.model) !== columnFilters.model
      ) {
        return false;
      }
      if (columnFilters.floor !== 'all' && ap.floor !== columnFilters.floor) {
        return false;
      }
      if (sectorFilter && !ap.sector.toLowerCase().includes(sectorFilter)) {
        return false;
      }
      if (ipFilter && !ap.ip.toLowerCase().includes(ipFilter)) {
        return false;
      }
      if (columnFilters.portId !== 'all' && ap.portId !== columnFilters.portId) {
        return false;
      }
      if (columnFilters.latency !== 'all') {
        if (columnFilters.latency === 'none' && ap.latencyMs !== null) return false;
        if (
          columnFilters.latency === 'optimal' &&
          (ap.latencyMs === null || ap.latencyMs >= snapshot.slowThresholdMs)
        ) {
          return false;
        }
        if (
          columnFilters.latency === 'high' &&
          (ap.latencyMs === null || ap.latencyMs < snapshot.slowThresholdMs)
        ) {
          return false;
        }
      }
      if (columnFilters.speed !== 'all') {
        if (columnFilters.speed === 'measured' && ap.speedMbps === null) return false;
        if (columnFilters.speed === 'unmeasured' && ap.speedMbps !== null) return false;
      }
      if (columnFilters.status !== 'all' && ap.status !== columnFilters.status) {
        return false;
      }
      if (q) {
        const speedText = ap.speedMbps !== null ? `${ap.speedMbps} mbps` : 'sin medir';
        const haystack =
          `${ap.model} ${ap.floor} ${ap.sector} ${ap.ip} ${ap.portId} ${speedText}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (!sortConfig.column) return filtered;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const statusOrder: Record<ApStatus, number> = {
      online: 1,
      slow: 2,
      offline: 3,
      pending: 4,
    };

    return [...filtered].sort((a, b) => {
      switch (sortConfig.column) {
        case 'model':
          return normalizeModel(a.model).localeCompare(normalizeModel(b.model)) * dir;
        case 'floor':
          return a.floor.localeCompare(b.floor, 'es') * dir;
        case 'sector':
          return a.sector.localeCompare(b.sector, 'es') * dir;
        case 'ip':
          return compareIps(a.ip, b.ip) * dir;
        case 'portId':
          return a.portId.localeCompare(b.portId) * dir;
        case 'latencyMs': {
          const valA = a.latencyMs ?? Number.POSITIVE_INFINITY;
          const valB = b.latencyMs ?? Number.POSITIVE_INFINITY;
          return (valA - valB) * dir;
        }
        case 'speedMbps': {
          const valA = a.speedMbps ?? -1;
          const valB = b.speedMbps ?? -1;
          return (valA - valB) * dir;
        }
        case 'status':
          return (statusOrder[a.status] - statusOrder[b.status]) * dir;
        default:
          return 0;
      }
    });
  }, [
    snapshot.aps,
    snapshot.slowThresholdMs,
    searchQuery,
    columnFilters,
    sortConfig,
  ]);

  const activeHistoryAp: AccessPoint | null = useMemo(
    () => snapshot.aps.find((item) => item.id === historyApId) ?? null,
    [snapshot.aps, historyApId],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header isScanning={snapshot.isScanning} onPingAll={handlePingAll} />

      <main className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-7 flex-1">
        <div className="md:hidden mb-4 text-center">
          <h1 className="font-display text-lg font-extrabold text-[#1A1A1A] uppercase tracking-wide">
            Monitoreo Wifi - EMUI
          </h1>
        </div>

        {errorBanner && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-[#E74C3C]/10 border border-[#E74C3C]/30 text-xs font-semibold text-[#C0392B]">
            {errorBanner}
          </div>
        )}

        <UpdateBar
          lastCycleAt={snapshot.lastCycleAt}
          nextCycleAt={snapshot.nextCycleAt}
          intervalSeconds={snapshot.intervalSeconds}
          slowThresholdMs={snapshot.slowThresholdMs}
          isScanning={snapshot.isScanning}
          telemetrySource={localBridgeConnected ? 'agent' : snapshot.telemetrySource}
          privateSubnetUnreachable={
            !localBridgeConnected && snapshot.privateSubnetUnreachable
          }
          emailAlertsActive={hasActiveToken && alertConfig.autoEnabled}
          onRefresh={handlePingAll}
          onOpenAgentModal={() => setAgentModalOpen(true)}
          onOpenEmailAlertsModal={() => setEmailAlertsModalOpen(true)}
        />

        <SummaryCards
          summary={snapshot.summary}
          activeStatusFilter={columnFilters.status}
          onSelectStatus={(status) => handleColumnFilterChange('status', status)}
        />

        <Toolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hasActiveFilters={hasActiveFilters}
          filteredCount={filteredAndSortedAps.length}
          totalCount={snapshot.aps.length}
          onClearFilters={clearAllFilters}
          onExportExcel={() =>
            exportApsToExcelCsv(filteredAndSortedAps, snapshot.slowThresholdMs)
          }
          onOpenManage={() => setManageOpen(true)}
        />

        <ApTable
          aps={filteredAndSortedAps}
          loading={loading}
          pingingIds={pingingIds}
          slowThresholdMs={snapshot.slowThresholdMs}
          models={models}
          floors={floors}
          portIds={portIds}
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          sortConfig={sortConfig}
          onSortColumn={handleSortColumn}
          onPingOne={handlePingOne}
          onSelectHistory={(ap) => setHistoryApId(ap.id)}
          onClearFilters={clearAllFilters}
        />

        <Legend slowThresholdMs={snapshot.slowThresholdMs} />
      </main>

      <Footer />

      <ApHistoryModal
        ap={activeHistoryAp}
        slowThresholdMs={snapshot.slowThresholdMs}
        isPinging={activeHistoryAp ? Boolean(pingingIds[activeHistoryAp.id]) : false}
        onPingOne={handlePingOne}
        onSaveSpeed={handleSaveSpeed}
        onClose={() => setHistoryApId(null)}
      />

      <ManageApsModal
        isOpen={manageOpen}
        aps={snapshot.aps}
        slowThresholdMs={snapshot.slowThresholdMs}
        onClose={() => setManageOpen(false)}
        onAddAp={handleAddAp}
        onUpdateAp={handleUpdateAp}
        onDeleteAp={handleDeleteAp}
        onResetDefaults={handleResetDefaults}
        onUpdateThreshold={handleUpdateThreshold}
      />

      <LanAgentModal
        isOpen={agentModalOpen}
        aps={snapshot.aps}
        localBridgeConnected={localBridgeConnected}
        onTestBridge={() => syncWithLocalBridge(snapshot.aps.map((ap) => ap.ip))}
        onSnapshotUpdate={setSnapshot}
        onClose={() => setAgentModalOpen(false)}
      />

      <EmailAlertsModal
        isOpen={emailAlertsModalOpen}
        gmailUser={gmailUser}
        hasActiveToken={hasActiveToken}
        authBusy={authBusy}
        authError={authError}
        config={alertConfig}
        aps={snapshot.aps}
        telemetrySource={localBridgeConnected ? 'agent' : snapshot.telemetrySource}
        privateSubnetUnreachable={!localBridgeConnected && snapshot.privateSubnetUnreachable}
        logs={alertLogs}
        onSignIn={handleGmailSignIn}
        onSignOut={handleGmailSignOut}
        onConfigChange={handleAlertConfigChange}
        onSendTestEmail={handleSendTestEmail}
        onClose={() => setEmailAlertsModalOpen(false)}
      />
    </div>
  );
}
