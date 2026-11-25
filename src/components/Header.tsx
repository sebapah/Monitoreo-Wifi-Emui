import { RefreshCw } from 'lucide-react';
import { BaLogo } from './BaLogo';

interface HeaderProps {
  isScanning: boolean;
  onPingAll: () => void;
}

export function Header({ isScanning, onPingAll }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-black/10 shadow-md"
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[74px] flex items-center justify-between gap-6">
        <BaLogo variant="dark" />

        <div className="hidden md:flex flex-col items-center text-center min-w-0">
          <h1 className="font-display text-[20px] lg:text-[22px] font-extrabold tracking-wide text-[#1A1A1A] uppercase leading-tight truncate">
            Monitoreo Wifi - EMUI
          </h1>
          <span className="text-[11px] font-semibold text-[#1A1A1A]/75 tracking-wide whitespace-nowrap">
            Access Points Cisco Meraki · Control de Operatividad
          </span>
        </div>

        <button
          type="button"
          onClick={onPingAll}
          disabled={isScanning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A1A1A] text-[#FFD700] text-xs font-bold tracking-wide hover:bg-[#2D2D2D] active:scale-[0.98] disabled:opacity-65 disabled:cursor-not-allowed transition-all shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Verificando...' : 'Ping General'}</span>
        </button>
      </div>
    </header>
  );
}
