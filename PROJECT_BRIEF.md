# PROJECT_BRIEF.md

## 1. Visão geral

- **Nome do projeto:** `FdctMonSys / DCMonitor`
- **Responsável / cliente:** `Norisvaldo Ferraz Junior`
- **Problema a resolver:** Monitorar temperatura e umidade do datacenter com dispositivos IoT, armazenar séries temporais localmente, exibir os dados no NOC e encaminhar medições ao Zabbix. O Raspberry Pi atual continuará durante a migração e será substituído gradualmente pelo ESP32.
- **Resultado esperado:** Uma stack Docker reproduzível no Oracle Linux 9 com Mosquitto, Node-RED, InfluxDB, Grafana e n8n; ESP32 publicando DHT22 a cada 30 segundos; Raspberry Pi coexistindo; dashboard Grafana e atualização do Zabbix.
- **Usuários-alvo:** NOC e equipes de suporte e sustentação de infraestrutura.

## 2. Stack

- **Firmware / IoT:** ESP32 DevKit + DHT22, Arduino/PlatformIO; Raspberry Pi 3 B + DHT11/MQ-2/HC-SR04 durante a transição
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
| RF-002 | Raspberry Pi continua publicando durante a migração | Alta | Mensagens atuais do Raspberry em `fdctmon/{device_id}/attrs` continuam aceitas mesmo sem `ic` e sem `schema_version` |
| RF-003 | Node-RED recebe MQTT, valida e grava no InfluxDB local | Alta | Cada mensagem válida gera pontos na measurement `ambiente`; payload inválido é rejeitado e aparece nos logs |
| RF-004 | Grafana exibe temperatura, umidade, índice de calor e histórico | Alta | Datasource InfluxDB e dashboard `DCMonitor - Ambiente` são provisionados ao subir a stack |
| RF-005 | n8n recebe a telemetria e envia ao Zabbix | Alta | Itens trapper `temperatura`, `umidade` e `indice_calor` do host configurado são atualizados; ausência de `ic` no Raspberry não interrompe os demais itens |
| RF-006 | Serviços sobem no Oracle Linux 9 com um único Compose | Alta | `docker compose up -d --build` inicia os cinco serviços e `docker compose ps` indica serviços saudáveis |
| RF-007 | Estado do ESP32 é publicado via MQTT Last Will | Média | `fdctmon/{device_id}/status` contém `online` quando conectado e `offline` após perda da sessão MQTT |

## 4. Requisitos não funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| RNF-001 | Segurança de segredos | Nenhuma senha/token no código; `.env` e `ESP32/include/config.hpp` ignorados pelo Git; exemplos contêm somente placeholders |
| RNF-002 | Confiabilidade do dispositivo | Firmware não bloqueia aguardando rede; tenta reconectar Wi-Fi e MQTT periodicamente; leitura DHT22 inválida não é publicada |
| RNF-003 | Persistência | Volumes Docker preservam Mosquitto, InfluxDB, Node-RED, n8n e Grafana após reinício |
| RNF-004 | Retenção | Bucket de telemetria mantém 90 dias (`2160h`) por padrão |
| RNF-005 | Observabilidade | Cada etapa ESP32/Raspberry → MQTT → Node-RED/n8n → InfluxDB/Zabbix → Grafana pode ser verificada separadamente por comando ou UI |
| RNF-006 | Simplicidade | Firmware didático em um arquivo principal, configuração separada e fluxo de um dado rastreável sem frameworks adicionais |
| RNF-007 | Rede | Portas necessárias são publicadas explicitamente em `0.0.0.0`; firewall limita as origens; porta MQTT interna `1884` não é exposta pelo host |

## 5. Decisões confirmadas em 2026-07-13

| # | Decisão | Consequência |
|---|---|---|
| D-010 | InfluxDB + Grafana substituem PostgreSQL + Flask | Código e documentação da plataforma antiga deixam de participar do deploy |
| D-011 | Raspberry Pi e ESP32 coexistem durante a migração | O contrato de ingestão aceita payload legado sem índice de calor |
| D-012 | Node-RED é responsável apenas por validar e persistir telemetria | Regras de automação e integrações externas não ficam acopladas à ingestão |
| D-013 | n8n encaminha medições ao Zabbix | Zabbix e futuras notificações Telegram ficam centralizados no motor de automação |
| D-014 | ESP32 usa somente DHT22 nesta fase | Motor, LED, acelerômetro e outros sensores do protótipo de aula são removidos |
| D-015 | ESP32 publica a cada 30 segundos | DHT22 respeita sua cadência e o volume esperado é de 2.880 mensagens/dia |
| D-016 | Serviços escutam em `0.0.0.0`; clientes usam IP ou DNS | O IP atual é `10.32.8.115`; DNS futuro não exige trocar o bind dos containers |
| D-017 | Execução da comunicação fica no `.ino` | `DC_Comunicacao.hpp` mantém somente estado dos clientes e configuração de identidade/tópicos |

## 6. Restrições

- **Stack obrigatória:** Mosquitto, Node-RED, InfluxDB 2.x, n8n e Grafana em Docker Compose
- **Servidor:** Oracle Linux 9 com Docker já instalado; IP atual `10.32.8.115`
- **Hardware atual:** Raspberry Pi 3 B com DHT11/MQ-2/HC-SR04
- **Hardware de substituição:** ESP32 DevKit com DHT22 no GPIO 25
- **Rede:** dispositivos e servidor possuem conectividade IP; Zabbix em rede alcançável pelo servidor
- **Custo:** componentes locais e open source

## 7. Fora do escopo desta fase

- PostgreSQL, Flask e FIWARE
- Sensores adicionais no ESP32 além do DHT22
- Comandos MQTT para atuadores, motor ou LED
- Regras Telegram, até que limiares, destinatários e política anti-repetição sejam definidos
- Alta disponibilidade ou cluster de InfluxDB/Grafana
- Migração do histórico PostgreSQL antigo para InfluxDB

## 8. Riscos conhecidos

| Risco | Impacto | Mitigação |
|---|---|---|
| Credencial Wi-Fi do protótipo foi exposta no código inicial | Alto | Removida do firmware; rotacionar a senha na infraestrutura antes de usar o dispositivo |
| Zabbix não possui itens trapper com as chaves documentadas | Alto | Criar/validar itens antes de ativar o fluxo n8n |
| n8n perde conexão MQTT ou falha ao executar `zabbix_sender` | Alto | Healthcheck, log de execuções e teste ponta a ponta independente |
| Dados dos dois dispositivos usam payloads de gerações diferentes | Médio | Node-RED/n8n exigem apenas `device_id`, `temp` e `umid`; `ic` é opcional |
| Perda do `.env` ou de volumes Docker | Alto | Backup periódico de `.env` em cofre seguro e dos volumes InfluxDB/Grafana/n8n |

## 9. Referências existentes

| O quê | Localização | Uso atual |
|---|---|---|
| Publicador Raspberry | `raspberry/sensor_publisher.py` | Mantido durante a transição e aceito pelo contrato MQTT legado |
| Protótipo ESP32 de aula | histórico Git de `ESP32/` | Apenas referência; regras de motor/acelerômetro não pertencem ao DCMonitor |
| Projeto FIWARE antigo | `OLD_PROJECT/` | Referência histórica; não reutilizar na plataforma nova |
