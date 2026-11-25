export const LOCAL_BRIDGE_URL = 'http://127.0.0.1:4321';

export function buildEmuiBatContent(ips: string[]): string {
  const safeIps = ips
    .filter((ip) => /^[\d.]+$/.test(ip))
    .map((ip) => `'${ip}'`)
    .join(',');

  const ipList =
    safeIps ||
    "'10.25.5.18','10.25.5.12','10.25.5.11','10.25.5.15','10.25.5.13','10.25.5.17','10.25.5.8','10.25.5.14','10.25.5.16'";

  return `@echo off
title Agente Ping EMUI - Puente Red Interna (127.0.0.1:4321)
echo ============================================================
echo   EMUI - Agente Local de Ping Wi-Fi Meraki (puerto 4321)
echo   Manten esta ventana abierta o minimizada mientras usas la web
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$lines = Get-Content -LiteralPath '%~f0' -Encoding UTF8; $idx = [Array]::IndexOf($lines, '#__PS_START__'); $code = ($lines[($idx+1)..($lines.Length-1)]) -join [Environment]::NewLine; Invoke-Expression $code"
pause
exit /b
#__PS_START__
$ErrorActionPreference = 'SilentlyContinue'
$DefaultIps = @(${ipList})
$Port = 4321
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
  $Listener.Start()
} catch {
  Write-Host "ERROR: No se pudo abrir el puerto $Port. Verifica que no haya otro agente abierto." -ForegroundColor Red
  exit 1
}

Write-Host "Agente activo en http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "Esperando consultas del dashboard Monitoreo Wifi - EMUI..." -ForegroundColor Cyan

function Invoke-EmuiPingBatch([string[]]$Ips) {
  $round1 = @()
  $round2 = @()

  foreach ($ip in $Ips) {
    $p1 = [System.Net.NetworkInformation.Ping]::new()
    $p2 = [System.Net.NetworkInformation.Ping]::new()
    $round1 += @{ ip = $ip; pinger = $p1; task = $p1.SendPingAsync($ip, 1500) }
    $round2 += @{ ip = $ip; pinger = $p2; task = $p2.SendPingAsync($ip, 1500) }
  }

  $allTasks = New-Object 'System.Collections.Generic.List[System.Threading.Tasks.Task]'
  foreach ($r in $round1) { $allTasks.Add($r.task) }
  foreach ($r in $round2) { $allTasks.Add($r.task) }
  try { [System.Threading.Tasks.Task]::WaitAll($allTasks.ToArray(), 3500) | Out-Null } catch {}

  $results = @()
  for ($i = 0; $i -lt $Ips.Count; $i++) {
    $ip = $Ips[$i]
    $times = @()

    foreach ($r in @($round1[$i], $round2[$i])) {
      try {
        if ($r.task.Status -eq 'RanToCompletion' -and $r.task.Result.Status -eq 'Success') {
          $ms = [math]::Max(0.5, [double]$r.task.Result.RoundtripTime)
          $times += $ms
        }
      } catch {}
      try { $r.pinger.Dispose() } catch {}
    }

    if ($times.Count -gt 0) {
      $avg = [math]::Round((($times | Measure-Object -Average).Average), 1)
      $min = [math]::Round((($times | Measure-Object -Minimum).Minimum), 1)
      $max = [math]::Round((($times | Measure-Object -Maximum).Maximum), 1)
      $loss = [math]::Round(((2 - $times.Count) / 2) * 100)
      $results += [ordered]@{
        ip = $ip
        reachable = $true
        latencyMs = $avg
        minMs = $min
        maxMs = $max
        packetLoss = $loss
        detail = 'Operativa (Agente LAN EMUI)'
      }
    } else {
      $results += [ordered]@{
        ip = $ip
        reachable = $false
        latencyMs = $null
        packetLoss = 100
        detail = 'Sin respuesta ICMP en red interna EMUI'
      }
    }
  }
  return $results
}

while ($true) {
  $client = $Listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 2000
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    while ($true) {
      $h = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($h)) { break }
    }

    $nl = ([string][char]13) + ([string][char]10)
    $corsHeaders = (@(
      'Access-Control-Allow-Origin: *',
      'Access-Control-Allow-Methods: GET, POST, OPTIONS',
      'Access-Control-Allow-Headers: Content-Type',
      'Access-Control-Allow-Private-Network: true',
      'Connection: close'
    ) -join $nl) + $nl

    if ($requestLine -and $requestLine.StartsWith('OPTIONS ')) {
      $resp = "HTTP/1.1 204 No Content$nl$corsHeaders$nl"
      $bytes = [System.Text.Encoding]::ASCII.GetBytes($resp)
      $stream.Write($bytes, 0, $bytes.Length)
      continue
    }

    $targetIps = $DefaultIps
    if ($requestLine -match 'ips=([^ &\r\n]+)') {
      $rawIps = [System.Uri]::UnescapeDataString($Matches[1])
      $parsed = @($rawIps.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' })
      if ($parsed.Count -gt 0) { $targetIps = $parsed }
    }

    $results = Invoke-EmuiPingBatch -Ips $targetIps
    $okCount = @($results | Where-Object { $_.reachable }).Count
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - Ping completado: $okCount/$($results.Count) operativas" -ForegroundColor Green

    $json = ([ordered]@{ ok = $true; results = $results; timestamp = (Get-Date).ToString('o') } | ConvertTo-Json -Depth 4 -Compress)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $header = "HTTP/1.1 200 OK$nl$($corsHeaders)Content-Type: application/json; charset=utf-8$nl" + "Content-Length: $($bodyBytes.Length)$nl$nl"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
  } catch {
  } finally {
    $client.Close()
  }
}
`;
}
