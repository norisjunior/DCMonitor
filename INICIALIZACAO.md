# Inicialização do DCMonitor no Oracle Linux 9

Este é o roteiro curto para a primeira inicialização após clonar o repositório e
preencher o arquivo `.env`.

Servidor atual: `10.32.8.115`.

## 1. Entrar na pasta e conferir o ambiente

```bash
cd ~/dcmonitor
docker --version
docker compose version
sudo systemctl enable --now docker
```

Se o repositório foi clonado em outro local, ajuste o primeiro comando.

## 2. Validar o `.env`

```bash
test -f .env || { echo "ERRO: arquivo .env ausente"; exit 1; }
chmod 600 .env

if grep -n 'TROQUE_' .env; then
  echo "ERRO: ainda existem valores TROQUE_* no .env"
  exit 1
fi

docker compose config -q
```

O último comando não deve apresentar erro. Mantenha:

```env
BIND_ADDRESS=0.0.0.0
```

`0.0.0.0` é somente o endereço de escuta. Para acessar a plataforma, use
`10.32.8.115`.

## 3. Subir a plataforma

```bash
docker compose up -d --build
docker compose ps
```

Na primeira execução, o download e a construção das imagens podem demorar. Rode
`docker compose ps` novamente após um ou dois minutos. Os cinco serviços devem
aparecer como `Up` e, após a inicialização, `healthy`:

- `mosquitto`
- `influxdb`
- `node-red`
- `n8n`
- `grafana`

## 4. Liberar o firewall para o primeiro teste

Confira se o `firewalld` está ativo:

```bash
sudo firewall-cmd --state
```

Se estiver ativo, esta liberação é simples para homologação em uma rede interna
confiável:

```bash
sudo firewall-cmd --permanent --add-port={1883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --reload
```

Em produção, restrinja `1880`, `3000`, `5678` e `8086` à rede de gestão e `1883`
à rede dos dispositivos. Não exponha essas portas diretamente à Internet.

## 5. Abrir as interfaces

| Serviço | Endereço |
|---|---|
| Grafana | `http://10.32.8.115:3000` |
| Node-RED | `http://10.32.8.115:1880` |
| n8n | `http://10.32.8.115:5678` |
| InfluxDB | `http://10.32.8.115:8086` |
| MQTT | `10.32.8.115:1883` |

Credenciais de primeiro acesso:

- Grafana: `GRAFANA_ADMIN_USER` e `GRAFANA_ADMIN_PASSWORD` do `.env`.
- Node-RED: `NODE_RED_ADMIN_USER` e a senha original usada para gerar o hash.
- InfluxDB: `INFLUXDB_ADMIN_USER` e `INFLUXDB_ADMIN_PASSWORD` do `.env`.
- n8n: crie o usuário proprietário solicitado no primeiro acesso.

O hash bcrypt armazenado no `.env` não é a senha de login do Node-RED.

## 6. Conferir o Zabbix

O Node-RED, o InfluxDB e o Grafana são provisionados automaticamente, incluindo
o envio ao Zabbix. O que não é provisionado está do lado do Zabbix: no host
indicado por `ZABBIX_HOST_NAME`, os itens trapper `temperatura`, `umidade`,
`indice_calor` e `rssi` precisam existir antes do teste. Veja os detalhes em
[node-red/README.md](node-red/README.md).

O n8n sobe sem workflow ativo e não precisa de configuração nesta etapa.

## 7. Testar o MQTT como se fosse um dispositivo

Estes comandos criam clientes Mosquitto descartáveis, separados do container do
broker. No Oracle Linux, `--network host` permite que eles acessem a porta
externa do broker em `127.0.0.1:1883`. `--rm` remove cada cliente ao encerrar.

Em um primeiro terminal, informe a senha MQTT e deixe o subscriber aberto:

```bash
export MQTT_USERNAME=fdctmon_iot
read -rsp "Senha MQTT: " MQTT_PASSWORD && echo
export MQTT_PASSWORD

docker run --rm --network host \
  -e MQTT_USERNAME -e MQTT_PASSWORD \
  eclipse-mosquitto:2.0.22 \
  sh -c 'exec mosquitto_sub -h 127.0.0.1 -p 1883 \
    -t "fdctmon/#" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -v'
```

Em um segundo terminal, informe as mesmas credenciais e publique uma medição:

```bash
export MQTT_USERNAME=fdctmon_iot
read -rsp "Senha MQTT: " MQTT_PASSWORD && echo
export MQTT_PASSWORD

docker run --rm --network host \
  -e MQTT_USERNAME -e MQTT_PASSWORD \
  eclipse-mosquitto:2.0.22 \
  sh -c 'exec mosquitto_pub -h 127.0.0.1 -p 1883 \
    -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
    -t fdctmon/teste-001/attrs \
    -m "{\"schema_version\":1,\"device_id\":\"teste-001\",\"sensor\":\"DHT22\",\"temp\":24.7,\"umid\":53.2,\"ic\":24.6}"'

unset MQTT_PASSWORD
```

O primeiro terminal deve mostrar a mensagem recebida no tópico
`fdctmon/teste-001/attrs`. Encerre o subscriber com `Ctrl+C` e remova a senha da
sessão com `unset MQTT_PASSWORD`.

Depois, confirme:

1. Node-RED sem erro no log e nós com status verde na UI.
2. Dashboard `DCMonitor - Ambiente` atualizado no Grafana.
3. Valores atualizados em **Latest Data** no Zabbix.

## Se algo não subir

```bash
docker compose ps
docker compose logs --tail=100 mosquitto influxdb node-red n8n grafana
```

Para acompanhar um serviço específico:

```bash
docker compose logs -f node-red
```

Não execute `docker compose down -v`: a opção `-v` remove os volumes e apaga os
dados persistidos. Para firewall definitivo, backup, atualização e rollback,
consulte [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).
