# EMBEDDED_IOT_GUIDELINES.md

> Mantido por: `embedded-iot`.
> Remova este arquivo se não houver firmware / IoT no projeto.

## Referência de hardware

| Componente | Modelo | Interface | Pino(s) | Observações |
|---|---|---|---|---|
| MCU | `<ex.: ESP32-S3 DevKitC>` | — | — | Lógica 3,3 V |
| Sensor | `<ex.: DHT22>` | GPIO | `<GPIO4>` | Pull-up 10 kΩ |
| Atuador | `<ex.: Relé>` | GPIO | `<GPIO5>` | Ativo em LOW |

## Contrato MQTT

| Tópico | Direção | Payload | QoS |
|---|---|---|---|
| `device/{id}/telemetry` | Dispositivo → Broker | `{"ts": <unix_ms>, "value": <float>}` | 1 |
| `device/{id}/command` | Broker → Dispositivo | `{"action": "<string>"}` | 1 |

## Convenções de firmware

- **Loop:** Sem `delay()` acima de 10 ms no loop principal. Use `millis()` ou tarefas FreeRTOS.
- **Wi-Fi:** Reconexão com backoff exponencial. Timeout: 30 s. Dispositivo opera offline sem rede.
- **MQTT:** Mensagem last will configurada. QoS 1 para telemetria. Reconectar ao desconectar.
- **Watchdog:** WDT configurado para `<N>` segundos. Reset em travamento.
- **Logs seriais:** Baseados em nível (`[INFO]`, `[WARN]`, `[ERROR]`). Sem credenciais nos logs.

## Gestão de energia

- Deep sleep quando aplicável: `<N µA>` em deep sleep.
- Fonte de wake: `<timer / interrupção GPIO>`.
- Tensão da bateria monitorada via `<pino ADC>` quando alimentado por bateria.

## Simulação (Wokwi)

- Arquivo de diagrama: `firmware/wokwi/diagram.json`
- Limitações vs hardware real: `<liste as diferenças>`
- Para executar: abra `diagram.json` no Wokwi ou use `wokwi-cli`.

## Build e flash

```bash
cd firmware
pio run              # compilar
pio run -t upload    # gravar
pio device monitor   # monitor serial
pio test             # executar testes unitários
```
