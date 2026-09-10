# Estratégia de testes

## Camadas

| Nível | Escopo | Verificação |
|---|---|---|
| Estático | JSON, docs, segredos e Compose | `scripts/run_project_checks.sh` |
| Firmware | Compilação ESP32 | `pio run -d ESP32` |
| Integração | MQTT → Node-RED → InfluxDB | payload controlado + consulta Influx |
| Integração | MQTT → Node-RED → Zabbix | payload controlado + Latest Data |
| Visual | InfluxDB → Grafana | dashboard com três métricas e histórico |
| Resiliência | Wi-Fi/MQTT/DHT22 | desligar rede/sensor e observar logs/status |

## Casos mínimos

1. Payload ESP32 válido grava três fields.
2. Payload Raspberry legado grava temperatura/umidade sem índice de calor.
3. JSON inválido não grava e gera log legível.
4. Temperatura/umidade fora da faixa não grava.
5. Interrupção do broker publica `offline` pelo Last Will.
6. Reinício da stack preserva dados e configurações.
7. Zabbix indisponível não interrompe o fluxo Node-RED/InfluxDB.
8. Dashboard diferencia séries por `device_id`.
9. Compose renderizado publica `1883`, `1880`, `3000`, `5678` e `8086` com `host_ip: 0.0.0.0`; a porta `1884` permanece somente interna.
10. Ao conectar ou reconectar o Wi-Fi, o monitor serial exibe o IP recebido; a manutenção do loop permanece não bloqueante.
11. Durante uma tentativa Wi-Fi em andamento, não surge uma nova mensagem de conexão; após perda ou falha, `Reconectando ao Wi-Fi` aparece no máximo uma vez a cada 10 s.

## Critério de entrega

- Checks estáticos e Compose aprovados.
- Firmware compilado ou limitação do ambiente declarada.
- Teste ponta a ponta realizado no Oracle Linux com evidência dos cinco pontos de verificação.
- Teste físico do DHT22; Wokwi sozinho não aprova hardware.
