# scripts/

Scripts administrativos do projeto. Executar sempre a partir da raiz do projeto.

## export_historico.sh

Arquivo trimestral completo — executa no último dia de cada trimestre e realiza 5 etapas em sequência:

1. `INSERT INTO medicoes_historico SELECT … FROM medicoes` — copia tudo para o histórico (SQL puro)
2. `DELETE FROM medicoes` — limpa a tabela operacional
3. `COPY medicoes_historico TO STDOUT CSV HEADER` — exporta o histórico sem carregar em memória
4. Compacta para `backups/YYYY-Ntrim.zip` (ex.: `backups/2026-1trim.zip`)
5. `DELETE FROM medicoes_historico` — limpa o histórico

> **Nota:** o `flow_retencao.json` do n8n (que fazia `INSERT SELECT + DELETE`) foi absorvido por
> este script para que a geração do ZIP e a limpeza aconteçam na mesma operação atômica.
> O fluxo n8n pode ser mantido inativo como alternativa manual.

**Pré-requisitos:**
```bash
sudo apt install zip          # se não tiver zip instalado
```

**Uso manual (qualquer momento):**
```bash
./scripts/export_historico.sh
```

**Agendamento via cron** (`crontab -e` no servidor, ajuste o caminho):
```cron
# Arquivo trimestral no último dia de cada trimestre às 03:00
0 3 31 3  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 6  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 9  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 31 12 * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
```

**Verificação após execução:**
```bash
ls -lh backups/

docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT COUNT(*) FROM medicoes; SELECT COUNT(*) FROM medicoes_historico;"
```

## run_project_checks.sh

Executa verificações gerais do projeto (lint, testes).

## check_docs_sync.py

Verifica se os documentos críticos existem e não estão vazios. Falha com exit 1 se algum estiver ausente.
