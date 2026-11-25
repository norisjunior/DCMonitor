#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[docs] arquivos obrigatórios"
python3 scripts/check_docs_sync.py

echo "[json] flows e dashboard"
python3 -m json.tool node-red/flows.json >/dev/null
python3 -m json.tool n8n/flow_zabbix.json >/dev/null
python3 -m json.tool grafana/dashboards/dcmonitor.json >/dev/null

echo "[node-red] funções do fluxo"
if command -v node >/dev/null 2>&1; then
  node scripts/test_node_red_functions.js
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/w" -w /w --entrypoint node \
    nodered/node-red:4.1.11 scripts/test_node_red_functions.js
else
  echo "[node-red] Node e Docker ausentes; testes das funções não executados"
fi

echo "[compose] renderização"
docker compose --env-file .env.example config -q

echo "[security] segredos conhecidos e serviços removidos"
if rg -n 'Th1ng\$IoT|FIAPIoT/aula09|POSTGRES_|Flask' \
  ESP32 node-red n8n grafana docker-compose.yml .env.example; then
  echo "Referência obsoleta ou segredo encontrado." >&2
  exit 1
fi

if command -v pio >/dev/null 2>&1; then
  echo "[esp32] compilação"
  # Os exemplos copiados só para compilar saem mesmo se o build falhar: um
  # ca_cert.hpp de exemplo esquecido geraria firmware com CA inválida.
  limpar_exemplos() {
    if [ "${cleanup_config:-0}" = "1" ]; then rm -f ESP32/include/config.hpp; fi
    if [ "${cleanup_ca:-0}" = "1" ]; then rm -f ESP32/include/ca_cert.hpp; fi
  }
  trap limpar_exemplos EXIT
  if [ ! -f ESP32/include/config.hpp ]; then
    cp ESP32/include/config.example.hpp ESP32/include/config.hpp
    cleanup_config=1
  fi
  if [ ! -f ESP32/include/ca_cert.hpp ]; then
    cp ESP32/include/ca_cert.example.hpp ESP32/include/ca_cert.hpp
    cleanup_ca=1
  fi
  pio run -d ESP32
else
  echo "[esp32] PlatformIO ausente; compilação não executada"
fi

echo "Todos os checks disponíveis foram aprovados."
