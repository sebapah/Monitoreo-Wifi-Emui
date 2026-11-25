import { BaLogo } from './BaLogo';

export function Footer() {
  return (
    <footer className="bg-[#343A40] text-white/85 border-t-[3px] border-[#FFD700] py-5 px-4 sm:px-8 mt-auto">
      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <BaLogo variant="light" />

        <div className="flex flex-col items-center text-center gap-0.5">
          <span className="text-xs sm:text-sm font-semibold text-white">
            EMUI — Ente de Mantenimiento Urbano Integral
          </span>
          <span className="text-[11px] text-white/60">
            Monitoreo de Red Wi-Fi Cisco Meraki · Gobierno de la Ciudad de Buenos Aires
          </span>
        </div>

        <div className="text-xs text-white/70 font-medium whitespace-nowrap">
          Ping automático cada 30 segundos
        </div>
      </div>
    </footer>
  );
}
