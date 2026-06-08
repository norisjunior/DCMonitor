#!/usr/bin/env bash
# Exporta medicoes_historico para ZIP trimestral e limpa a tabela.
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

# Verifica se há registros
COUNT=$(docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq \
  -c "SELECT COUNT(*) FROM medicoes_historico;")

if [ "$COUNT" -eq 0 ]; then
  echo "Nenhum registro em medicoes_historico — nada a exportar."
  exit 0
fi

echo "Exportando $COUNT registros para ${FILENAME}.zip..."

# Exporta via COPY TO STDOUT — sem carregar dados em memória
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\COPY medicoes_historico TO STDOUT CSV HEADER" \
  > "$CSV_TMP"

# Compacta para ZIP
zip -j "${BACKUPS_DIR}/${FILENAME}.zip" "$CSV_TMP"
rm "$CSV_TMP"

# Limpa o histórico somente após o ZIP ter sido gerado
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM medicoes_historico;"

echo "Concluído: ${BACKUPS_DIR}/${FILENAME}.zip"
