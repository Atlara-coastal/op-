# One-time setup of the daily OP backup on this PC. Run it yourself (it asks for the
# superadmin login); the password is stored encrypted with Windows DPAPI, readable only
# by this Windows user on this PC.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'OP'
New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host ''
Write-Host 'Copia diaria de OP en este PC' -ForegroundColor Green
Write-Host 'Usa la cuenta SUPERADMIN de OP (la que ve los dos espacios: Elkin y Cyndi).'
$user = Read-Host 'Usuario'
$pass = Read-Host 'Contrasena' -AsSecureString
Set-Content (Join-Path $dir 'backup-cred.txt') @($user.Trim(), ($pass | ConvertFrom-SecureString)) -Encoding utf8

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\OP\scripts\run-backup.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At '12:00 AM'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName 'OP Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Copia diaria de OP (Elkin y Cyndi) en Documentos\OP-Backups' -Force | Out-Null

Write-Host 'Haciendo la primera copia...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\OP\scripts\run-backup.ps1'
Get-Content (Join-Path $dir 'backup.log') -Tail 2
