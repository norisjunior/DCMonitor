# Firmware ESP32 — DCMonitor

Firmware didático para ESP32 DevKit com um DHT22 e um display OLED SSD1306. Lê temperatura e umidade, calcula o índice de calor, reporta a potência do sinal Wi-Fi, mostra as medições no display e publica via MQTT a cada 30 segundos.

O mesmo binário serve a toda a frota: nada no código identifica uma placa específica.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `src/ESP32DC.ino` | `struct`, coleta, Wi-Fi/MQTT, JSON e fluxo de `setup()`/`loop()` |
| `src/DC_Ambiente.hpp` | Inicialização, leitura e índice de calor do DHT22 |
| `src/DC_Comunicacao.hpp` | Clientes Wi-Fi/MQTT, identidade e composição dos tópicos |
| `src/DC_Display.hpp` | OLED SSD1306: layout, caixas e formatação dos valores |
| `include/config.hpp` | Configuração local de rede, GPIO, intervalo e versão |

O `.ino` conta todo o fluxo de execução. O header de comunicação mantém apenas o estado compartilhado e a identidade; não inicializa conexões nem publica JSON. Não há um módulo de dados porque a única `struct` pertence à aplicação.

## Hardware

| DHT22 | ESP32 |
|---|---|
| VCC | 3,3 V |
| DATA | GPIO 25 |
| GND | GND |

| OLED SSD1306 128x64 | ESP32 |
|---|---|
| VCC | 3,3 V |
| SCL | GPIO 26 |
| SDA | GPIO 27 |
| GND | GND |

Endereço I2C padrão do módulo: `0x3C`. Alguns módulos usam `0x3D`; nesse caso ajuste `ENDERECO_OLED` no `config.hpp`. Os pinos do display não podem coincidir com `PINO_DHT`.

O módulo usado é o bicolor: as 16 primeiras linhas são amarelas e o restante azul. O layout reserva a faixa amarela para o cabeçalho de duas linhas — `FUNDACENTRO` e o `device_id` — e inicia as caixas em `y = 17`, de modo que bordas e rótulos não fiquem partidos entre as duas cores. Trocar por um painel monocromático não exige alteração — apenas a faixa superior deixa de ser amarela.

O `device_id` na segunda linha cabe com folga: 18 caracteres ocupam 108 dos 128 px. É o mesmo texto do tópico MQTT, da tag do InfluxDB e do host no Zabbix, então dá para ir até uma placa no rack e saber qual série ela alimenta.

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

Na lista de leases do DHCP a placa aparece pelo próprio `device_id`, e não pelo nome padrão do fabricante — útil quando há várias na mesma rede.

## Vários dispositivos

O firmware é o mesmo em todas as placas. O que as distingue vem do hardware:

| O que | Valor | Origem |
|---|---|---|
| `device_id` | `esp32-18B4C0D8CBB0` | `ESP.getEfuseMac()` |
| Tópicos MQTT | `fdctmon/{device_id}/attrs` e `/status` | derivados do `device_id` |
| Client-id MQTT | `{device_id}` | derivado do `device_id` |
| Hostname na rede | `{device_id}` | `WiFi.setHostname()` |

Não há nada por dispositivo em `config.hpp`: gravar uma placa nova é compilar e enviar, sem editar arquivo nem controlar planilha de IDs. O client-id único importa — dois clientes MQTT com o mesmo id derrubam um ao outro em ciclo.

Nomes legíveis para o NOC — sala, rack, andar — ficam no servidor, não no firmware: nome visível do host no Zabbix e rótulo no Grafana. Renomear um ponto de medição não exige regravar a placa.

## MQTT

- Telemetria: `fdctmon/{device_id}/attrs`, QoS 0, não retida.
- Estado: `fdctmon/{device_id}/status`, retido; `online` ou Last Will `offline`.
- Publicação: 30 segundos.
- Identidade: derivada do identificador único do chip.
- Diagnóstico de enlace: `rssi` em dBm, lido de `WiFi.RSSI()` no instante da publicação. Acima de -70 dBm o sinal é bom; abaixo de -80 dBm há risco de desconexão.

Exemplo:

```json
{"schema_version":1,"device_id":"esp32-A1B2C3D4E5F6","sensor":"DHT22","firmware_version":"1.3.0","temp":24.7,"umid":53.2,"ic":24.6,"rssi":-67}
```

## Comportamento em falhas

- O loop não fica preso aguardando Wi-Fi ou MQTT.
- `WiFi.begin()` inicia a conexão uma única vez; falhas de Wi-Fi usam
  `WiFi.reconnect()` a cada 10 s, sem reiniciar uma tentativa ainda em andamento.
- MQTT é tentado novamente a cada 5 s.
- Leitura inválida do DHT22 não é publicada nem atualiza o display.
- O display acompanha o sensor mesmo sem Wi-Fi ou MQTT; só a publicação depende da rede.
- Display ausente ou com endereço I2C diferente apenas gera aviso no serial; o firmware segue publicando.
- Não há armazenamento local: se a rede cair, aquela medição não é reenviada.
- QoS 0 foi escolhido pela simplicidade e pela repetição da telemetria a cada 30 s.

## Wokwi

O projeto contém a configuração do Wokwi, mas ainda não possui `diagram.json`. A simulação deve ser validada separadamente do hardware físico e precisa de um `config.hpp` apropriado à rede simulada.

Os antigos fluxos de aula foram removidos daqui. Os fluxos oficiais ficam em `node-red/` e `n8n/` na raiz do repositório.
