#!/bin/sh
# Test de restaurare: restaurează un backup într-o bază de date temporară și compară numărul de
# rânduri din fiecare tabel cu baza de date curentă. Nu modifică baza de date reală.
#
#   restore-check.sh /backups/alconst-20261111-020000.dump
#
# Folosește variabilele standard PostgreSQL (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
set -eu

dump="${1:?Indică fișierul de backup de verificat}"
scratch="restore_check_$$"

counts() {
  psql -X -At -d "$1" -c "
    SELECT format('SELECT %L, count(*) FROM %I', tablename, tablename)
    FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" |
    while read -r query; do psql -X -At -F ' ' -d "$1" -c "$query"; done
}

createdb "$scratch"
trap 'dropdb --if-exists "$scratch"' EXIT
pg_restore --no-owner --no-privileges --exit-on-error -d "$scratch" "$dump"

restored="$(counts "$scratch")"
current="$(counts "${PGDATABASE:?PGDATABASE este obligatoriu}")"

echo "Tabele și rânduri în backup:"
echo "$restored" | sed 's/^/  /'
if [ "$restored" = "$current" ]; then
  echo "OK: backup-ul se restaurează și corespunde cu baza de date curentă."
else
  echo "ATENȚIE: backup-ul se restaurează, dar diferă de baza de date curentă (normal dacă s-au făcut modificări după backup)."
fi
