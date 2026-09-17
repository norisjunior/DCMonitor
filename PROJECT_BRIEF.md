# PROJECT_BRIEF.md

## 1. Visão geral

- **Nome do projeto:** `FdctMonSys / DCMonitor`
- **Responsável / cliente:** `Norisvaldo Ferraz Junior`
- **Problema a resolver:** Monitorar temperatura e umidade do datacenter com dispositivos IoT, armazenar séries temporais localmente, exibir os dados no NOC e encaminhar medições ao Zabbix.
- **Resultado esperado:** Uma stack Docker reproduzível no Oracle Linux 9 com Mosquitto, Node-RED, InfluxDB, Grafana e n8n; ESP32 publicando DHT22 a cada 30 segundos; dashboard Grafana e atualização do Zabbix.
- **Usuários-alvo:** NOC e equipes de suporte e sustentação de infraestrutura.

## 2. Stack

- **Firmware / IoT:** ESP32 DevKit + DHT22, Arduino/PlatformIO
- **Mensageria:** Eclipse Mosquitto MQTT
- **Ingestão:** Node-RED
- **Automação / integrações:** n8n
- **Banco de telemetria:** InfluxDB 2.x
- **Dashboard:** Grafana
- **Infraestrutura:** Docker Compose em Oracle Linux 9
- **ML:** N/A

> SQLite usado internamente por n8n e Grafana não é banco de dados do domínio. PostgreSQL e Flask não fazem parte da nova plataforma.

## 3. Requisitos funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-001 | ESP32 lê DHT22 e publica temperatura, umidade e índice de calor via MQTT a cada 30 s | Alta | Payload JSON válido visível em `fdctmon/{device_id}/attrs`, com `device_id`, `temp`, `umid`, `ic`, `sensor=DHT22` e `schema_version=1` |
| RF-003 | Node-RED recebe MQTT, valida e grava no InfluxDB local | Alta | Cada mensagem válida gera pontos na measurement `ambiente`; payload inválido é rejeitado e aparece nos logs |
| RF-004 | Grafana exibe temperatura, umidade, índice de calor e histórico | Alta | Datasource InfluxDB e dashboard `DCMonitor - Ambiente` são provisionados ao subir a stack |
| RF-005 | Node-RED envia a telemetria validada ao Zabbix | Alta | Itens trapper `temp`, `umid`, `headindex` e `rssi` do host homônimo ao `device_id` são atualizados; a ausência de `ic`/`rssi` não interrompe os demais itens |
| RF-006 | Serviços sobem no Oracle Linux 9 com um único Compose | Alta | `docker compose up -d --build` inicia os cinco serviços e `docker compose ps` indica serviços saudáveis |
| RF-007 | Estado do ESP32 é publicado via MQTT Last Will | Média | `fdctmon/{device_id}/status` contém `online` quando conectado e `offline` após perda da sessão MQTT |

## 4. Requisitos não funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| RNF-001 | Segurança de segredos | Nenhuma senha/token no código; `.env` e `ESP32/include/config.hpp` ignorados pelo Git; exemplos contêm somente placeholders |
| RNF-002 | Confiabilidade do dispositivo | Firmware não bloqueia aguardando rede; tenta reconectar Wi-Fi e MQTT periodicamente; leitura DHT22 inválida não é publicada |
| RNF-003 | Persistência | Volumes Docker preservam Mosquitto, InfluxDB, Node-RED, n8n e Grafana após reinício |
| RNF-004 | Retenção | Bucket de telemetria mantém 90 dias (`2160h`) por padrão |
| RNF-005 | Observabilidade | Cada etapa ESP32 → MQTT → Node-RED → InfluxDB/Zabbix → Grafana pode ser verificada separadamente por comando ou UI |
| RNF-006 | Simplicidade | Firmware didático em um arquivo principal, configuração separada e fluxo de um dado rastreável sem frameworks adicionais |
| RNF-007 | Rede | Portas necessárias são publicadas explicitamente em `0.0.0.0`; firewall limita as origens; porta MQTT interna `1884` não é exposta pelo host |

## 5. Decisões confirmadas

| # | Decisão | Consequência |
|---|---|---|
| D-010 | InfluxDB + Grafana substituem PostgreSQL + Flask | Código e documentação da plataforma antiga deixam de participar do deploy |
| D-011 | Raspberry Pi e ESP32 coexistem durante a migração | Substituída por D-020 em 2026-09-17 |
| D-012 | Node-RED valida a telemetria, persiste no InfluxDB e alimenta o Zabbix | Uma única validação serve às duas saídas; o n8n fica livre para as regras de notificação |
| D-013 | Envio ao Zabbix usa o nó trapper do Node-RED | Não há processo externo nem duplicação de consumidor MQTT; o n8n mantém `flow_zabbix.json` como contingência |
| D-014 | ESP32 usa somente DHT22 nesta fase | Motor, LED, acelerômetro e outros sensores do protótipo de aula são removidos |
| D-015 | ESP32 publica a cada 30 segundos | DHT22 respeita sua cadência e o volume esperado é de 2.880 mensagens/dia |
| D-016 | Serviços escutam em `0.0.0.0`; clientes usam IP ou DNS | O IP atual é `10.32.8.115`; DNS futuro não exige trocar o bind dos containers |
| D-017 | Execução da comunicação fica no `.ino` | `DC_Comunicacao.hpp` mantém somente estado dos clientes e configuração de identidade/tópicos |
| D-018 | `WiFi.begin()` executa uma vez; falhas usam `WiFi.reconnect()` | Tentativas em andamento não são reiniciadas; estados terminais respeitam o intervalo de 10 s |
| D-019 | O host no Zabbix é o `device_id` do dispositivo | Cada dispositivo precisa de um host homônimo no Zabbix; não há host fixo por sala |
| D-020 | O Raspberry Pi sai do escopo; o ESP32 é o único dispositivo | `raspberry/` deixa o repositório; `ic`, `rssi` e `sensor` seguem opcionais na validação por robustez, não por compatibilidade |
| D-021 | Um único binário para toda a frota; identidade derivada do chip | Gravar uma placa nova não exige editar `config.hpp`; nomes legíveis ficam no Zabbix e no Grafana, não no firmware |

## 6. Restrições

- **Stack obrigatória:** Mosquitto, Node-RED, InfluxDB 2.x, n8n e Grafana em Docker Compose
- **Servidor:** Oracle Linux 9 com Docker já instalado; IP atual `10.32.8.115`
- **Hardware:** ESP32 DevKit com DHT22 no GPIO 25
- **Rede:** dispositivos e servidor possuem conectividade IP; Zabbix em rede alcançável pelo servidor
- **Custo:** componentes locais e open source

## 7. Fora do escopo desta fase

- PostgreSQL, Flask e FIWARE
- Sensores adicionais no ESP32 além do DHT22
- Comandos MQTT para atuadores, motor ou LED
- Regras Telegram, até que limiares, destinatários e política anti-repetição sejam definidos
- Alta disponibilidade ou cluster de InfluxDB/Grafana

## 8. Riscos conhecidos

| Risco | Impacto | Mitigação |
|---|---|---|
| Credencial Wi-Fi do protótipo foi exposta no código inicial | Alto | Removida do firmware; rotacionar a senha na infraestrutura antes de usar o dispositivo |
| Zabbix não possui host homônimo ao `device_id` ou itens trapper com as chaves documentadas | Alto | Criar/validar host e itens antes de subir o fluxo; o nó trapper não acusa item recusado |
| Node-RED perde conexão MQTT ou falha ao enviar ao Zabbix | Alto | Healthcheck, nó `catch` com log de erro e teste ponta a ponta independente |
| Perda do `.env` ou de volumes Docker | Alto | Backup periódico de `.env` em cofre seguro e dos volumes InfluxDB/Grafana/n8n |

## 9. Referências existentes

| O quê | Localização | Uso atual |
|---|---|---|
| Protótipo ESP32 de aula | histórico Git de `ESP32/` | Apenas referência; regras de motor/acelerômetro não pertencem ao DCMonitor |
| Projeto FIWARE antigo | `OLD_PROJECT/` | Referência histórica; não reutilizar na plataforma nova |
