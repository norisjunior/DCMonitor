# Node-RED — ingestão

O fluxo `flows.json` e o `settings.js` são copiados pela imagem para o volume `node_red_data` somente quando ele é criado. Mudanças nesses arquivos exigem recriar o volume (veja `docs/DEPLOY_PROD.md`).

| Arquivo | Conteúdo |
|---|---|
| `flows.json` | abas "DCMonitor - MQTT para InfluxDB e Zabbix" e "Cadastro de dispositivos" |
| `flows_cred.json` | referência `${INFLUXDB_TOKEN}`, sem segredo |
| `settings.js` | login do editor, login da página de cadastro, `httpStatic` |
| `admin/index.html`, `admin/app.js` | página de cadastro, copiada para `/opt/dcmonitor/admin` na imagem |
| `Dockerfile` | instala os nós extras e copia os arquivos acima |

## Telemetria

Responsabilidades:

1. Assinar `fdctmon/+/data` no Mosquitto interno `mosquitto:1884`.
2. Interpretar e validar o JSON, exigindo que o `device_id` do payload seja igual ao do tópico.
3. Acrescentar `local` e `nome` a partir do cadastro de dispositivos.
4. Gravar a medição no InfluxDB pelo nó `influxdb out`.
5. Enviar os mesmos valores aos itens trapper do Zabbix.

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
| `CADASTRO_ADMIN_USER`, `CADASTRO_ADMIN_PASSWORD_HASH` | login da página `/admin/` e da API `/api/cadastro`, em `settings.js`; sem o hash o Node-RED não sobe |

O host dos itens trapper não vem do ambiente: cada medição é enviada ao host cujo nome é igual ao `device_id` do dispositivo. O campo `Default hostname` do nó fica vazio de propósito — ele só valeria para itens enviados sem host.

`flows_cred.json` guarda apenas o texto `${INFLUXDB_TOKEN}`. O Node-RED aceita o arquivo em texto puro, resolve a variável a cada início e regrava o arquivo cifrado com `NODE_RED_CREDENTIAL_SECRET`. O token não fica no repositório nem na imagem.

## Modelo gravado

Measurement `ambiente`, tags `device_id`, `sensor`, `local` e `nome`, fields `temperatura`, `umidade`, `indice_calor` e `rssi` — os dois últimos opcionais. O nó InfluxDB escapa tags e fields; o fluxo não monta mais line protocol à mão.

`local` é o código do local no cadastro, ou `sem-local` se a placa não estiver cadastrada ou não tiver local. `nome` é o nome amigável, ou o próprio `device_id`. O Zabbix não usa essas tags: continua recebendo pelo `device_id`.

## Cadastro de dispositivos

A aba "Cadastro de dispositivos" mantém o local e o nome amigável de cada placa no arquivo `/data/cadastro/dispositivos.json`, que é o diretório do host `CADASTRO_DIR` (padrão `./cadastro`) montado no container. O diretório precisa pertencer ao UID 1000.

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

- Ao iniciar, o fluxo lê o arquivo, valida e guarda o cadastro no contexto global `cadastro`. Sem o arquivo, cria e grava um cadastro vazio. Erro de leitura ou JSON inválido deixam o cadastro descarregado, com o motivo no contexto `cadastroErro` e no status do nó; a telemetria segue gravando com `sem-local`.
- `GET /api/cadastro` devolve o cadastro, o erro de carga e as placas vistas (contexto `vistos`, só em memória, zerado a cada reinício).
- `PUT /api/cadastro` valida o corpo, exige a mesma `revisao` em memória (409 se outra janela salvou antes; 503 se o cadastro não carregou) e passa ao nó `Gravar e aplicar`. Esse nó é síncrono: confere a revisão de novo (duas gravações simultâneas não se sobrepõem), grava `dispositivos.json.tmp`, copia o arquivo atual para `dispositivos.json.bak`, renomeia o `.tmp` e só então aplica o cadastro. Falha de gravação responde 500 e não altera memória nem arquivo. O nó usa o módulo `fs` (aba Setup), habilitado por `functionExternalModules` no `settings.js`.
- Regras de validação: código de local em slug (`a-z`, `0-9`, hífen, até 32 caracteres, `sem-local` reservado), nome de local até 48 caracteres, nome de dispositivo até 64, local referenciado precisa existir, no máximo 200 locais e 2000 dispositivos.

A página `http://SERVIDOR:1880/admin/` (`admin/index.html` e `admin/app.js`) é servida pelo `httpStatic` do `settings.js`, com cabeçalhos de segurança (CSP, anti-frame, nosniff) aplicados também à API. Página e API usam o login `CADASTRO_ADMIN_USER`/`CADASTRO_ADMIN_PASSWORD_HASH` (`httpStaticAuth` e `httpNodeAuth`), separado do editor. A página atualiza a situação das placas a cada 30 s.

Editar `dispositivos.json` à mão também funciona, com o Node-RED reiniciado em seguida (`docker compose restart node-red`); pela página, a alteração vale sem reiniciar. Para desfazer a última gravação, restaure `dispositivos.json.bak` e reinicie.

## Testes das funções

`scripts/test_node_red_functions.js` extrai os nós `function` de `flows.json` e os executa fora do Node-RED, com `msg`, `node` e `global` simulados:

```bash
node scripts/test_node_red_functions.js
```

## Pré-requisito Zabbix

Cada dispositivo precisa de um host no Zabbix com o nome exatamente igual ao seu `device_id` — por exemplo `esp32-18B4C0D8CBB0` — e, nesse host, os itens do tipo **Zabbix trapper**:

| Field no InfluxDB | Chave no Zabbix | Tipo |
|---|---|---|
| `temperatura` | `temp` | Numeric (float) |
| `umidade` | `umid` | Numeric (float) |
| `indice_calor` | `headindex` | Numeric (float) |
| `rssi` | `rssi` | Numeric (float) |

As chaves diferem dos fields do InfluxDB porque reproduzem os itens já cadastrados no Zabbix; a correspondência fica na constante `CHAVES` do nó `Montar itens do Zabbix`. `headindex` é a grafia cadastrada no Zabbix para o índice de calor: se o item for renomeado para `heatindex`, altere a constante junto.

Valores ausentes no payload são omitidos: um payload só com `temp` e `umid` envia dois itens em vez de quatro.

O nó `zabbix-sender` chama `addItem(...item)` da biblioteca `node-zabbix-sender`, então cada item precisa ser o array `[host, chave, valor]`. Um array de objetos `{host, key, value}` passa pela validação do nó, não gera erro e chega ilegível ao Zabbix — o sintoma é o fluxo verde sem nenhum dado em **Latest data**.

O nó `zabbix-sender` registra erro apenas para falha de conexão, tempo esgotado ou resposta inválida. Item trapper inexistente é recusado pelo servidor Zabbix sem gerar erro no Node-RED, então confira **Latest Data** ao criar itens novos.

Se um volume Node-RED antigo já existir, os arquivos provisionados pela imagem não substituem alterações persistidas. Para uma instalação limpa, confirme o conteúdo na UI ou recrie somente o volume após fazer backup.

Ao importar `flows.json` pela UI em um volume que já existe, o `flows_cred.json` da imagem não é usado: abra o nó de configuração `InfluxDB interno` e escreva `${INFLUXDB_TOKEN}` no campo do token. O Node-RED resolve a variável no início de cada execução, então o token real não precisa ser digitado.
