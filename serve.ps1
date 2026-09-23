# Serves this folder on http://localhost so the page can load the recordings
# with Web Audio (gapless loops). Close this window to stop the server.
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

# Use a fixed port so tasks and settings saved in the browser stay with the page;
# fall back to the next ports only if it is taken.
$listener = $null
foreach ($port in 8765..8775) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    $l.Start()
    $listener = $l
    break
  } catch { }
}
if (-not $listener) {
  Write-Host 'Could not start the server: ports 8765-8775 are all in use.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

$url = $listener.Prefixes | Select-Object -First 1
Write-Host "Muslim To-Do List is running at $url"
Write-Host 'Keep this window open while you use the page. Close it to stop.'
if (-not $NoBrowser) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($path -eq '') { $path = 'index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $root $path))
      # Only serve files inside this folder.
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
        $res.StatusCode = 404
      } else {
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
