# Firmware ESP32 — DCMonitor

Firmware didático para ESP32 DevKit com um DHT22. Lê temperatura e umidade, calcula o índice de calor e publica via MQTT a cada 30 segundos.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `src/ESP32DC.ino` | `struct`, coleta, Wi-Fi/MQTT, JSON e fluxo de `setup()`/`loop()` |
| `src/DC_Ambiente.hpp` | Inicialização, leitura e índice de calor do DHT22 |
| `src/DC_Comunicacao.hpp` | Clientes Wi-Fi/MQTT, identidade e composição dos tópicos |
| `include/config.hpp` | Configuração local de rede, GPIO, intervalo e versão |

O `.ino` conta todo o fluxo de execução. O header de comunicação mantém apenas o estado compartilhado e a identidade; não inicializa conexões nem publica JSON. Não há um módulo de dados porque a única `struct` pertence à aplicação.

## Hardware

| DHT22 | ESP32 |
|---|---|
| VCC | 3,3 V |
| DATA | GPIO 25 |
| GND | GND |

Se o DHT22 for o sensor avulso, use resistor pull-up de aproximadamente 10 kΩ entre VCC e DATA. Módulos prontos normalmente já possuem o resistor.

## Configuração

```bash
cp include/config.example.hpp include/config.hpp
```

Edite `include/config.hpp` com Wi-Fi, IP do servidor, credenciais MQTT, GPIO, intervalo e versão. Esse arquivo é ignorado pelo Git. A senha encontrada no protótipo original deve ser considerada exposta e rotacionada.

## Compilar e gravar

```bash
pio run
pio run -t upload
pio device monitor
```

Monitor serial: 115200 baud.

Ao conectar ao Wi-Fi, o monitor serial mostra o endereço recebido, por exemplo:

```text
[INFO] Wi-Fi conectado. IP: 10.32.8.120
```

## MQTT

- Telemetria: `fdctmon/{device_id}/attrs`, QoS 0, não retida.
- Estado: `fdctmon/{device_id}/status`, retido; `online` ou Last Will `offline`.
- Publicação: 30 segundos.
- Identidade: derivada do identificador único do chip.

Exemplo:

```json
{"schema_version":1,"device_id":"esp32-A1B2C3D4E5F6","sensor":"DHT22","firmware_version":"1.0.0","temp":24.7,"umid":53.2,"ic":24.6}
```

## Comportamento em falhas

- O loop não fica preso aguardando Wi-Fi ou MQTT.
- Wi-Fi é tentado novamente a cada 10 s e MQTT a cada 5 s.
- Leitura inválida do DHT22 não é publicada.
- Não há armazenamento local: se a rede cair, aquela medição não é reenviada.
- QoS 0 foi escolhido pela simplicidade e pela repetição da telemetria a cada 30 s.

## Wokwi

O projeto contém a configuração do Wokwi, mas ainda não possui `diagram.json`. A simulação deve ser validada separadamente do hardware físico e precisa de um `config.hpp` apropriado à rede simulada.

Os antigos fluxos de aula foram removidos daqui. Os fluxos oficiais ficam em `node-red/` e `n8n/` na raiz do repositório.
