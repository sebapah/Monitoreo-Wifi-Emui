import type { AccessPoint } from '../types/ap';

function getStatusLabel(status: AccessPoint['status']): string {
  switch (status) {
    case 'online':
      return 'Operativa';
    case 'slow':
      return 'Conexión Lenta';
    case 'offline':
      return 'Fuera de Línea';
    default:
      return 'Pendiente';
  }
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/"/g, '""');
  return `"${clean}"`;
}

export function exportApsToExcelCsv(aps: AccessPoint[], slowThresholdMs: number): void {
  const headers = [
    'Modelo',
    'Piso',
    'Ubicación',
    'Dirección IP',
    'Boca / ID',
    'Latencia Promedio (ms)',
    'Mín / Máx (ms)',
    'Pérdida de Paquetes (%)',
    'Velocidad Bajada Fast.com (Mbps)',
    'Velocidad Subida Fast.com (Mbps)',
    'Estado',
    'Detalle Diagnóstico',
    'Último Chequeo',
  ];

  const rows = aps.map((ap) => {
    const latency = ap.latencyMs !== null ? String(ap.latencyMs) : 'Sin respuesta';
    const minMax =
      ap.minMs !== null && ap.maxMs !== null ? `${ap.minMs} / ${ap.maxMs}` : '—';
    const loss = ap.packetLoss !== null ? `${ap.packetLoss}%` : '—';
    const downSpeed = ap.speedMbps !== null ? String(ap.speedMbps) : 'Sin medir';
    const upSpeed = ap.uploadMbps !== null ? String(ap.uploadMbps) : '—';
    const checkedAt = ap.lastCheckedAt
      ? new Date(ap.lastCheckedAt).toLocaleString('es-AR')
      : 'Pendiente';

    return [
      ap.model,
      ap.floor,
      ap.sector,
      ap.ip,
      ap.portId || '—',
      latency,
      minMax,
      loss,
      downSpeed,
      upSpeed,
      getStatusLabel(ap.status),
      `${ap.detail} (Umbral lenta: ${slowThresholdMs} ms)`,
      checkedAt,
    ]
      .map(escapeCsvCell)
      .join(';');
  });

  const csvContent = `\uFEFF${headers.map(escapeCsvCell).join(';')}\r\n${rows.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Monitoreo_Wifi_EMUI_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
