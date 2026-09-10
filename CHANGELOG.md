# CHANGELOG

Todas as mudanças relevantes neste projeto são documentadas aqui.
Formato: `## [versão ou data] — descrição breve`, seguido de lista de alterações.
Mantido pela skill `documentation`.

---

## [2026-09-10] — Node-RED grava pelo nó nativo do InfluxDB e envia ao Zabbix

### Adicionado

- `node-red/flows.json` — nó `Enviar ao Zabbix` (`zabbix-sender`) alimentado por uma segunda saída do nó de validação; envia `temperatura`, `umidade`, `indice_calor` e `rssi` ao host de `ZABBIX_HOST_NAME`
- `node-red/flows_cred.json` — credencial do InfluxDB provisionada como `${INFLUXDB_TOKEN}`; o valor real vem do ambiente
- `node-red/Dockerfile` — `node-red-contrib-influxdb@0.7.0` e `node-red-contrib-zabbix-sender@1.0.0` embutidos na imagem
- `docker-compose.yml` — `ZABBIX_SERVER`, `ZABBIX_PORT` e `ZABBIX_HOST_NAME` no serviço `node-red`

### Alterado

- `node-red/flows.json` — gravação passa do par `function` + `http request` para o nó `influxdb out` (configuração 2.0); a função deixa de montar line protocol, cabeçalho `Authorization` e URL
- `docs/decision-log.md` — o envio ao Zabbix sai do n8n; entrada de 2026-07-13 marcada como substituída
- `README.md`, `INICIALIZACAO.md`, `PROJECT_BRIEF.md`, `docs/*` e `n8n/README.md` — caminho MQTT → Node-RED → InfluxDB/Zabbix

### Removido

- `node-red/flows.json` — nó `Confirmar gravação`: o nó `influxdb out` não tem saída e reporta falha pelo `catch`

O n8n fica sem workflow ativo. `n8n/flow_zabbix.json` e o `zabbix_sender` da imagem permanecem como contingência; ativá-lo junto com o fluxo do Node-RED faz o Zabbix receber cada medição duas vezes.

Measurement, tags e fields não mudaram: o dashboard Grafana e as séries já gravadas continuam válidos.

---

## [2026-08-13c] — Display OLED SSD1306 no ESP32

### Adicionado

- `ESP32/src/DC_Display.hpp` — módulo do OLED 128x64: título `FUNDACENTRO` centralizado e duas caixas lado a lado, temperatura à esquerda e umidade à direita, com rótulo em fonte pequena e valor em fonte grande
- `ESP32/include/config.example.hpp` — `PINO_OLED_SDA`, `PINO_OLED_SCL` e `ENDERECO_OLED`
- `ESP32/platformio.ini` — `Adafruit GFX Library` e `Adafruit SSD1306`

### Alterado

- `ESP32/src/ESP32DC.ino` — `loop()` passa a ler o sensor a cada 30 s independentemente do MQTT; o display é atualizado sempre e a publicação ocorre apenas com o cliente conectado
- `ESP32/include/config.example.hpp` — `VERSAO_FIRMWARE` para `1.2.0`
- `docs/ARCHITECTURE.md` e `ESP32/README.md` — organização do firmware, pinagem do OLED e comportamento em falhas

A caixa da esquerda é mais larga que a da direita porque `Temperatura` ocupa 66 px na fonte pequena, acima da metade dos 128 px da tela. Display ausente ou em endereço I2C diferente apenas registra aviso no serial; a telemetria continua.

O layout considera o painel bicolor de 0,96": as linhas 0 a 15 são amarelas. As caixas começam em `y = 17` para que borda e rótulos fiquem inteiros na área azul, e a folga interna entre rótulo e valor foi reduzida para o conjunto continuar cabendo nos 64 px.

---

## [2026-08-13b] — RSSI do ESP32 no contrato MQTT

### Adicionado

- `ESP32/src/ESP32DC.ino` — payload passa a incluir `rssi` com o retorno de `WiFi.RSSI()` no instante da publicação
- `node-red/flows.json` — `rssi` validado na faixa -120 a 0 dBm e gravado como field opcional no measurement `ambiente`
- `grafana/dashboards/dcmonitor.json` — painel `Sinal Wi-Fi atual` com limiares de cor e painel `Histórico do sinal Wi-Fi`

### Alterado

- `ESP32/include/config.example.hpp` — `VERSAO_FIRMWARE` para `1.1.0`
- `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` e `ESP32/README.md` — contrato MQTT, modelo InfluxDB e exemplo de payload sincronizados

`schema_version` permanece `1`: o campo é opcional e aditivo, então o Raspberry legado e qualquer consumidor que o ignore continuam válidos.

---

## [2026-08-13] — Acesso HTTP interno ao n8n

### Alterado

- `docker-compose.yml` — `N8N_SECURE_COOKIE=false` para permitir login no n8n via HTTP enquanto o servidor for acessado apenas pela rede interna
- `docs/SECURITY.md` — decisão registrada na superfície de rede e adicionada como pendência de reversão quando o n8n passar a ser servido por HTTPS

---

## [2026-07-13] — Migração para ESP32, InfluxDB e Grafana

### Alterado

- Portas da stack publicadas explicitamente em `0.0.0.0`, com acesso documentado pelo IP atual `10.32.8.115` e preparação para DNS futuro
- Comando de geração do hash bcrypt do Node-RED corrigido para sobrescrever o entrypoint da imagem
- Teste manual do `zabbix_sender` corrigido para ler as variáveis dentro do container n8n
- Arquitetura de produção substituída por Mosquitto + Node-RED + InfluxDB + n8n + Grafana no Oracle Linux 9
- Firmware ESP32 confirmado para DHT22 no GPIO 25, índice de calor, publicação MQTT a cada 30 s, Last Will e reconexão não bloqueante
- Firmware ESP32 reorganizado em `.ino` orquestrador + `DC_Ambiente.hpp` + `DC_Comunicacao.hpp`, mantendo a `struct` no código da aplicação
- Execução de Wi-Fi/MQTT e serialização JSON movidas para o `.ino`; header de comunicação reduzido a clientes, identidade e tópicos; IP recebido passa a aparecer no monitor serial
- Inicialização Wi-Fi passa a chamar `WiFi.begin()` uma única vez e a usar `WiFi.reconnect()` somente após estados de falha, sem reiniciar tentativas em andamento
- Roteiro de inicialização passa a testar MQTT com containers efêmeros de `mosquitto_sub` e `mosquitto_pub`, sem expor a senha no histórico do shell
- Contrato MQTT atualizado com compatibilidade temporária para o Raspberry Pi legado
- Node-RED passa a validar e persistir telemetria no InfluxDB
- n8n passa a concentrar o envio ao Zabbix; Telegram permanece pendente de regras confirmadas
- Grafana recebe datasource e dashboard provisionados
- Documentação de requisitos, arquitetura, segurança, testes e deploy sincronizada

### Adicionado

- `INICIALIZACAO.md` com roteiro copiável para a primeira subida no Oracle Linux, validação, acessos, teste MQTT e diagnóstico
- `ESP32/include/config.example.hpp` e `ESP32/README.md`
- `ESP32/src/DC_Ambiente.hpp` e `ESP32/src/DC_Comunicacao.hpp`
- `node-red/` com fluxo de ingestão versionado
- `grafana/` com provisioning do datasource e dashboard
- `n8n/flow_zabbix.json`
- testes de regressão do Raspberry em `raspberry/tests/`

### Removido

- PostgreSQL, Flask, fluxos n8n de persistência/retenção e scripts de histórico PostgreSQL
- regras de motor, LED, acelerômetro e referências FIAPIoT do protótipo ESP32 de aula
- credenciais Wi-Fi hardcoded do firmware

### Segurança

- MQTT externo autenticado em `1883`; listener anônimo restrito à rede Docker em `1884`
- interfaces e tokens documentados para uso por `.env`; Node-RED protegido por hash bcrypt
- senha Wi-Fi exposta no protótipo marcada para rotação obrigatória

## [2026-06-09b] — Cadência de 10s e histerese de fumaça

### Alterado
- `raspberry/sensor_publisher.py` — fumaça/presença são amostradas a cada 2 s, mas o payload MQTT é publicado a cada 10 s
- `raspberry/sensor_publisher.py` — `fumaca` passa por histerese: 3 leituras consecutivas para entrar ou sair de alerta
- `raspberry/sensor_simulator.py` — simulador acompanha a mesma cadência e histerese do dispositivo
- `web/templates/index.html` — polling do dashboard ajustado para 10 s
- `web/tests/test_sensor_logic.py` — adicionados testes unitários da histerese de fumaça
- `PROJECT_BRIEF.md`, `docs/*` e `n8n/README.md` — temporizações e decisão arquitetural atualizadas

---

## [2026-06-09] — Autenticação MQTT no Mosquitto

### Corrigido
- `mosquitto/mosquitto.conf` — desabilitado acesso anônimo e configurado `password_file`
- `docker-compose.yml` — Mosquitto gera credenciais em runtime a partir de `MQTT_USERNAME` e `MQTT_PASSWORD`; healthcheck passa a autenticar
- `raspberry/sensor_publisher.py` e `raspberry/sensor_simulator.py` — publicadores usam `username_pw_set()` quando credenciais MQTT estão definidas

### Alterado
- `.env.example` e `raspberry/.env.example` — adicionadas variáveis `MQTT_USERNAME` e `MQTT_PASSWORD`
- `README.md`, `n8n/README.md`, `docs/DEPLOY_PROD.md`, `docs/TESTING_LOCAL.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` e `docs/decision-log.md` — documentação sincronizada com MQTT autenticado

---

## [2026-06-08f] — Correção do zabbix_sender no container n8n

### Alterado
- `n8n/Dockerfile` — multi-stage build: copia `zabbix_sender` de `alpine:3.22` (tem apk) para a imagem hardened do n8n (sem apk)
- `n8n/flow_principal.json` — nó "Envia ao Zabbix" migrado de `executeCommand` (não existe no n8n 2.18.4) para `Code` com `child_process`; lê `ZABBIX_SERVER` e `ZABBIX_HOST_NAME` de `process.env`

---

## [2026-06-08e] — Auditoria de documentação e correções

### Corrigido
- `scripts/check_docs_sync.py` — removido `docs/SECURITY.md` (não existe); adicionado `docs/REQUIREMENTS.md` (existe e é crítico); CI estava quebrando
- `scripts/export_historico.sh` — script agora faz operação completa: archive medicoes → export ZIP → limpeza; eliminado desalinhamento de timing com o n8n flow_retencao
- `docs/REQUIREMENTS.md` RF-003b — atualizado para refletir implementação real (script trimestral, tabela historico, ZIP)
- `README.md` — adicionada nota sobre variantes de fluxo n8n (homologação vs produção)
- `n8n/README.md` — esclarecido papel do flow_retencao (alternativa manual; script é o mecanismo principal)
- `scripts/README.md` — documentação atualizada com as 5 etapas do script e nota sobre n8n

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
