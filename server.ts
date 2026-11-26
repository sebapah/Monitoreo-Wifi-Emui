import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { alertService } from './server/alertService.ts';
import { pingMonitor } from './server/pingService.ts';
import type { AgentPingItem, ApInput } from './src/types/ap.ts';

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get('/api/monitor', (_req, res) => {
    res.json(pingMonitor.getSnapshot());
  });

  app.get('/api/monitor/agent-config', (_req, res) => {
    const snapshot = pingMonitor.getSnapshot();
    res.json({
      token: pingMonitor.getAgentToken(),
      ips: snapshot.aps.map((ap) => ap.ip),
      intervalSeconds: snapshot.intervalSeconds,
    });
  });

  app.post('/api/monitor/agent-report', (req, res) => {
    const token = req.headers['x-agent-token'] || req.body?.token;
    if (token !== pingMonitor.getAgentToken()) {
      res.status(401).json({ error: 'Token de agente inválido.' });
      return;
    }

    const results = req.body?.results;
    if (!Array.isArray(results)) {
      res.status(400).json({ error: 'Se esperaba un arreglo results válido.' });
      return;
    }

    const snapshot = pingMonitor.applyAgentReport(results as AgentPingItem[]);
    res.json({ ok: true, snapshot });
  });

  app.post('/api/monitor/ping-all', async (_req, res) => {
    try {
      const snapshot = await pingMonitor.runPingAll(true);
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Error al ejecutar ping general',
      });
    }
  });

  app.post('/api/monitor/ping/:id', async (req, res) => {
    try {
      const result = await pingMonitor.pingOne(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Access Point no encontrado' });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Error al verificar Access Point',
      });
    }
  });

  app.patch('/api/monitor/config', (req, res) => {
    const threshold = Number(req.body?.slowThresholdMs);
    if (!Number.isFinite(threshold) || threshold < 20 || threshold > 2000) {
      res.status(400).json({
        error: 'El umbral de latencia debe estar entre 20 ms y 2000 ms.',
      });
      return;
    }
    const snapshot = pingMonitor.updateSlowThreshold(threshold);
    res.json(snapshot);
  });

  app.post('/api/monitor/reset-stats', (_req, res) => {
    const snapshot = pingMonitor.resetUptimeStats();
    res.json(snapshot);
  });

  app.get('/api/alerts', (_req, res) => {
    res.json(alertService.getState());
  });

  app.patch('/api/alerts/config', (req, res) => {
    const autoEnabled =
      typeof req.body?.autoEnabled === 'boolean' ? req.body.autoEnabled : undefined;
    const rawCooldown = req.body?.cooldownMinutes;
    const cooldownMinutes =
      rawCooldown !== undefined ? Number(rawCooldown) : undefined;

    if (
      cooldownMinutes !== undefined &&
      (!Number.isFinite(cooldownMinutes) || ![0, 15, 30, 60].includes(cooldownMinutes))
    ) {
      res.status(400).json({
        error: 'El intervalo de repetición debe ser 0, 15, 30 o 60 minutos.',
      });
      return;
    }

    res.json(alertService.updateConfig(autoEnabled, cooldownMinutes));
  });

  app.post('/api/alerts/test', async (_req, res) => {
    try {
      const result = await alertService.sendTestAlert(pingMonitor.getSnapshot());
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo enviar la alerta de prueba.',
        state: alertService.getState(),
      });
    }
  });

  app.post('/api/aps', async (req, res) => {
    const body = req.body as Partial<ApInput>;
    if (!body.model || !body.floor || !body.sector || !body.ip) {
      res.status(400).json({
        error: 'Modelo, piso, ubicación e IP son campos obligatorios.',
      });
      return;
    }
    try {
      const created = await pingMonitor.addAp({
        model: String(body.model),
        floor: String(body.floor),
        sector: String(body.sector),
        ip: String(body.ip),
        portId: String(body.portId ?? ''),
      });
      res.status(201).json({ ap: created, snapshot: pingMonitor.getSnapshot() });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo agregar el Access Point',
      });
    }
  });

  app.put('/api/aps/:id', async (req, res) => {
    const body = req.body as Partial<ApInput>;
    if (!body.model || !body.floor || !body.sector || !body.ip) {
      res.status(400).json({
        error: 'Modelo, piso, ubicación e IP son campos obligatorios.',
      });
      return;
    }
    try {
      const updated = await pingMonitor.updateAp(req.params.id, {
        model: String(body.model),
        floor: String(body.floor),
        sector: String(body.sector),
        ip: String(body.ip),
        portId: String(body.portId ?? ''),
      });
      if (!updated) {
        res.status(404).json({ error: 'Access Point no encontrado' });
        return;
      }
      res.json({ ap: updated, snapshot: pingMonitor.getSnapshot() });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo actualizar el Access Point',
      });
    }
  });

  app.delete('/api/aps/:id', (req, res) => {
    const deleted = pingMonitor.deleteAp(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Access Point no encontrado' });
      return;
    }
    res.json({ snapshot: pingMonitor.getSnapshot() });
  });

  app.post('/api/aps/:id/speed', (req, res) => {
    const rawDown = req.body?.downloadMbps;
    const rawUp = req.body?.uploadMbps;

    const downloadMbps =
      rawDown === null || rawDown === '' || rawDown === undefined
        ? null
        : Number(rawDown);
    const uploadMbps =
      rawUp === null || rawUp === '' || rawUp === undefined
        ? null
        : Number(rawUp);

    if (downloadMbps !== null && (!Number.isFinite(downloadMbps) || downloadMbps <= 0)) {
      res.status(400).json({ error: 'La velocidad de bajada debe ser mayor a 0 Mbps.' });
      return;
    }

    const result = pingMonitor.recordSpeed(req.params.id, downloadMbps, uploadMbps);
    if (!result) {
      res.status(404).json({ error: 'Access Point no encontrado' });
      return;
    }
    res.json(result);
  });

  app.post('/api/aps/reset', async (_req, res) => {
    try {
      const snapshot = await pingMonitor.resetToDefaultAps();
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo restablecer la lista',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Monitoreo Wifi - EMUI escuchando en http://0.0.0.0:${port}`);
    pingMonitor.start();
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
