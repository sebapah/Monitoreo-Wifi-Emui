import { useEffect, useState } from 'react';
import { Bell, Clock, Network, RefreshCw } from 'lucide-react';

interface UpdateBarProps {
  lastCycleAt: string | null;
  nextCycleAt: string;
  intervalSeconds: number;
  slowThresholdMs: number;
  isScanning: boolean;
  telemetrySource: 'server' | 'agent';
  privateSubnetUnreachable: boolean;
  alertsActive: boolean;
  onRefresh: () => void;
  onOpenAgentModal: () => void;
  onOpenAlertsModal: () => void;
}

function formatCountdown(targetIso: string): string {
  const diffMs = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function UpdateBar({
  lastCycleAt,
  nextCycleAt,
  intervalSeconds,
  slowThresholdMs,
  isScanning,
  telemetrySource,
  privateSubnetUnreachable,
  alertsActive,
  onRefresh,
  onOpenAgentModal,
  onOpenAlertsModal,
}: UpdateBarProps) {
  const [countdown, setCountdown] = useState<string>(() => formatCountdown(nextCycleAt));

  useEffect(() => {
    setCountdown(formatCountdown(nextCycleAt));
    const timer = setInterval(() => {
      setCountdown(formatCountdown(nextCycleAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [nextCycleAt]);

  const formattedLastCheck = lastCycleAt
    ? new Date(lastCycleAt).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Ejecutando primer sondeo ICMP...';

  return (
    <div className="space-y-3 mb-6">
      <div className="bg-white/80 backdrop-blur-md border border-[#E9ECEF] rounded-[10px] px-4 sm:px-5 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#495057]">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isScanning ? 'bg-[#E67E22] animate-pulse' : 'bg-[#27AE60]'
            }`}
            aria-hidden="true"
          />
          <span className="font-medium text-[#343A40]">
            {isScanning ? 'Ejecutando ping a las IPs...' : `Último chequeo: ${formattedLastCheck}`}
          </span>
          <span className="text-[#ADB5BD] hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#6C757D] tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#6C757D]" />
            Próximo ciclo ({intervalSeconds} seg):{' '}
            <strong className="font-mono text-[#343A40]">{countdown}</strong>
          </span>
          <span className="text-[#ADB5BD] hidden md:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-[#6C757D] tabular-nums hidden md:inline">
            {telemetrySource === 'agent' ? 'Origen: Agente LAN EMUI · ' : ''}
            Umbral lenta: ≥ {slowThresholdMs} ms
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenAlertsModal}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              alertsActive
                ? 'bg-[#EAFAF1] border-[#27AE60]/40 text-[#1E8449] hover:bg-[#D5F5E3]'
                : 'bg-[#FFF8DC] border-[#E6B800]/60 text-[#1A1A1A] hover:bg-[#FFD700]/30'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{alertsActive ? 'Alertas WhatsApp · Activa' : 'Alertas WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAgentModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#DEE2E6] text-xs font-semibold text-[#343A40] hover:bg-[#FFF8DC] hover:border-[#E6B800] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Network className="w-3.5 h-3.5 text-[#2C3E50]" />
            <span>Agente Red Local</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isScanning}
            title="Ejecutar ping a todas las IPs ahora"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F1F3F5] border border-[#DEE2E6] text-xs font-semibold text-[#495057] hover:bg-[#E9ECEF] hover:text-[#1A1A1A] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {privateSubnetUnreachable && (
        <div className="bg-[#FFF8DC] border border-[#E6B800]/50 rounded-[10px] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#1A1A1A]">
          <div className="space-y-0.5 max-w-3xl">
            <p className="font-bold">
              Subred privada 10.25.5.x no alcanzable desde este servidor en la nube
            </p>
            <p className="text-[#495057]">
              Las IPs <span className="font-mono">10.25.5.x</span> pertenecen a la red interna del EMUI y no son ruteables desde Internet. Para monitorearlas en vivo cada 30 segundos, ejecutá el Agente LAN en una PC dentro del EMUI (sin instalar nada) o corré este proyecto en tu red local.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAgentModal}
            className="px-3.5 py-2 rounded-md bg-[#1A1A1A] text-[#FFD700] text-xs font-bold hover:bg-[#2D2D2D] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Conectar Red Local EMUI
          </button>
        </div>
      )}
    </div>
  );
}
