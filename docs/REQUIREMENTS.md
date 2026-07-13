# Requisitos — DCMonitor

> Atualizado em 2026-07-13. Fonte de verdade resumida: `PROJECT_BRIEF.md`.

## Objetivo confirmado

Substituir PostgreSQL/Flask por uma plataforma de séries temporais no Oracle Linux 9. O ESP32 com DHT22 será o dispositivo principal, enquanto o Raspberry Pi permanece ativo durante a migração.

## Histórias de usuário e critérios de aceite

### HU-001 — Telemetria do ESP32

Como operador do NOC, quero receber temperatura, umidade e índice de calor a cada 30 segundos para acompanhar o ambiente do datacenter.

- DHT22 conectado ao GPIO 23 e alimentado segundo a especificação do módulo.
- Tópico `fdctmon/{device_id}/attrs`.
- JSON com `schema_version`, `device_id`, `sensor`, `firmware_version`, `temp`, `umid` e `ic`.
- Valores em °C e %UR, arredondados em uma casa decimal.
- Leitura inválida é registrada no serial e não é publicada.
- Wi-Fi/MQTT reconectam sem bloquear indefinidamente o loop.

### HU-002 — Coexistência do Raspberry

Como mantenedor, quero manter o Raspberry ativo durante a substituição para não interromper o monitoramento.

- Node-RED e n8n aceitam `device_id`, `temp` e `umid` como contrato mínimo.
- `ic`, `sensor`, `schema_version` e `firmware_version` são opcionais na transição.
- Campos adicionais do Raspberry são ignorados nesta fase, sem quebrar o fluxo.

### HU-003 — Persistência de séries temporais

Como administrador, quero que o Node-RED grave as medições no InfluxDB para manter um histórico consultável.

- Node-RED assina `fdctmon/+/attrs` pela porta MQTT interna.
- Validação rejeita IDs, temperaturas e umidades fora do contrato.
- Measurement: `ambiente`.
- Tags: `device_id`, `sensor`.
- Fields: `temperatura`, `umidade`, `indice_calor` quando disponível.
- Timestamp é atribuído pelo InfluxDB/servidor.
- Retenção padrão do bucket `fdctmon`: 90 dias.

### HU-004 — Visualização no Grafana

Como operador do NOC, quero um dashboard pronto após o deploy para visualizar valores atuais e histórico.

- Datasource `DCMonitor InfluxDB` provisionado automaticamente.
- Dashboard `DCMonitor - Ambiente` provisionado automaticamente.
- Painéis para temperatura, umidade, índice de calor e histórico.
- Atualização automática a cada 30 segundos.

### HU-005 — Integração Zabbix

Como equipe de infraestrutura, quero receber as mesmas medições no Zabbix para usar alertas e histórico já existentes.

- n8n assina `fdctmon/+/attrs` independentemente do Node-RED.
- `zabbix_sender` envia `temperatura`, `umidade` e, quando presente, `indice_calor`.
- Servidor, porta e host Zabbix vêm do `.env`.
- Argumentos são passados sem composição de comando shell.
- Falha Zabbix aparece na execução n8n e não impede a gravação no InfluxDB.

### HU-006 — Implantação simples

Como administrador do Oracle Linux, quero subir toda a plataforma com poucos comandos.

- Após preencher `.env`, `docker compose config` é válido.
- `docker compose up -d --build` sobe Mosquitto, InfluxDB, Node-RED, n8n e Grafana.
- Volumes nomeados preservam dados.
- `docker compose ps` e `docker compose logs <serviço>` permitem diagnóstico.

## Contrato MQTT

Exemplo ESP32:

```json
{
  "schema_version": 1,
  "device_id": "esp32-A1B2C3D4E5F6",
  "sensor": "DHT22",
  "firmware_version": "1.0.0",
  "temp": 24.7,
  "umid": 53.2,
  "ic": 24.6
}
```

| Campo | Tipo | Obrigatório | Unidade/uso |
|---|---|---:|---|
| `device_id` | string `[A-Za-z0-9_-]`, até 64 chars | sim | tag e identidade |
| `temp` | number | sim | °C, faixa aceita -40 a 80 |
| `umid` | number | sim | %UR, faixa aceita 0 a 100 |
| `ic` | number | ESP32 sim; legado não | °C |
| `sensor` | string | ESP32 sim; legado não | `DHT22`, fallback `legacy` |
| `schema_version` | integer | ESP32 sim; legado não | versão atual `1` |
| `firmware_version` | string | ESP32 sim; legado não | rastreabilidade |

Status do dispositivo: `fdctmon/{device_id}/status`, payload retido `online`/`offline`.

## Requisitos não funcionais

- Segredos somente em `.env` e `ESP32/include/config.hpp`, ambos ignorados.
- Porta 1883 autenticada; porta 1884 restrita à rede Docker.
- Interfaces administrativas protegidas e liberadas no firewall apenas para a rede de gestão.
- Logs não devem imprimir senhas, tokens ou cabeçalho de autorização do InfluxDB.
- A perda de uma integração não deve impedir as demais, pois Node-RED e n8n são consumidores MQTT independentes.
- Retenção de 90 dias; backup e restauração documentados em `docs/DEPLOY_PROD.md`.

## Pontos de verificação independentes

| Etapa | Verificação |
|---|---|
| Dispositivo → MQTT | `mosquitto_sub` autenticado em `fdctmon/#` |
| MQTT → Node-RED | Debug/log e status do nó de gravação na UI Node-RED |
| Node-RED → InfluxDB | Consulta Flux na UI do InfluxDB |
| InfluxDB → Grafana | Dashboard provisionado com dados por `device_id` |
| MQTT → n8n | Execuções do workflow `DCMonitor - MQTT para Zabbix` |
| n8n → Zabbix | Latest Data dos itens trapper do host configurado |

## Fora do escopo atual

- PostgreSQL, Flask e FIWARE.
- Novos sensores no ESP32.
- Migração de dados históricos.
- Regras Telegram sem limiares e política de repetição confirmados.
- Cluster/alta disponibilidade.

## Plano incremental

| Fase | Entregável | Skills |
|---|---|---|
| F1 | Compose, variáveis, volumes e healthchecks | `devops-ci`, `security-review` |
| F2 | Firmware ESP32 DHT22 | `embedded-iot`, `qa-testing` |
| F3 | MQTT → Node-RED → InfluxDB | `system-integrator`, `database` |
| F4 | Grafana provisionado | `system-integrator`, `documentation` |
| F5 | n8n → Zabbix | `system-integrator`, `security-review` |
| F6 | Telegram após definir regras | `product-requirements`, `system-integrator` |
