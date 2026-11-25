# Mosquitto — broker MQTT

| Arquivo | Conteúdo |
|---|---|
| `mosquitto.conf` | plugin dynamic security, listeners 8883 (TLS) e 1884, persistência e log |
| `iniciar.sh` | partida do container; na primeira subida cria o administrador e o papel `ingestao` |

Os dois são montados somente leitura no container. Também são montados:

| Diretório do host | No container | Conteúdo |
|---|---|---|
| `MQTT_CERTS_DIR` (padrão `./pki/mosquitto`) | `/mosquitto/certs` | `ca.crt`, `server.crt`, `server.key`, gerados por `scripts/gerar_certificados.sh` |
| `MQTT_SEGURANCA_DIR` (padrão `./mqtt-seguranca`) | `/mosquitto/seguranca` | `dynamic-security.json`: clientes, papéis e hashes das senhas |

Crie o diretório de segurança antes de subir, com dono UID 1883 (usuário `mosquitto` do container):

```bash
sudo install -d -o 1883 -g 1883 ./mqtt-seguranca
```

Os dois diretórios ficam fora do Git (`pki/` e `mqtt-seguranca/` estão no `.gitignore`).

## Portas

| Porta | Quem usa | Controle |
|---|---|---|
| 8883 | ESP32, publicada no host | somente TLS; usuário = `device_id`, senha própria de cada placa; papel `disp-<device_id>` |
| 1884 | Node-RED, só na rede Docker | sem TLS, não publicada; login `MQTT_ADMIN_USER`/`MQTT_ADMIN_PASSWORD` |

A porta 1883 não existe mais. Nenhuma porta aceita conexão anônima (`allow_anonymous false`). Com `per_listener_settings false`, a autenticação vale para as duas portas: um login aceito na 1884 também é aceito na 8883.

## Dynamic security

As credenciais ficam no plugin dynamic security, que o Node-RED administra em tempo de execução pelo tópico `$CONTROL/dynamic-security/v1`. O arquivo `dynamic-security.json` guarda só hashes das senhas.

A cada partida, `iniciar.sh`:

1. recusa subir se `MQTT_ADMIN_PASSWORD` começar com `TROQUE_` ou tiver menos de 24 caracteres. Gere com `openssl rand -base64 32`;
2. grava o login do administrador em `/root/.config/mosquitto_pub` e `/root/.config/mosquitto_ctrl`, dentro do container (modo `0600`). O healthcheck do Compose e o `mosquitto_ctrl` leem a senha desses arquivos, e não da linha de comando, que apareceria no `ps` do host.

Na primeira subida, sem `dynamic-security.json`, ele também:

1. cria `dynamic-security.json.inicial` com o cliente administrador `MQTT_ADMIN_USER` (padrão `node-red`) e a senha `MQTT_ADMIN_PASSWORD`;
2. sobe um broker temporário em `127.0.0.1:1885` e cria o papel `ingestao`: lê `fdctmon/#` e pode publicar em `fdctmon/+/cmd`;
3. atribui `ingestao` ao administrador, encerra o broker temporário e só então renomeia o arquivo para `dynamic-security.json`. Uma interrupção no meio é refeita por inteiro na próxima subida.

Com o arquivo presente, `iniciar.sh` só inicia o broker. Trocar `MQTT_ADMIN_PASSWORD` no `.env` depois disso não altera a senha gravada no broker, e o Node-RED e o healthcheck deixam de conectar. Para trocar, primeiro mude a senha no broker, ainda com o `.env` antigo (o comando pede a senha nova):

```bash
docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec setClientPassword node-red
```

Depois ponha a mesma senha no `.env` e recrie os containers: `docker compose up -d mosquitto node-red`. Troque `node-red` pelo seu `MQTT_ADMIN_USER`, se for outro.

Cada placa tem um cliente e um papel próprios, criados pela página `/admin/` (veja `node-red/README.md`):

| Papel `disp-<device_id>` | Tópico |
|---|---|
| `publishClientSend` | `fdctmon/<device_id>/data` |
| `publishClientSend` | `fdctmon/<device_id>/status` |
| `subscribeLiteral` e `publishClientReceive` | `fdctmon/<device_id>/cmd` |

As regras são literais, uma cópia por placa. O plugin do Mosquitto 2.0.22 não substitui `%u` nem `%c` nas ACLs, então um papel único com padrão não funciona.

- Publicação fora do próprio ramo é descartada sem aviso; a conexão continua. O sintoma é silêncio no tópico.
- Uma placa não assina `fdctmon/#`. Para observar o tráfego, use a porta interna com o login do Node-RED:

```bash
docker compose exec mosquitto sh -c \
  'mosquitto_sub -p 1884 -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" -t "fdctmon/#" -v'
```

- Para listar as credenciais pela linha de comando. O login vem de `/root/.config/mosquitto_ctrl`, mas esse arquivo aponta para a porta 1885 da primeira subida; por isso `-h` e `-p` vão explícitos:

```bash
docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec listClients
```

- Para criar um cliente de leitura para outro consumidor interno, como a contingência do n8n (pede a senha do novo cliente):

```bash
docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec createClient n8n
docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec addClientRole n8n ingestao
```

A API da página só altera clientes com ID no formato do firmware (`esp32-` + 12 dígitos hexadecimais), então esse cliente fica fora do alcance dela.

## TLS

O certificado do servidor é assinado pela CA própria do DCMonitor (`scripts/gerar_certificados.sh`). As placas confiam só nessa CA e conferem o nome: o `MQTT_HOST` do firmware precisa estar no certificado. Detalhes, renovação e backup em `docs/DEPLOY_PROD.md`.

As placas não verificam a data de validade do certificado: o mbedTLS do framework do ESP32 é compilado sem verificação de datas. Elas conferem a cadeia e o nome.

Para testar a 8883 de dentro do container, use `--cafile /mosquitto/certs/ca.crt` e `-h localhost`, que está no certificado (veja `docs/TESTING_LOCAL.md`).

Alterações em `mosquitto.conf`, `iniciar.sh` ou nos certificados valem após `docker compose restart mosquitto`. Alterações de credenciais pela página valem na hora, sem reiniciar.
