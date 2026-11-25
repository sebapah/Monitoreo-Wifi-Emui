import type { AccessPoint, ScheduleWindowStatus } from '../types/ap';

export const DEFAULT_ALERT_RECIPIENT = 'sistemas_emui@buenosaires.gob.ar';
const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

const WEEKDAY_ES: Record<string, string> = {
  Mon: 'Lunes',
  Tue: 'Martes',
  Wed: 'Miércoles',
  Thu: 'Jueves',
  Fri: 'Viernes',
  Sat: 'Sábado',
  Sun: 'Domingo',
};

const ACTIVE_WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

export function getAlertScheduleStatus(now: Date = new Date()): ScheduleWindowStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayEn = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hourRaw = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

  const dayLabel = WEEKDAY_ES[weekdayEn] ?? weekdayEn;
  const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} hs`;

  const isWeekday = ACTIVE_WEEKDAYS.has(weekdayEn);
  const totalMinutes = hour * 60 + minute;
  const startMinutes = 9 * 60; // 09:00
  const endMinutes = 16 * 60; // 16:00 inclusive at 16:00:xx -> < 16*60 + 1? Use 09:00 <= t <= 16:00 (up to 16:00)
  const isBusinessHour = totalMinutes >= startMinutes && totalMinutes <= endMinutes;

  if (!isWeekday) {
    return {
      isWithinWindow: false,
      dayLabel,
      timeLabel,
      reason: `Fuera de horario: hoy es ${dayLabel} (solo Lunes a Viernes de 09:00 a 16:00 hs).`,
    };
  }

  if (!isBusinessHour) {
    return {
      isWithinWindow: false,
      dayLabel,
      timeLabel,
      reason: `Fuera de franja horaria (${timeLabel}): las alarmas operan de 09:00 a 16:00 hs.`,
    };
  }

  return {
    isWithinWindow: true,
    dayLabel,
    timeLabel,
    reason: `Dentro de horario activo (${dayLabel} ${timeLabel} · Lun a Vie 09:00–16:00 hs).`,
  };
}

export function formatBuenosAiresDateTime(date: Date = new Date()): string {
  return date.toLocaleString('es-AR', {
    timeZone: AR_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeMimeBase64Url(rawMime: string): string {
  return encodeUtf8Base64(rawMime)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeMimeHeaderUtf8(text: string): string {
  return `=?UTF-8?B?${encodeUtf8Base64(text)}?=`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusSpanish(status: AccessPoint['status']): string {
  switch (status) {
    case 'online':
      return 'En Línea';
    case 'slow':
      return 'Conexión Lenta';
    case 'offline':
      return 'Fuera de Línea';
    default:
      return 'Pendiente';
  }
}

export interface BuildAlertEmailParams {
  kind: 'auto' | 'test';
  recipientEmail: string;
  senderEmail?: string | null;
  offlineAps: AccessPoint[];
  allAps: AccessPoint[];
  telemetrySource: 'server' | 'agent';
  scheduleStatus: ScheduleWindowStatus;
}

export function buildAlertEmailContent(params: BuildAlertEmailParams): {
  subject: string;
  htmlBody: string;
  apSummary: string;
} {
  const nowStr = formatBuenosAiresDateTime(new Date());
  const { kind, offlineAps, allAps, telemetrySource, scheduleStatus } = params;
  const isTest = kind === 'test';

  const apCount = offlineAps.length;
  const apNames = offlineAps.map((ap) => `${ap.sector} (${ap.ip})`).join(', ');

  const subject = isTest
    ? `[PRUEBA] Alerta Monitoreo Wi-Fi EMUI · ${nowStr}`
    : apCount === 1
      ? `[ALERTA CAÍDA] AP ${offlineAps[0].sector} (${offlineAps[0].ip}) fuera de línea - EMUI`
      : `[ALERTA CAÍDA] ${apCount} Access Points fuera de línea - EMUI`;

  const apSummary = isTest
    ? `Prueba manual (${allAps.length} APs monitoreados)`
    : apNames;

  const targetRows = (isTest ? allAps : offlineAps)
    .map((ap) => {
      const lastOnline = ap.lastOnlineAt
        ? formatBuenosAiresDateTime(new Date(ap.lastOnlineAt))
        : 'Sin registro';
      const badgeColor =
        ap.status === 'online'
          ? '#1E8449'
          : ap.status === 'slow'
            ? '#B9770E'
            : ap.status === 'offline'
              ? '#C0392B'
              : '#6C757D';
      const latencyText = ap.latencyMs !== null ? `${ap.latencyMs} ms` : '—';

      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;font-weight:700;color:#1A1A1A;">${escapeHtml(ap.model)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;color:#343A40;">${escapeHtml(ap.floor)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;color:#1A1A1A;font-weight:600;">${escapeHtml(ap.sector)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;font-family:monospace;color:#2C3E50;">${escapeHtml(ap.ip)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;font-family:monospace;color:#495057;">${escapeHtml(ap.portId)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;color:#343A40;">${escapeHtml(latencyText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;font-weight:700;color:${badgeColor};">${escapeHtml(statusSpanish(ap.status))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E9ECEF;font-size:11px;color:#6C757D;">${escapeHtml(lastOnline)}</td>
        </tr>
      `;
    })
    .join('');

  const bannerBg = isTest ? '#FFF8DC' : '#FDEDEC';
  const bannerBorder = isTest ? '#E6B800' : '#E74C3C';
  const headline = isTest
    ? 'Correo de prueba — Sistema de Alarmas Wi-Fi EMUI'
    : `Se detectó ${apCount === 1 ? '1 Access Point caído' : `${apCount} Access Points caídos`}`;

  const subheadline = isTest
    ? 'Esta es una verificación manual del sistema de alertas por Gmail hacia Sistemas EMUI. A continuación se muestra el estado actual del tablero.'
    : 'El monitoreo automático detectó falta de respuesta ICMP/TCP durante el horario operativo configurado (Lunes a Viernes de 09:00 a 16:00 hs).';

  const htmlBody = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:20px;background:#F4F6F9;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
    <div style="max-width:760px;margin:0 auto;background:#FFFFFF;border:1px solid #DEE2E6;border-radius:10px;overflow:hidden;">
      <div style="background:#FFD700;padding:16px 22px;border-bottom:2px solid #E6B800;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#1A1A1A;">
          Gobierno de la Ciudad de Buenos Aires · EMUI
        </div>
        <div style="font-size:18px;font-weight:800;color:#1A1A1A;margin-top:2px;">
          Monitoreo Wi-Fi · Cisco Meraki
        </div>
      </div>

      <div style="padding:20px 22px;">
        <div style="background:${bannerBg};border:1px solid ${bannerBorder};border-radius:8px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:15px;font-weight:800;color:#1A1A1A;margin-bottom:4px;">
            ${escapeHtml(headline)}
          </div>
          <div style="font-size:13px;color:#343A40;line-height:1.45;">
            ${escapeHtml(subheadline)}
          </div>
        </div>

        <div style="font-size:12px;color:#495057;margin-bottom:14px;line-height:1.6;">
          <strong>Fecha y hora (Buenos Aires):</strong> ${escapeHtml(nowStr)}<br/>
          <strong>Origen de medición:</strong> ${telemetrySource === 'agent' ? 'Agente LAN EMUI (Red Local)' : 'Servidor de Monitoreo'}<br/>
          <strong>Ventana horaria configurada:</strong> Lunes a Viernes · 09:00 a 16:00 hs (${escapeHtml(scheduleStatus.dayLabel)} ${escapeHtml(scheduleStatus.timeLabel)})
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #DEE2E6;">
          <thead>
            <tr style="background:#343A40;color:#FFFFFF;text-align:left;">
              <th style="padding:9px 10px;">Modelo</th>
              <th style="padding:9px 10px;">Piso</th>
              <th style="padding:9px 10px;">Ubicación</th>
              <th style="padding:9px 10px;">IP</th>
              <th style="padding:9px 10px;">Boca / ID</th>
              <th style="padding:9px 10px;">Latencia</th>
              <th style="padding:9px 10px;">Estado</th>
              <th style="padding:9px 10px;">Última vez en línea</th>
            </tr>
          </thead>
          <tbody>
            ${targetRows}
          </tbody>
        </table>

        <p style="font-size:11px;color:#6C757D;margin-top:16px;margin-bottom:0;">
          Enviado automáticamente desde Monitoreo Wifi - EMUI${params.senderEmail ? ` mediante la cuenta conectada (${escapeHtml(params.senderEmail)})` : ''}.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, htmlBody, apSummary };
}

export async function sendGmailAlertEmail(params: {
  accessToken: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
}): Promise<{ id: string; threadId?: string }> {
  const mimeLines = [
    `To: ${params.recipientEmail}`,
    `Subject: ${encodeMimeHeaderUtf8(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeUtf8Base64(params.htmlBody),
  ];

  const raw = encodeMimeBase64Url(mimeLines.join('\r\n'));

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    let detail = `Error HTTP ${response.status} al enviar por Gmail`;
    try {
      const errJson = (await response.json()) as { error?: { message?: string; status?: string } };
      if (errJson?.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // Ignore parse failure
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return (await response.json()) as { id: string; threadId?: string };
}
