export type ApStatus = 'online' | 'slow' | 'offline' | 'pending';

export interface PingRecord {
  timestamp: string;
  status: ApStatus;
  latencyMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  jitterMs: number | null;
  packetLoss: number;
  detail: string;
  source?: 'server' | 'agent';
}

export interface OutageEvent {
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  source: 'server' | 'agent';
}

export interface AccessPoint {
  id: string;
  model: string;
  floor: string;
  sector: string;
  ip: string;
  portId: string;
  status: ApStatus;
  latencyMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  jitterMs: number | null;
  packetLoss: number | null;
  lastCheckedAt: string | null;
  lastOnlineAt: string | null;
  speedMbps: number | null;
  uploadMbps: number | null;
  speedCheckedAt: string | null;
  totalChecks: number;
  successfulChecks: number;
  uptimePercent: number | null;
  outageCount: number;
  offlineSince: string | null;
  activeOutageStartedAt: string | null;
  lastOutageAt: string | null;
  lastOutageDurationSec: number | null;
  outages: OutageEvent[];
  detail: string;
  history: PingRecord[];
}

export interface MonitorSummary {
  total: number;
  online: number;
  slow: number;
  offline: number;
  pending: number;
  avgLatencyMs: number | null;
}

export interface MonitorSnapshot {
  aps: AccessPoint[];
  summary: MonitorSummary;
  lastCycleAt: string | null;
  nextCycleAt: string;
  intervalSeconds: number;
  slowThresholdMs: number;
  isScanning: boolean;
  telemetrySource: 'server' | 'agent';
  lastAgentReportAt: string | null;
  isCloudHost: boolean;
  privateSubnetUnreachable: boolean;
}

export interface ApInput {
  model: string;
  floor: string;
  sector: string;
  ip: string;
  portId: string;
}

export interface AgentPingItem {
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
  minMs?: number | null;
  maxMs?: number | null;
  packetLoss?: number;
  detail?: string;
}

export type SortColumn =
  | 'model'
  | 'floor'
  | 'sector'
  | 'ip'
  | 'portId'
  | 'latencyMs'
  | 'speedMbps'
  | 'uptimePercent'
  | 'status';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  column: SortColumn | null;
  direction: SortDirection;
}

export interface ColumnFilters {
  model: string;
  floor: string;
  sector: string;
  ip: string;
  portId: string;
  latency: 'all' | 'optimal' | 'high' | 'none';
  speed: 'all' | 'measured' | 'unmeasured';
  uptime: 'all' | 'healthy' | 'degraded' | 'withOutages';
  status: ApStatus | 'all';
}

export interface AlertChannelsStatus {
  whatsappConfigured: boolean;
  telegramConfigured: boolean;
}

export interface AlertLogEntry {
  id: string;
  timestamp: string;
  kind: 'auto' | 'test';
  channel: string;
  apSummary: string;
  success: boolean;
  message: string;
}

export interface ScheduleWindowStatus {
  isWithinWindow: boolean;
  dayLabel: string;
  timeLabel: string;
  reason: string;
}

export interface AlertMonitorState {
  autoEnabled: boolean;
  cooldownMinutes: number;
  channels: AlertChannelsStatus;
  scheduleStatus: ScheduleWindowStatus;
  logs: AlertLogEntry[];
}

