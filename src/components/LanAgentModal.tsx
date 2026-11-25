import { useState } from 'react';
import { Check, Copy, Download, RefreshCw, Terminal, X } from 'lucide-react';
import type { AccessPoint, MonitorSnapshot } from '../types/ap';
import { buildEmuiBatContent, LOCAL_BRIDGE_URL } from '../utils/batGenerator';

interface LanAgentModalProps {
  isOpen: boolean;
  aps: AccessPoint[];
  localBridgeConnected: boolean;
  onTestBridge: () => Promise<boolean>;
  onSnapshotUpdate?: (snapshot: MonitorSnapshot) => void;
  onClose: () => void;
}

export function LanAgentModal({
  isOpen,
  aps,
  localBridgeConnected,
  onTestBridge,
  onClose,
}: LanAgentModalProps) {
  const [copiedBat, setCopiedBat] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const batContent = buildEmuiBatContent(aps.map((ap) => ap.ip));

  const handleDownloadBat = () => {
    const blob = new Blob([batContent.replace(/\n/g, '\r\n')], {
      type: 'application/x-bat;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agente-ping-emui.bat';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyBat = async () => {
    try {
      await navigator.clipboard.writeText(batContent.replace(/\n/g, '\r\n'));
      setCopiedBat(true);
      setTimeout(() => setCopiedBat(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const handleCheckBridge = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const ok = await onTestBridge();
      if (ok) {
        setTestMsg('Conexión exitosa con el agente local. Los 9 Access Points ya se están actualizando cada 30 segundos.');
      } else {
        setTestMsg(`No se detectó el agente en ${LOCAL_BRIDGE_URL}. Descargá y ejecutá agente-ping-emui.bat primero.`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-agent-title"
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
          <div>
            <h2
              id="lan-agent-title"
              className="font-display text-base font-extrabold text-[#1A1A1A]"
            >
              Agente Local EMUI (.bat) — Ping desde la Red del Gobierno
            </h2>
            <p className="text-xs font-medium text-[#1A1A1A]/80">
              Puente local en Windows para hacer ping real a las 10.25.5.x cada 30 segundos
            </p>
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
          <div className="bg-[#FFF8DC] border border-[#E6B800]/50 rounded-lg p-3.5 space-y-1.5 text-[#1A1A1A]">
            <p className="font-bold">
              Estado del puente local: {localBridgeConnected ? 'Conectado y midiendo en vivo' : 'No detectado en esta PC'}
            </p>
            <p className="text-[#495057]">
              Al ejecutar <strong>agente-ping-emui.bat</strong> en tu PC dentro de la red del EMUI, abre un puente local en <span className="font-mono">127.0.0.1:4321</span>. Esta web le consulta cada 30 segundos, obtiene los pings ICMP reales de las IPs <span className="font-mono">10.25.5.x</span> y actualiza el tablero automáticamente.
            </p>
          </div>

          <div className="border border-[#DEE2E6] rounded-lg p-4 space-y-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-[#1A1A1A] text-sm">
                <Terminal className="w-4 h-4 text-[#27AE60]" />
                <span>Pasos para probarlo</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadBat}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#27AE60] hover:bg-[#1E8449] text-white font-bold shadow-xs cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar agente-ping-emui.bat</span>
                </button>

                <button
                  type="button"
                  onClick={handleCheckBridge}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1A1A1A] text-[#FFD700] font-bold hover:bg-[#2D2D2D] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? 'Probando...' : 'Probar conexión'}</span>
                </button>
              </div>
            </div>

            <ol className="list-decimal list-inside space-y-1 text-[#495057]">
              <li>Descargá el archivo <strong>agente-ping-emui.bat</strong> (o copiá el código de abajo en el Bloc de notas y guardalo como <span className="font-mono">agente-ping-emui.bat</span>).</li>
              <li>Hacé doble clic en el archivo desde una PC conectada a la red interna del EMUI (no requiere permisos de administrador).</li>
              <li>Dejá esa ventana abierta/minimizada: el tablero hará ping real cada 30 segundos de forma automática.</li>
            </ol>

            {testMsg && (
              <div className="p-2.5 rounded-md bg-[#F8F9FA] border border-[#DEE2E6] text-[#1A1A1A] font-medium">
                {testMsg}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[#6C757D]">
                  Contenido completo de agente-ping-emui.bat:
                </span>
                <button
                  type="button"
                  onClick={handleCopyBat}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#F1F3F5] hover:bg-[#E9ECEF] text-[#343A40] text-[11px] font-semibold cursor-pointer"
                >
                  {copiedBat ? (
                    <>
                      <Check className="w-3 h-3 text-[#27AE60]" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar .bat</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="bg-[#1A1A1A] text-[#F8F9FA] font-mono text-[10px] p-3 rounded-md overflow-x-auto max-h-56 leading-relaxed">
                {batContent}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
