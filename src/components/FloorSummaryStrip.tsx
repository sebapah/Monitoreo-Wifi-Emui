import { Layers } from 'lucide-react';
import type { AccessPoint } from '../types/ap';

interface FloorSummaryStripProps {
  aps: AccessPoint[];
  activeFloor: string;
  onSelectFloor: (floor: string) => void;
}

function parseFloorNumber(floor: string): number {
  const m = floor.match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : 0;
}

export function FloorSummaryStrip({
  aps,
  activeFloor,
  onSelectFloor,
}: FloorSummaryStripProps) {
  if (aps.length === 0) return null;

  const grouped = new Map<string, AccessPoint[]>();
  for (const ap of aps) {
    const list = grouped.get(ap.floor) ?? [];
    list.push(ap);
    grouped.set(ap.floor, list);
  }

  const floors = Array.from(grouped.entries()).sort(
    ([a], [b]) => parseFloorNumber(b) - parseFloorNumber(a),
  );

  return (
    <section
      aria-label="Resumen por piso"
      className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
    >
      {floors.map(([floor, list]) => {
        const isSelected = activeFloor === floor;
        const okCount = list.filter(
          (ap) => ap.status === 'online' || ap.status === 'slow',
        ).length;
        const offlineCount = list.filter((ap) => ap.status === 'offline').length;
        const latencies = list
          .map((ap) => ap.latencyMs)
          .filter((v): v is number => v !== null);
        const avgMs =
          latencies.length > 0
            ? Math.round(
                (latencies.reduce((acc, v) => acc + v, 0) / latencies.length) * 10,
              ) / 10
            : null;
        const outages = list.reduce((acc, ap) => acc + (ap.outageCount ?? 0), 0);

        const healthColor =
          offlineCount === list.length
            ? 'text-[#C0392B]'
            : offlineCount > 0
              ? 'text-[#D35400]'
              : 'text-[#1E8449]';

        return (
          <button
            key={floor}
            type="button"
            onClick={() => onSelectFloor(isSelected ? 'all' : floor)}
            className={`text-left bg-white/85 backdrop-blur-md rounded-[10px] px-3.5 py-2.5 border transition-all cursor-pointer flex items-center justify-between gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-[#E6B800] ${
              isSelected
                ? 'border-[#E6B800] ring-2 ring-[#FFD700]/35 bg-[#FFFDF2]'
                : 'border-[#E9ECEF]'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                <Layers className="w-3.5 h-3.5 text-[#6C757D] shrink-0" />
                <span className="truncate">{floor}</span>
              </div>
              <div className="text-[11px] text-[#6C757D] tabular-nums mt-0.5">
                {avgMs !== null ? `${avgMs} ms prom.` : 'Sin latencia'} · {outages}{' '}
                {outages === 1 ? 'caída' : 'caídas'}
              </div>
            </div>

            <div className={`font-mono text-sm font-extrabold tabular-nums shrink-0 ${healthColor}`}>
              {okCount}/{list.length}
            </div>
          </button>
        );
      })}
    </section>
  );
}
