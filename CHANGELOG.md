# CHANGELOG

Todas as mudanças relevantes neste projeto são documentadas aqui.
Formato: `## [versão ou data] — descrição breve`, seguido de lista de alterações.
Mantido pela skill `documentation`.

---

## [2026-11-25c] — HTTPS no Node-RED

### Adicionado

- `scripts/gerar_certificados.sh` — emite também o certificado do Node-RED (`pki/node-red/`, chave com dono UID 1000) e se recusa a rodar quando a CA existe sem a chave
- `node-red/settings.js` — porta 1880 só em HTTPS, certificado relido a cada 12 h
- `docs/DEPLOY_PROD.md` — "Confiar na CA nos navegadores" e "Chave da CA" (tirar do servidor, cifrada, e devolver para renovar)

### Alterado

- `docker-compose.yml` — monta `NODERED_CERTS_DIR` em `/data/tls`; `NODE_EXTRA_CA_CERTS` e healthcheck em HTTPS
- Endereços do Node-RED na documentação passam a `https://…:1880`; `docs/SECURITY.md`, `PROJECT_BRIEF.md` (D-030) e `docs/decision-log.md`

**Ação necessária:** rode `sudo bash scripts/gerar_certificados.sh` de novo (gera `pki/node-red/`), acrescente `NODERED_CERTS_DIR=./pki/node-red` ao `.env`, recrie o volume `dcmonitor_node_red_data` (novo `settings.js`) e instale `pki/ca/ca.crt` nos computadores que acessam a página. Depois, tire `pki/ca/ca.key` do servidor.

---

## [2026-11-25b] — Credencial MQTT por dispositivo, TLS e segundo Zabbix

### Adicionado

- Plugin dynamic security no Mosquitto (`mosquitto/mosquitto.conf`) e `mosquitto/iniciar.sh`, que na primeira subida cria o cliente administrador e o papel `ingestao`
- `node-red/flows.json` — aba `Credenciais MQTT`: `GET /api/credenciais`, `POST /api/credenciais/:id` (cria; 409 se já existe), `PUT` (troca) e `DELETE` (revoga), com papel `disp-<device_id>` restrito aos tópicos da própria placa, cabeçalho `X-DCMonitor` obrigatório e IDs só no formato `esp32-XXXXXXXXXXXX`
- `node-red/admin/` — coluna de credencial, geração de senha para placa nova, troca e revogação com confirmação, e painel com a linha da serial mostrada uma única vez
- `scripts/gerar_certificados.sh` — CA própria, certificado do servidor e `ESP32/include/ca_cert.hpp`
- `ESP32/src/DC_Credencial.hpp` — senha MQTT na NVS; `ESP32/include/ca_cert.example.hpp`
- Segundo servidor Zabbix (`ZABBIX_SERVER_2`) e debugs `MSG RAW ESP32` e `MSG ZABBIX` no fluxo versionado
- `scripts/test_node_red_functions.js` — 43 testes

### Alterado

- Firmware 1.6.0: MQTT sobre TLS na porta 8883, usuário = `device_id`, senha da NVS; sem senha, espera a linha `credencial <device_id> <senha>` na serial sem dormir (Enter repete o ID); espera de conexão TLS limitada a `TEMPO_MAXIMO_MQTT_S`
- `ESP32/include/config.example.hpp` — saem `MQTT_USERNAME` e `MQTT_PASSWORD`; `MQTT_PORT` passa a 8883; `NTP_SERVIDOR` aponta para o servidor
- `docker-compose.yml` — Mosquitto publica só a 8883; diretórios do host `MQTT_CERTS_DIR` e `MQTT_SEGURANCA_DIR`; healthcheck autenticado sem senha na linha de comando; Node-RED recebe `MQTT_ADMIN_*` e `ZABBIX_SERVER_2` (padrão `10.32.8.69`)
- `node-red/flows_cred.json` — login do Node-RED na porta interna
- `.env.example`, `.gitignore`, `PROJECT_BRIEF.md` (RF-005, RF-009, RNF-008, D-024, D-026 a D-029), `docs/decision-log.md` e documentação operacional

### Removido

- `mosquitto/acl`, a senha MQTT única da frota (`MQTT_USERNAME`, `MQTT_PASSWORD`) e a porta 1883

**Ação necessária:**

1. No servidor, como root: `bash scripts/gerar_certificados.sh` e `install -d -o 1883 -g 1883 ./mqtt-seguranca`. Guarde `pki/ca/ca.key` em cofre.
2. No `.env`: remova `MQTT_USERNAME`/`MQTT_PASSWORD`; adicione `MQTT_ADMIN_USER`, `MQTT_ADMIN_PASSWORD` (ao menos 24 caracteres: `openssl rand -base64 32`), `MQTT_CERTS_DIR`, `MQTT_SEGURANCA_DIR` e, se quiser explicitar, `ZABBIX_SERVER_2=10.32.8.69`.
3. chrony servindo as redes das placas e firewall com 8883/tcp e 123/udp liberadas para elas e 1883 fechada (`docs/DEPLOY_PROD.md`).
4. Recrie o volume `dcmonitor_node_red_data` (fluxo e `flows_cred.json` novos).
5. Copie `ca_cert.hpp` do servidor para `ESP32/include/`. No `config.hpp` local: `MQTT_PORT = 8883`, `MQTT_HOST` com o IP ou nome do certificado, `NTP_SERVIDOR` com o servidor, `VERSAO_FIRMWARE = "1.6.0"`. Grave cada placa com `pio run -t erase && pio run -t upload`, gere a senha em `/admin/` e cole a linha no monitor serial.

---

## [2026-11-25] — Cadastro de dispositivos, tópico `data` e ACL por dispositivo

### Adicionado

- `node-red/admin/index.html` e `app.js` — página `/admin/` para definir nome amigável e local de cada dispositivo e manter a lista de locais; mostra a situação e a última leitura de cada placa vista
- `node-red/flows.json` — aba `Cadastro de dispositivos`: lê `dispositivos.json` ao iniciar (cria vazio se ausente), API `GET`/`PUT /api/cadastro` com validação e controle de revisão (409 em conflito, inclusive em gravações simultâneas) e gravação atômica com `dispositivos.json.bak`
- `node-red/settings.js` — `httpStatic` em `/admin/`, login próprio da página e da API (`CADASTRO_ADMIN_USER`, `CADASTRO_ADMIN_PASSWORD_HASH`; sem o hash o Node-RED não sobe), cabeçalhos CSP/anti-frame/nosniff e `functionExternalModules` para o `fs` do nó de gravação
- `docker-compose.yml` — diretório do host `CADASTRO_DIR` (padrão `./cadastro`) montado em `/data/cadastro`; ACL do Mosquitto montada e copiada com permissão restrita
- `mosquitto/acl` — cada cliente só escreve em `fdctmon/{client-id}/data` e `/status` e só lê `/cmd`
- `grafana/dashboards/dcmonitor.json` — variáveis `Local` e `Dispositivo`, legendas com o nome amigável e painel `Situação das placas` com o tempo desde a última medição
- `scripts/test_node_red_functions.js` — 27 testes das funções do fluxo, executados pelo `run_project_checks.sh`
- `docs/DEVELOPMENT.md` — processo de desenvolvimento e revisão

### Alterado

- Tópico de telemetria `fdctmon/{device_id}/attrs` → `fdctmon/{device_id}/data`; `fdctmon/{device_id}/cmd` reservado para comandos futuros
- `ESP32/src/DC_Comunicacao.hpp` e `ESP32/include/config.example.hpp` — tópico `data`; `VERSAO_FIRMWARE` para `1.5.0`
- `node-red/flows.json` — telemetria assina `fdctmon/+/data`, rejeita `device_id` diferente do tópico e grava as tags `local` e `nome` (`sem-local` e o próprio `device_id` para placa sem cadastro)
- `grafana/dashboards/dcmonitor.json` — valores atuais e situação pegam a medição mais recente de cada placa e só então aplicam os filtros: placa que mudou de local aparece apenas no local novo
- `n8n/flow_zabbix.json` — contingência assina `fdctmon/+/data`
- `.env.example`, `.gitignore`, `PROJECT_BRIEF.md` (RF-001, RF-003, RF-008, RNF-001, D-023 a D-025), `docs/decision-log.md` e documentação operacional

O Zabbix não muda: host igual ao `device_id` e as mesmas chaves.

**Ação necessária:**

1. No `.env`, adicione `CADASTRO_ADMIN_USER`, `CADASTRO_ADMIN_PASSWORD_HASH` (entre aspas simples) e `CADASTRO_DIR`, conforme `.env.example`.
2. No host, crie o diretório do cadastro: `install -d -o 1000 -g 1000 ./cadastro`.
3. Recrie o volume `dcmonitor_node_red_data`: `settings.js` e `flows.json` só são copiados para ele na criação. Para recomeçar sem histórico, recrie também os volumes do InfluxDB; medições antigas não têm as tags `local` e `nome` e não aparecem nos filtros do Grafana.
4. No `ESP32/include/config.hpp` local, ajuste `VERSAO_FIRMWARE` para `1.5.0` e regrave todas as placas: firmware anterior publica em `attrs` e deixa de ser ingerido.

---

## [2026-11-24] — ESP32 com deep sleep e transmissão a cada minuto

### Adicionado

- `ESP32/src/ESP32DC.ino` — ciclo completo em `setup()` terminando em `esp_deep_sleep_start()` com despertar por timer de 60 s; `loop()` fica vazio
- `ESP32/src/ESP32DC.ino` — watchdog de tarefa (`esp_task_wdt`) que reinicia a placa se o ciclo acordado passar de 30 s
- `ESP32/src/ESP32DC.ino` — sincronização NTP na primeira vez e a cada 60 ciclos, com o contador em `RTC_DATA_ATTR`
- `ESP32/src/ESP32DC.ino` — segunda tentativa de leitura do DHT22 após 2,1 s
- `ESP32/src/DC_Display.hpp` — `definirHorario()`; o horário da medição (`HH:MM`) aparece à direita de `FUNDACENTRO`
- `ESP32/README.md` — seção `Ciclo com deep sleep`

### Alterado

- `ESP32/src/ESP32DC.ino` — uma sessão MQTT por ciclo, com `DISCONNECT` limpo; o status retido segue `online` e o Last Will só dispara em falha no meio do ciclo
- `ESP32/src/ESP32DC.ino` — esperas de Wi-Fi (10 s), MQTT (5 s) e NTP (3 s) limitadas; ao estourar, a placa dorme e tenta no próximo ciclo
- `ESP32/src/DC_Display.hpp` — `inicializar()` não limpa mais o painel, que mantém a última leitura até ser redesenhado; leitura inválida mostra `Falha no DHT22`
- `ESP32/include/config.example.hpp` — `INTERVALO_PUBLICACAO_MS`, `INTERVALO_TENTATIVA_WIFI_MS` e `INTERVALO_TENTATIVA_MQTT_MS` substituídos por `TEMPO_SONO_S`, limites de espera, watchdog e NTP; `VERSAO_FIRMWARE` para `1.4.0`
- `PROJECT_BRIEF.md` — RF-001, RF-007 e RNF-002; D-015 substituída por D-022
- `docs/ARCHITECTURE.md`, `docs/EMBEDDED_IOT_GUIDELINES.md`, `docs/REQUIREMENTS.md`, `docs/decision-log.md`

O payload da telemetria não muda: mesmos tópicos, campos e `schema_version`.

**Ação necessária:** copie para o seu `include/config.hpp` o bloco de tempos do `config.example.hpp`; sem ele o firmware não compila. No Zabbix, ajuste os gatilhos de ausência de dados para a nova cadência e use `nodata` para detectar placa fora do ar, já que o status retido permanece `online`.

---

## [2026-09-17c] — ESP32 identificável na frota

### Adicionado

- `ESP32/src/ESP32DC.ino` — `WiFi.setHostname()` com o `device_id`, entre `WiFi.mode()` e `WiFi.begin()`: a placa aparece no DHCP pelo próprio identificador
- `ESP32/src/DC_Display.hpp` — `definirIdentificador()` e `desenharCabecalho()`; o `device_id` ocupa a segunda linha da faixa amarela, abaixo de `FUNDACENTRO`
- `ESP32/README.md` — seção `Vários dispositivos`
- `docs/ARCHITECTURE.md` — seção `Identidade na frota`

### Alterado

- `ESP32/src/ESP32DC.ino` — `configurarIdentidade()` sai de `inicializarComunicacao()` e passa para o início de `setup()`: o display precisa do identificador antes de exibir `Iniciando...`
- `ESP32/include/config.example.hpp` — `VERSAO_FIRMWARE` para `1.3.0`

O contrato MQTT não muda: mesmos tópicos, mesmos campos, mesmo `schema_version`. O `device_id` já era derivado de `ESP.getEfuseMac()`; o que mudou é que ele agora também aparece na rede e na placa, e não só no payload.

`config.hpp` continua sem nada específico de dispositivo — atualize o seu apenas se quiser refletir a versão `1.3.0`.

---

## [2026-09-17b] — Raspberry Pi fora do escopo

### Removido

- `raspberry/` — publicador, simulador, dependências e testes de regressão do dispositivo legado
- `scripts/run_project_checks.sh` — etapa `pytest`, sem alvo após a remoção dos testes
- `PROJECT_BRIEF.md` — RF-002 e o risco de convivência de payloads de gerações diferentes
- `docs/REQUIREMENTS.md` — HU-002 e a migração de histórico do escopo

### Alterado

- `node-red/flows.json` — fallback da tag `sensor` passa de `legacy` para `desconhecido`
- `PROJECT_BRIEF.md` — D-011 marcada como substituída; D-020 registra a saída do Raspberry
- `docs/decision-log.md` — entrada de 2026-09-17 e a de 2026-07-13 marcada como substituída
- `README.md`, `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS.md`, `docs/TESTING_LOCAL.md`, `docs/TESTING_STRATEGY.md`, `docs/EMBEDDED_IOT_GUIDELINES.md`, `node-red/README.md` e `scripts/README.md` — ESP32 como único dispositivo

`ic`, `rssi`, `sensor`, `schema_version` e `firmware_version` continuam opcionais na validação, agora por robustez e não por compatibilidade: uma versão de firmware sem eles ainda grava temperatura e umidade.

---

## [2026-09-17] — Itens do Zabbix no formato aceito pelo nó e host por dispositivo

### Corrigido

- `node-red/flows.json` — `Montar itens do Zabbix` emite `[[host, chave, valor], ...]`; o nó `zabbix-sender` chama `addItem(...item)`, então qualquer outro formato é aceito sem erro e chega ilegível ao servidor

### Alterado

- `node-red/flows.json` — o host de destino passa a ser o `device_id` da medição, e não um host fixo; a saída 2 do nó `Validar telemetria` leva o `device_id` junto dos fields
- `node-red/flows.json` — chaves alinhadas aos itens já cadastrados no Zabbix: `temp`, `umid`, `headindex` e `rssi`, reunidas na constante `CHAVES`
- `node-red/flows.json` — `Default hostname` do nó `zabbix-sender` fica vazio: o host vem de cada item
- `docker-compose.yml` e `.env.example` — `ZABBIX_HOST_NAME` sai do serviço `node-red` e permanece no `n8n`, para a contingência
- `n8n/flow_zabbix.json` — chaves da contingência alinhadas às do Zabbix
- `PROJECT_BRIEF.md`, `INICIALIZACAO.md`, `docs/*`, `node-red/README.md` e `n8n/README.md` — chaves, host por dispositivo e o formato exigido pelo nó

O sintoma corrigido era o fluxo verde no Node-RED sem nenhum dado em **Latest data**: o nó só reporta falha de transporte, e um item recusado pelo servidor não aparece no log.

Measurement, tags e fields do InfluxDB não mudaram; as chaves do Zabbix deixam de coincidir com eles de propósito.

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
