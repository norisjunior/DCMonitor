# Arquitetura — DCMonitor

> Última atualização: 2026-07-13.

## Fluxo de dados

```text
ESP32 + DHT22 ──┐
                ├── MQTT autenticado :1883 ──► Mosquitto
Raspberry Pi ───┘                              ├── :1884 interno ─► Node-RED ─► InfluxDB ─► Grafana
                                                └── :1884 interno ─► n8n ─► Zabbix
                                                                         └── Telegram (fase futura)
```

Todos os serviços de servidor executam no mesmo Docker Compose no Oracle Linux 9. Node-RED e n8n recebem cópias independentes da mesma publicação MQTT; falha no Zabbix não bloqueia o InfluxDB.

As portas publicadas fazem bind em `0.0.0.0`. Clientes acessam o servidor pelo
IP atual `10.32.8.115` ou por um nome DNS que aponte para esse IP; o endereço de
escuta não é usado como hostname público.

## Componentes e responsabilidades

| Componente | Responsabilidade |
|---|---|
| ESP32 | Ler DHT22, calcular índice de calor, reportar RSSI, publicar a cada 30 s e anunciar status MQTT |
| Raspberry | Manter coleta legada durante a migração |
| Mosquitto | Autenticar dispositivos e distribuir mensagens aos consumidores internos |
| Node-RED | Validar o contrato mínimo e escrever line protocol na API do InfluxDB |
| InfluxDB | Armazenar séries temporais por 90 dias |
| Grafana | Consultar InfluxDB e exibir dashboard do NOC |
| n8n | Validar telemetria e coordenar integrações Zabbix/Telegram |
| Zabbix | Receber valores em itens trapper e aplicar alertas operacionais |

## Organização do firmware ESP32

```text
ESP32DC.ino          struct + setup/loop + Wi-Fi/MQTT + JSON
DC_Ambiente.hpp      DHT22 + validação + índice de calor
DC_Comunicacao.hpp   clientes Wi-Fi/MQTT + identidade/tópicos
config.hpp           configuração local não versionada
```

O `.ino` concentra o fluxo executável para leitura didática. O header de comunicação não inicializa, reconecta ou publica; fornece somente os objetos compartilhados e a identidade MQTT. O módulo do sensor permanece separado porque encapsula uma biblioteca e regras específicas do DHT22.

## Fronteiras de segurança

- `1883/tcp`: todas as interfaces do host → Mosquitto, autenticado, usado por ESP32/Raspberry.
- `1884/tcp`: somente rede Docker, anônimo para eliminar credenciais em flows exportados; não publicado no host.
- `1880`, `3000`, `5678`, `8086`: interfaces administrativas; firewall deve limitar à rede de gestão.
- InfluxDB não recebe escrita direta dos dispositivos.
- Node-RED envia o token InfluxDB somente em chamada interna HTTP.
- n8n usa `execFileSync` com lista de argumentos para evitar command injection no `zabbix_sender`.

## Modelo InfluxDB

```text
measurement: ambiente
tags:        device_id, sensor
fields:      temperatura (float), umidade (float), indice_calor (float opcional),
             rssi (float opcional)
timestamp:   atribuído pelo servidor
```

`device_id` e `sensor` são tags porque filtram séries. Valores de medição são fields para evitar cardinalidade desnecessária.

## Contratos

O contrato MQTT completo está em `docs/REQUIREMENTS.md`. O mínimo aceito durante a migração é `device_id`, `temp` e `umid`; o ESP32 versão 1 também envia `ic`, `rssi`, `sensor`, `schema_version` e `firmware_version`.

O `rssi` é diagnóstico de enlace, não medição ambiental. Por ser opcional e aditivo, foi incluído sem alterar `schema_version`: consumidores que o ignoram continuam válidos.

## Evolução prevista

1. Operar Raspberry e ESP32 lado a lado.
2. Validar estabilidade do ESP32/DHT22 e equivalência no Grafana/Zabbix.
3. Adicionar sensores ao ESP32 somente após novos requisitos e versão de payload.
4. Desativar o Raspberry quando a substituição for aceita.

## Riscos

- A porta MQTT interna anônima depende do isolamento da rede Docker.
- Fluxo Zabbix depende do `zabbix_sender` e da permissão de módulos builtin no Code node do n8n.
- Dashboard provisionado assume o bucket `fdctmon`; alterar o nome exige atualizar suas consultas.
- InfluxDB OSS em nó único não oferece alta disponibilidade.
