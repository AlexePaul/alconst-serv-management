#!/bin/sh
# Backup-ul bazei de date: un fișier `pg_dump` (format custom) la fiecare rulare.
#
# Folosește variabilele standard PostgreSQL (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
#   BACKUP_DIR        unde se scriu fișierele (implicit /backups)
#   BACKUP_KEEP_DAYS  câte zile se păstrează (implicit 14)
#
# Fișierul este scris sub un nume temporar, verificat (trebuie să poată fi citit de pg_restore)
# și abia apoi redenumit: un backup incomplet nu apare niciodată ca fiind valid.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
final="$BACKUP_DIR/alconst-$stamp.dump"
partial="$final.part"

pg_dump --format=custom --no-owner --no-privileges --file="$partial"
pg_restore --list "$partial" > /dev/null
mv "$partial" "$final"

# Curăță backup-urile vechi și eventualele fișiere parțiale rămase de la rulări întrerupte.
find "$BACKUP_DIR" -name 'alconst-*.dump' -type f -mtime "+$BACKUP_KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'alconst-*.dump.part' -type f -mmin +120 -delete

echo "[backup] $(date -u +%FT%TZ) scris $final ($(wc -c < "$final") octeți)"
