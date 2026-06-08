#!/usr/bin/env bash
# Arquivo trimestral completo: medicoes → historico → ZIP → limpeza.
# Executar a partir da raiz do projeto: ./scripts/export_historico.sh
set -euo pipefail

# Carrega variáveis do .env
set -a && source .env && set +a

# Determina ano e trimestre
YEAR=$(date +%Y)
MONTH=$(date +%-m)
if   [ "$MONTH" -le 3  ]; then TRIM=1
elif [ "$MONTH" -le 6  ]; then TRIM=2
elif [ "$MONTH" -le 9  ]; then TRIM=3
else TRIM=4; fi

FILENAME="${YEAR}-${TRIM}trim"
BACKUPS_DIR="./backups"
CSV_TMP="/tmp/${FILENAME}.csv"

mkdir -p "$BACKUPS_DIR"

# Verifica se há registros em medicoes
COUNT=$(docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq \
  -c "SELECT COUNT(*) FROM medicoes;")

if [ "$COUNT" -eq 0 ]; then
  echo "Nenhum registro em medicoes — nada a arquivar."
  exit 0
fi

echo "Arquivando $COUNT registros de medicoes para medicoes_historico..."

# Etapa 1: copia medicoes → historico (SQL puro, sem carga em memória)
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "INSERT INTO medicoes_historico (id, timestamp, device_id, temperatura, umidade, fumaca, presenca_notificavel, distancia)
      SELECT id, timestamp, device_id, temperatura, umidade, fumaca, presenca_notificavel, distancia
      FROM medicoes;"

# Etapa 2: apaga medicoes (dados já estão em historico)
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM medicoes;"

echo "Exportando historico para ${FILENAME}.zip..."

# Etapa 3: exporta historico para CSV via COPY TO STDOUT (sem carregar em memória)
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\COPY medicoes_historico TO STDOUT CSV HEADER" \
  > "$CSV_TMP"

# Etapa 4: compacta para ZIP (-j = não incluir caminho, apenas o arquivo)
zip -j "${BACKUPS_DIR}/${FILENAME}.zip" "$CSV_TMP"
rm "$CSV_TMP"

# Etapa 5: limpa historico
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM medicoes_historico;"

echo "Concluído: ${BACKUPS_DIR}/${FILENAME}.zip"
