#!/usr/bin/env bash
# Instalează versiunea aflată în clona curentă: dependențe, build, verificări, migrări și
# repornirea proceselor PM2 ale ACESTEI aplicații (API-ul și worker-ul).
#
# Interfața web nu se instalează aici: este găzduită separat (Vercel) și se construiește acolo.
# De aceea pe server se instalează și se construiesc doar API-ul, worker-ul și pachetele lor.
#
#   deploy/deploy.sh <mediu> prepare     dependențe, build, verificări, migrări, pornire de probă
#   deploy/deploy.sh <mediu> activate    repornirea proceselor și confirmarea versiunii
#
# Este pornit de `remote-deploy.sh`, ca utilizator obișnuit, după ce clona a fost adusă la
# commit-ul cerut. Între cele două faze, `remote-deploy.sh` (root) pune în locul fișierului de
# mediu activ pe cel nou, deja verificat în faza `prepare`. Nu rulează ca root: un `node_modules` al lui root sau un al doilea daemon PM2
# sub root ar strica fiecare deploy următor.
#
# Regula de bază: orice verificare are loc ÎNAINTE de repornire. Dacă ceva nu este în regulă,
# scriptul se oprește, iar versiunea veche continuă să servească.
set -euo pipefail

# O comandă trimisă prin SSM nu are terminal; fără asta, pnpm poate aștepta o confirmare
# pe care nu o primește niciodată.
export CI=true

ENV_NAME="${1:?Indică mediul: stage sau prod}"
PHASE="${2:?Indică faza: prepare sau activate}"
APP_DIR="${ALCONST_APP_DIR:-/srv/alconst/$ENV_NAME}"
ENV_FILE="${ALCONST_ENV_FILE:-/etc/alconst/$ENV_NAME.env}"
READY_TIMEOUT="${ALCONST_READY_TIMEOUT:-90}"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'DEPLOY OPRIT: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || fail "deploy.sh nu se rulează ca root."
# Setări specifice mașinii (de exemplu PATH pentru node, pnpm și pm2), dacă există.
# shellcheck disable=SC1091
if [ -f /srv/alconst/env.sh ]; then . /srv/alconst/env.sh; fi
[ -r "$ENV_FILE" ] || fail "fișierul de mediu $ENV_FILE lipsește sau nu poate fi citit."
for tool in node pnpm pm2 git curl; do
  command -v "$tool" > /dev/null || fail "comanda „$tool” nu este disponibilă pentru $(id -un)."
done

cd "$APP_DIR"
VERSION="$(git rev-parse HEAD)"
export ALCONST_ENV="$ENV_NAME" ALCONST_APP_DIR="$APP_DIR" ALCONST_ENV_FILE="$ENV_FILE"
echo "Mediu: $ENV_NAME · fază: $PHASE · versiune: $VERSION · utilizator: $(id -un)"
port="$(node --env-file="$ENV_FILE" -p 'process.env.API_PORT || 3001')"

# Așteaptă ca API-ul de pe portul dat să răspundă la /api/ready cu versiunea instalată acum.
wait_ready() {
  local target_port="$1" deadline=$(( $(date +%s) + READY_TIMEOUT )) response
  until response="$(curl -fsS --max-time 5 "http://127.0.0.1:$target_port/api/ready" 2> /dev/null)" \
    && printf '%s' "$response" | grep -q "\"version\":\"$VERSION\""; do
    [ "$(date +%s)" -lt "$deadline" ] || return 1
    sleep 2
  done
  echo "API (127.0.0.1:$target_port): $response"
}

if [ "$PHASE" = prepare ]; then

step "Dependențe"
# Doar API-ul, worker-ul și pachetele de care depind – fără dependențele interfeței web.
pnpm install --frozen-lockfile --filter '@alconst/api...' --filter '@alconst/worker...'

step "Build"
pnpm --filter '@alconst/api...' --filter '@alconst/worker...' build

step "Verificarea rezultatului build-ului"
# Build-ul golește directoarele de ieșire la început: unul întrerupt nu trebuie să ajungă la repornire.
for artifact in \
  apps/api/dist/main.js \
  apps/api/dist/cli/check-config.js \
  apps/worker/dist/main.js \
  apps/worker/dist/cli/check-config.js; do
  [ -s "$artifact" ] || fail "build-ul nu a produs $artifact."
done

step "Verificarea configurării cu versiunea nouă"
# Aceeași validare pe care o fac procesele la pornire. O configurare greșită oprește deploy-ul
# aici; altfel procesul nou ar refuza să pornească după ce cel vechi a fost deja oprit.
NODE_ENV=production node --env-file="$ENV_FILE" apps/api/dist/cli/check-config.js \
  || fail "configurarea API-ului nu este validă."
NODE_ENV=production node --env-file="$ENV_FILE" apps/worker/dist/cli/check-config.js \
  || fail "configurarea worker-ului nu este validă."

step "Migrările bazei de date"
ENV_FILE="$ENV_FILE" pnpm --filter @alconst/database exec prisma migrate deploy

step "Pornire de probă a API-ului"
# Versiunea nouă este pornită pe un port alăturat, cu configurarea nouă, și trebuie să răspundă
# la /api/ready înainte ca procesul activ să fie atins. Un API care nu pornește (bază de date
# inaccesibilă, o eroare la încărcare) oprește deploy-ul aici.
probe_port="${ALCONST_PROBE_PORT:-$(( port + 1 ))}"
probe_log="$(mktemp)"
API_PORT="$probe_port" APP_VERSION="$VERSION" NODE_ENV=production \
  node --env-file="$ENV_FILE" apps/api/dist/main.js > "$probe_log" 2>&1 &
probe_pid=$!
trap 'kill "$probe_pid" 2> /dev/null || true; rm -f "$probe_log"' EXIT
if ! wait_ready "$probe_port"; then
  tail -n 30 "$probe_log" >&2
  fail "versiunea nouă a API-ului nu pornește (pornire de probă pe portul $probe_port)."
fi
kill "$probe_pid" 2> /dev/null || true
wait "$probe_pid" 2> /dev/null || true
trap - EXIT
rm -f "$probe_log"

printf '\nPregătire reușită: %s (%s)\n' "$VERSION" "$ENV_NAME"
exit 0
fi

[ "$PHASE" = activate ] || fail "fază necunoscută: $PHASE"

step "Repornirea proceselor aplicației"
# `startOrReload` cu fișierul nostru atinge doar procesele definite în el.
# Niciodată `pm2 reload all`, `pm2 restart all` sau `pm2 kill`: pe aceeași mașină rulează și alte aplicații.
APP_VERSION="$VERSION" pm2 startOrReload deploy/ecosystem.config.cjs --update-env

step "Verificarea versiunii pornite"
wait_ready "$port" \
  || fail "API-ul nu răspunde cu versiunea $VERSION pe 127.0.0.1:$port (/api/ready). Vezi: pm2 logs alconst-$ENV_NAME-api"

# Worker-ul nu are port: verificăm că procesul este pornit și nu se repornește în buclă.
sleep 5
pm2 jlist | node -e '
  const wanted = process.argv.slice(1);
  const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
  let ok = true;
  for (const name of wanted) {
    const proc = list.find((entry) => entry.name === name);
    const status = proc ? proc.pm2_env.status : "lipsește";
    console.log(`${name}: ${status}`);
    if (status !== "online") ok = false;
  }
  process.exit(ok ? 0 : 1);
' "alconst-$ENV_NAME-api" "alconst-$ENV_NAME-worker" \
  || fail "un proces al aplicației nu este pornit. Vezi: pm2 logs alconst-$ENV_NAME-worker"

printf '\nDeploy reușit: %s (%s)\n' "$VERSION" "$ENV_NAME"
