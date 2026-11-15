#!/usr/bin/env bash
# Применяет миграции Django к базе из backend/.env. Другие базы не трогает.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

if [[ "$ROOT" == /mnt/* && -d "$HOME/POTOK/backend" ]]; then
  ROOT="$HOME/POTOK"
fi

if ! pg_isready -q; then
  echo "Postgres не принимает соединения. Службу сам не поднимаю."
  exit 1
fi

cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  python3.15 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate

if [[ ! -f .env ]]; then
  cp .env.example .env
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

python manage.py makemigrations
python manage.py migrate --noinput
python manage.py showmigrations
