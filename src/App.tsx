import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApHistoryModal } from './components/ApHistoryModal';
import { ApTable } from './components/ApTable';
import { FloorSummaryStrip } from './components/FloorSummaryStrip';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LanAgentModal } from './components/LanAgentModal';
import { Legend } from './components/Legend';
import { ManageApsModal } from './components/ManageApsModal';
import { MessagingAlertsModal } from './components/MessagingAlertsModal';
import { SummaryCards } from './components/SummaryCards';
import { Toolbar } from './components/Toolbar';
import { UpdateBar } from './components/UpdateBar';
import type {
  AccessPoint,
  AgentPingItem,
  AlertMonitorState,
  ApInput,
  ApStatus,
  ColumnFilters,
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
  uptime: 'all',
  status: 'all',
};

const EMPTY_ALERT_STATE: AlertMonitorState = {
  autoEnabled: true,
  cooldownMinutes: 30,
  channels: {
    whatsappConfigured: false,
    telegramConfigured: false,
  },
  scheduleStatus: {
    isWithinWindow: false,
    dayLabel: 'Lunes',
    timeLabel: '09:00 hs',
    reason: 'Verificando ventana horaria...',
  },
  logs: [],
};

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
  const [alertsModalOpen, setAlertsModalOpen] = useState<boolean>(false);
  const [localBridgeConnected, setLocalBridgeConnected] = useState<boolean>(false);
  const [alertState, setAlertState] = useState<AlertMonitorState>(EMPTY_ALERT_STATE);
  const agentTokenRef = useRef<string | null>(null);
  const bridgeInFlightRef = useRef<Promise<boolean> | null>(null);
  const ipsRef = useRef<string[]>([]);

  const isPrivateTargetIp = (ip: string) =>
    /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

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
      if (bridgeInFlightRef.current) {
        return bridgeInFlightRef.current;
      }

      const run = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
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
        } finally {
          bridgeInFlightRef.current = null;
        }
      })();

      bridgeInFlightRef.current = run;
      return run;
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

  const ipsKey = useMemo(
    () => snapshot.aps.map((ap) => ap.ip).join(','),
    [snapshot.aps],
  );

  useEffect(() => {
    ipsRef.current = snapshot.aps.map((ap) => ap.ip);
  }, [snapshot.aps]);

  useEffect(() => {
    if (!ipsKey) return;
    const bridgeInterval = setInterval(() => {
      void syncWithLocalBridge(ipsRef.current);
    }, 30000);
    return () => clearInterval(bridgeInterval);
  }, [ipsKey, syncWithLocalBridge]);

  const fetchAlertState = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = (await res.json()) as AlertMonitorState;
        setAlertState(data);
      }
    } catch {
      // Ignore background fetch failures
    }
  }, []);

  useEffect(() => {
    void fetchAlertState();
    const timer = setInterval(() => {
      void fetchAlertState();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchAlertState]);

  const handleUpdateAlertConfig = useCallback(
    async (autoEnabled: boolean, cooldownMinutes: number) => {
      const res = await fetch('/api/alerts/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoEnabled, cooldownMinutes }),
      });
      if (res.ok) {
        const data = (await res.json()) as AlertMonitorState;
        setAlertState(data);
      }
    },
    [],
  );

  const handleSendTestAlert = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    try {
      const res = await fetch('/api/alerts/test', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        state?: AlertMonitorState;
      };
      if (data.state) {
        setAlertState(data.state);
      }
      return {
        ok: Boolean(res.ok && data.ok),
        message: data.message ?? 'Error al enviar la alerta de prueba.',
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : 'No se pudo contactar al servidor de alertas.',
      };
    }
  }, []);

  const handlePingAll = async () => {
    const ips = snapshot.aps.map((ap) => ap.ip);
    const allPrivate = ips.length > 0 && ips.every(isPrivateTargetIp);
    setSnapshot((prev) => ({ ...prev, isScanning: true }));
    try {
      const usedBridge = await syncWithLocalBridge(ips);
      if (usedBridge) {
        setSnapshot((prev) => ({ ...prev, isScanning: false }));
        return;
      }

      if (snapshot.isCloudHost && allPrivate) {
        await fetchSnapshot();
        setSnapshot((prev) => ({ ...prev, isScanning: false }));
        setErrorBanner(
          'No se pudo contactar al Agente Red Local (.bat) en esta PC. Se conservaron los últimos datos sin pisarlos con errores de la nube.',
        );
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
      if (targetAp && (localBridgeConnected || snapshot.telemetrySource === 'agent' || snapshot.isCloudHost)) {
        const usedBridge = await syncWithLocalBridge([targetAp.ip]);
        if (usedBridge) return;
        if (snapshot.isCloudHost && isPrivateTargetIp(targetAp.ip)) {
          setErrorBanner(
            `No se pudo contactar al Agente Red Local (.bat) para verificar ${targetAp.ip}. Verificá que la ventana del .bat siga abierta.`,
          );
          return;
        }
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

  const handleResetStats = async () => {
    const res = await fetch('/api/monitor/reset-stats', { method: 'POST' });
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
      columnFilters.uptime !== 'all' ||
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
      if (columnFilters.uptime !== 'all') {
        if (
          columnFilters.uptime === 'healthy' &&
          (ap.uptimePercent === null || ap.uptimePercent < 99)
        ) {
          return false;
        }
        if (
          columnFilters.uptime === 'degraded' &&
          (ap.uptimePercent === null || ap.uptimePercent >= 99)
        ) {
          return false;
        }
        if (columnFilters.uptime === 'withOutages' && (ap.outageCount ?? 0) === 0) {
          return false;
        }
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
        case 'uptimePercent': {
          const valA = a.uptimePercent ?? -1;
          const valB = b.uptimePercent ?? -1;
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
          alertsActive={
            alertState.autoEnabled &&
            (alertState.channels.whatsappConfigured || alertState.channels.telegramConfigured)
          }
          onRefresh={handlePingAll}
          onOpenAgentModal={() => setAgentModalOpen(true)}
          onOpenAlertsModal={() => {
            void fetchAlertState();
            setAlertsModalOpen(true);
          }}
        />

        <SummaryCards
          summary={snapshot.summary}
          activeStatusFilter={columnFilters.status}
          onSelectStatus={(status) => handleColumnFilterChange('status', status)}
        />

        <FloorSummaryStrip
          aps={snapshot.aps}
          activeFloor={columnFilters.floor}
          onSelectFloor={(floor) => handleColumnFilterChange('floor', floor)}
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
        onResetStats={handleResetStats}
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

      <MessagingAlertsModal
        isOpen={alertsModalOpen}
        alertState={alertState}
        aps={snapshot.aps}
        privateSubnetUnreachable={!localBridgeConnected && snapshot.privateSubnetUnreachable}
        onUpdateConfig={handleUpdateAlertConfig}
        onSendTestAlert={handleSendTestAlert}
        onClose={() => setAlertsModalOpen(false)}
      />
    </div>
  );
}
