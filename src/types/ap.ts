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
  status: ApStatus | 'all';
}

export interface EmailAlertConfig {
  recipientEmail: string;
  autoEnabled: boolean;
  cooldownMinutes: number;
}

export interface EmailAlertLogEntry {
  id: string;
  timestamp: string;
  kind: 'auto' | 'test';
  recipient: string;
  subject: string;
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
