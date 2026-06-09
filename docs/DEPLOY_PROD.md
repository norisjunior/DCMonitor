# Deploy em produção

## Servidor

```bash
git clone <repo> dcmonitor && cd dcmonitor
cp .env.example .env          # preencha todas as variáveis
docker compose up -d --build  # sobe mosquitto, postgres, n8n, web
```

Verifique: `docker compose ps` — todos os serviços `Up`.

## n8n (http://servidor:5678)

1. **Credentials → New → MQTT** — nome `FdctMonSys MQTT`, host `mosquitto`, porta `1883`, usuário/senha de `MQTT_USERNAME` e `MQTT_PASSWORD`
2. **Credentials → New → Postgres** — nome `FdctMonSys PostgreSQL`, host `postgres`, porta `5432`, db/user/pass do `.env`
3. **Workflows → Import** → `n8n/flow_principal.json` → associe as credenciais → **ative**
4. **Workflows → Import** → `n8n/flow_retencao.json` → associe credencial Postgres → mantenha **inativo** (script é o mecanismo principal)

## Arquivo trimestral (cron no servidor)

```bash
chmod +x scripts/export_historico.sh
crontab -e
```

Adicione (ajuste o caminho):
```
0 3 31 3  * cd /caminho/dcmonitor && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 6  * cd /caminho/dcmonitor && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 30 9  * cd /caminho/dcmonitor && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
0 3 31 12 * cd /caminho/dcmonitor && ./scripts/export_historico.sh >> ./backups/export.log 2>&1
```

## Raspberry Pi

```bash
cd raspberry
cp .env.example .env          # MQTT_BROKER_HOST = IP do servidor; MQTT_USERNAME/PASSWORD iguais ao servidor
pip install -r requirements.txt
python sensor_publisher.py
```

## Verificação ponta a ponta

```bash
# Banco recebendo dados
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 3;"

# Broker autenticado
mosquitto_pub -h servidor -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "fdctmon/b827eb00f6d0/attrs" \
  -m '{"device_id":"b827eb00f6d0","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'

# Dashboard
curl http://servidor:5000/api/status

# Zabbix (aguardar ~30 s após o Pi publicar)
# Verificar em: Zabbix → Monitoring → Latest Data → host configurado
```

Dashboard disponível em `http://servidor:5000`.
