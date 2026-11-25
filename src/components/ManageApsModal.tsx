import { useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { AccessPoint, ApInput } from '../types/ap';

interface ManageApsModalProps {
  isOpen: boolean;
  aps: AccessPoint[];
  slowThresholdMs: number;
  onClose: () => void;
  onAddAp: (input: ApInput) => Promise<void>;
  onUpdateAp: (id: string, input: ApInput) => Promise<void>;
  onDeleteAp: (id: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onUpdateThreshold: (ms: number) => Promise<void>;
}

const EMPTY_FORM: ApInput = {
  model: 'MR 33',
  floor: '1 Piso',
  sector: '',
  ip: '',
  portId: '',
};

export function ManageApsModal({
  isOpen,
  aps,
  slowThresholdMs,
  onClose,
  onAddAp,
  onUpdateAp,
  onDeleteAp,
  onResetDefaults,
  onUpdateThreshold,
}: ManageApsModalProps) {
  const [form, setForm] = useState<ApInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState<number>(slowThresholdMs);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const startEdit = (ap: AccessPoint) => {
    setEditingId(ap.id);
    setForm({
      model: ap.model,
      floor: ap.floor,
      sector: ap.sector,
      ip: ap.ip,
      portId: ap.portId,
    });
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.model.trim() || !form.floor.trim() || !form.sector.trim() || !form.ip.trim()) {
      setErrorMsg('Completá modelo, piso, ubicación e IP.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await onUpdateAp(editingId, form);
      } else {
        await onAddAp(form);
      }
      cancelEdit();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar el Access Point');
    } finally {
      setSubmitting(false);
    }
  };

  const handleThresholdSave = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onUpdateThreshold(thresholdInput);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar umbral');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[#DEE2E6] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-4 border-b border-black/10"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
          }}
        >
          <div>
            <h2
              id="manage-modal-title"
              className="font-display text-base font-extrabold text-[#1A1A1A]"
            >
              Administración de Access Points y Umbral de Latencia
            </h2>
            <p className="text-xs font-medium text-[#1A1A1A]/75">
              Agregá, editá o probá nuevos equipos Meraki en la red EMUI
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar administración"
            className="w-8 h-8 rounded-lg bg-[#1A1A1A]/10 hover:bg-[#1A1A1A]/20 text-[#1A1A1A] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="px-4 py-2.5 rounded-lg bg-[#E74C3C]/10 border border-[#E74C3C]/30 text-xs font-semibold text-[#C0392B]">
              {errorMsg}
            </div>
          )}

          {/* Configuración umbral de conexión lenta */}
          <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#343A40]">
                Umbral para considerar conexión lenta
              </h3>
              <p className="text-xs text-[#6C757D]">
                Los APs operables con latencia igual o superior a este valor se marcarán como Conexión Lenta.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={20}
                max={2000}
                step={10}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(Number(e.target.value))}
                className="w-24 h-9 px-2.5 rounded-md border border-[#CED4DA] bg-white font-mono text-sm text-[#1A1A1A] tabular-nums"
              />
              <span className="text-xs font-semibold text-[#495057]">ms</span>
              <button
                type="button"
                onClick={handleThresholdSave}
                disabled={submitting}
                className="h-9 px-3 rounded-md bg-[#343A40] text-white text-xs font-semibold hover:bg-[#1A1A1A] transition-colors cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>

          {/* Formulario alta / edición */}
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#DEE2E6] rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#343A40]">
                {editingId ? 'Editar Access Point' : 'Agregar Access Point'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-xs font-semibold text-[#6C757D] hover:text-[#1A1A1A] cursor-pointer"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Modelo
                </label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="MR 33"
                  className="w-full h-9 px-2.5 rounded-md border border-[#CED4DA] text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Piso
                </label>
                <input
                  type="text"
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                  placeholder="3 Piso"
                  className="w-full h-9 px-2.5 rounded-md border border-[#CED4DA] text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Ubicación / Sector
                </label>
                <input
                  type="text"
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  placeholder="Ej: Sala de reuniones"
                  className="w-full h-9 px-2.5 rounded-md border border-[#CED4DA] text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Boca / ID
                </label>
                <input
                  type="text"
                  value={form.portId}
                  onChange={(e) => setForm({ ...form, portId: e.target.value })}
                  placeholder="6340301"
                  className="w-full h-9 px-2.5 rounded-md border border-[#CED4DA] font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
              <div className="flex-1 min-w-[200px] max-w-xs">
                <label className="block text-[11px] font-semibold text-[#495057] mb-1">
                  Dirección IP / Host
                </label>
                <input
                  type="text"
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  placeholder="10.25.5.18"
                  className="w-full h-9 px-2.5 rounded-md border border-[#CED4DA] font-mono text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="h-9 px-4 rounded-md bg-[#27AE60] hover:bg-[#1E8449] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{editingId ? 'Guardar cambios' : 'Agregar y hacer Ping'}</span>
              </button>
            </div>
          </form>

          {/* Listado rápido */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#343A40]">
                Equipos registrados ({aps.length})
              </h3>
              <button
                type="button"
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await onResetDefaults();
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#495057] hover:text-[#1A1A1A] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar lista original EMUI</span>
              </button>
            </div>

            <div className="border border-[#E9ECEF] rounded-lg divide-y divide-[#E9ECEF] max-h-56 overflow-y-auto">
              {aps.map((ap) => (
                <div
                  key={ap.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F8F9FA]"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-[#1A1A1A]">{ap.sector}</span>
                    <span className="text-[#6C757D]">
                      {' '}
                      · {ap.floor} · {ap.model} ·{' '}
                    </span>
                    <span className="font-mono text-[#343A40]">{ap.ip}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(ap)}
                      title="Editar"
                      className="p-1.5 rounded hover:bg-[#E9ECEF] text-[#495057] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAp(ap.id)}
                      title="Eliminar"
                      className="p-1.5 rounded hover:bg-[#E74C3C]/10 text-[#E74C3C] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
