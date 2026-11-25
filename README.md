# DCMonitor

Monitoramento ambiental de datacenter com ESP32, MQTT, InfluxDB, Node-RED, n8n, Grafana e Zabbix.

```text
ESP32 ─TLS :8883→ Mosquitto → Node-RED ┬→ InfluxDB → Grafana
                                       └→ Zabbix (e um segundo Zabbix, opcional)
```

Cada placa publica em `fdctmon/{device_id}/data`, por TLS na porta 8883, com
usuário igual ao `device_id` e senha própria. A senha é gerada na página de
cadastro (`https://IP_DO_SERVIDOR:1880/admin/`) e colada no monitor serial da
placa. O Node-RED acrescenta o local e o nome amigável definidos na mesma página.

## Subir no Oracle Linux 9

Pré-requisito: Docker com o plugin Compose já instalado.

Para a primeira subida no servidor `10.32.8.115`, siga o roteiro direto em
[INICIALIZACAO.md](INICIALIZACAO.md).

```bash
git clone <URL_DO_REPOSITORIO> dcmonitor
cd dcmonitor
cp .env.example .env
nano .env
```

Substitua todos os valores `TROQUE_*`, inclusive `MQTT_ADMIN_PASSWORD`, o login
do Node-RED no broker: o Mosquitto recusa subir com menos de 24 caracteres; use
`openssl rand -base64 32`. Gere as demais chaves com:

```bash
openssl rand -hex 32
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

O mesmo comando gera os dois hashes: o do editor (`NODE_RED_ADMIN_PASSWORD_HASH`)
e o da página de cadastro (`CADASTRO_ADMIN_PASSWORD_HASH`), com senhas diferentes.
Coloque cada hash entre aspas simples no `.env`.

Gere a CA e o certificado TLS do broker (cria `pki/` e
`ESP32/include/ca_cert.hpp`) e crie os diretórios do cadastro de dispositivos
(UID 1000 do Node-RED) e das credenciais MQTT (UID 1883 do Mosquitto):

```bash
sudo bash scripts/gerar_certificados.sh
sudo install -d -o 1000 -g 1000 ./cadastro
sudo install -d -o 1883 -g 1883 ./mqtt-seguranca
```

Depois:

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

Interfaces:

| Serviço | Endereço |
|---|---|
| Grafana | `http://IP_DO_SERVIDOR:3000` |
| Node-RED | `https://IP_DO_SERVIDOR:1880` |
| Cadastro de dispositivos e credenciais MQTT | `https://IP_DO_SERVIDOR:1880/admin/` |
| n8n | `http://IP_DO_SERVIDOR:5678` |
| InfluxDB | `http://IP_DO_SERVIDOR:8086` |
| MQTT dos dispositivos (TLS) | `IP_DO_SERVIDOR:8883` |

Nesta instalação, substitua `IP_DO_SERVIDOR` por `10.32.8.115`. A variável
`BIND_ADDRESS=0.0.0.0` faz os serviços aceitarem conexões por todas as interfaces,
mas `0.0.0.0` não é um endereço para navegador, ESP32 ou registro DNS.

Quando houver um nome bonito, mantenha o bind em `0.0.0.0` e crie no DNS um
registro apontando o nome para `10.32.8.115`. URLs públicas e HTTPS de Grafana,
n8n e Node-RED serão configurados quando o proxy reverso e o certificado forem
definidos.

O fluxo do Node-RED, o datasource do Grafana e o dashboard já são provisionados. Antes do primeiro envio, crie os itens trapper do Zabbix descritos em [node-red/README.md](node-red/README.md). O n8n sobe sem workflow ativo: veja [n8n/README.md](n8n/README.md).

Se o firewall estiver ativo, libere MQTT (8883) e NTP para as redes das placas e as interfaces somente para a rede de gestão. A porta 1883 não é mais usada. Exemplo temporário para validação:

```bash
sudo firewall-cmd --permanent --add-port={8883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --permanent --add-service=ntp
sudo firewall-cmd --reload
```

As placas pegam a hora do próprio servidor (chrony); a configuração está em [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).

## ESP32

```bash
cd ESP32
cp include/config.example.hpp include/config.hpp
nano include/config.hpp
# copie include/ca_cert.hpp gerado no servidor por scripts/gerar_certificados.sh
pio run
pio run -t upload
pio device monitor
```

O ESP32 usa DHT22 no GPIO 25 e publica a cada ~60 segundos, em deep sleep entre ciclos. Na primeira vez, a placa mostra `Sem credencial` e imprime o próprio ID no monitor serial: gere a senha em `/admin/` ("Placa nova: ID mostrado na serial") e cole no serial a linha `credencial <device_id> <senha>`. Ao atualizar o firmware, ajuste `VERSAO_FIRMWARE` no seu `config.hpp` (atual: `1.6.0`). Veja [ESP32/README.md](ESP32/README.md).

## Teste rápido sem hardware

Gere em `/admin/` a senha de uma placa fictícia `esp32-0000000000A1` ("Placa
nova: ID mostrado na serial"; a página só aceita IDs no formato do firmware); a
senha é o terceiro campo da linha mostrada. Publique de
dentro do container do broker:

```bash
docker compose exec mosquitto mosquitto_pub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A1 -P 'SENHA_DE_TESTE' \
  -t fdctmon/esp32-0000000000A1/data \
  -m '{"schema_version":1,"device_id":"esp32-0000000000A1","sensor":"DHT22","temp":24.7,"umid":53.2,"ic":24.6}'
```

O usuário só publica no próprio ramo, `fdctmon/esp32-0000000000A1/...`; uma mensagem
fora dele é descartada sem erro. Em até 30 segundos, os dados devem aparecer no
dashboard `DCMonitor - Ambiente` do Grafana, com local `sem-local` até que a
placa seja cadastrada em `/admin/`. Ao terminar, revogue a credencial de teste.

Para ver o tráfego MQTT, assine pela porta interna, de dentro do container, com
o login do Node-RED (uma placa não tem permissão de leitura em `fdctmon/#`):

```bash
docker compose exec mosquitto sh -c \
  'mosquitto_sub -p 1884 -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" -t "fdctmon/#" -v'
```

## Operação

```bash
docker compose logs -f mosquitto node-red influxdb
docker compose logs -f n8n
docker compose restart
docker compose pull
docker compose up -d --build
```

Deploy, backup, firewall e rollback: [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md). Arquitetura e contrato MQTT: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Estrutura

```text
INICIALIZACAO.md  primeira subida e teste da plataforma no Oracle Linux
ESP32/       firmware PlatformIO do ESP32/DHT22
mosquitto/   configuração MQTT, TLS e partida do dynamic security
node-red/    fluxo MQTT → InfluxDB e Zabbix, página de cadastro e credenciais MQTT
n8n/         automações futuras; sem workflow ativo
grafana/     datasource e dashboard provisionados
docs/        requisitos, arquitetura, segurança e operação
scripts/     verificações determinísticas e geração dos certificados TLS
cadastro/    dispositivos.json (criado no host, fora do Git)
mqtt-seguranca/  credenciais MQTT das placas, só hashes (criado no host, fora do Git)
pki/         CA e certificado do broker (gerado no servidor, fora do Git)
```
