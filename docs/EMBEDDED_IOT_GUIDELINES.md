# Diretrizes embarcadas — ESP32

## Hardware atual

| Componente | Modelo | Interface | Pino | Observação |
|---|---|---|---|---|
| MCU | ESP32 DevKit | — | — | Lógica 3,3 V |
| Sensor | DHT22 | GPIO | 25 | Pull-up ~10 kΩ se sensor avulso |

## Convenções implementadas

- Configuração sensível em `ESP32/include/config.hpp`, ignorada pelo Git.
- `ESP32DC.ino` mantém a `struct` e executa sensor, Wi-Fi, MQTT e JSON; `DC_Ambiente.hpp` encapsula o DHT22 e `DC_Comunicacao.hpp` mantém clientes, identidade e tópicos.
- O endereço IP recebido pelo ESP32 é registrado a cada ciclo.
- Ciclo com deep sleep de 60 s (`TEMPO_SONO_S`); todo o trabalho fica em `setup()`.
- Esperas de Wi-Fi, MQTT e NTP têm limite; ao estourar, a placa dorme e tenta no próximo ciclo.
- Watchdog de tarefa (`esp_task_wdt`) reinicia a placa se o ciclo acordado passar de 30 s.
- Estado que precisa sobreviver ao sono usa `RTC_DATA_ATTR`; o fuso é reaplicado a cada boot.
- Last Will retido no tópico de status; a sessão termina com `DISCONNECT` limpo.
- Leitura DHT22 inválida tem uma segunda tentativa e, persistindo, não é publicada.
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
