# Runs the OP cloud backup (called by Windows Task Scheduler "OP Backup").
$ErrorActionPreference = 'Stop'
$root = 'C:\OP'
$credFile = Join-Path $env:APPDATA 'OP\backup-cred.txt'
$log = Join-Path $env:APPDATA 'OP\backup.log'
try {
  $cfg = Get-Content (Join-Path $root 'js\config.js') -Raw
  $env:SUPABASE_URL = [regex]::Match($cfg, "SUPABASE_URL = '([^']+)'").Groups[1].Value
  $env:SUPABASE_ANON_KEY = [regex]::Match($cfg, "SUPABASE_ANON_KEY = '([^']+)'").Groups[1].Value
  $lines = Get-Content $credFile
  $env:ADMIN_USER = $lines[0]
  $secure = $lines[1] | ConvertTo-SecureString
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
  $node = 'C:\ANTIGRAVITY\node_bin\node-v20.11.1-win-x64\node.exe'
  $out = & $node (Join-Path $root 'scripts\backup.mjs') 2>&1 | Out-String
  Add-Content $log "$(Get-Date -Format s) $($out.Trim())"
} catch {
  Add-Content $log "$(Get-Date -Format s) ERROR $($_.Exception.Message)"
  exit 1
}
