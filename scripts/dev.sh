#!/usr/bin/env bash
# Локальный API и страница. Запускать в Ubuntu: bash scripts/dev.sh
# Чужие процессы, базы и WSL не останавливает.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

if [[ "$ROOT" == /mnt/* && -d "$HOME/POTOK/backend" && -d "$HOME/POTOK/web" ]]; then
  echo "Код на диске Windows. Запускаю копию в $HOME/POTOK"
  ROOT="$HOME/POTOK"
fi

API_PORT=8000
WEB_PORT=5173
if ss -ltn | awk '{print $4}' | grep -q ":${API_PORT}$"; then
  echo "Порт ${API_PORT} занят, API не трогаю его и беру 8001"
  API_PORT=8001
fi
if ss -ltn | awk '{print $4}' | grep -q ":${WEB_PORT}$"; then
  echo "Порт ${WEB_PORT} занят, страницу не трогаю и беру 5174"
  WEB_PORT=5174
fi

if ! pg_isready -q; then
  echo "Postgres не принимает соединения. Службу сам не поднимаю: нужен пароль sudo этого Ubuntu."
  echo "Если это ваш кластер: sudo service postgresql start"
  exit 1
fi

cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  python3.15 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -q -r requirements.txt

if [[ ! -f .env ]]; then
  cp .env.example .env
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

python manage.py migrate --noinput
python manage.py runserver "0.0.0.0:${API_PORT}" &
API_PID=$!

cd "$ROOT/web"
if [[ ! -d node_modules ]]; then
  npm install
fi
export VITE_API_URL="http://127.0.0.1:${API_PORT}"
npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup INT TERM

echo "API  http://127.0.0.1:${API_PORT}/api/docs"
echo "Сайт http://127.0.0.1:${WEB_PORT}/"
echo "Остановить: Ctrl+C"
wait "$API_PID" "$WEB_PID"
