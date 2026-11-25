# Deploy no Oracle Linux 9

## 1. Preparar

```bash
git clone <URL_DO_REPOSITORIO> dcmonitor
cd dcmonitor
cp .env.example .env
chmod 600 .env
nano .env
```

Substitua todos os placeholders. Gere valores aleatórios com `openssl rand -hex 32`. Para os hashes do Node-RED:

```bash
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

Gere dois hashes, com senhas diferentes:

| Variável | Uso |
|---|---|
| `NODE_RED_ADMIN_PASSWORD_HASH` | login do editor do Node-RED (`NODE_RED_ADMIN_USER`) |
| `CADASTRO_ADMIN_PASSWORD_HASH` | login da página de cadastro `/admin/` (`CADASTRO_ADMIN_USER`, padrão `cadastro`) |

Os dois são obrigatórios: sem eles o Compose recusa a configuração e o Node-RED não sobe. No `.env`, coloque cada hash entre aspas simples para preservar `$`.

`CADASTRO_DIR` (padrão `./cadastro`) é o diretório do host com `dispositivos.json`. Crie-o antes de subir, gravável pelo UID 1000 do container do Node-RED:

```bash
sudo install -d -o 1000 -g 1000 ./cadastro
```

Se o arquivo não existir, o Node-RED cria um cadastro vazio na primeira subida. Se o diretório faltar ou tiver outro dono, o cadastro não carrega e a página mostra o motivo; a telemetria continua gravando.

`MQTT_ADMIN_USER` (padrão `node-red`) e `MQTT_ADMIN_PASSWORD` são o login do Node-RED no broker, na porta interna 1884. O mesmo cliente administra as credenciais das placas e também autentica na 8883 (`per_listener_settings false`), por isso a senha precisa ser forte: o Mosquitto recusa subir com `TROQUE_*` ou com menos de 24 caracteres. Gere com:

```bash
openssl rand -base64 32
```

A senha é gravada no broker só na primeira subida; trocá-la depois no `.env` exige trocar antes no broker (veja `mosquitto/README.md`).

`ZABBIX_SERVER_2` é o segundo servidor Zabbix, que recebe os mesmos itens (padrão `10.32.8.69`). Para desligar, defina a variável vazia no `.env` (`ZABBIX_SERVER_2=`).

Mantenha `BIND_ADDRESS=0.0.0.0`: esse valor faz o Docker aceitar conexões por
todas as interfaces do servidor. Acesse as interfaces pelo IP atual
`10.32.8.115`, nunca por `0.0.0.0`.

### Certificados TLS do broker

As placas conectam só na porta 8883, com TLS. Gere a CA e o certificado do servidor, como root, na raiz do repositório:

```bash
sudo bash scripts/gerar_certificados.sh
```

| Saída | Conteúdo |
|---|---|
| `pki/ca/ca.key`, `pki/ca/ca.crt` | CA própria do DCMonitor, 10 anos; criada só na primeira execução |
| `pki/mosquitto/` | `ca.crt`, `server.crt` e `server.key` (dono UID 1883), montados no Mosquitto (`MQTT_CERTS_DIR`) |
| `ESP32/include/ca_cert.hpp` | certificado público da CA para o firmware, igual para toda a frota |

O certificado do servidor vale 825 dias e traz os nomes pelos quais as placas chegam ao broker:

| Variável | Padrão | Entra no certificado |
|---|---|---|
| `MQTT_TLS_NOMES` | `vplviot.ctn.fundacentro.intra` | como DNS |
| `MQTT_TLS_IPS` | `10.32.8.115` | como IP e também como DNS |

Também entram `mosquitto`, `localhost` e `127.0.0.1`, para conexões de dentro do servidor. Cada IP entra também como DNS porque o mbedTLS 2.28 do ESP32 só compara o host com entradas DNS. Para mais de um valor, separe por espaço:

```bash
sudo MQTT_TLS_NOMES="vplviot.ctn.fundacentro.intra" MQTT_TLS_IPS="10.32.8.115" \
  bash scripts/gerar_certificados.sh
```

A chave da CA é o segredo mais sensível da instalação e não tem senha: guarde uma cópia de `pki/ca/ca.key` em cofre. O recomendado é tirá-la do servidor depois de emitir o certificado e devolvê-la só para renovar (veja "Renovação do certificado do broker"). `pki/` e `mqtt-seguranca/` estão no `.gitignore`.

Copie `ESP32/include/ca_cert.hpp` para a máquina que compila o firmware (veja `ESP32/README.md`).

### Diretório das credenciais MQTT

As credenciais das placas (só hashes) ficam em `dynamic-security.json`, no diretório do host `MQTT_SEGURANCA_DIR` (padrão `./mqtt-seguranca`). Crie-o com dono UID 1883, o usuário do Mosquitto no container:

```bash
sudo install -d -o 1883 -g 1883 ./mqtt-seguranca
```

Na primeira subida, o Mosquitto cria o arquivo com o cliente `MQTT_ADMIN_USER` e o papel `ingestao`.

## 2. Subir

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

O primeiro startup inicializa organização, bucket e token do InfluxDB. Alterar as variáveis `DOCKER_INFLUXDB_INIT_*` depois que o volume existe não recria essas estruturas.

Após subir, valide o bind publicado:

```bash
docker compose ps
sudo ss -lntp | grep -E ':(8883|1880|3000|5678|8086)\b'
```

A porta 1883 não deve aparecer. Confira o certificado servido na 8883:

```bash
openssl s_client -connect 10.32.8.115:8883 -CAfile pki/mosquitto/ca.crt </dev/null 2>/dev/null \
  | grep -E 'subject=|Verify return code'
```

O resultado esperado é `Verify return code: 0 (ok)`.

Para usar DNS futuramente, crie um registro apontando o nome para
`10.32.8.115` e preserve `BIND_ADDRESS=0.0.0.0`. O nome público e o HTTPS devem
ser definidos nas aplicações somente junto com o proxy reverso e o certificado.
O nome usado pelas placas no `MQTT_HOST` precisa estar no certificado do broker;
para um nome novo, rode `scripts/gerar_certificados.sh` com `MQTT_TLS_NOMES`.

## 3. NTP para as placas

As placas usam a hora só no display: o TLS delas não verifica datas e funciona sem NTP. O chrony do Oracle Linux 9 serve NTP a elas. Em `/etc/chrony.conf`, acrescente:

```text
allow 10.32.8.0/24
allow 172.16.40.0/24
allow 172.16.200.0/23
local stratum 10
```

`local stratum 10` mantém o serviço mesmo sem fonte externa. Com a rede apartada da internet, troque a linha `pool` por um NTP interno (por exemplo, o controlador de domínio) ou remova-a.

```bash
sudo firewall-cmd --permanent --add-service=ntp && sudo firewall-cmd --reload
sudo systemctl restart chronyd
chronyc sources
chronyc clients
```

`chronyc clients` lista as placas que já consultaram o servidor. No firmware, `NTP_SERVIDOR` aponta para o IP do servidor do DCMonitor.

## 4. Firewall e SELinux

Os bind mounts usam o sufixo `:Z`, adequado ao SELinux. Libere portas somente para as redes necessárias:

| Porta | Origem recomendada | Uso |
|---:|---|---|
| 8883/tcp | redes das placas | MQTT com TLS, usuário e senha por placa |
| 123/udp | redes das placas | NTP (chrony do host) |
| 1880/tcp | rede de gestão | Node-RED: editor, página `/admin/` e geração de senhas MQTT |
| 3000/tcp | NOC/rede de gestão | Grafana |
| 5678/tcp | rede de gestão | n8n |
| 8086/tcp | rede de gestão | InfluxDB UI/API |

A porta 1883 deixou de existir. Se ela foi liberada em uma instalação anterior, feche-a:

```bash
sudo firewall-cmd --permanent --remove-port=1883/tcp
```

Exemplo aberto para homologação:

```bash
sudo firewall-cmd --permanent --add-port={8883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --permanent --add-service=ntp
sudo firewall-cmd --reload
```

Em produção, prefira rich rules por sub-rede em vez de exposição ampla. Exemplo para a 8883:

```bash
for rede in 10.32.8.0/24 172.16.40.0/24 172.16.200.0/23; do
  sudo firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$rede port port=8883 protocol=tcp accept"
done
sudo firewall-cmd --reload
```

A página de cadastro usa a mesma porta `1880` do editor e devolve a senha MQTT gerada sem TLS: quem cadastra placas precisa estar na rede de gestão, e a 1880 não deve ser aberta para as redes das placas.

## 5. Preparar o Zabbix

O Node-RED e o Grafana são provisionados automaticamente, inclusive o envio ao Zabbix. Crie antes, para cada dispositivo, um host no Zabbix com o nome igual ao `device_id` e os itens trapper `temp`, `umid`, `headindex` e `rssi`, conforme `node-red/README.md`. Com `ZABBIX_SERVER_2`, crie os mesmos hosts e itens no segundo servidor. O n8n sobe sem workflow ativo.

## 6. Verificar

```bash
docker compose ps
docker compose logs --tail=100 mosquitto node-red influxdb grafana n8n
docker compose exec mosquitto sh -c \
  'mosquitto_sub -p 1884 -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" -t "fdctmon/#" -v'
```

A assinatura é feita pela porta interna 1884, de dentro do container, com o login do Node-RED: uma placa na 8883 não tem leitura em `fdctmon/#`.

Gere a credencial de uma placa de teste (ID fictício no formato do firmware, como `esp32-0000000000A1`) em `/admin/`, publique o payload de teste como em `INICIALIZACAO.md` (passo 9) e confirme:

1. Node-RED sem erro de ingestão.
2. InfluxDB Data Explorer com measurement `ambiente` e tags `local` e `nome`.
3. Grafana `DCMonitor - Ambiente` atualizado.
4. Latest Data do Zabbix atualizado.
5. Página `http://10.32.8.115:1880/admin/` abre com o login do cadastro e lista a placa de teste como "novo", com a credencial ativa.
6. Revogue a credencial de teste ao terminar.

## Backup

Antes de atualizar:

```bash
mkdir -p backups
docker compose stop
docker run --rm -v dcmonitor_influxdb_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/influxdb-data.tgz -C /data .
docker run --rm -v dcmonitor_n8n_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/n8n-data.tgz -C /data .
docker run --rm -v dcmonitor_grafana_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/grafana-data.tgz -C /data .
sudo tar czf backups/mqtt-seguranca-$(date +%F).tgz mqtt-seguranca
docker compose start
cp cadastro/dispositivos.json backups/dispositivos-$(date +%F).json
```

O cadastro de dispositivos é um arquivo comum do host: basta copiá-lo, inclusive com a stack no ar. Para restaurar, copie o arquivo de volta para `CADASTRO_DIR`, mantendo o dono UID 1000, e reinicie o Node-RED (`docker compose restart node-red`).

`mqtt-seguranca/dynamic-security.json` guarda as credenciais das placas (só hashes). Sem ele, todas as placas precisam de senha nova e de regravação. Para restaurar, copie-o de volta mantendo o dono UID 1883 e o modo `0600` e reinicie o Mosquitto.

Guarde `.env` e `pki/ca/ca.key` separadamente em cofre seguro. Perder a chave da CA obriga a criar uma CA nova e regravar todas as placas na próxima renovação. Os diretórios `backups/`, `cadastro/`, `pki/` e `mqtt-seguranca/` são ignorados pelo Git.

## Renovação do certificado do broker

O certificado do servidor vale 825 dias. Confira a data de vencimento:

```bash
openssl x509 -in pki/mosquitto/server.crt -noout -enddate
```

Antes de vencer, rode o script de novo e reinicie o broker:

```bash
sudo bash scripts/gerar_certificados.sh
docker compose restart mosquitto
```

Com `pki/ca/ca.key` presente, o script reaproveita a CA e renova só o certificado do servidor: as placas não precisam ser regravadas. Se a chave da CA foi guardada fora do servidor, devolva-a para `pki/ca/` antes de rodar o script: sem ela, o script cria uma CA nova.

As placas não verificam as datas do certificado (o mbedTLS do firmware é compilado sem essa verificação), então não deixam de conectar quando ele vence. Um certificado vencido, ou com a chave vazada, continua aceito por elas até a troca da CA.

Apagar `pki/ca/` cria uma CA nova: o `ca_cert.hpp` muda e todas as placas precisam ser recompiladas e regravadas.

## Atualização e rollback

```bash
docker compose pull
docker compose build --pull
docker compose up -d
```

O `settings.js`, o `flows.json` e o `flows_cred.json` são copiados para o volume `dcmonitor_node_red_data` só quando ele é criado. Uma atualização que muda esses arquivos — como as que introduziram o cadastro de dispositivos e as credenciais MQTT — exige recriar o volume:

```bash
docker compose stop node-red
docker compose rm -f node-red
docker volume rm dcmonitor_node_red_data
docker compose up -d --build node-red
```

Na passagem para o cadastro de dispositivos, recriar também o bucket do InfluxDB é aceitável: os dados antigos não têm as tags `local` e `nome` e não aparecem nos filtros do Grafana.

Na passagem para a credencial por placa e TLS:

1. Gere os certificados e crie `mqtt-seguranca/`, como na seção 1.
2. Acrescente `MQTT_ADMIN_USER` e `MQTT_ADMIN_PASSWORD` (`openssl rand -base64 32`) ao `.env` e remova `MQTT_USERNAME` e `MQTT_PASSWORD`.
3. Recrie o volume do Node-RED (comandos acima) e suba a stack: `docker compose up -d --build`.
4. Libere a 8883 e o NTP no firewall e feche a 1883 (seção 4).
5. Grave o firmware 1.6.0 em cada placa e gere a senha na página `/admin/`, como em `ESP32/README.md`.

O firmware 1.5.0 conecta na 1883, que não existe mais: até ser regravada, a placa fica fora do broker.

Para rollback, restaure a revisão anterior do Git e as imagens/volumes do backup. Nunca execute `docker compose down -v` em produção: `-v` apaga os dados persistidos.
