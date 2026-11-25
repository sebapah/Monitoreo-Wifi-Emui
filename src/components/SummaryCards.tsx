import { Activity, CheckCircle2, Gauge, Wifi, WifiOff } from 'lucide-react';
import type { ApStatus, MonitorSummary } from '../types/ap';

interface SummaryCardsProps {
  summary: MonitorSummary;
  activeStatusFilter: ApStatus | 'all';
  onSelectStatus: (status: ApStatus | 'all') => void;
}

export function SummaryCards({
  summary,
  activeStatusFilter,
  onSelectStatus,
}: SummaryCardsProps) {
  const toggleFilter = (target: ApStatus | 'all') => {
    if (target !== 'all' && activeStatusFilter === target) {
      onSelectStatus('all');
    } else {
      onSelectStatus(target);
    }
  };

  return (
    <section
      aria-label="Resumen de estado de Access Points"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5"
    >
      {/* Total APs */}
      <button
        type="button"
        onClick={() => toggleFilter('all')}
        className={`text-left bg-white/85 backdrop-blur-md rounded-[10px] p-5 border transition-all duration-150 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
          activeStatusFilter === 'all'
            ? 'border-[#2C3E50]/35 ring-1 ring-[#2C3E50]/15'
            : 'border-[#E9ECEF]'
        }`}
      >
        <div className="w-12 h-12 rounded-lg bg-[#2C3E50]/10 text-[#2C3E50] flex items-center justify-center shrink-0">
          <Wifi className="w-6 h-6" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6C757D] truncate">
            Total Access Points
          </span>
          <span className="font-display text-[28px] font-extrabold leading-tight text-[#2C3E50] tabular-nums">
            {summary.total}
          </span>
          <span className="text-[11px] text-[#6C757D] tabular-nums">
            {summary.avgLatencyMs !== null
              ? `Promedio red: ${summary.avgLatencyMs} ms`
              : 'Meraki EMUI (Pisos 1 a 4)'}
          </span>
        </div>
      </button>

      {/* Operativas */}
      <button
        type="button"
        onClick={() => toggleFilter('online')}
        className={`text-left bg-white/85 backdrop-blur-md rounded-[10px] p-5 border transition-all duration-150 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
          activeStatusFilter === 'online'
            ? 'border-[#27AE60] ring-1 ring-[#27AE60]/25'
            : 'border-[#E9ECEF]'
        }`}
      >
        <div className="w-12 h-12 rounded-lg bg-[#27AE60]/10 text-[#27AE60] flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6C757D] truncate">
            Operativas
          </span>
          <span className="font-display text-[28px] font-extrabold leading-tight text-[#27AE60] tabular-nums">
            {summary.online}
          </span>
          <span className="text-[11px] text-[#6C757D]">En línea · Latencia óptima</span>
        </div>
      </button>

      {/* Conexión Lenta */}
      <button
        type="button"
        onClick={() => toggleFilter('slow')}
        className={`text-left bg-white/85 backdrop-blur-md rounded-[10px] p-5 border transition-all duration-150 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
          activeStatusFilter === 'slow'
            ? 'border-[#E67E22] ring-1 ring-[#E67E22]/25'
            : 'border-[#E9ECEF]'
        }`}
      >
        <div className="w-12 h-12 rounded-lg bg-[#E67E22]/12 text-[#E67E22] flex items-center justify-center shrink-0">
          <Gauge className="w-6 h-6" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6C757D] truncate">
            Conexión Lenta
          </span>
          <span className="font-display text-[28px] font-extrabold leading-tight text-[#E67E22] tabular-nums">
            {summary.slow}
          </span>
          <span className="text-[11px] text-[#6C757D]">Latencia alta o pérdida parcial</span>
        </div>
      </button>

      {/* Fuera de Línea */}
      <button
        type="button"
        onClick={() => toggleFilter('offline')}
        className={`text-left bg-white/85 backdrop-blur-md rounded-[10px] p-5 border transition-all duration-150 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
          activeStatusFilter === 'offline'
            ? 'border-[#E74C3C] ring-1 ring-[#E74C3C]/25'
            : 'border-[#E9ECEF]'
        }`}
      >
        <div className="w-12 h-12 rounded-lg bg-[#E74C3C]/10 text-[#E74C3C] flex items-center justify-center shrink-0">
          {summary.pending > 0 && summary.offline === 0 ? (
            <Activity className="w-6 h-6" />
          ) : (
            <WifiOff className="w-6 h-6" />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6C757D] truncate">
            Fuera de Línea
          </span>
          <span className="font-display text-[28px] font-extrabold leading-tight text-[#E74C3C] tabular-nums">
            {summary.offline}
          </span>
          <span className="text-[11px] text-[#6C757D]">
            {summary.pending > 0 ? `${summary.pending} verificando...` : 'Sin respuesta ICMP'}
          </span>
        </div>
      </button>
    </section>
  );
}
