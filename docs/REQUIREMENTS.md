# Requisitos — DCMonitor

> Atualizado em 2026-11-25. Fonte de verdade resumida: `PROJECT_BRIEF.md`.

## Objetivo confirmado

Substituir PostgreSQL/Flask por uma plataforma de séries temporais no Oracle Linux 9. O ESP32 com DHT22 é o único dispositivo de campo.

## Histórias de usuário e critérios de aceite

### HU-001 — Telemetria do ESP32

Como operador do NOC, quero receber temperatura, umidade e índice de calor a cada minuto para acompanhar o ambiente do datacenter.

- DHT22 conectado ao GPIO 25 e alimentado segundo a especificação do módulo.
- Tópico `fdctmon/{device_id}/data`; usuário e client-id MQTT iguais ao `device_id`.
- Conexão somente por TLS na porta 8883, com a senha própria da placa (HU-008).
- JSON com `schema_version`, `device_id`, `sensor`, `firmware_version`, `temp`, `umid`, `ic` e `rssi`.
- Valores em °C e %UR, arredondados em uma casa decimal.
- Leitura inválida é registrada no serial e não é publicada.
- Wi-Fi/MQTT/NTP têm espera limitada por ciclo; o ciclo acordado é encerrado pelo watchdog após 30 s.
- Entre ciclos o ESP32 fica em deep sleep por 60 s.
- O display mostra o horário da medição, para que valores antigos sejam reconhecíveis.

### HU-003 — Persistência de séries temporais

Como administrador, quero que o Node-RED grave as medições no InfluxDB para manter um histórico consultável.

- Node-RED assina `fdctmon/+/data` pela porta MQTT interna.
- Validação rejeita IDs, temperaturas e umidades fora do contrato, e medição cujo `device_id` difere do tópico.
- Measurement: `ambiente`.
- Tags: `device_id`, `sensor`, `local` (código do local, ou `sem-local`) e `nome` (nome amigável, ou o próprio `device_id`).
- Fields: `temperatura`, `umidade`, `indice_calor` e `rssi` quando disponíveis.
- Timestamp é atribuído pelo InfluxDB/servidor.
- Retenção padrão do bucket `fdctmon`: 90 dias.

### HU-004 — Visualização no Grafana

Como operador do NOC, quero um dashboard pronto após o deploy para visualizar valores atuais e histórico.

- Datasource `DCMonitor InfluxDB` provisionado automaticamente.
- Dashboard `DCMonitor - Ambiente` provisionado automaticamente.
- Painéis para temperatura, umidade, índice de calor, sinal Wi-Fi e histórico.
- Variáveis `Local` e `Dispositivo` (seleção múltipla, com "All"); legendas e valores atuais mostram o nome amigável.
- Tabela "Situação das placas" com a última medição de cada placa nos últimos 30 dias; "Sem dados há" fica laranja a partir de 3 min e vermelho a partir de 10 min.
- Atualização automática a cada 30 segundos.

### HU-005 — Integração Zabbix

Como equipe de infraestrutura, quero receber as mesmas medições no Zabbix para usar alertas e histórico já existentes.

- O mesmo fluxo Node-RED que grava no InfluxDB envia ao Zabbix, em ramificação separada.
- São enviadas as chaves `temp`, `umid` e, quando presentes, `headindex` e `rssi`.
- O host de destino é o próprio `device_id`; servidor e porta vêm do `.env` (`ZABBIX_SERVER`, `ZABBIX_PORT`).
- Com `ZABBIX_SERVER_2` (padrão `10.32.8.69` no Compose), os mesmos itens vão também a um segundo servidor Zabbix, na mesma `ZABBIX_PORT`. Definida vazia no `.env`, o segundo envio fica desligado.
- O envio usa o protocolo trapper por socket, sem execução de processo externo.
- Falha no Zabbix aparece no nó `catch` do fluxo e não impede a gravação no InfluxDB.

### HU-006 — Implantação simples

Como administrador do Oracle Linux, quero subir toda a plataforma com poucos comandos.

- Após preencher `.env`, `docker compose config` é válido.
- `docker compose up -d --build` sobe Mosquitto, InfluxDB, Node-RED, n8n e Grafana.
- Volumes nomeados preservam dados.
- `docker compose ps` e `docker compose logs <serviço>` permitem diagnóstico.

### HU-007 — Cadastro de dispositivos

Como operador do NOC, quero dar a cada placa um nome amigável e um local para encontrá-la no Grafana sem decorar o `device_id`.

- Página `https://SERVIDOR:1880/admin/` com login próprio (`CADASTRO_ADMIN_USER`, `CADASTRO_ADMIN_PASSWORD_HASH`), separado do editor do Node-RED.
- A página lista as placas vistas desde o último reinício do Node-RED, com situação e última leitura, e as já cadastradas; placa sem cadastro aparece como "novo".
- Permite definir nome (até 64 caracteres) e local de cada placa, e criar e remover locais (código slug imutável + nome). Local com placas não pode ser removido.
- Salvar grava `dispositivos.json` no diretório do host `CADASTRO_DIR` e vale para as próximas medições, sem reiniciar.
- Duas janelas editando ao mesmo tempo: a segunda a salvar recebe 409 e precisa recarregar.
- JSON inválido no disco não derruba a ingestão: a página mostra o motivo e a telemetria continua gravando com `sem-local`.
- O firmware e o Zabbix não mudam.

### HU-008 — Credencial MQTT por dispositivo e TLS

Como administrador, quero que cada placa tenha senha própria e fale com o broker por TLS, para que uma placa não publique no lugar de outra e eu possa tirar uma placa de serviço sem mexer nas demais.

- O broker só aceita as placas na porta 8883, com TLS e certificado assinado pela CA do DCMonitor (`scripts/gerar_certificados.sh`). A porta 1883 não existe; nenhuma porta aceita conexão anônima.
- O usuário MQTT da placa é o `device_id`; o papel `disp-<device_id>` só permite publicar em `fdctmon/<device_id>/data` e `/status` e ler `fdctmon/<device_id>/cmd`.
- Na página `/admin/`, com o login do cadastro, a coluna "Credencial MQTT" mostra `sem senha`, `ativa desde <data>` ou `desativada`.
- "Gerar senha" (na tabela ou no formulário "Placa nova: ID mostrado na serial") cria cliente e papel (`POST`) e mostra uma única vez a linha `credencial <device_id> <senha>`, com botão "Copiar linha". A senha tem 32 caracteres `[A-Za-z0-9_-]`; o broker guarda só o hash. Gerar para placa que já tem senha responde 409 e não altera nada.
- "Trocar senha" (`PUT`) e "Revogar" (`DELETE`) pedem um segundo clique de confirmação. Trocar invalida a senha antiga na hora e derruba a sessão aberta; revogar tira o acesso da placa e pode ser repetido sem erro.
- A API só aceita IDs no formato `^esp32-[0-9A-F]{12}$` (400 caso contrário) e exige o cabeçalho `X-DCMonitor: 1` (403 sem ele). Segunda operação para a mesma placa em andamento: 409. Broker sem resposta em 5 s: 504, avisando que o estado é incerto.
- A placa sem senha não dorme: mostra `Sem credencial`, imprime no serial o ID e o formato da linha e espera. Enter numa linha vazia repete as instruções. Ao receber a linha com o próprio ID, grava a senha na NVS e reinicia. Linha de outro ID ou malformada é recusada com mensagem.
- Credencial recusada pelo broker gera aviso no serial; a placa segue medindo e mostrando os valores no display.
- A placa confere cadeia e nome do certificado do broker, não as datas; publica mesmo sem NTP, com o display em `--:--`.
- O Node-RED entra na porta interna 1884 com `MQTT_ADMIN_USER`/`MQTT_ADMIN_PASSWORD`. O Mosquitto recusa subir com essa senha em `TROQUE_*` ou com menos de 24 caracteres.

## Contrato MQTT

Exemplo ESP32:

```json
{
  "schema_version": 1,
  "device_id": "esp32-A1B2C3D4E5F6",
  "sensor": "DHT22",
  "firmware_version": "1.6.0",
  "temp": 24.7,
  "umid": 53.2,
  "ic": 24.6,
  "rssi": -67
}
```

| Campo | Tipo | Obrigatório | Unidade/uso |
|---|---|---:|---|
| `device_id` | string `[A-Za-z0-9_-]`, até 64 chars | sim | tag e identidade |
| `temp` | number | sim | °C, faixa aceita -40 a 80 |
| `umid` | number | sim | %UR, faixa aceita 0 a 100 |
| `ic` | number | não | °C |
| `rssi` | number | não | dBm, faixa aceita -120 a 0 |
| `sensor` | string | não | `DHT22`, fallback `desconhecido` |
| `schema_version` | integer | não | versão atual `1` |
| `firmware_version` | string | não | rastreabilidade |

O firmware envia todos os campos desde a versão 1.2.0. Eles seguem opcionais na validação para que uma versão anterior, ou um dispositivo em recuperação, continue gravando temperatura e umidade.

Tópicos por dispositivo:

| Tópico | Sentido | Conteúdo |
|---|---|---|
| `fdctmon/{device_id}/data` | placa → servidor | telemetria acima, QoS 0, não retida |
| `fdctmon/{device_id}/status` | placa → servidor | `online` retido a cada despertar; `offline` somente via Last Will, quando a sessão cai sem `DISCONNECT` |
| `fdctmon/{device_id}/cmd` | servidor → placa | reservado para comandos futuros; ainda não usado pelo firmware |

Com deep sleep, a ausência do dispositivo é detectada pela falta de telemetria, e um comando futuro em `/cmd` terá de ser mensagem retida, lida pela placa ao acordar.

Conexão:

| Item | Valor |
|---|---|
| Porta | 8883, somente TLS; certificado do servidor assinado pela CA do DCMonitor, com o `MQTT_HOST` da placa entre os nomes |
| Usuário | `device_id` |
| Senha | própria da placa, gerada em `/admin/` e gravada na NVS |
| Client-id | `device_id` |
| Permissões | papel `disp-{device_id}`: publica em `fdctmon/{device_id}/data` e `/status`; assina e recebe `fdctmon/{device_id}/cmd` |

Publicação fora do próprio ramo é descartada sem aviso. Consumidores internos usam a porta 1884, sem TLS e só na rede Docker, com `MQTT_ADMIN_USER` (papel `ingestao`: lê `fdctmon/#`, pode publicar em `fdctmon/+/cmd`).

## Requisitos não funcionais

- Segredos somente em `.env`, `ESP32/include/config.hpp`, `pki/` e `mqtt-seguranca/`, todos ignorados pelo Git. A senha MQTT de cada placa fica só na NVS da placa e, como hash, no broker.
- Porta 8883 somente TLS, com credencial por placa; porta 1884 restrita à rede Docker e autenticada; porta 1883 fechada.
- Certificado do servidor renovável sem regravar placas; a chave da CA guardada em cofre.
- Página de cadastro protegida por login próprio; o cadastro é um arquivo comum do host, copiável para backup.
- Interfaces fazem bind em `0.0.0.0`; as administrativas são protegidas e liberadas no firewall apenas para a rede de gestão.
- Logs não devem imprimir senhas, tokens ou cabeçalho de autorização do InfluxDB.
- A perda de uma integração não deve impedir as demais: InfluxDB e Zabbix recebem por ramificações independentes do fluxo Node-RED.
- Retenção de 90 dias; backup e restauração documentados em `docs/DEPLOY_PROD.md`.

## Pontos de verificação independentes

| Etapa | Verificação |
|---|---|
| Dispositivo → MQTT | `mosquitto_sub` na porta interna 1884, de dentro do container do broker, com `MQTT_ADMIN_USER` |
| Credencial → broker | Placa provisionada em `/admin/` publica na 8883; após "Revogar", o serial mostra a credencial recusada |
| MQTT → Node-RED | Debug/log e status do nó de gravação na UI Node-RED |
| Node-RED → InfluxDB | Consulta Flux na UI do InfluxDB |
| InfluxDB → Grafana | Dashboard provisionado com dados por local e nome |
| Cadastro → InfluxDB | Medição seguinte a um salvamento na página `/admin/` chega com as novas tags `local` e `nome` |
| Node-RED → Zabbix | Latest Data dos itens trapper do host homônimo ao `device_id` |

## Fora do escopo atual

- PostgreSQL, Flask e FIWARE.
- Novos sensores no ESP32.
- Regras Telegram sem limiares e política de repetição confirmados.
- Cluster/alta disponibilidade.

## Plano incremental

| Fase | Entregável | Skills |
|---|---|---|
| F1 | Compose, variáveis, volumes e healthchecks | `devops-ci`, `security-review` |
| F2 | Firmware ESP32 DHT22 | `embedded-iot`, `qa-testing` |
| F3 | MQTT → Node-RED → InfluxDB | `system-integrator`, `database` |
| F4 | Grafana provisionado | `system-integrator`, `documentation` |
| F5 | Node-RED → Zabbix | `system-integrator`, `security-review` |
| F6 | Telegram após definir regras | `product-requirements`, `system-integrator` |
