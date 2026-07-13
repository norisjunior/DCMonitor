# Diretrizes embarcadas — ESP32

## Hardware atual

| Componente | Modelo | Interface | Pino | Observação |
|---|---|---|---|---|
| MCU | ESP32 DevKit | — | — | Lógica 3,3 V |
| Sensor | DHT22 | GPIO | 23 | Pull-up ~10 kΩ se sensor avulso |

O Raspberry legado usa DHT11 e permanece separado do firmware ESP32.

## Convenções implementadas

- Configuração sensível em `ESP32/include/config.hpp`, ignorada pelo Git.
- `ESP32DC.ino` mantém a `struct` e orquestra a aplicação; `DC_Ambiente.hpp` e `DC_Comunicacao.hpp` encapsulam sensor e rede.
- Publicação a cada 30 s usando aritmética segura com `millis()`.
- Tentativas não bloqueantes: Wi-Fi 10 s, MQTT 5 s.
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
