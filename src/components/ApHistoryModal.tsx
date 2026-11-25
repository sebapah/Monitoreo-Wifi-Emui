import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Radio,
  X,
  XCircle,
} from 'lucide-react';
import type { AccessPoint } from '../types/ap';
import { MerakiModelThumb } from './MerakiModelThumb';

interface ApHistoryModalProps {
  ap: AccessPoint | null;
  slowThresholdMs: number;
  isPinging: boolean;
  onPingOne: (id: string) => void;
  onSaveSpeed: (
    id: string,
    downloadMbps: number | null,
    uploadMbps: number | null,
  ) => Promise<void>;
  onClose: () => void;
}

export function ApHistoryModal({
  ap,
  slowThresholdMs,
  isPinging,
  onPingOne,
  onSaveSpeed,
  onClose,
}: ApHistoryModalProps) {
  const [downInput, setDownInput] = useState<string>('');
  const [upInput, setUpInput] = useState<string>('');
  const [savingSpeed, setSavingSpeed] = useState(false);
  const [speedError, setSpeedError] = useState<string | null>(null);

  useEffect(() => {
    if (!ap) return;
    setDownInput(ap.speedMbps !== null ? String(ap.speedMbps) : '');
    setUpInput(ap.uploadMbps !== null ? String(ap.uploadMbps) : '');
    setSpeedError(null);
  }, [ap]);

  if (!ap) return null;

  const handleSaveSpeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpeedError(null);
    const downVal = downInput.trim() ? Number(downInput) : null;
    const upVal = upInput.trim() ? Number(upInput) : null;
    if (downVal !== null && (!Number.isFinite(downVal) || downVal <= 0)) {
      setSpeedError('Ingresá un valor válido en Mbps mayor a 0.');
      return;
    }
    setSavingSpeed(true);
    try {
      await onSaveSpeed(ap.id, downVal, upVal);
    } catch (err) {
      setSpeedError(
        err instanceof Error ? err.message : 'No se pudo guardar la velocidad.',
      );
    } finally {
      setSavingSpeed(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[#DEE2E6] shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-4 border-b border-black/10"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <MerakiModelThumb model={ap.model} size="md" />
            <div className="min-w-0">
              <h2
                id="history-modal-title"
                className="font-display text-base font-extrabold text-[#1A1A1A] truncate"
              >
                {ap.sector} · {ap.floor}
              </h2>
              <p className="text-xs font-medium text-[#1A1A1A]/80 font-mono tabular-nums">
                {ap.model} · IP {ap.ip} · Boca {ap.portId || '—'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="w-8 h-8 rounded-lg bg-[#1A1A1A]/10 hover:bg-[#1A1A1A]/20 text-[#1A1A1A] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Métricas actuales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6C757D] block">
                Latencia Prom.
              </span>
              <span className="font-mono text-lg font-bold text-[#1A1A1A] tabular-nums">
                {ap.latencyMs !== null ? `${ap.latencyMs} ms` : '—'}
              </span>
            </div>

            <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6C757D] block">
                Mín / Máx
              </span>
              <span className="font-mono text-lg font-bold text-[#1A1A1A] tabular-nums">
                {ap.minMs !== null && ap.maxMs !== null
                  ? `${ap.minMs}/${ap.maxMs}`
                  : '—'}
              </span>
            </div>

            <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6C757D] block">
                Jitter
              </span>
              <span className="font-mono text-lg font-bold text-[#1A1A1A] tabular-nums">
                {ap.jitterMs !== null ? `${ap.jitterMs} ms` : '—'}
              </span>
            </div>

            <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6C757D] block">
                Pérdida
              </span>
              <span className="font-mono text-lg font-bold text-[#1A1A1A] tabular-nums">
                {ap.packetLoss !== null ? `${ap.packetLoss}%` : '—'}
              </span>
            </div>
          </div>

          <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#495057] space-y-0.5">
              <div>
                <strong className="text-[#1A1A1A]">Diagnóstico:</strong> {ap.detail}
              </div>
              <div className="text-[#6C757D] tabular-nums">
                Última vez en línea:{' '}
                {ap.lastOnlineAt
                  ? new Date(ap.lastOnlineAt).toLocaleString('es-AR')
                  : 'Sin registros exitosos todavía'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onPingOne(ap.id)}
              disabled={isPinging}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#FFD700] text-xs font-bold hover:bg-[#2D2D2D] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Radio className={`w-3.5 h-3.5 ${isPinging ? 'animate-pulse' : ''}`} />
              <span>{isPinging ? 'Midiendo...' : 'Probar IP ahora'}</span>
            </button>
          </div>

          {/* Medición Fast.com del AP */}
          <form
            onSubmit={handleSaveSpeed}
            className="bg-white border border-[#DEE2E6] rounded-lg p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-[#2C3E50]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#343A40]">
                  Velocidad Wi-Fi medida con Fast.com
                </h3>
              </div>

              <a
                href="https://fast.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#1A1A1A] bg-[#FFD700] hover:bg-[#E6B800] px-2.5 py-1 rounded transition-colors"
              >
                <span>Abrir Fast.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-[11px] text-[#6C757D]">
              Conectate al Wi-Fi de este sector ({ap.sector}), medí en Fast.com y registrá los Mbps reales acá.
              {ap.speedCheckedAt && (
                <span className="block text-[#495057] mt-0.5 tabular-nums">
                  Última medición: {new Date(ap.speedCheckedAt).toLocaleString('es-AR')}
                </span>
              )}
            </p>

            {speedError && (
              <p className="text-xs font-semibold text-[#C0392B]">{speedError}</p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Bajada (Mbps)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10000"
                  value={downInput}
                  onChange={(e) => setDownInput(e.target.value)}
                  placeholder="Ej: 120"
                  className="w-28 h-9 px-2.5 rounded-md border border-[#CED4DA] font-mono text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Subida (opcional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10000"
                  value={upInput}
                  onChange={(e) => setUpInput(e.target.value)}
                  placeholder="Ej: 45"
                  className="w-28 h-9 px-2.5 rounded-md border border-[#CED4DA] font-mono text-sm tabular-nums"
                />
              </div>

              <button
                type="submit"
                disabled={savingSpeed}
                className="h-9 px-3.5 rounded-md bg-[#27AE60] hover:bg-[#1E8449] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSpeed ? 'Guardando...' : 'Guardar Mbps'}
              </button>
            </div>
          </form>

          {/* Historial de mediciones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#495057]">
                Historial reciente de Ping (cada 30 seg)
              </h3>
              <span className="text-[11px] text-[#6C757D] tabular-nums">
                Umbral lenta: ≥ {slowThresholdMs} ms
              </span>
            </div>

            {ap.history.length === 0 ? (
              <p className="text-xs text-[#6C757D] py-6 text-center bg-[#F8F9FA] rounded-lg border border-[#E9ECEF]">
                Aún no hay registros históricos guardados para este Access Point.
              </p>
            ) : (
              <div className="border border-[#E9ECEF] rounded-lg divide-y divide-[#E9ECEF] max-h-64 overflow-y-auto">
                {ap.history.map((item, idx) => (
                  <div
                    key={`${item.timestamp}-${idx}`}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#FFF8DC]/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === 'online' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#27AE60] shrink-0" />
                      ) : item.status === 'slow' ? (
                        <AlertTriangle className="w-4 h-4 text-[#E67E22] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#E74C3C] shrink-0" />
                      )}
                      <span className="font-mono text-[#495057] tabular-nums shrink-0">
                        {new Date(item.timestamp).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      <span className="text-[#6C757D] truncate">{item.detail}</span>
                    </div>

                    <div className="font-mono font-semibold text-[#1A1A1A] tabular-nums shrink-0">
                      {item.latencyMs !== null ? `${item.latencyMs} ms` : 'Timeout'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
