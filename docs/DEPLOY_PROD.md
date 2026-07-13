# Deploy no Oracle Linux 9

## 1. Preparar

```bash
git clone <URL_DO_REPOSITORIO> dcmonitor
cd dcmonitor
cp .env.example .env
chmod 600 .env
nano .env
```

Substitua todos os placeholders. Gere valores aleatórios com `openssl rand -hex 32`. Para o hash do Node-RED:

```bash
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

No `.env`, coloque o hash entre aspas simples para preservar `$`.

Mantenha `BIND_ADDRESS=0.0.0.0`: esse valor faz o Docker aceitar conexões por
todas as interfaces do servidor. Acesse as interfaces pelo IP atual
`10.32.8.115`, nunca por `0.0.0.0`.

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
sudo ss -lntp | grep -E ':(1883|1880|3000|5678|8086)\\b'
```

Para usar DNS futuramente, crie um registro apontando o nome para
`10.32.8.115` e preserve `BIND_ADDRESS=0.0.0.0`. O nome público e o HTTPS devem
ser definidos nas aplicações somente junto com o proxy reverso e o certificado.

## 3. Firewall e SELinux

Os bind mounts usam o sufixo `:Z`, adequado ao SELinux. Libere portas somente para as redes necessárias:

| Porta | Origem recomendada | Uso |
|---:|---|---|
| 1883 | rede dos dispositivos | MQTT autenticado |
| 1880 | rede de gestão | Node-RED |
| 3000 | NOC/rede de gestão | Grafana |
| 5678 | rede de gestão | n8n |
| 8086 | rede de gestão | InfluxDB UI/API |

Exemplo aberto para homologação:

```bash
sudo firewall-cmd --permanent --add-port={1883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --reload
```

Em produção, prefira rich rules por sub-rede em vez de exposição ampla.

## 4. Configurar n8n e Zabbix

Siga `n8n/README.md`: crie a credencial MQTT interna, importe `flow_zabbix.json` e ative. O Node-RED e o Grafana são provisionados automaticamente.

## 5. Verificar

```bash
docker compose ps
docker compose logs --tail=100 mosquitto node-red influxdb grafana n8n
mosquitto_sub -h localhost -p 1883 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t 'fdctmon/#' -v
```

Publique o payload de teste do README e confirme:

1. Node-RED sem erro de ingestão.
2. InfluxDB Data Explorer com measurement `ambiente`.
3. Grafana `DCMonitor - Ambiente` atualizado.
4. Execução n8n concluída.
5. Latest Data do Zabbix atualizado.

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
docker compose start
```

Guarde `.env` separadamente em cofre seguro. O diretório `backups/` é ignorado pelo Git.

## Atualização e rollback

```bash
docker compose pull
docker compose build --pull
docker compose up -d
```

Para rollback, restaure a revisão anterior do Git e as imagens/volumes do backup. Nunca execute `docker compose down -v` em produção: `-v` apaga os dados persistidos.
