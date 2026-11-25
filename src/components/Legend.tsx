interface LegendProps {
  slowThresholdMs: number;
}

export function Legend({ slowThresholdMs }: LegendProps) {
  return (
    <div className="mt-5 bg-white/85 backdrop-blur-md border border-[#E9ECEF] rounded-[10px] px-5 py-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#495057] font-medium">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-[#27AE60] shrink-0" aria-hidden="true" />
        <span className="tabular-nums">Operativa (&lt; {slowThresholdMs} ms · 0% pérdida)</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-[#E67E22] shrink-0" aria-hidden="true" />
        <span className="tabular-nums">
          Conexión Lenta (≥ {slowThresholdMs} ms o pérdida parcial)
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-[#E74C3C] shrink-0" aria-hidden="true" />
        <span>Fuera de Línea (Sin respuesta / No computa latencia)</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[3px] bg-[#ADB5BD] shrink-0" aria-hidden="true" />
        <span>Pendiente de verificación</span>
      </div>
    </div>
  );
}
