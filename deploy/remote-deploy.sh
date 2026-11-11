#!/usr/bin/env bash
# Punctul de intrare al unui deploy, pe server. Se instalează o singură dată ca
# /srv/alconst/remote-deploy.sh (root, 750) și este pornit de documentul SSM al aplicației:
#
#   /srv/alconst/remote-deploy.sh <mediu> <commit>
#
# Ce face, ca root: aduce variabilele de mediu din Parameter Store, apoi predă restul unui
# utilizator obișnuit – actualizarea clonei și `deploy/deploy.sh` din versiunea cerută.
set -euo pipefail

ENV_NAME="${1:?Indică mediul: stage sau prod}"
COMMIT="${2:?Indică commit-ul de instalat}"
APP_USER="${ALCONST_USER:-admin}"
APP_DIR="/srv/alconst/$ENV_NAME"
# Cât poate ocupa build-ul. Mașina este partajată și fără swap: dacă nu ajunge memoria, trebuie
# oprit build-ul nostru, nu altă aplicație. (Vârful măsurat la build-ul API-ului: ~450 MB.)
BUILD_MEMORY_MAX="${ALCONST_BUILD_MEMORY_MAX:-1000M}"

case "$ENV_NAME" in stage | prod) ;; *) echo "Mediu necunoscut: $ENV_NAME" >&2; exit 2 ;; esac
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "Commit invalid." >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "remote-deploy.sh se rulează ca root (prin SSM)." >&2; exit 2; }

# Un singur deploy pe mediu la un moment dat.
exec 9> "/var/lock/alconst-$ENV_NAME.deploy.lock"
flock -n 9 || { echo "Un alt deploy pentru $ENV_NAME este deja în curs." >&2; exit 3; }

LIVE_ENV="/etc/alconst/$ENV_NAME.env"
NEXT_ENV="$LIVE_ENV.next"
as_user() { runuser -u "$APP_USER" -- bash -lc "$1"; }

# 1. Variabilele de mediu noi sunt scrise într-un fișier separat; cel activ rămâne neatins până
#    când cele noi trec verificarea.
ALCONST_ENV_FILE="$NEXT_ENV" /srv/alconst/fetch-env.sh "$ENV_NAME"

# 2. Pregătirea, ca utilizator obișnuit: doar commit-uri de pe ramura mediului pot fi instalate.
prepare=$(cat << SCRIPT
set -euo pipefail
cd '$APP_DIR'
git fetch --quiet origin 'release/$ENV_NAME'
git merge-base --is-ancestor '$COMMIT' 'origin/release/$ENV_NAME' \
  || { echo 'Commit-ul nu face parte din release/$ENV_NAME.' >&2; exit 4; }
git checkout --quiet --detach '$COMMIT'
ALCONST_ENV_FILE='$NEXT_ENV' ./deploy/deploy.sh '$ENV_NAME' prepare
SCRIPT
)
if command -v systemd-run > /dev/null && [ -d /run/systemd/system ]; then
  # Limită de memorie pentru build (procesele PM2 nu sunt incluse: aparțin daemonului PM2).
  systemd-run --scope --quiet --collect \
    -p "MemoryMax=$BUILD_MEMORY_MAX" -p MemorySwapMax=0 \
    runuser -u "$APP_USER" -- bash -lc "$prepare"
else
  as_user "$prepare"
fi

# 3. Fișierul de mediu verificat îl înlocuiește pe cel activ, dintr-o singură mișcare.
mv -f "$NEXT_ENV" "$LIVE_ENV"

# 4. Repornirea proceselor aplicației și confirmarea versiunii.
as_user "cd '$APP_DIR' && ./deploy/deploy.sh '$ENV_NAME' activate"
