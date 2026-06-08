# FdctMonSys

Monitoramento ambiental de datacenter — Raspberry Pi + n8n + PostgreSQL + Flask.

## Visão geral

```
Raspberry Pi  →  MQTT  →  Mosquitto  →  n8n  →  PostgreSQL
                                          └──────────────────►  Zabbix
                                     Flask ◄── PostgreSQL
                                     Browser (NOC telão) ◄── Flask
```

## Início rápido (servidor)

```bash
cp .env.example .env       # preencha as senhas
docker compose up -d       # sobe os 4 serviços
```

Dashboard disponível em `http://<servidor>:5000`
n8n disponível em `http://<servidor>:5678`

Após subir, importe os fluxos n8n: veja [n8n/README.md](n8n/README.md).

## Início rápido (Raspberry Pi)

```bash
cd raspberry
cp .env.example .env       # coloque o IP do servidor em MQTT_BROKER_HOST
pip install -r requirements.txt
python sensor_publisher.py
```

## Verificação ponta a ponta

```bash
# 1. Publicar medição de teste
mosquitto_pub -h <servidor> -t "fdctmon/b827eb00f6d0/attrs" \
  -m '{"device_id":"b827eb00f6d0","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'

# 2. Confirmar no banco
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 3;"

# 3. Verificar API
curl http://<servidor>:5000/api/status
```

## Testes

```bash
cd web
pip install flask psycopg2-binary pytest
pytest tests/ -v
```

## Estrutura

```
docker-compose.yml     orquestração dos serviços
mosquitto/             configuração do broker MQTT
db/schema.sql          schema PostgreSQL
n8n/                   fluxos n8n exportados como JSON
raspberry/             script Python do Pi
web/                   dashboard Flask
docs/                  documentação viva
```

Consulte [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para o diagrama completo e
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) para requisitos e critérios de aceite.
