# CHANGELOG

Todas as mudanças relevantes neste projeto são documentadas aqui.
Formato: `## [versão ou data] — descrição breve`, seguido de lista de alterações.
Mantido pela skill `documentation`.

---

## [2026-06-08d] — Script de exportação trimestral do histórico

### Adicionado
- `scripts/export_historico.sh` — exporta `medicoes_historico` para `backups/YYYY-Ntrim.zip` via `psql COPY TO STDOUT` e limpa a tabela; cron no host, sem carregar dados em memória
- `scripts/README.md` — documentação dos scripts administrativos com setup de cron
- `.gitignore` — adicionado `backups/`

---

## [2026-06-08c] — Arquivo trimestral simplificado (SQL puro, sem carga em memória)

### Alterado
- `n8n/flow_retencao.json` — simplificado para 3 nós: cron trimestral → INSERT SELECT → DELETE; CSV removido do fluxo (geraria OOM com milhões de registros)
- `docker-compose.yml` — removido volume `./backups` (não mais necessário)
- `.gitignore` — removida entrada `backups/`
- `n8n/README.md` — documentado comando manual para exportar CSV via psql quando necessário

---

## [2026-06-08b] — Retenção com arquivo histórico e CSV compactado

### Adicionado
- `db/schema.sql` — tabela `medicoes_historico` com índices em `timestamp` e `device_id`
- `docker-compose.yml` — volume `./backups:/home/node/files` no serviço n8n para persistir CSVs

### Alterado
- `n8n/flow_retencao.json` — fluxo expandido de 2 para 8 nós: conta → verifica → busca → gera CSV → gzip → INSERT historico → DELETE medicoes
- `n8n/README.md` — descrição atualizada com todos os nós do fluxo de retenção
- `.gitignore` — adicionado `backups/` (CSVs gerados não são versionados)

---

## [2026-06-08] — Implementação inicial: substituição do FIWARE por n8n + PostgreSQL

### Adicionado
- `docker-compose.yml` — orquestra Mosquitto, PostgreSQL 16, n8n e Flask em 4 containers
- `mosquitto/mosquitto.conf` — broker MQTT na porta 1883
- `db/schema.sql` — tabela `medicoes` com índices em `timestamp` e `device_id`
- `n8n/Dockerfile` — imagem n8n customizada com `zabbix-utils` instalado
- `n8n/flow_principal.json` — fluxo n8n: MQTT → PostgreSQL + zabbix_sender
- `n8n/flow_retencao.json` — fluxo n8n: retenção automática de 90 dias (cron diário 02h)
- `n8n/README.md` — instruções de importação de fluxos e configuração de credenciais
- `raspberry/sensor_publisher.py` — script Python refatorado para o Pi: JSON unificado, sem FIWARE, sem armazenamento local, cache de temperatura
- `raspberry/requirements.txt` e `raspberry/.env.example`
- `web/app.py` — Flask com rotas `GET /` e `GET /api/status`
- `web/templates/index.html` — dashboard NOC com polling AJAX 5s e banner offline
- `web/Dockerfile` e `web/requirements.txt`
- `web/tests/test_app.py` — testes unitários das rotas Flask (10 casos)
- `web/tests/test_sensor_logic.py` — testes unitários da lógica de presença notificável (6 casos)
- `.env.example` — todas as variáveis documentadas
- `.gitignore` — inclui `.env`, `__pycache__`, node_modules do OLD_PROJECT

### Alterado
- `docs/ARCHITECTURE.md` — atualizado com diagrama real do novo sistema
- `docs/REQUIREMENTS.md` — documento completo de requisitos funcionais, RNFs, riscos e plano
- `docs/decision-log.md` — 6 decisões arquiteturais registradas
- `PROJECT_BRIEF.md` — RF e RNF atualizados com critérios de aceite verificáveis

### Removido
- `docs/DATA_ML_GUIDELINES.md` — não aplicável (ML é N/A no projeto)

### Não implementado (fora do escopo)
- FIWARE (substituído por completo)
- Armazenamento local no Pi
- Autenticação na página web
