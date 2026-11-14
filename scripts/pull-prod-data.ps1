$ErrorActionPreference = "Stop"
$ssh = Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe"
$scp = Join-Path $env:WINDIR "System32\OpenSSH\scp.exe"
$root = Split-Path $PSScriptRoot -Parent
$dump = Join-Path $root "backend\prod.dump"
$media = Join-Path $root "backend\prod-media.tgz"

& $ssh -o BatchMode=yes root@81.90.182.174 "sudo -u postgres pg_dump -Fc potok -f /tmp/potok.dump && tar -C /var/www/potok/backend -czf /tmp/potok-media.tgz media"
& $scp -o BatchMode=yes root@81.90.182.174:/tmp/potok.dump $dump
& $scp -o BatchMode=yes root@81.90.182.174:/tmp/potok-media.tgz $media
& $ssh -o BatchMode=yes root@81.90.182.174 "rm -f /tmp/potok.dump /tmp/potok-media.tgz"

wsl -e bash -lc "pg_restore --clean --if-exists --no-owner --no-acl -d postgresql://potok:potok@127.0.0.1:5432/potok /mnt/c/W27/POTOK/backend/prod.dump || true; mkdir -p /mnt/c/W27/POTOK/backend/media; tar -xzf /mnt/c/W27/POTOK/backend/prod-media.tgz -C /mnt/c/W27/POTOK/backend; rm -f /mnt/c/W27/POTOK/backend/prod-media.tgz"
Write-Output "prod data copied to backend/prod.dump and backend/media"
