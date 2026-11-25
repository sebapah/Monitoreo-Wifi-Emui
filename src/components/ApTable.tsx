import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Copy,
  History,
  Loader2,
  Radio,
  XCircle,
} from 'lucide-react';
import type {
  AccessPoint,
  ApStatus,
  ColumnFilters,
  SortColumn,
  SortConfig,
} from '../types/ap';
import { MerakiModelThumb } from './MerakiModelThumb';

interface ApTableProps {
  aps: AccessPoint[];
  loading: boolean;
  pingingIds: Record<string, boolean>;
  slowThresholdMs: number;
  models: string[];
  floors: string[];
  portIds: string[];
  columnFilters: ColumnFilters;
  onColumnFilterChange: <K extends keyof ColumnFilters>(
    key: K,
    value: ColumnFilters[K],
  ) => void;
  sortConfig: SortConfig;
  onSortColumn: (column: SortColumn) => void;
  onPingOne: (id: string) => void;
  onSelectHistory: (ap: AccessPoint) => void;
  onClearFilters: () => void;
}

export function ApTable({
  aps,
  loading,
  pingingIds,
  slowThresholdMs,
  models,
  floors,
  portIds,
  columnFilters,
  onColumnFilterChange,
  sortConfig,
  onSortColumn,
  onPingOne,
  onSelectHistory,
  onClearFilters,
}: ApTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyIp = async (id: string, ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) {
      return <ArrowUpDown className="w-3 h-3 text-white/45 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#FFD700] shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#FFD700] shrink-0" />
    );
  };

  const renderSortHeader = (label: string, column: SortColumn) => (
    <button
      type="button"
      onClick={() => onSortColumn(column)}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:text-[#FFD700] transition-colors cursor-pointer whitespace-nowrap"
    >
      <span>{label}</span>
      {renderSortIcon(column)}
    </button>
  );

  const renderStatus = (ap: AccessPoint, isPinging: boolean) => {
    if (isPinging || ap.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6C757D] whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E6B800]" />
          Verificando
        </span>
      );
    }

    if (ap.status === 'online') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E8449] whitespace-nowrap">
          <CheckCircle2 className="w-4 h-4 text-[#27AE60] shrink-0" />
          Operativa
        </span>
      );
    }

    if (ap.status === 'slow') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D35400] whitespace-nowrap">
          <AlertTriangle className="w-4 h-4 text-[#E67E22] shrink-0" />
          Conexión Lenta
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C0392B] whitespace-nowrap">
        <XCircle className="w-4 h-4 text-[#E74C3C] shrink-0" />
        Fuera de Línea
      </span>
    );
  };

  const renderLatency = (ap: AccessPoint) => {
    if (ap.status === 'pending') {
      return <span className="text-xs text-[#6C757D]">Pendiente...</span>;
    }

    if (ap.status === 'offline' || ap.latencyMs === null) {
      return (
        <div className="flex flex-col">
          <span className="text-xs font-medium text-[#6C757D]">Sin respuesta</span>
          <span className="text-[11px] text-[#ADB5BD]">No computa latencia</span>
        </div>
      );
    }

    const ratio = Math.min(100, Math.round((ap.latencyMs / slowThresholdMs) * 100));
    const barColor = ap.status === 'slow' ? 'bg-[#E67E22]' : 'bg-[#27AE60]';
    const textColor = ap.status === 'slow' ? 'text-[#D35400]' : 'text-[#1E8449]';

    return (
      <div className="flex flex-col gap-1 min-w-[115px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-mono text-xs font-bold tabular-nums ${textColor}`}>
            {ap.latencyMs} ms
          </span>
          {ap.packetLoss !== null && ap.packetLoss > 0 && (
            <span className="text-[11px] font-semibold text-[#D35400] tabular-nums">
              {ap.packetLoss}% pérd.
            </span>
          )}
        </div>
        <div className="w-full h-1.5 bg-[#E9ECEF] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.max(8, ratio)}%` }}
          />
        </div>
      </div>
    );
  };

  const filterInputClass =
    'w-full h-7 px-2 rounded border border-[#CED4DA] bg-white text-[11px] text-[#343A40] placeholder:text-[#ADB5BD] focus:outline-none focus:border-[#E6B800] focus:ring-1 focus:ring-[#FFD700]/40';

  return (
    <div className="bg-white border border-[#DEE2E6] rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#343A40] text-white">
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Modelo', 'model')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Piso', 'floor')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Ubicación', 'sector')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Dirección IP', 'ip')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Boca / ID', 'portId')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Latencia', 'latencyMs')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Velocidad', 'speedMbps')}
              </th>
              <th className="py-3 px-3.5 whitespace-nowrap">
                {renderSortHeader('Estado', 'status')}
              </th>
              <th className="py-3 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-right whitespace-nowrap">
                Acciones
              </th>
            </tr>

            {/* Fila de filtros por columna */}
            <tr className="bg-[#F1F3F5] border-b border-[#DEE2E6]">
              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por modelo"
                  value={columnFilters.model}
                  onChange={(e) => onColumnFilterChange('model', e.target.value)}
                  className={filterInputClass}
                >
                  <option value="all">Todos</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </th>

              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por piso"
                  value={columnFilters.floor}
                  onChange={(e) => onColumnFilterChange('floor', e.target.value)}
                  className={filterInputClass}
                >
                  <option value="all">Todos</option>
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </th>

              <th className="py-2 px-3.5 font-normal">
                <input
                  type="search"
                  aria-label="Filtrar por ubicación"
                  value={columnFilters.sector}
                  onChange={(e) => onColumnFilterChange('sector', e.target.value)}
                  placeholder="Filtrar sector..."
                  className={filterInputClass}
                />
              </th>

              <th className="py-2 px-3.5 font-normal">
                <input
                  type="search"
                  aria-label="Filtrar por IP"
                  value={columnFilters.ip}
                  onChange={(e) => onColumnFilterChange('ip', e.target.value)}
                  placeholder="Filtrar IP..."
                  className={`${filterInputClass} font-mono`}
                />
              </th>

              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por boca o ID"
                  value={columnFilters.portId}
                  onChange={(e) => onColumnFilterChange('portId', e.target.value)}
                  className={`${filterInputClass} font-mono`}
                >
                  <option value="all">Todas</option>
                  {portIds.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </th>

              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por latencia"
                  value={columnFilters.latency}
                  onChange={(e) =>
                    onColumnFilterChange(
                      'latency',
                      e.target.value as ColumnFilters['latency'],
                    )
                  }
                  className={filterInputClass}
                >
                  <option value="all">Todas</option>
                  <option value="optimal">&lt; {slowThresholdMs} ms</option>
                  <option value="high">≥ {slowThresholdMs} ms</option>
                  <option value="none">Sin respuesta</option>
                </select>
              </th>

              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por velocidad"
                  value={columnFilters.speed}
                  onChange={(e) =>
                    onColumnFilterChange(
                      'speed',
                      e.target.value as ColumnFilters['speed'],
                    )
                  }
                  className={filterInputClass}
                >
                  <option value="all">Todas</option>
                  <option value="measured">Con medición</option>
                  <option value="unmeasured">Sin medir</option>
                </select>
              </th>

              <th className="py-2 px-3.5 font-normal">
                <select
                  aria-label="Filtrar por estado"
                  value={columnFilters.status}
                  onChange={(e) =>
                    onColumnFilterChange(
                      'status',
                      e.target.value as ApStatus | 'all',
                    )
                  }
                  className={filterInputClass}
                >
                  <option value="all">Todos</option>
                  <option value="online">Operativa</option>
                  <option value="slow">Conexión Lenta</option>
                  <option value="offline">Fuera de Línea</option>
                </select>
              </th>

              <th className="py-2 px-3.5 text-right font-normal">
                <button
                  type="button"
                  onClick={onClearFilters}
                  title="Limpiar todos los filtros"
                  className="text-[11px] font-semibold text-[#6C757D] hover:text-[#1A1A1A] cursor-pointer whitespace-nowrap"
                >
                  Limpiar
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E9ECEF]">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td colSpan={9} className="py-4 px-4">
                    <div className="h-4 bg-[#E9ECEF] rounded w-full" />
                  </td>
                </tr>
              ))
            ) : aps.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 px-4 text-center">
                  <p className="text-sm font-medium text-[#495057] mb-2">
                    No se encontraron Access Points con los filtros actuales.
                  </p>
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="text-xs font-semibold text-[#1A1A1A] bg-[#FFD700] hover:bg-[#E6B800] px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                  >
                    Restablecer filtros
                  </button>
                </td>
              </tr>
            ) : (
              aps.map((ap, index) => {
                const isPinging = Boolean(pingingIds[ap.id]);
                const rowBg = index % 2 === 1 ? 'bg-[#F8F9FA]' : 'bg-white';

                return (
                  <tr
                    key={ap.id}
                    className={`${rowBg} hover:bg-[#FFF8DC] transition-colors duration-150`}
                  >
                    <td className="py-2.5 px-3.5 font-semibold text-[#343A40] whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <MerakiModelThumb model={ap.model} />
                        <span>{ap.model}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3.5 text-[#495057] font-medium whitespace-nowrap tabular-nums">
                      {ap.floor}
                    </td>

                    <td className="py-3 px-3.5 text-[#1A1A1A] font-medium">
                      <div className="flex flex-col">
                        <span>{ap.sector}</span>
                        {ap.lastCheckedAt && (
                          <span className="text-[11px] text-[#6C757D] tabular-nums">
                            Chequeo:{' '}
                            {new Date(ap.lastCheckedAt).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleCopyIp(ap.id, ap.ip)}
                        title="Copiar dirección IP"
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-[#343A40] bg-[#F1F3F5] hover:bg-[#E9ECEF] px-2.5 py-1 rounded border border-[#DEE2E6] transition-colors cursor-pointer tabular-nums"
                      >
                        <span>{ap.ip}</span>
                        {copiedId === ap.id ? (
                          <Check className="w-3 h-3 text-[#27AE60]" />
                        ) : (
                          <Copy className="w-3 h-3 text-[#6C757D]" />
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-3.5 font-mono text-xs text-[#495057] whitespace-nowrap tabular-nums">
                      {ap.portId || '—'}
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderLatency(ap)}
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectHistory(ap)}
                        title="Cargar o actualizar velocidad medida en Fast.com"
                        className="text-left group cursor-pointer"
                      >
                        {ap.speedMbps !== null ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-[#1A1A1A] group-hover:text-[#0072BC] tabular-nums">
                              {ap.speedMbps} Mbps
                            </span>
                            <span className="text-[11px] text-[#6C757D] tabular-nums">
                              {ap.uploadMbps !== null ? `↑ ${ap.uploadMbps} Mbps` : 'Fast.com'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-[#6C757D] group-hover:text-[#1A1A1A] underline decoration-dotted underline-offset-2">
                            Sin medir
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderStatus(ap, isPinging)}
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPingOne(ap.id)}
                          disabled={isPinging}
                          title={`Hacer ping a ${ap.ip}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#DEE2E6] bg-white hover:bg-[#F1F3F5] text-xs font-semibold text-[#343A40] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Radio
                            className={`w-3.5 h-3.5 ${
                              isPinging ? 'animate-pulse text-[#E67E22]' : 'text-[#2C3E50]'
                            }`}
                          />
                          <span>Ping</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectHistory(ap)}
                          title="Ver historial, diagnóstico y velocidad Fast.com"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#DEE2E6] bg-white hover:bg-[#F1F3F5] text-xs font-semibold text-[#495057] transition-colors cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 text-[#6C757D]" />
                          <span>Detalle</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
