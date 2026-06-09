# Análise de Requisitos — FdctMonSys

> Gerado em: 2026-06-08
> Baseado em: `PROJECT_BRIEF.md` + sessão de clarificação de requisitos

---

## Objetivo

Substituir a infraestrutura FIWARE por **n8n + PostgreSQL + Mosquitto**, mantendo a coleta de sensores do Raspberry Pi e adicionando uma página web Flask para o telão do NOC, com integração ao Zabbix realizada no servidor.

---

## Histórias de usuário + critérios de aceite

### RF-001 — Coleta e publicação MQTT no Pi

> *Como engenheiro do NOC, quero que o Raspberry Pi colete continuamente os sensores e publique os dados via MQTT, para que o servidor possa armazenar e exibir as condições do datacenter.*

**Critérios de aceite:**
- Presença e fumaça coletados a cada 2 s; temperatura/umidade a cada 30 s com cache local entre leituras
- Publicação MQTT autenticada com `MQTT_USERNAME` e `MQTT_PASSWORD` vindos do `.env`
- Payload JSON publicado em `fdctmon/{device_id}/attrs`:
  ```json
  {"temp": 25.3, "umid": 60.0, "fumaca": 0, "presenca_notificavel": 1, "distancia": 142.5, "device_id": "b827eb00f6d0"}
  ```
- Lógica de `presenca_notificavel`: `1` somente se distância < 200 cm **e** horário entre 22h e 06h
- Pi reconecta ao broker automaticamente após queda de rede
- Nenhum dado gravado localmente no Pi (sem arquivo, sem banco)
- Código baseado em `OLD_PROJECT/FdctMonSys-App/envdatacenter.py`; tópicos FIWARE removidos

---

### RF-002 — Armazenamento no PostgreSQL

> *Como engenheiro do NOC, quero que todas as medições sejam armazenadas com timestamp no PostgreSQL, para que seja possível consultar o histórico e detectar tendências.*

**Critérios de aceite:**
- Tabela `medicoes` com colunas: `id`, `timestamp`, `device_id`, `temperatura`, `umidade`, `fumaca`, `presenca_notificavel`, `distancia`
- Cada mensagem MQTT resulta em exatamente 1 INSERT
- `timestamp` gerado pelo servidor (não pelo Pi)
- `SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 5` retorna os últimos registros com valores corretos

---

### RF-003 — Fluxo n8n principal (MQTT → PostgreSQL)

> *Como administrador, quero um fluxo n8n que receba as mensagens MQTT e insira no banco, para que o pipeline de dados seja automatizado sem intervenção manual.*

**Critérios de aceite:**
- Fluxo ativo com nó MQTT Trigger inscrito em `fdctmon/#`
- JSON parseado e mapeado para as colunas da tabela `medicoes`
- INSERT executado via nó Postgres do n8n
- Erro de parse não derruba o fluxo (tratamento de exceção no nó)
- Fluxo visível e editável na UI do n8n

---

### RF-003b — Arquivo trimestral e retenção de dados

> *Como administrador, quero que os dados sejam arquivados trimestralmente e o banco operacional seja limpo, para que medicoes permaneça leve e o histórico completo seja preservado.*

**Critérios de aceite:**
- Tabela `medicoes_historico` no PostgreSQL recebe todos os registros arquivados (preservação permanente)
- Script `scripts/export_historico.sh` executa no último dia de cada trimestre via cron do servidor:
  1. Move `medicoes` → `medicoes_historico` (INSERT SELECT, sem carga em memória)
  2. Apaga `medicoes`
  3. Exporta `medicoes_historico` para `backups/YYYY-Ntrim.zip`
  4. Apaga `medicoes_historico`
- Resultado: 4 arquivos ZIP por ano (`2026-1trim.zip` … `2026-4trim.zip`), cada um com um trimestre completo
- Fluxo n8n `flow_retencao.json` (3 nós: agenda trimestral → INSERT SELECT → DELETE) disponível como alternativa manual via UI do n8n
- Após execução, `SELECT COUNT(*) FROM medicoes` retorna 0; ZIP gerado em `backups/`

---

### RF-004 — Pi sem armazenamento local

> *Como administrador, quero que o Pi seja responsável apenas por coletar e publicar, sem gravar dados localmente, para simplificar a arquitetura e centralizar o armazenamento no servidor.*

**Critérios de aceite:**
- Código Python do Pi não importa nem usa `sqlite3`, arquivos `.csv`, MySQL ou qualquer mecanismo de persistência local
- `grep -r "open\|sqlite\|mysql\|csv" raspberry/` retorna vazio

---

### RF-005 — Dashboard web Flask

> *Como operador do NOC, quero uma página web que exiba as condições atuais do datacenter em tempo real, para que posso monitorar temperatura, umidade, fumaça e presença sem acessar o servidor diretamente.*

**Critérios de aceite:**
- Rota `GET /` retorna página HTML com valores de temperatura, umidade, fumaça, presença notificável e distância
- Rota `GET /api/status` retorna JSON com último registro + campo `online: true/false`
- `online: false` quando `NOW() - timestamp_ultimo_registro > 2 minutos`
- JavaScript na página chama `/api/status` a cada 5 s e atualiza os valores sem recarregar a página
- Banner/alerta visível quando `online: false`

---

### RF-006 — Integração Zabbix via servidor

> *Como engenheiro de infraestrutura, quero que as medições sejam enviadas ao Zabbix automaticamente pelo servidor, para que os alertas existentes no Zabbix continuem funcionando sem mudança.*

**Critérios de aceite:**
- n8n executa `zabbix_sender` a cada mensagem MQTT processada
- Chaves Zabbix: `temperatura`, `umidade`, `fumaca`, `presenca` para o host `SALA COFRE` no Zabbix `10.32.8.57`
- Falha no `zabbix_sender` não impede o INSERT no PostgreSQL
- Verificação: itens no Zabbix latest data atualizados após publicação MQTT manual de teste

---

## Requisitos não-funcionais

| ID | Requisito | Critério verificável |
|---|---|---|
| RNF-001 | Segredos em `.env` | `.env` no `.gitignore`; `.env.example` documentado com placeholders; Mosquitto com `allow_anonymous false`; senha/hash MQTT não versionados |
| RNF-002 | Latência Pi → banco | `timestamp` no banco ≤ 5 s após publicação MQTT |
| RNF-003 | Startup único | `docker compose up` sobe os 4 serviços sem erro; `docker compose ps` mostra todos `Up` |
| RNF-004 | Reconexão do Pi | Pi reconecta ao broker em até 30 s após queda simulada de rede |
| RNF-005 | Testes unitários | `pytest` passa com cobertura das rotas `/` e `/api/status` e da função `online/offline` |
| RNF-006 | OWASP Top 10 | `security-review` executado antes da entrega; sem findings bloqueantes |
| RNF-007 | Simplicidade de código | Sem ORM, sem classes abstratas, sem design patterns desnecessários; cada arquivo tem responsabilidade única e óbvia pelo nome; qualquer desenvolvedor consegue rastrear o fluxo de um dado lendo no máximo 3 arquivos |
| RNF-008 | Observabilidade do ciclo de dados | Cada etapa do ciclo Pi → Broker → n8n → PostgreSQL → Flask → Browser é verificável de forma independente, sem precisar subir o sistema inteiro (ver tabela abaixo) |

### RNF-008 — Pontos de verificação do ciclo de dados

| Etapa | Como verificar independentemente |
|---|---|
| **Pi → Broker** | `mosquitto_sub -h <broker_ip> -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "fdctmon/#" -v` no terminal — mensagens JSON aparecem em tempo real |
| **Broker → n8n** | UI do n8n → aba "Executions" do fluxo principal — cada execução mostra o payload recebido e o resultado do INSERT |
| **n8n → PostgreSQL** | `psql -c "SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 5"` — registros mais recentes visíveis |
| **PostgreSQL → Flask** | `curl http://<servidor>/api/status` — retorna JSON com último registro e flag `online` |
| **Flask → Browser** | DevTools do browser (aba Network) — requisições a `/api/status` a cada 5 s com resposta 200 |
| **n8n → Zabbix** | Zabbix frontend → "Latest Data" para o host `SALA COFRE` — valores atualizados |

### RNF-007 — Princípios de simplicidade de código

- **Sem ORM:** queries SQL escritas diretamente com `psycopg2`; o SQL é legível no próprio código
- **Sem classes abstratas ou herança:** funções simples com nomes descritivos
- **Sem frameworks além do declarado:** apenas Flask, `paho-mqtt`, `psycopg2`; nenhuma camada extra
- **Um arquivo por responsabilidade clara:** `sensor_publisher.py` (Pi), `app.py` (Flask), schema em `db/schema.sql`
- **Logs em cada etapa:** `print()` ou `logging` básico em cada publicação MQTT, cada INSERT, cada chamada ao Zabbix — rastreável via `docker compose logs`

---

## Fora do escopo

- FIWARE (Orion, IoT Agent, MongoDB, MySQL)
- Armazenamento local no Pi
- Histórico/gráfico de medições no dashboard (somente valor atual)
- Autenticação na página web
- `zabbix_sender` chamado do Pi
- Suporte a múltiplos dispositivos IoT
- Alertas por e-mail/SMS (responsabilidade do Zabbix)

---

## Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R-001 | `zabbix_sender` não disponível no container do servidor | Alto | Verificar na fase F1; alternativa: Zabbix API HTTP |
| R-002 | n8n perde conexão MQTT silenciosamente | Alto | Configurar reconexão automática no nó MQTT; monitorar via UI do n8n |
| R-003 | Cache de temperatura zerado após reboot do Pi | Baixo | Primeira mensagem pós-reboot terá `temp: null`; Flask exibe "—"; banco aceita null |
| R-004 | Rede entre Pi (10.x.x.x) e servidor (192.168.x.x) falha | Alto | Threshold de 2 min detecta; banner offline no dashboard; Pi reconecta em loop |
| R-005 | n8n INSERT falha durante pico de mensagens | Médio | Fila interna do n8n absorve; monitorar execuções com erro na UI |

---

## Plano de implementação incremental

| Fase | Entregável | Skills |
|---|---|---|
| **F1 — Infra** | `docker-compose.yml` (Mosquitto + PostgreSQL + n8n + Flask); `.env.example`; schema SQL | `devops-ci`, `database` |
| **F2 — IoT Device** | `raspberry/sensor_publisher.py`: JSON unificado, sem FIWARE, sem armazenamento local, cache de temperatura | `embedded-iot` |
| **F3 — n8n flows** | Fluxo principal (MQTT → Postgres + Zabbix) + fluxo de retenção (Schedule → DELETE 90d) exportados como JSON | `system-integrator`, `backend-api` |
| **F4 — Flask Dashboard** | Rotas `/` e `/api/status`; template HTML com AJAX polling 5 s; banner offline; distância + presença notificável | `frontend-web`, `backend-api`, `style-guardian` |
| **F5 — Testes & Revisão** | `pytest` Flask + queries; `security-review`; `code-review`; `CHANGELOG.md` e `docs/` atualizados | `qa-testing`, `security-review`, `code-review`, `documentation` |

> F1 é pré-requisito de F3 e F4. F2 pode correr em paralelo com F3/F4. F5 é obrigatório antes de qualquer entrega.

---

## Decisões registradas

Ver [decision-log.md](decision-log.md) para justificativas completas de cada escolha arquitetural.
