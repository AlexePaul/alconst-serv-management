#!/usr/bin/env bash
# Scrie fișierul de mediu al aplicației din AWS Systems Manager Parameter Store.
# Se instalează ca /srv/alconst/fetch-env.sh (root, 750) și este pornit de remote-deploy.sh.
#
#   /srv/alconst/fetch-env.sh <mediu>
#
# Citește toți parametrii de sub prefixul /alconst/<mediu>/ – numai al acestei aplicații – și
# scrie /etc/alconst/<mediu>.env (640, root:<utilizatorul aplicației>). Numele variabilei este
# ultima parte a numelui parametrului: /alconst/stage/DATABASE_URL → DATABASE_URL.
set -euo pipefail

ENV_NAME="${1:?Indică mediul: stage sau prod}"
PREFIX="${ALCONST_SSM_PREFIX:-/alconst/$ENV_NAME/}"
TARGET="${ALCONST_ENV_FILE:-/etc/alconst/$ENV_NAME.env}"
APP_GROUP="${ALCONST_GROUP:-admin}"

umask 077
directory="$(dirname "$TARGET")"
# Directorul poate fi parcurs de grupul aplicației (altfel fișierul din el nu poate fi citit),
# dar nu de alți utilizatori.
install -d -m 750 -o root -g "$APP_GROUP" "$directory"
temporary="$(mktemp "$directory/.env.XXXXXX")"
trap 'rm -f "$temporary"' EXIT

aws ssm get-parameters-by-path \
  --path "$PREFIX" --recursive --with-decryption --output json \
  | python3 -c '
import json, re, sys

parameters = json.load(sys.stdin)["Parameters"]
if not parameters:
    sys.exit("Niciun parametru sub prefixul cerut; fișierul de mediu nu a fost modificat.")
lines = []
for parameter in sorted(parameters, key=lambda item: item["Name"]):
    key = parameter["Name"].rsplit("/", 1)[-1]
    value = parameter["Value"]
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
        sys.exit(f"Nume de variabilă invalid: {key}")
    if "\n" in value or "\r" in value:
        sys.exit(f"Valoarea variabilei {key} conține sfârșit de linie.")
    # Între apostrofuri valoarea este luată literal; dacă ea conține un apostrof, între ghilimele.
    if chr(39) not in value:
        lines.append(f"{key}={chr(39)}{value}{chr(39)}")
    elif chr(34) not in value and "\\" not in value:
        lines.append(f"{key}={chr(34)}{value}{chr(34)}")
    else:
        sys.exit(f"Valoarea variabilei {key} conține și apostrof, și ghilimele sau backslash.")
print("\n".join(lines))
' > "$temporary"

chown "root:$APP_GROUP" "$temporary"
chmod 640 "$temporary"
mv -f "$temporary" "$TARGET"
trap - EXIT
echo "[fetch-env] $(grep -c '' "$TARGET") variabile scrise în $TARGET"
