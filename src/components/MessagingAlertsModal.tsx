import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import type { AccessPoint, AlertMonitorState } from '../types/ap';

interface MessagingAlertsModalProps {
  isOpen: boolean;
  alertState: AlertMonitorState;
  aps: AccessPoint[];
  privateSubnetUnreachable: boolean;
  onUpdateConfig: (autoEnabled: boolean, cooldownMinutes: number) => Promise<void>;
  onSendTestAlert: () => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}

function buildWhatsappShareUrl(aps: AccessPoint[]): string {
  const nowStr = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const offline = aps.filter((ap) => ap.status === 'offline');
  const lines = [
    `*Monitoreo Wifi - EMUI* (${nowStr})`,
    offline.length > 0
      ? `APs fuera de línea (${offline.length}):`
      : `Todos los APs verificados (${aps.length} equipos):`,
    ...aps.map(
      (ap) =>
        `• ${ap.sector} (${ap.floor}) - ${ap.ip}: ${
          ap.status === 'offline'
            ? 'FUERA DE LÍNEA'
            : ap.status === 'slow'
              ? `LENTA (${ap.latencyMs ?? '?'} ms)`
              : ap.status === 'online'
                ? `EN LÍNEA (${ap.latencyMs ?? '?'} ms)`
                : 'PENDIENTE'
        }`,
    ),
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function MessagingAlertsModal({
  isOpen,
  alertState,
  aps,
  privateSubnetUnreachable,
  onUpdateConfig,
  onSendTestAlert,
  onClose,
}: MessagingAlertsModalProps) {
  const [savingConfig, setSavingConfig] = useState(false);
  const [confirmTestOpen, setConfirmTestOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const { whatsappConfigured, telegramConfigured } = alertState.channels;
  const anyChannelConfigured = whatsappConfigured || telegramConfigured;
  const whatsappShareUrl = buildWhatsappShareUrl(aps);

  const handleToggleAuto = async (checked: boolean) => {
    setSavingConfig(true);
    try {
      await onUpdateConfig(checked, alertState.cooldownMinutes);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleChangeCooldown = async (minutes: number) => {
    setSavingConfig(true);
    try {
      await onUpdateConfig(alertState.autoEnabled, minutes);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleConfirmTest = async () => {
    setSendingTest(true);
    setTestFeedback(null);
    try {
      const result = await onSendTestAlert();
      setTestFeedback(result);
      if (result.ok) {
        setConfirmTestOpen(false);
      }
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="msg-alerts-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-[#DEE2E6] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-4 border-b border-black/10"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] text-[#FFD700] flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="msg-alerts-title"
                className="font-display text-base font-extrabold text-[#1A1A1A]"
              >
                Alarmas Gratuitas (WhatsApp / Telegram)
              </h2>
              <p className="text-xs font-medium text-[#1A1A1A]/80">
                Sin Google Cloud ni costos · Lunes a Viernes de 09:00 a 16:00 hs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg bg-[#1A1A1A]/10 hover:bg-[#1A1A1A]/20 text-[#1A1A1A] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#495057]">
          {/* Schedule Status */}
          <div
            className={`rounded-lg border p-3.5 flex flex-wrap items-center justify-between gap-2 ${
              alertState.scheduleStatus.isWithinWindow
                ? 'bg-[#EAFAF1] border-[#27AE60]/30 text-[#1E8449]'
                : 'bg-[#F8F9FA] border-[#DEE2E6] text-[#495057]'
            }`}
          >
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-bold text-[#1A1A1A]">
                  Ventana operativa: Lunes a Viernes · 09:00 a 16:00 hs (Buenos Aires)
                </p>
                <p className="text-xs tabular-nums">{alertState.scheduleStatus.reason}</p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${
                alertState.scheduleStatus.isWithinWindow
                  ? 'bg-[#27AE60] text-white'
                  : 'bg-[#6C757D] text-white'
              }`}
            >
              {alertState.scheduleStatus.isWithinWindow ? 'En horario' : 'Fuera de horario'}
            </span>
          </div>

          {privateSubnetUnreachable && (
            <div className="rounded-lg border border-[#E6B800]/60 bg-[#FFF8DC] p-3.5 flex items-start gap-2.5 text-[#1A1A1A]">
              <AlertTriangle className="w-4 h-4 text-[#B9770E] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Protección antifalsos positivos activa</p>
                <p className="text-[#495057] leading-relaxed">
                  Mientras este servidor en la nube no esté recibiendo lecturas del{' '}
                  <strong>Agente Red Local (.bat)</strong>, las alarmas automáticas quedan en pausa para no disparar falsas caídas. Podés ejecutar una prueba manual en cualquier momento.
                </p>
              </div>
            </div>
          )}

          {/* Free Channels Setup */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-[#DEE2E6] rounded-lg p-3.5 bg-[#F8F9FA] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#1E8449]" />
                  WhatsApp (CallMeBot)
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    whatsappConfigured
                      ? 'bg-[#EAFAF1] text-[#1E8449] border border-[#27AE60]/30'
                      : 'bg-[#FFF3CD] text-[#856404]'
                  }`}
                >
                  {whatsappConfigured ? 'Activo' : 'Sin configurar'}
                </span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#495057] leading-relaxed">
                <li>
                  Agendá <strong className="font-mono text-[#1A1A1A]">+34 644 91 96 80</strong> en WhatsApp y enviale:{' '}
                  <code className="bg-white px-1 py-0.5 rounded border border-[#DEE2E6] text-[#1A1A1A]">
                    I allow callmebot to send me messages
                  </code>
                </li>
                <li>El bot te responderá al instante con tu API key gratuita.</li>
                <li>
                  En <strong>Secrets</strong> (o <code className="font-mono">.env</code>) cargá{' '}
                  <code className="font-mono font-bold">CALLMEBOT_PHONE</code> (ej.{' '}
                  <code className="font-mono">54911XXXXXXXX</code>) y{' '}
                  <code className="font-mono font-bold">CALLMEBOT_APIKEY</code>.
                </li>
              </ol>
            </div>

            <div className="border border-[#DEE2E6] rounded-lg p-3.5 bg-[#F8F9FA] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-[#2C3E50]" />
                  Telegram Bot (Grupos)
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    telegramConfigured
                      ? 'bg-[#EAFAF1] text-[#1E8449] border border-[#27AE60]/30'
                      : 'bg-[#E9ECEF] text-[#495057]'
                  }`}
                >
                  {telegramConfigured ? 'Activo' : 'Opcional'}
                </span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#495057] leading-relaxed">
                <li>
                  Creá un bot gratis con <strong className="text-[#1A1A1A]">@BotFather</strong> en Telegram (<code className="font-mono">/newbot</code>) y sumalo al grupo de Sistemas EMUI.
                </li>
                <li>
                  En <strong>Secrets</strong> (o <code className="font-mono">.env</code>) cargá{' '}
                  <code className="font-mono font-bold">TELEGRAM_BOT_TOKEN</code> y{' '}
                  <code className="font-mono font-bold">TELEGRAM_CHAT_ID</code>.
                </li>
                <li>Ideal si querés que la alerta llegue a todo el equipo al mismo tiempo.</li>
              </ol>
            </div>
          </div>

          {/* Rules Configuration */}
          <div className="border border-[#DEE2E6] rounded-lg p-4 space-y-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alertState.autoEnabled}
                  disabled={savingConfig}
                  onChange={(e) => void handleToggleAuto(e.target.checked)}
                  className="w-4 h-4 rounded border-[#CED4DA] accent-[#1A1A1A] cursor-pointer"
                />
                <span className="text-xs font-semibold text-[#1A1A1A]">
                  Activar alarmas automáticas ante caídas (Lun–Vie 09:00–16:00 hs)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="msg-alert-cooldown"
                  className="text-[11px] font-bold uppercase text-[#6C757D]"
                >
                  Repetición:
                </label>
                <select
                  id="msg-alert-cooldown"
                  value={alertState.cooldownMinutes}
                  disabled={savingConfig}
                  onChange={(e) =>
                    void handleChangeCooldown(Number.parseInt(e.target.value, 10) || 0)
                  }
                  className="h-8 px-2.5 rounded-md border border-[#CED4DA] bg-white text-xs text-[#1A1A1A] font-medium focus:outline-none focus:border-[#E6B800]"
                >
                  <option value={0}>Solo al caer</option>
                  <option value={15}>Cada 15 min</option>
                  <option value={30}>Cada 30 min</option>
                  <option value={60}>Cada 60 min</option>
                </select>
              </div>
            </div>
          </div>

          {/* Test Section */}
          <div className="border border-[#DEE2E6] rounded-lg p-4 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1A1A]">Probar envío de alerta</h3>
                <p className="text-xs text-[#6C757D]">
                  Dispará un mensaje de prueba al canal configurado o compartí el estado actual por WhatsApp Web.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#27AE60]/40 bg-[#EAFAF1] hover:bg-[#D5F5E3] text-xs font-bold text-[#1E8449] transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Enviar por WhatsApp Web</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setTestFeedback(null);
                    setConfirmTestOpen(true);
                  }}
                  disabled={!anyChannelConfigured || confirmTestOpen}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold text-[#1A1A1A] shadow-xs hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Probar alerta automática</span>
                </button>
              </div>
            </div>

            {!anyChannelConfigured && (
              <p className="text-[11px] text-[#B9770E] font-medium">
                Para las alertas automáticas en segundo plano, agregá primero las variables gratuitas en Secrets (arriba). Mientras tanto podés probar el formato al instante con <strong>Enviar por WhatsApp Web</strong>.
              </p>
            )}

            {confirmTestOpen && (
              <div className="rounded-lg border border-[#E6B800] bg-[#FFF8DC] p-3.5 space-y-3">
                <p className="font-bold text-xs text-[#1A1A1A]">
                  Confirmar envío de mensaje de prueba (
                  {[
                    whatsappConfigured ? 'WhatsApp' : null,
                    telegramConfigured ? 'Telegram' : null,
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                  )
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmTestOpen(false)}
                    disabled={sendingTest}
                    className="px-3 py-1.5 rounded-md border border-[#CED4DA] bg-white hover:bg-[#F1F3F5] text-xs font-semibold text-[#495057] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmTest()}
                    disabled={sendingTest}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#1A1A1A] text-[#FFD700] text-xs font-bold hover:bg-[#2D2D2D] cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Enviando...' : 'Confirmar y enviar ahora'}</span>
                  </button>
                </div>
              </div>
            )}

            {testFeedback && (
              <div
                className={`px-3.5 py-2.5 rounded-md border text-xs font-semibold flex items-center gap-2 ${
                  testFeedback.ok
                    ? 'bg-[#EAFAF1] border-[#27AE60]/30 text-[#1E8449]'
                    : 'bg-[#FDEDEC] border-[#E74C3C]/30 text-[#C0392B]'
                }`}
              >
                {testFeedback.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{testFeedback.message}</span>
              </div>
            )}
          </div>

          {/* History */}
          <div className="border border-[#DEE2E6] rounded-lg overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-[#343A40] text-white text-xs font-bold flex items-center justify-between">
              <span>Historial de alertas enviadas</span>
              <span className="text-[#FFD700] tabular-nums">{alertState.logs.length}</span>
            </div>
            {alertState.logs.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-[#6C757D]">
                Todavía no se registraron envíos de alarma.
              </div>
            ) : (
              <div className="divide-y divide-[#E9ECEF] max-h-40 overflow-y-auto">
                {alertState.logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            entry.kind === 'test'
                              ? 'bg-[#FFF3CD] text-[#856404]'
                              : 'bg-[#FDEDEC] text-[#C0392B]'
                          }`}
                        >
                          {entry.kind === 'test' ? 'Prueba' : 'Alarma'}
                        </span>
                        <span className="font-semibold text-[#1A1A1A] truncate">
                          {entry.apSummary}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6C757D] truncate">
                        {entry.channel} · {entry.message}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[#6C757D] tabular-nums shrink-0">
                      {new Date(entry.timestamp).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
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
