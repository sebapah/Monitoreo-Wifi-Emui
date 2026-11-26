import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BaLogo } from './BaLogo';

interface HeaderProps {
  isScanning: boolean;
  onPingAll: () => void;
}

function getBuenosAiresClock(now: Date = new Date()): { time: string; date: string } {
  const time = now.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = now.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return { time, date };
}

export function Header({ isScanning, onPingAll }: HeaderProps) {
  const [clock, setClock] = useState<{ time: string; date: string }>(() =>
    getBuenosAiresClock(),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(getBuenosAiresClock());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 border-b border-black/10 shadow-md"
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 min-h-[76px] py-2 flex items-center justify-between gap-4">
        <BaLogo variant="dark" />

        <div className="hidden md:flex flex-col items-center text-center min-w-0">
          <h1 className="font-display text-[20px] lg:text-[22px] font-extrabold tracking-wide text-[#1A1A1A] uppercase leading-tight truncate">
            Monitoreo Wifi - EMUI
          </h1>
          <span className="text-[11px] font-semibold text-[#1A1A1A]/75 tracking-wide whitespace-nowrap">
            Access Points Cisco Meraki · Control de Operatividad
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div
            aria-label="Hora actual en Buenos Aires"
            className="bg-[#1A1A1A] text-[#FFD700] rounded-lg px-3.5 py-1.5 shadow-sm flex flex-col items-end border border-black/20"
          >
            <span className="font-mono text-xl sm:text-2xl font-extrabold leading-none tracking-tight tabular-nums">
              {clock.time}
            </span>
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wide mt-0.5 tabular-nums whitespace-nowrap">
              {clock.date}
            </span>
          </div>

          <button
            type="button"
            onClick={onPingAll}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-lg bg-[#1A1A1A] text-[#FFD700] text-xs font-bold tracking-wide hover:bg-[#2D2D2D] active:scale-[0.98] disabled:opacity-65 disabled:cursor-not-allowed transition-all shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isScanning ? 'Verificando...' : 'Ping General'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
