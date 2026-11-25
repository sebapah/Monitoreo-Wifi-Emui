import { Download, RotateCcw, Search, Settings2 } from 'lucide-react';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  hasActiveFilters: boolean;
  filteredCount: number;
  totalCount: number;
  onClearFilters: () => void;
  onExportExcel: () => void;
  onOpenManage: () => void;
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  filteredCount,
  totalCount,
  onClearFilters,
  onExportExcel,
  onOpenManage,
}: ToolbarProps) {
  return (
    <div className="bg-white/85 backdrop-blur-md border border-[#E9ECEF] rounded-[10px] px-4 sm:px-5 py-3.5 mb-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
        <div className="relative flex-1 min-w-[220px] max-w-[340px]">
          <Search className="w-4 h-4 text-[#6C757D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Búsqueda rápida en todas las columnas..."
            aria-label="Buscar Access Point"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[#CED4DA] bg-white text-sm text-[#343A40] placeholder:text-[#ADB5BD] focus:outline-none focus:border-[#E6B800] focus:ring-2 focus:ring-[#FFD700]/25 transition-colors"
          />
        </div>

        <span className="text-xs font-medium text-[#6C757D] tabular-nums whitespace-nowrap">
          Mostrando <strong className="text-[#1A1A1A]">{filteredCount}</strong> de {totalCount}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-8 px-2.5 rounded-md border border-[#DEE2E6] bg-[#F8F9FA] hover:bg-[#E9ECEF] text-xs font-semibold text-[#495057] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpiar filtros</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onExportExcel}
          className="h-9 px-4 rounded-md text-xs font-bold text-white inline-flex items-center gap-2 shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
          style={{
            background: 'linear-gradient(135deg, #27AE60 0%, #1E8449 100%)',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Descargar Excel</span>
        </button>

        <button
          type="button"
          onClick={onOpenManage}
          className="h-9 px-4 rounded-md text-xs font-bold text-[#1A1A1A] inline-flex items-center gap-2 shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
          }}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Gestionar APs</span>
        </button>
      </div>
    </div>
  );
}
