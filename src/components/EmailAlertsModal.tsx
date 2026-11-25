import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  LogOut,
  Mail,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AccessPoint,
  EmailAlertConfig,
  EmailAlertLogEntry,
  ScheduleWindowStatus,
} from '../types/ap';
import { buildAlertEmailContent, getAlertScheduleStatus } from '../services/gmailAlert';

interface EmailAlertsModalProps {
  isOpen: boolean;
  gmailUser: User | null;
  hasActiveToken: boolean;
  authBusy: boolean;
  authError: string | null;
  config: EmailAlertConfig;
  aps: AccessPoint[];
  telemetrySource: 'server' | 'agent';
  privateSubnetUnreachable: boolean;
  logs: EmailAlertLogEntry[];
  onSignIn: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onConfigChange: (next: EmailAlertConfig) => void;
  onSendTestEmail: (recipientEmail: string) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}

export function EmailAlertsModal({
  isOpen,
  gmailUser,
  hasActiveToken,
  authBusy,
  authError,
  config,
  aps,
  telemetrySource,
  privateSubnetUnreachable,
  logs,
  onSignIn,
  onSignOut,
  onConfigChange,
  onSendTestEmail,
  onClose,
}: EmailAlertsModalProps) {
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleWindowStatus>(() =>
    getAlertScheduleStatus(),
  );
  const [confirmTestOpen, setConfirmTestOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmTestOpen(false);
      return;
    }
    setScheduleStatus(getAlertScheduleStatus());
    const timer = setInterval(() => {
      setScheduleStatus(getAlertScheduleStatus());
    }, 15000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmedRecipient = config.recipientEmail.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedRecipient);

  const preview = buildAlertEmailContent({
    kind: 'test',
    recipientEmail: trimmedRecipient,
    senderEmail: gmailUser?.email,
    offlineAps: aps.filter((ap) => ap.status === 'offline'),
    allAps: aps,
    telemetrySource,
    scheduleStatus,
  });

  const handleConfirmTestSend = async () => {
    if (!emailValid || !hasActiveToken) return;
    setSendingTest(true);
    setTestFeedback(null);
    try {
      const result = await onSendTestEmail(trimmedRecipient);
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
      aria-labelledby="email-alerts-title"
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
                id="email-alerts-title"
                className="font-display text-base font-extrabold text-[#1A1A1A]"
              >
                Alarmas por Email (Gmail)
              </h2>
              <p className="text-xs font-medium text-[#1A1A1A]/80">
                Notificación automática ante caídas · Lunes a Viernes de 09:00 a 16:00 hs
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
          {/* Gmail Account Connection */}
          <div className="border border-[#DEE2E6] rounded-lg p-4 bg-[#F8F9FA] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-sm text-[#1A1A1A]">
                  <Mail className="w-4 h-4 text-[#2C3E50]" />
                  <span>Cuenta remitente de Gmail</span>
                </div>
                {hasActiveToken && gmailUser ? (
                  <p className="text-xs text-[#1E8449] font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Conectado como {gmailUser.email}
                  </p>
                ) : gmailUser ? (
                  <p className="text-xs text-[#B9770E] font-medium">
                    Sesión de {gmailUser.email} detectada: volvé a conectar Gmail para activar el envío en esta pestaña.
                  </p>
                ) : (
                  <p className="text-xs text-[#6C757D]">
                    Iniciá sesión con tu cuenta de Google para autorizar el envío de alarmas a Sistemas EMUI.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasActiveToken ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onSignIn()}
                      disabled={authBusy}
                      className="px-3 py-1.5 rounded-md border border-[#CED4DA] bg-white hover:bg-[#E9ECEF] text-xs font-semibold text-[#343A40] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cambiar cuenta
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSignOut()}
                      disabled={authBusy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E74C3C]/30 bg-white hover:bg-[#FDEDEC] text-xs font-semibold text-[#C0392B] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Desconectar</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onSignIn()}
                    disabled={authBusy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1A1A1A] text-[#FFD700] text-xs font-bold hover:bg-[#2D2D2D] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>
                      {authBusy
                        ? 'Conectando...'
                        : gmailUser
                          ? 'Reconectar Gmail'
                          : 'Iniciar sesión con Google'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {authError && (
              <div className="px-3 py-2 rounded-md bg-[#FDEDEC] border border-[#E74C3C]/30 text-xs font-medium text-[#C0392B]">
                {authError}
              </div>
            )}
          </div>

          {/* Schedule Status */}
          <div
            className={`rounded-lg border p-3.5 flex flex-wrap items-center justify-between gap-2 ${
              scheduleStatus.isWithinWindow
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
                <p className="text-xs tabular-nums">{scheduleStatus.reason}</p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${
                scheduleStatus.isWithinWindow
                  ? 'bg-[#27AE60] text-white'
                  : 'bg-[#6C757D] text-white'
              }`}
            >
              {scheduleStatus.isWithinWindow ? 'En horario' : 'Fuera de horario'}
            </span>
          </div>

          {/* Cloud telemetry protection warning */}
          {privateSubnetUnreachable && (
            <div className="rounded-lg border border-[#E6B800]/60 bg-[#FFF8DC] p-3.5 flex items-start gap-2.5 text-[#1A1A1A]">
              <AlertTriangle className="w-4 h-4 text-[#B9770E] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">
                  Protección antifalsos positivos activa
                </p>
                <p className="text-[#495057] leading-relaxed">
                  Como este servidor en la nube aún no está conectado a tu{' '}
                  <strong>Agente Red Local (.bat)</strong>, los 9 APs figuran como fuera de línea por bloqueo de red. Las alarmas automáticas quedan pausadas hasta detectar pings reales del agente local, pero podés <strong>enviar el correo de prueba ahora mismo</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Configuration */}
          <div className="border border-[#DEE2E6] rounded-lg p-4 space-y-3.5 bg-white">
            <h3 className="text-sm font-bold text-[#1A1A1A]">
              Configuración de alertas
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="alert-recipient"
                  className="block text-[11px] font-bold uppercase tracking-wide text-[#6C757D] mb-1"
                >
                  Email destinatario
                </label>
                <input
                  id="alert-recipient"
                  type="email"
                  value={config.recipientEmail}
                  onChange={(e) =>
                    onConfigChange({ ...config, recipientEmail: e.target.value })
                  }
                  placeholder="sistemas_emui@buenosaires.gob.ar"
                  className="w-full h-9 px-3 rounded-md border border-[#CED4DA] bg-white text-xs text-[#1A1A1A] font-medium focus:outline-none focus:border-[#E6B800] focus:ring-2 focus:ring-[#FFD700]/25"
                />
                {!emailValid && (
                  <p className="text-[11px] text-[#C0392B] mt-1 font-medium">
                    Ingresá una dirección de correo válida.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="alert-cooldown"
                  className="block text-[11px] font-bold uppercase tracking-wide text-[#6C757D] mb-1"
                >
                  Frecuencia por caída continua
                </label>
                <select
                  id="alert-cooldown"
                  value={config.cooldownMinutes}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      cooldownMinutes: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full h-9 px-3 rounded-md border border-[#CED4DA] bg-white text-xs text-[#1A1A1A] font-medium focus:outline-none focus:border-[#E6B800]"
                >
                  <option value={0}>Solo al caer (sin repetir hasta que vuelva)</option>
                  <option value={15}>Recordar cada 15 minutos si sigue caído</option>
                  <option value={30}>Recordar cada 30 minutos si sigue caído</option>
                  <option value={60}>Recordar cada 60 minutos si sigue caído</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.autoEnabled}
                onChange={(e) =>
                  onConfigChange({ ...config, autoEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded border-[#CED4DA] accent-[#1A1A1A] cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#1A1A1A]">
                Activar envío automático de alarmas cuando algún AP quede Fuera de Línea (Lun–Vie 09:00–16:00 hs)
              </span>
            </label>
          </div>

          {/* Test Email Action + Mandatory Confirmation Dialog */}
          <div className="border border-[#DEE2E6] rounded-lg p-4 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1A1A]">
                  Prueba inmediata de alarma
                </h3>
                <p className="text-xs text-[#6C757D]">
                  Enviá un correo de prueba con el estado actual de los {aps.length} Access Points a{' '}
                  <strong className="text-[#1A1A1A]">{trimmedRecipient || '—'}</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTestFeedback(null);
                  setConfirmTestOpen(true);
                }}
                disabled={!hasActiveToken || !emailValid || confirmTestOpen}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold text-[#1A1A1A] shadow-xs hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #FFD700 0%, #E6B800 100%)',
                }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar prueba ahora</span>
              </button>
            </div>

            {!hasActiveToken && (
              <p className="text-[11px] text-[#B9770E] font-medium">
                Conectá primero tu cuenta de Gmail arriba para habilitar el botón de prueba.
              </p>
            )}

            {confirmTestOpen && (
              <div className="rounded-lg border border-[#E6B800] bg-[#FFF8DC] p-4 space-y-3">
                <p className="font-bold text-sm text-[#1A1A1A]">
                  Confirmar envío de correo de prueba
                </p>
                <div className="space-y-1 text-xs text-[#343A40] bg-white/80 rounded-md p-3 border border-[#E6B800]/40">
                  <p>
                    <strong>Para:</strong> {trimmedRecipient}
                  </p>
                  <p>
                    <strong>Desde:</strong> {gmailUser?.email ?? 'Cuenta conectada'}
                  </p>
                  <p>
                    <strong>Asunto:</strong> {preview.subject}
                  </p>
                  <p>
                    <strong>Contenido:</strong> Tabla con el estado actual de los {aps.length}{' '}
                    Access Points Cisco Meraki del EMUI.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmTestOpen(false)}
                    disabled={sendingTest}
                    className="px-3.5 py-1.5 rounded-md border border-[#CED4DA] bg-white hover:bg-[#F1F3F5] text-xs font-semibold text-[#495057] cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmTestSend()}
                    disabled={sendingTest}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#1A1A1A] text-[#FFD700] text-xs font-bold hover:bg-[#2D2D2D] cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Enviando correo...' : 'Confirmar y enviar ahora'}</span>
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

          {/* Alert History */}
          <div className="border border-[#DEE2E6] rounded-lg overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-[#343A40] text-white text-xs font-bold flex items-center justify-between">
              <span>Registro de alarmas enviadas (sesión actual)</span>
              <span className="text-[#FFD700] tabular-nums">{logs.length}</span>
            </div>
            {logs.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-[#6C757D]">
                Todavía no se enviaron correos de alarma ni pruebas en esta sesión.
              </div>
            ) : (
              <div className="divide-y divide-[#E9ECEF] max-h-44 overflow-y-auto">
                {logs.map((entry) => (
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
                        Para: {entry.recipient} · {entry.message}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[#6C757D] tabular-nums shrink-0">
                      {new Date(entry.timestamp).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
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
