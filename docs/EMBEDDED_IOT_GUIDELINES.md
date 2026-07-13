# Diretrizes embarcadas — ESP32

## Hardware atual

| Componente | Modelo | Interface | Pino | Observação |
|---|---|---|---|---|
| MCU | ESP32 DevKit | — | — | Lógica 3,3 V |
| Sensor | DHT22 | GPIO | 25 | Pull-up ~10 kΩ se sensor avulso |

O Raspberry legado usa DHT11 e permanece separado do firmware ESP32.

## Convenções implementadas

- Configuração sensível em `ESP32/include/config.hpp`, ignorada pelo Git.
- `ESP32DC.ino` mantém a `struct` e executa sensor, Wi-Fi, MQTT e JSON; `DC_Ambiente.hpp` encapsula o DHT22 e `DC_Comunicacao.hpp` mantém clientes, identidade e tópicos.
- O endereço IP recebido pelo ESP32 é registrado uma vez a cada conexão Wi-Fi.
- Publicação a cada 30 s usando aritmética segura com `millis()`.
- A conexão Wi-Fi é iniciada uma vez com `WiFi.begin()`; estados de falha usam
  `WiFi.reconnect()` a cada 10 s, sem interromper `WL_IDLE_STATUS`.
- Tentativas MQTT são não bloqueantes e ocorrem a cada 5 s.
- Last Will retido no tópico de status.
- Leitura DHT22 inválida não é publicada.
- Buffer MQTT/JSON de 256 bytes, maior que o payload documentado.
- Logs `[INFO]`, `[WARN]` e `[ERROR]`, sem credenciais.
- Telemetria QoS 0 e sem fila offline, decisão documentada no log.

## Build

```bash
cd ESP32
cp include/config.example.hpp include/config.hpp
pio run
pio run -t upload
pio device monitor
```

## Wokwi

`wokwi.toml` existe, mas ainda falta `diagram.json`. A simulação não substitui o teste no DHT22 físico e deve usar credenciais próprias de laboratório.

## Próximas extensões

Novos sensores exigem atualizar requisitos, contrato/versionamento do payload, cálculo de consumo, pinagem e testes antes de alterar o firmware.
