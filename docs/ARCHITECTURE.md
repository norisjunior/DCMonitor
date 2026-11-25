# Arquitetura — DCMonitor

> Última atualização: 2026-11-25.

## Fluxo de dados

```text
                                                        ┌─► InfluxDB ─► Grafana
ESP32 + DHT22 ── MQTT autenticado :1883 ──► Mosquitto ─┬─► Node-RED ─┤
                                           :1884      │             └─► Zabbix
                                           interno    └─► n8n (Telegram, fase futura)

Navegador (rede de gestão) ── :1880/admin/ ──► Node-RED ──► cadastro/dispositivos.json (host)
```

Todos os serviços de servidor executam no mesmo Docker Compose no Oracle Linux 9. O Node-RED grava no InfluxDB e envia ao Zabbix em duas ramificações independentes do mesmo fluxo: falha no Zabbix não bloqueia o InfluxDB. O n8n continua assinando a porta interna quando houver workflow ativo; hoje não há.

As portas publicadas fazem bind em `0.0.0.0`. Clientes acessam o servidor pelo
IP atual `10.32.8.115` ou por um nome DNS que aponte para esse IP; o endereço de
escuta não é usado como hostname público.

## Componentes e responsabilidades

| Componente | Responsabilidade |
|---|---|
| ESP32 | Ler DHT22, calcular índice de calor, reportar RSSI, exibir medições, horário e `device_id` no OLED, publicar a cada ~60 s com deep sleep entre ciclos e anunciar status MQTT |
| Mosquitto | Autenticar dispositivos, restringir cada um ao próprio ramo de tópicos (ACL) e distribuir mensagens aos consumidores internos |
| Node-RED | Validar o contrato mínimo, enriquecer a medição com local e nome do cadastro, gravar no InfluxDB, alimentar os itens trapper do Zabbix e servir a página de cadastro |
| InfluxDB | Armazenar séries temporais por 90 dias |
| Grafana | Consultar InfluxDB e exibir dashboard do NOC, filtrável por local e dispositivo |
| n8n | Reservado para as automações de notificação (Telegram); sem workflow ativo |
| Zabbix | Receber valores em itens trapper e aplicar alertas operacionais |

## Organização do firmware ESP32

```text
ESP32DC.ino          struct + ciclo em setup() + Wi-Fi/MQTT/NTP + JSON + deep sleep
DC_Ambiente.hpp      DHT22 + validação + índice de calor
DC_Comunicacao.hpp   clientes Wi-Fi/MQTT + identidade/tópicos
DC_Display.hpp       OLED SSD1306 + cabeçalho com horário + layout das caixas
config.hpp           configuração local não versionada
```

O `.ino` concentra o fluxo executável para leitura didática. O header de comunicação não inicializa, reconecta ou publica; fornece somente os objetos compartilhados e a identidade MQTT. O módulo do sensor permanece separado porque encapsula uma biblioteca e regras específicas do DHT22. O módulo de display segue o mesmo critério: todo o cálculo de layout fica nele, e o `.ino` apenas entrega os valores já lidos.

Desde o firmware 1.4.0 o dispositivo trabalha em ciclos com deep sleep: acorda, lê o sensor, conecta, publica, desconecta de forma limpa, atualiza o display e dorme 60 s. Cada espera de rede tem limite e um watchdog encerra ciclos travados. O display é atualizado mesmo sem rede e mantém a imagem durante o sono, com o horário da medição no cabeçalho. A disponibilidade da placa passa a ser inferida pela chegada da telemetria, não pelo tópico de status.

## Identidade na frota

O `device_id` derivado de `ESP.getEfuseMac()` é a única chave de dispositivo do sistema e atravessa todas as camadas sem tradução:

```text
ESP.getEfuseMac()
  └─► device_id  esp32-18B4C0D8CBB0
        ├─► tópicos MQTT   fdctmon/esp32-18B4C0D8CBB0/{data,status,cmd}
        ├─► client-id MQTT esp32-18B4C0D8CBB0 (base da ACL)
        ├─► hostname DHCP  esp32-18B4C0D8CBB0
        ├─► cabeçalho OLED esp32-18B4C0D8CBB0
        ├─► tag InfluxDB   device_id
        ├─► chave do cadastro dispositivos.json
        └─► host Zabbix    esp32-18B4C0D8CBB0
```

O Node-RED assina `fdctmon/+/data`, então uma placa nova entra na ingestão sem alterar o fluxo. Nomes legíveis ficam fora do firmware, no cadastro de dispositivos descrito abaixo; no Zabbix, o nome visível do host continua sendo o lugar para o rótulo local.

## Tópicos MQTT

| Tópico | Sentido | Uso |
|---|---|---|
| `fdctmon/{device_id}/data` | placa → servidor | telemetria, QoS 0, não retida |
| `fdctmon/{device_id}/status` | placa → servidor | `online` retido ao conectar; Last Will `offline` |
| `fdctmon/{device_id}/cmd` | servidor → placa | reservado para comandos futuros; o firmware ainda não assina |

Como a placa passa a maior parte do tempo em deep sleep, um comando futuro precisará ser publicado como mensagem retida em `/cmd` e lido pela placa ao acordar.

Na porta 1883, a ACL do Mosquitto (`mosquitto/acl`) usa o client-id da conexão (`%c`): cada cliente só escreve em `fdctmon/%c/data` e `fdctmon/%c/status` e só lê `fdctmon/%c/cmd`. O firmware usa o `device_id` como client-id, então cada placa fica presa ao próprio ramo. Publicação negada é descartada pelo broker sem derrubar a conexão. A porta interna 1884 não aplica a ACL. O Node-RED ainda confere se o `device_id` do payload é igual ao do tópico e descarta a medição quando não é.

## Cadastro de dispositivos

O local e o nome amigável de cada placa ficam em `dispositivos.json`, num diretório do host (`CADASTRO_DIR`, padrão `./cadastro`) montado no Node-RED em `/data/cadastro`. O firmware não muda: o cadastro é indexado pelo `device_id`.

```json
{
  "schema_version": 1,
  "revisao": 3,
  "locais": { "biblioteca": "Biblioteca" },
  "dispositivos": {
    "esp32-18B4C0D8CBB0": { "nome": "Rack 2", "local": "biblioteca" }
  }
}
```

- Locais têm código (slug imutável, minúsculas, números e hífen, até 32 caracteres) e nome (até 48 caracteres). O código `sem-local` é reservado.
- Nome do dispositivo: até 64 caracteres. Nome e local são opcionais.
- O Node-RED lê o arquivo ao iniciar e mantém o cadastro em memória. Sem o arquivo, cria um cadastro vazio. Com JSON inválido ou erro de leitura, o cadastro não carrega, a página mostra o motivo e a telemetria continua gravando sem local e nome.
- A página `http://SERVIDOR:1880/admin/` é servida pelo próprio Node-RED (`httpStatic`) e usa `GET /api/cadastro` e `PUT /api/cadastro`. O login é próprio, separado do editor. O `PUT` exige a revisão atual (409 se outra janela salvou antes), grava o arquivo e só então aplica o cadastro em memória: vale para as próximas medições, sem reiniciar.
- A página lista as placas vistas desde o último reinício do Node-RED, com situação e última leitura, e as cadastradas. Placa vista sem cadastro aparece como "novo".

A medição gravada no InfluxDB recebe as tags `local` (código do local, ou `sem-local`) e `nome` (nome amigável, ou o próprio `device_id`). O Zabbix não muda: host igual ao `device_id`, mesmas chaves.

## Fronteiras de segurança

- `1883/tcp`: todas as interfaces do host → Mosquitto, autenticado, com ACL por client-id, usado pelos ESP32.
- `1884/tcp`: somente rede Docker, anônimo para eliminar credenciais em flows exportados; não publicado no host.
- `1880`, `3000`, `5678`, `8086`: interfaces administrativas; firewall deve limitar à rede de gestão. A página de cadastro usa a mesma porta `1880` do editor, com login separado.
- InfluxDB não recebe escrita direta dos dispositivos.
- Node-RED lê o token InfluxDB do ambiente; ele não aparece no fluxo versionado e só trafega na rede interna do Compose.
- O envio ao Zabbix usa o protocolo trapper por socket, sem executar processo externo nem compor linha de comando.

## Modelo InfluxDB

```text
measurement: ambiente
tags:        device_id, sensor, local, nome
fields:      temperatura (float), umidade (float), indice_calor (float opcional),
             rssi (float opcional)
timestamp:   atribuído pelo servidor
```

`device_id`, `sensor`, `local` e `nome` são tags porque filtram séries. Valores de medição são fields para evitar cardinalidade desnecessária. Renomear uma placa ou trocá-la de local cria uma série nova dali em diante; o trecho anterior continua com as tags antigas. Dados gravados antes do cadastro não têm `local` nem `nome` e ficam fora dos filtros do Grafana.

## Contratos

O contrato MQTT completo está em `docs/REQUIREMENTS.md`. O mínimo exigido pela validação é `device_id`, `temp` e `umid`; o ESP32 versão 1 também envia `ic`, `rssi`, `sensor`, `schema_version` e `firmware_version`. Os campos aditivos continuam opcionais na validação para que uma versão de firmware sem eles não deixe de gravar.

O `rssi` é diagnóstico de enlace, não medição ambiental. Por ser opcional e aditivo, foi incluído sem alterar `schema_version`: consumidores que o ignoram continuam válidos.

## Evolução prevista

1. Ampliar a frota de ESP32, um host homônimo no Zabbix por dispositivo.
2. Adicionar sensores ao ESP32 somente após novos requisitos e versão de payload.
3. Definir as regras de notificação e ativar o n8n.

## Riscos

- A porta MQTT interna anônima depende do isolamento da rede Docker.
- A credencial MQTT é única para a frota: a ACL limita cada client-id ao próprio ramo, mas não impede um cliente com a senha de se declarar com o client-id de outra placa.
- Placas vistas pela página de cadastro ficam só em memória e somem a cada reinício do Node-RED até a próxima medição.
- O nó `zabbix-sender` só reporta erro de transporte: item trapper inexistente é recusado pelo servidor sem aparecer no log do Node-RED.
- Dashboard provisionado assume o bucket `fdctmon`; alterar o nome exige atualizar suas consultas.
- InfluxDB OSS em nó único não oferece alta disponibilidade.
