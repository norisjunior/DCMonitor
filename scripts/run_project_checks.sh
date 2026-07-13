#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[docs] arquivos obrigatórios"
python3 scripts/check_docs_sync.py

echo "[json] flows e dashboard"
python3 -m json.tool node-red/flows.json >/dev/null
python3 -m json.tool n8n/flow_zabbix.json >/dev/null
python3 -m json.tool grafana/dashboards/dcmonitor.json >/dev/null

echo "[compose] renderização"
docker compose --env-file .env.example config -q

echo "[security] segredos conhecidos e serviços removidos"
if rg -n 'Th1ng\$IoT|FIAPIoT/aula09|POSTGRES_|Flask' \
  ESP32 node-red n8n grafana docker-compose.yml .env.example; then
  echo "Referência obsoleta ou segredo encontrado." >&2
  exit 1
fi

if command -v pytest >/dev/null 2>&1; then
  echo "[raspberry] testes de regressão"
  pytest -q raspberry/tests
else
  echo "[raspberry] pytest ausente; teste não executado"
fi

if command -v pio >/dev/null 2>&1; then
  echo "[esp32] compilação"
  if [ ! -f ESP32/include/config.hpp ]; then
    cp ESP32/include/config.example.hpp ESP32/include/config.hpp
    cleanup_config=1
  fi
  pio run -d ESP32
  if [ "${cleanup_config:-0}" = "1" ]; then
    rm -f ESP32/include/config.hpp
  fi
else
  echo "[esp32] PlatformIO ausente; compilação não executada"
fi

echo "Todos os checks disponíveis foram aprovados."
