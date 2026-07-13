# Teste local da plataforma

## Checks sem subir containers

```bash
bash scripts/run_project_checks.sh
```

O script valida documentação, JSON, Compose e testes do Raspberry; compila o ESP32 quando `pio` está instalado.

## Integração Docker

```bash
cp .env.example .env
# preencha os placeholders
docker compose up -d --build
docker compose ps
```

Observe o MQTT:

```bash
mosquitto_sub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t 'fdctmon/#' -v
```

Publique ESP32 simulado:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t fdctmon/teste-esp32/attrs \
  -m '{"schema_version":1,"device_id":"teste-esp32","sensor":"DHT22","firmware_version":"test","temp":24.7,"umid":53.2,"ic":24.6}'
```

Publique payload legado:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t fdctmon/teste-raspberry/attrs \
  -m '{"device_id":"teste-raspberry","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'
```

Confirme, nesta ordem:

1. `docker compose logs node-red` sem erro.
2. InfluxDB `http://localhost:8086` contém measurement `ambiente`.
3. Grafana `http://localhost:3000` mostra os dois `device_id`.
4. n8n registra execução após importar/ativar `flow_zabbix.json`.
5. Zabbix Latest Data atualiza temperatura e umidade.

## Falhas

- Publique JSON inválido e confirme que nenhum ponto é gravado.
- Pare o Zabbix ou use endereço inválido; InfluxDB deve continuar recebendo.
- Desligue o ESP32 sem desconexão limpa; o tópico de status deve mudar para `offline`.
- Reconecte o Wi-Fi e confirme no monitor serial a mensagem `Wi-Fi conectado. IP: ...` antes da reconexão MQTT.
- Reinicie a stack e confirme que os dados permanecem.

Para encerrar sem apagar volumes:

```bash
docker compose down
```

Não use `docker compose down -v` se quiser preservar dados.
