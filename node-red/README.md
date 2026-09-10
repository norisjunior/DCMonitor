# Node-RED — ingestão

O fluxo `flows.json` é carregado automaticamente na primeira criação do volume `node_red_data`.

Responsabilidades:

1. Assinar `fdctmon/+/attrs` no Mosquitto interno `mosquitto:1884`.
2. Interpretar e validar o JSON.
3. Gravar a medição no InfluxDB pelo nó `influxdb out`.
4. Enviar os mesmos valores aos itens trapper do Zabbix.

A saída 1 do nó `Validar telemetria` grava no InfluxDB; a saída 2 monta os itens do Zabbix. As ramificações são independentes: falha no Zabbix não impede a gravação, e o contrário também vale. Erros dos dois caminhos chegam ao nó `catch` `Erros do fluxo`.

## Nós instalados na imagem

| Módulo | Uso |
|---|---|
| `node-red-contrib-influxdb@0.7.0` | nó `influxdb out` na configuração 2.0 |
| `node-red-contrib-zabbix-sender@1.0.0` | protocolo trapper do Zabbix |

Os dois são instalados pelo `Dockerfile` em `/usr/src/node-red/node_modules`, não pelo palette manager da UI. Esse diretório está no `NODE_PATH` da imagem e não é encoberto pelo volume montado em `/data`.

## Configuração por variável de ambiente

O fluxo versionado não contém endereços nem segredos. O Node-RED substitui `${VAR}` pelo valor do ambiente ao carregar os nós:

| Variável | Onde é usada |
|---|---|
| `INFLUXDB_URL` | nó de configuração `InfluxDB interno` |
| `INFLUXDB_ORG`, `INFLUXDB_BUCKET` | nó `Gravar no InfluxDB` |
| `INFLUXDB_TOKEN` | credencial do nó de configuração, via `flows_cred.json` |
| `ZABBIX_SERVER`, `ZABBIX_PORT` | destino do nó `Enviar ao Zabbix` |
| `ZABBIX_HOST_NAME` | host dos itens trapper (`Default hostname`) |

`flows_cred.json` guarda apenas o texto `${INFLUXDB_TOKEN}`. O Node-RED aceita o arquivo em texto puro, resolve a variável a cada início e regrava o arquivo cifrado com `NODE_RED_CREDENTIAL_SECRET`. O token não fica no repositório nem na imagem.

## Modelo gravado

Measurement `ambiente`, tags `device_id` e `sensor`, fields `temperatura`, `umidade`, `indice_calor` e `rssi` — os dois últimos opcionais. O nó InfluxDB escapa tags e fields; o fluxo não monta mais line protocol à mão.

## Pré-requisito Zabbix

No host indicado por `ZABBIX_HOST_NAME`, os itens do tipo **Zabbix trapper** precisam existir antes do primeiro envio:

| Chave | Tipo sugerido |
|---|---|
| `temperatura` | Numeric (float) |
| `umidade` | Numeric (float) |
| `indice_calor` | Numeric (float) |
| `rssi` | Numeric (float) |

As chaves são iguais aos nomes dos fields no InfluxDB. Valores ausentes no payload são omitidos: o Raspberry legado envia somente `temperatura` e `umidade`.

O nó `zabbix-sender` registra erro apenas para falha de conexão, tempo esgotado ou resposta inválida. Item trapper inexistente é recusado pelo servidor Zabbix sem gerar erro no Node-RED, então confira **Latest Data** ao criar itens novos.

Se um volume Node-RED antigo já existir, os arquivos provisionados pela imagem não substituem alterações persistidas. Para uma instalação limpa, confirme o conteúdo na UI ou recrie somente o volume após fazer backup.

Ao importar `flows.json` pela UI em um volume que já existe, o `flows_cred.json` da imagem não é usado: abra o nó de configuração `InfluxDB interno` e escreva `${INFLUXDB_TOKEN}` no campo do token. O Node-RED resolve a variável no início de cada execução, então o token real não precisa ser digitado.
