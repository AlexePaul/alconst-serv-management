#!/bin/sh
# Rulează backup-ul la pornire și apoi o dată la BACKUP_INTERVAL_HOURS ore (implicit 24).
# Un backup eșuat este raportat în log și reîncercat la următorul interval; bucla nu se oprește.
set -u

interval="$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"
while true; do
  /usr/local/bin/backup.sh || echo "[backup] $(date -u +%FT%TZ) EȘUAT – se reîncearcă la următoarea rulare" >&2
  sleep "$interval"
done
