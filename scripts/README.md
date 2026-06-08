# scripts/

Scripts administrativos do projeto. Executar sempre a partir da raiz do projeto.

## export_historico.sh

Exporta `medicoes_historico` para um ZIP trimestral e limpa a tabela.

**Pré-requisitos:**
```bash
sudo apt install zip          # se não tiver zip instalado
```

**Uso manual:**
```bash
./scripts/export_historico.sh
```

Gera `backups/YYYY-Ntrim.zip` (ex.: `backups/2026-1trim.zip`) e apaga todos os registros de `medicoes_historico`.

**Agendamento via cron** (executar `crontab -e` no servidor):
```cron
# Exporta histórico no último dia de cada trimestre às 03:00
0 3 31 3  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 6  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 9  * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 31 12 * cd /caminho/do/projeto && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
```

**Verificação após execução:**
```bash
# ZIP gerado
ls -lh backups/

# Histórico limpo no banco
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT COUNT(*) FROM medicoes_historico;"
```

## run_project_checks.sh

Executa verificações gerais do projeto (lint, testes).

## check_docs_sync.py

Verifica consistência entre arquivos de código e documentação.
