# Arquitetura — DCMonitor

> Última atualização: 2026-09-10.

## Fluxo de dados

```text
ESP32 + DHT22 ──┐                                                       ┌─► InfluxDB ─► Grafana
                ├── MQTT autenticado :1883 ──► Mosquitto ─┬─► Node-RED ─┤
Raspberry Pi ───┘                              :1884      │             └─► Zabbix
                                               interno    └─► n8n (Telegram, fase futura)
```

Todos os serviços de servidor executam no mesmo Docker Compose no Oracle Linux 9. O Node-RED grava no InfluxDB e envia ao Zabbix em duas ramificações independentes do mesmo fluxo: falha no Zabbix não bloqueia o InfluxDB. O n8n continua assinando a porta interna quando houver workflow ativo; hoje não há.

As portas publicadas fazem bind em `0.0.0.0`. Clientes acessam o servidor pelo
IP atual `10.32.8.115` ou por um nome DNS que aponte para esse IP; o endereço de
escuta não é usado como hostname público.

## Componentes e responsabilidades

| Componente | Responsabilidade |
|---|---|
| ESP32 | Ler DHT22, calcular índice de calor, reportar RSSI, exibir medições no OLED, publicar a cada 30 s e anunciar status MQTT |
| Raspberry | Manter coleta legada durante a migração |
| Mosquitto | Autenticar dispositivos e distribuir mensagens aos consumidores internos |
| Node-RED | Validar o contrato mínimo, gravar no InfluxDB e alimentar os itens trapper do Zabbix |
| InfluxDB | Armazenar séries temporais por 90 dias |
| Grafana | Consultar InfluxDB e exibir dashboard do NOC |
| n8n | Reservado para as automações de notificação (Telegram); sem workflow ativo |
| Zabbix | Receber valores em itens trapper e aplicar alertas operacionais |

## Organização do firmware ESP32

```text
ESP32DC.ino          struct + setup/loop + Wi-Fi/MQTT + JSON
DC_Ambiente.hpp      DHT22 + validação + índice de calor
DC_Comunicacao.hpp   clientes Wi-Fi/MQTT + identidade/tópicos
DC_Display.hpp       OLED SSD1306 + layout das caixas
config.hpp           configuração local não versionada
```

O `.ino` concentra o fluxo executável para leitura didática. O header de comunicação não inicializa, reconecta ou publica; fornece somente os objetos compartilhados e a identidade MQTT. O módulo do sensor permanece separado porque encapsula uma biblioteca e regras específicas do DHT22. O módulo de display segue o mesmo critério: todo o cálculo de layout fica nele, e o `.ino` apenas entrega os valores já lidos.

A cadência de leitura passou a ser independente do MQTT: o `loop()` lê o sensor a cada 30 s e atualiza o display mesmo sem rede; a publicação acontece apenas quando o cliente MQTT está conectado.

## Fronteiras de segurança

- `1883/tcp`: todas as interfaces do host → Mosquitto, autenticado, usado por ESP32/Raspberry.
- `1884/tcp`: somente rede Docker, anônimo para eliminar credenciais em flows exportados; não publicado no host.
- `1880`, `3000`, `5678`, `8086`: interfaces administrativas; firewall deve limitar à rede de gestão.
- InfluxDB não recebe escrita direta dos dispositivos.
- Node-RED lê o token InfluxDB do ambiente; ele não aparece no fluxo versionado e só trafega na rede interna do Compose.
- O envio ao Zabbix usa o protocolo trapper por socket, sem executar processo externo nem compor linha de comando.

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
- O nó `zabbix-sender` só reporta erro de transporte: item trapper inexistente é recusado pelo servidor sem aparecer no log do Node-RED.
- Dashboard provisionado assume o bucket `fdctmon`; alterar o nome exige atualizar suas consultas.
- InfluxDB OSS em nó único não oferece alta disponibilidade.
