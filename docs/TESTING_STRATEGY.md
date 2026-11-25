# Estratégia de testes

## Camadas

| Nível | Escopo | Verificação |
|---|---|---|
| Estático | JSON, docs, segredos e Compose | `scripts/run_project_checks.sh` |
| Unitário | Funções do fluxo Node-RED | `node scripts/test_node_red_functions.js` |
| Firmware | Compilação ESP32 | `pio run -d ESP32` |
| Integração | MQTT → Node-RED → InfluxDB | payload controlado + consulta Influx |
| Integração | MQTT → Node-RED → Zabbix | payload controlado + Latest Data |
| Integração | Credenciais `/admin/` → broker | gerar, trocar e revogar + `mosquitto_pub` na 8883 com TLS |
| Hardware | Provisionamento pela serial | placa sem senha recebe a linha `credencial` e publica |
| Visual | InfluxDB → Grafana | dashboard com três métricas e histórico |
| Resiliência | Wi-Fi/MQTT/DHT22 | desligar rede/sensor e observar logs/status |

## Casos mínimos

1. Payload ESP32 válido grava três fields.
2. Payload sem `ic`/`rssi` grava temperatura e umidade e não interrompe os demais itens.
3. JSON inválido não grava e gera log legível.
4. Temperatura/umidade fora da faixa não grava.
5. Interrupção do broker publica `offline` pelo Last Will.
6. Reinício da stack preserva dados e configurações.
7. Zabbix indisponível não interrompe o fluxo Node-RED/InfluxDB.
8. Dashboard diferencia séries pelo nome amigável e filtra por `Local` e `Dispositivo`.
9. Compose renderizado publica `8883`, `1880`, `3000`, `5678` e `8086` com `host_ip: 0.0.0.0`; a porta `1884` permanece somente interna e a `1883` não existe.
10. Ao conectar ou reconectar o Wi-Fi, o monitor serial exibe o IP recebido; a manutenção do loop permanece não bloqueante.
11. Durante uma tentativa Wi-Fi em andamento, não surge uma nova mensagem de conexão; após perda ou falha, `Reconectando ao Wi-Fi` aparece no máximo uma vez a cada 10 s.
12. Publicação na 8883 com a credencial de uma placa no ramo de outra não chega ao Node-RED; uma placa não lê `fdctmon/#`.
13. Cadastro salvo em `/admin/` vale na medição seguinte, sem reiniciar; salvar sobre revisão antiga responde 409.
14. `dispositivos.json` inválido não impede a gravação da telemetria, que sai com `local=sem-local`.
15. Gerar senha mostra a linha `credencial <device_id> <senha>` uma vez; gerar de novo responde 409; trocar invalida a senha antiga; revogar é idempotente.
16. API de credenciais sem o cabeçalho `X-DCMonitor: 1` responde 403; ID fora de `^esp32-[0-9A-F]{12}$` responde 400; broker parado responde 504.
17. Conexão sem TLS, sem a CA certa ou anônima (8883 e 1884) é recusada.
18. Placa sem senha não dorme, aceita só a linha do próprio ID e passa a publicar após reiniciar; credencial revogada gera aviso no serial.
19. Placa sem NTP publica por TLS normalmente; o display mostra `--:--`.
20. Com `ZABBIX_SERVER_2` vazio, nada vai ao segundo Zabbix; preenchido, os dois recebem os mesmos itens.

## Critério de entrega

- Checks estáticos e Compose aprovados.
- Firmware compilado ou limitação do ambiente declarada.
- Teste ponta a ponta realizado no Oracle Linux com evidência dos cinco pontos de verificação.
- Teste físico do DHT22; Wokwi sozinho não aprova hardware.
