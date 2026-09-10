# DCMonitor

Monitoramento ambiental de datacenter com ESP32/Raspberry, MQTT, InfluxDB, Node-RED, n8n, Grafana e Zabbix.

```text
ESP32 / Raspberry → Mosquitto → Node-RED ┬→ InfluxDB → Grafana
                                         └→ Zabbix
```

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

Substitua todos os valores `TROQUE_*`. Gere chaves simples com:

```bash
openssl rand -hex 32
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

Coloque o hash do Node-RED entre aspas simples no `.env`. Depois:

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

Interfaces:

| Serviço | Endereço |
|---|---|
| Grafana | `http://IP_DO_SERVIDOR:3000` |
| Node-RED | `http://IP_DO_SERVIDOR:1880` |
| n8n | `http://IP_DO_SERVIDOR:5678` |
| InfluxDB | `http://IP_DO_SERVIDOR:8086` |
| MQTT dos dispositivos | `IP_DO_SERVIDOR:1883` |

Nesta instalação, substitua `IP_DO_SERVIDOR` por `10.32.8.115`. A variável
`BIND_ADDRESS=0.0.0.0` faz os serviços aceitarem conexões por todas as interfaces,
mas `0.0.0.0` não é um endereço para navegador, ESP32 ou registro DNS.

Quando houver um nome bonito, mantenha o bind em `0.0.0.0` e crie no DNS um
registro apontando o nome para `10.32.8.115`. URLs públicas e HTTPS de Grafana,
n8n e Node-RED serão configurados quando o proxy reverso e o certificado forem
definidos.

O fluxo do Node-RED, o datasource do Grafana e o dashboard já são provisionados. Antes do primeiro envio, crie os itens trapper do Zabbix descritos em [node-red/README.md](node-red/README.md). O n8n sobe sem workflow ativo: veja [n8n/README.md](n8n/README.md).

Se o firewall estiver ativo, libere MQTT para a rede dos dispositivos e as interfaces somente para a rede de gestão. Exemplo temporário para validação:

```bash
sudo firewall-cmd --permanent --add-port={1883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --reload
```

## ESP32

```bash
cd ESP32
cp include/config.example.hpp include/config.hpp
nano include/config.hpp
pio run
pio run -t upload
pio device monitor
```

O ESP32 usa DHT22 no GPIO 25 e publica a cada 30 segundos. Veja [ESP32/README.md](ESP32/README.md).

## Teste rápido sem hardware

```bash
mosquitto_pub -h IP_DO_SERVIDOR -p 1883 \
  -u fdctmon_iot -P 'SENHA_MQTT' \
  -t fdctmon/teste-001/attrs \
  -m '{"schema_version":1,"device_id":"teste-001","sensor":"DHT22","temp":24.7,"umid":53.2,"ic":24.6}'
```

Em até 30 segundos, os dados devem aparecer no dashboard `DCMonitor - Ambiente` do Grafana.

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
raspberry/   publicador legado durante a migração
mosquitto/   configuração MQTT
node-red/    fluxo MQTT → InfluxDB e Zabbix
n8n/         automações futuras; sem workflow ativo
grafana/     datasource e dashboard provisionados
docs/        requisitos, arquitetura, segurança e operação
scripts/     verificações determinísticas
```
