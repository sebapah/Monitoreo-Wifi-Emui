import fs from 'node:fs';
import path from 'node:path';
import type {
  AccessPoint,
  AlertChannelsStatus,
  AlertLogEntry,
  AlertMonitorState,
  MonitorSnapshot,
  ScheduleWindowStatus,
} from '../src/types/ap.ts';

const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
const STATE_DIR = path.resolve(process.cwd(), 'data');
const ALERT_STATE_FILE = path.resolve(STATE_DIR, 'alert-state.json');
const MAX_ALERT_LOGS = 50;

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

interface PersistedAlertState {
  autoEnabled: boolean;
  cooldownMinutes: number;
  logs: AlertLogEntry[];
}

function getCallMeBotConfig(): { phone: string; apikey: string } | null {
  const rawPhone = (process.env.CALLMEBOT_PHONE ?? '').trim().replace(/[^0-9]/g, '');
  const apikey = (process.env.CALLMEBOT_APIKEY ?? '').trim();
  if (!rawPhone || !apikey) return null;
  return { phone: rawPhone, apikey };
}

function getTelegramConfig(): { botToken: string; chatId: string } | null {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

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
  const isBusinessHour = totalMinutes >= 9 * 60 && totalMinutes <= 16 * 60;

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

function formatBuenosAiresDateTime(date: Date = new Date()): string {
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

function buildPlainTextAlert(
  kind: 'auto' | 'test',
  targetAps: AccessPoint[],
  snapshot: MonitorSnapshot,
): string {
  const nowStr = formatBuenosAiresDateTime(new Date());
  const sourceLabel =
    snapshot.telemetrySource === 'agent' ? 'Agente LAN EMUI' : 'Servidor local';

  if (kind === 'test') {
    const lines = [
      '*[PRUEBA] Monitoreo Wifi - EMUI*',
      `Fecha: ${nowStr} (Buenos Aires)`,
      `Estado general: ${snapshot.summary.online} En Línea · ${snapshot.summary.slow} Lentos · ${snapshot.summary.offline} Fuera de Línea`,
      '',
      ...snapshot.aps.map(
        (ap) =>
          `- ${ap.sector} (${ap.floor}) | ${ap.ip} | ${ap.status === 'offline' ? 'CAÍDO' : ap.status === 'slow' ? `LENTO (${ap.latencyMs ?? '?'}ms)` : ap.status === 'online' ? `OK (${ap.latencyMs ?? '?'}ms)` : 'PENDIENTE'}`,
      ),
    ];
    return lines.join('\n');
  }

  const header =
    targetAps.length === 1
      ? `*[ALERTA CAÍDA] Monitoreo Wifi - EMUI*\n1 Access Point fuera de línea:`
      : `*[ALERTA CAÍDA] Monitoreo Wifi - EMUI*\n${targetAps.length} Access Points fuera de línea:`;

  const lines = [
    header,
    `Fecha: ${nowStr} (Buenos Aires)`,
    `Origen: ${sourceLabel}`,
    '',
    ...targetAps.map((ap) => {
      const lastOnline = ap.lastOnlineAt
        ? formatBuenosAiresDateTime(new Date(ap.lastOnlineAt))
        : 'Sin registro';
      return `- *${ap.sector}* (${ap.floor}, ${ap.model}) | IP: ${ap.ip} | Boca: ${ap.portId || '-'} | Últ. vez OK: ${lastOnline}`;
    }),
  ];
  return lines.join('\n');
}

async function sendViaCallMeBot(text: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = getCallMeBotConfig();
  if (!cfg) {
    return { ok: false, detail: 'WhatsApp (CallMeBot) no configurado en Secrets.' };
  }

  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', cfg.phone);
  url.searchParams.set('text', text);
  url.searchParams.set('apikey', cfg.apikey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, detail: `CallMeBot respondió HTTP ${response.status}.` };
    }
    if (body.toLowerCase().includes('error') && !body.toLowerCase().includes('queued')) {
      return { ok: false, detail: 'CallMeBot rechazó el envío. Verificá número y API key.' };
    }
    return { ok: true, detail: 'Mensaje enviado por WhatsApp (CallMeBot).' };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'Error de red al contactar CallMeBot.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaTelegram(text: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = getTelegramConfig();
  if (!cfg) {
    return { ok: false, detail: 'Telegram Bot no configurado en Secrets.' };
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: text.replace(/\*/g, ''),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, detail: `Telegram respondió HTTP ${response.status}.` };
    }
    return { ok: true, detail: 'Mensaje enviado por Telegram.' };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'Error de red al contactar Telegram.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

class AlertService {
  private autoEnabled = true;
  private cooldownMinutes = 30;
  private logs: AlertLogEntry[] = [];
  private lastAlertedAt = new Map<string, number>();
  private inFlight = false;

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      if (!fs.existsSync(ALERT_STATE_FILE)) return;
      const raw = fs.readFileSync(ALERT_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedAlertState>;
      if (typeof parsed.autoEnabled === 'boolean') {
        this.autoEnabled = parsed.autoEnabled;
      }
      if (
        typeof parsed.cooldownMinutes === 'number' &&
        [0, 15, 30, 60].includes(parsed.cooldownMinutes)
      ) {
        this.cooldownMinutes = parsed.cooldownMinutes;
      }
      if (Array.isArray(parsed.logs)) {
        this.logs = parsed.logs.slice(0, MAX_ALERT_LOGS);
      }
    } catch {
      // Ignore corrupt state
    }
  }

  private saveState(): void {
    try {
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      if (!ALERT_STATE_FILE.startsWith(STATE_DIR + path.sep)) return;
      const payload: PersistedAlertState = {
        autoEnabled: this.autoEnabled,
        cooldownMinutes: this.cooldownMinutes,
        logs: this.logs.slice(0, MAX_ALERT_LOGS),
      };
      fs.writeFileSync(ALERT_STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore write failures
    }
  }

  public getChannelsStatus(): AlertChannelsStatus {
    return {
      whatsappConfigured: Boolean(getCallMeBotConfig()),
      telegramConfigured: Boolean(getTelegramConfig()),
    };
  }

  public getState(): AlertMonitorState {
    return {
      autoEnabled: this.autoEnabled,
      cooldownMinutes: this.cooldownMinutes,
      channels: this.getChannelsStatus(),
      scheduleStatus: getAlertScheduleStatus(),
      logs: this.logs,
    };
  }

  public updateConfig(autoEnabled?: boolean, cooldownMinutes?: number): AlertMonitorState {
    if (typeof autoEnabled === 'boolean') {
      this.autoEnabled = autoEnabled;
    }
    if (
      typeof cooldownMinutes === 'number' &&
      Number.isFinite(cooldownMinutes) &&
      [0, 15, 30, 60].includes(cooldownMinutes)
    ) {
      this.cooldownMinutes = cooldownMinutes;
    }
    this.saveState();
    return this.getState();
  }

  private appendLog(entry: AlertLogEntry): void {
    this.logs = [entry, ...this.logs].slice(0, MAX_ALERT_LOGS);
    this.saveState();
  }

  private async dispatchToConfiguredChannels(
    text: string,
  ): Promise<{ success: boolean; channelsLabel: string; message: string }> {
    const channels = this.getChannelsStatus();
    const outcomes: { name: string; ok: boolean; detail: string }[] = [];

    if (channels.whatsappConfigured) {
      const res = await sendViaCallMeBot(text);
      outcomes.push({ name: 'WhatsApp', ok: res.ok, detail: res.detail });
    }
    if (channels.telegramConfigured) {
      const res = await sendViaTelegram(text);
      outcomes.push({ name: 'Telegram', ok: res.ok, detail: res.detail });
    }

    if (outcomes.length === 0) {
      return {
        success: false,
        channelsLabel: 'Sin canal configurado',
        message:
          'Configurá CALLMEBOT_PHONE / CALLMEBOT_APIKEY (WhatsApp) o TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en Secrets.',
      };
    }

    const anyOk = outcomes.some((o) => o.ok);
    const channelsLabel = outcomes.map((o) => o.name).join(' + ');
    const message = outcomes.map((o) => `${o.name}: ${o.detail}`).join(' · ');
    return { success: anyOk, channelsLabel, message };
  }

  public async sendTestAlert(
    snapshot: MonitorSnapshot,
  ): Promise<{ ok: boolean; message: string; state: AlertMonitorState }> {
    const channels = this.getChannelsStatus();
    if (!channels.whatsappConfigured && !channels.telegramConfigured) {
      const message =
        'Falta cargar las credenciales gratuitas en Secrets (WhatsApp CallMeBot o Telegram Bot) para enviar la prueba automática.';
      return { ok: false, message, state: this.getState() };
    }

    const text = buildPlainTextAlert('test', snapshot.aps, snapshot);
    const result = await this.dispatchToConfiguredChannels(text);

    this.appendLog({
      id: `${Date.now()}-test`,
      timestamp: new Date().toISOString(),
      kind: 'test',
      channel: result.channelsLabel,
      apSummary: `Prueba manual (${snapshot.aps.length} APs)`,
      success: result.success,
      message: result.message,
    });

    return {
      ok: result.success,
      message: result.message,
      state: this.getState(),
    };
  }

  public async evaluateSnapshot(snapshot: MonitorSnapshot): Promise<void> {
    if (snapshot.aps.length === 0) return;

    // Reset cooldown when an AP comes back online or slow
    for (const ap of snapshot.aps) {
      if (ap.status === 'online' || ap.status === 'slow') {
        this.lastAlertedAt.delete(ap.id);
      }
    }

    // Protect against cloud false-positives when 10.25.5.x is unreachable without local agent
    if (snapshot.privateSubnetUnreachable || !this.autoEnabled) return;

    const channels = this.getChannelsStatus();
    if (!channels.whatsappConfigured && !channels.telegramConfigured) return;

    const scheduleStatus = getAlertScheduleStatus();
    if (!scheduleStatus.isWithinWindow) return;

    const nowMs = Date.now();
    const cooldownMs =
      this.cooldownMinutes > 0
        ? this.cooldownMinutes * 60 * 1000
        : Number.POSITIVE_INFINITY;

    const apsToAlert = snapshot.aps.filter((ap) => {
      if (ap.status !== 'offline') return false;
      const lastSent = this.lastAlertedAt.get(ap.id);
      if (lastSent === undefined) return true;
      return nowMs - lastSent >= cooldownMs;
    });

    if (apsToAlert.length === 0 || this.inFlight) return;

    this.inFlight = true;
    for (const ap of apsToAlert) {
      this.lastAlertedAt.set(ap.id, nowMs);
    }

    try {
      const text = buildPlainTextAlert('auto', apsToAlert, snapshot);
      const result = await this.dispatchToConfiguredChannels(text);
      if (!result.success) {
        for (const ap of apsToAlert) {
          this.lastAlertedAt.delete(ap.id);
        }
      }
      this.appendLog({
        id: `${Date.now()}-auto`,
        timestamp: new Date().toISOString(),
        kind: 'auto',
        channel: result.channelsLabel,
        apSummary: apsToAlert.map((ap) => `${ap.sector} (${ap.ip})`).join(', '),
        success: result.success,
        message: result.message,
      });
    } finally {
      this.inFlight = false;
    }
  }
}

export const alertService = new AlertService();
