# Node-RED — ingestão

O fluxo `flows.json` e o `settings.js` são copiados pela imagem para o volume `node_red_data` somente quando ele é criado. Mudanças nesses arquivos exigem recriar o volume (veja `docs/DEPLOY_PROD.md`).

| Arquivo | Conteúdo |
|---|---|
| `flows.json` | abas "DCMonitor - MQTT para InfluxDB e Zabbix", "Cadastro de dispositivos" e "Credenciais MQTT" |
| `flows_cred.json` | referências `${INFLUXDB_TOKEN}`, `${MQTT_ADMIN_USER}` e `${MQTT_ADMIN_PASSWORD}`, sem segredo |
| `settings.js` | HTTPS da porta 1880, login do editor, login da página de cadastro, `httpStatic` |
| `admin/index.html`, `admin/app.js` | página de cadastro e credenciais, copiada para `/opt/dcmonitor/admin` na imagem |
| `Dockerfile` | instala os nós extras e copia os arquivos acima |

## Telemetria

Responsabilidades:

1. Assinar `fdctmon/+/data` no Mosquitto interno `mosquitto:1884`, com o login `MQTT_ADMIN_USER`/`MQTT_ADMIN_PASSWORD`.
2. Interpretar e validar o JSON, exigindo que o `device_id` do payload seja igual ao do tópico.
3. Acrescentar `local` e `nome` a partir do cadastro de dispositivos.
4. Gravar a medição no InfluxDB pelo nó `influxdb out`.
5. Enviar os mesmos valores aos itens trapper do Zabbix e, se configurado, a um segundo servidor Zabbix.

A saída 1 do nó `Validar telemetria` grava no InfluxDB; a saída 2 monta os itens do Zabbix. As ramificações são independentes: falha no Zabbix não impede a gravação, e o contrário também vale. Erros dos dois caminhos chegam ao nó `catch` `Erros do fluxo`.

Os itens do Zabbix seguem para `Enviar ao Zabbix` e para `Zabbix 2 configurado?`. Esse nó só deixa passar quando `ZABBIX_SERVER_2` tem valor; daí os itens vão a `Enviar ao Zabbix 2`, com os mesmos hosts, chaves e `ZABBIX_PORT`. Sem a variável no `.env`, o Compose usa `10.32.8.69`; com `ZABBIX_SERVER_2=` (vazia), o segundo envio fica desligado.

Dois nós de debug ajudam no diagnóstico: `MSG RAW ESP32` (ativo) mostra na barra lateral cada payload recebido; `MSG ZABBIX` (inativo) mostra os itens enviados ao Zabbix. Ative ou desative pelo botão do nó na UI.

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
| `ZABBIX_SERVER_2` | destino do nó `Enviar ao Zabbix 2` (mesma `ZABBIX_PORT`); padrão `10.32.8.69` no Compose; definida vazia no `.env`, desliga |
| `MQTT_ADMIN_USER`, `MQTT_ADMIN_PASSWORD` | login do nó de configuração `Mosquitto interno`, via `flows_cred.json`; `MQTT_ADMIN_USER` também é omitido da lista de credenciais |
| `CADASTRO_ADMIN_USER`, `CADASTRO_ADMIN_PASSWORD_HASH` | login da página `/admin/` e das APIs `/api/cadastro` e `/api/credenciais`, em `settings.js`; sem o hash o Node-RED não sobe |
| `NODERED_CERTS_DIR` (Compose) | diretório do host com `server.key`, `server.crt` e `ca.crt` do HTTPS, montado em `/data/tls`; sem ele o Node-RED não sobe |
| `NODE_EXTRA_CA_CERTS` (Compose) | faz o Node.js confiar na CA do DCMonitor; usado pelo healthcheck em HTTPS |

O host dos itens trapper não vem do ambiente: cada medição é enviada ao host cujo nome é igual ao `device_id` do dispositivo. O campo `Default hostname` do nó fica vazio de propósito — ele só valeria para itens enviados sem host.

`flows_cred.json` guarda apenas os textos `${INFLUXDB_TOKEN}`, `${MQTT_ADMIN_USER}` e `${MQTT_ADMIN_PASSWORD}`. O Node-RED aceita o arquivo em texto puro, resolve as variáveis a cada início e regrava o arquivo cifrado com `NODE_RED_CREDENTIAL_SECRET`. Token e senha não ficam no repositório nem na imagem.

## HTTPS

O Node-RED serve a porta 1880 só em HTTPS (`https` no `settings.js`), com o certificado emitido por `scripts/gerar_certificados.sh` em `pki/node-red/`. O certificado é relido a cada 12 h (`httpsRefreshInterval`), então uma renovação vale sem reiniciar. Os navegadores precisam confiar na CA do DCMonitor (`docs/DEPLOY_PROD.md`, "Confiar na CA nos navegadores").

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

A página `https://SERVIDOR:1880/admin/` (`admin/index.html` e `admin/app.js`) é servida pelo `httpStatic` do `settings.js`, com cabeçalhos de segurança (CSP, anti-frame, nosniff) aplicados também à API. Página e API usam o login `CADASTRO_ADMIN_USER`/`CADASTRO_ADMIN_PASSWORD_HASH` (`httpStaticAuth` e `httpNodeAuth`), separado do editor. A página atualiza a situação das placas a cada 30 s.

A tabela da página também tem a coluna "Credencial MQTT", descrita abaixo.

Editar `dispositivos.json` à mão também funciona, com o Node-RED reiniciado em seguida (`docker compose restart node-red`); pela página, a alteração vale sem reiniciar. Para desfazer a última gravação, restaure `dispositivos.json.bak` e reinicie.

## Credenciais MQTT

A aba "Credenciais MQTT" gera, troca e revoga a senha MQTT de cada placa. O usuário MQTT da placa é o próprio `device_id`. A aba fala com o plugin dynamic security do Mosquitto por MQTT, pela porta 1884: publica em `$CONTROL/dynamic-security/v1` e lê a resposta em `$CONTROL/dynamic-security/v1/response`.

| Rota | Efeito |
|---|---|
| `GET /api/credenciais` | lista os clientes do broker, menos o administrador: `{ clientes: { <device_id>: { ativo, descricao } } }` |
| `POST /api/credenciais/:id` | cria cliente, papel e senha; se a placa já tem senha, responde 409 e não altera nada |
| `PUT /api/credenciais/:id` | troca: apaga e recria cliente e papel com senha nova; a sessão aberta com a senha antiga cai |
| `DELETE /api/credenciais/:id` | revoga: apaga cliente e papel; repetir sobre placa sem credencial responde 200 com `"revogada": false` |

- O papel criado é `disp-<device_id>`, com permissões literais: publicar em `fdctmon/<device_id>/data` e `/status`, assinar e receber `fdctmon/<device_id>/cmd`.
- A senha tem 32 caracteres `[A-Za-z0-9_-]`, gerada com `crypto.randomBytes`. A resposta do `POST` e do `PUT` traz `device_id`, `senha`, `gerada_em` e `linha_serial` (`credencial <device_id> <senha>`). Ela volta uma única vez: no broker fica só o hash, e o Node-RED não a registra no log nem a grava em disco (só a mantém em memória até o broker responder).
- Todas as rotas exigem o cabeçalho `X-DCMonitor: 1`, que a página envia; sem ele, 403. Um cabeçalho próprio obriga o navegador a um preflight CORS, que o Node-RED não autoriza, então outro site não dispara a requisição com o login guardado no navegador (CSRF).
- Só IDs no formato do firmware são aceitos: `^esp32-[0-9A-F]{12}$`; outro valor responde 400. Assim o administrador, ou um futuro cliente do n8n, nunca é alterado pela API.
- Uma operação por placa de cada vez: outra requisição para a mesma placa, enquanto a anterior espera o broker, responde 409. Erro do broker responde 502.
- Cada requisição fica pendente no contexto global `pendentesDynsec` até a resposta do broker, casada pelo `correlationData`. O nó `Expirar comandos` roda a cada 2 s e responde 504 às pendentes há mais de 5 s. Numa geração, troca ou revogação, o 504 avisa que o estado da credencial é incerto: o comando pode ter sido aplicado. Recarregue a página e, se a placa aparecer com senha, use "Trocar senha".
- As rotas usam o mesmo login da página de cadastro (`httpNodeAuth`).

Na página `/admin/`:

- A coluna "Credencial MQTT" mostra `sem senha`, `ativa desde <data>` ou `desativada`. `desativada` só aparece se o cliente for desativado direto no broker, com `mosquitto_ctrl`.
- Placa sem senha tem o botão "Gerar senha". Placa com senha tem "Trocar senha" e "Revogar"; os dois pedem um segundo clique de confirmação em até 5 s.
- O formulário "Placa nova: ID mostrado na serial" gera a senha de uma placa que ainda não publicou nada: basta o `device_id` que ela imprime no monitor serial, por exemplo `esp32-E0477D077000`.
- Ao gerar, um painel mostra a linha `credencial <device_id> <senha>` uma única vez, com o botão "Copiar linha". Cole essa linha no monitor serial da placa (veja `ESP32/README.md`).

Ao importar `flows.json` pela UI em um volume que já existe, abra o nó de configuração `Mosquitto interno` e escreva `${MQTT_ADMIN_USER}` e `${MQTT_ADMIN_PASSWORD}` nos campos de usuário e senha.

## Testes das funções

`scripts/test_node_red_functions.js` extrai os nós `function` de `flows.json` e os executa fora do Node-RED, com `msg`, `node`, `global` e `env` simulados. São 43 testes: telemetria, cadastro, segundo Zabbix e credenciais MQTT.

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
