# Firmware ESP32 — DCMonitor

Firmware didático para ESP32 DevKit com um DHT22 e um display OLED SSD1306. Lê temperatura e umidade, calcula o índice de calor, reporta a potência do sinal Wi-Fi, mostra as medições no display e publica via MQTT. Entre uma medição e outra a placa fica em deep sleep por 60 segundos.

O mesmo binário serve a toda a frota: nada no código identifica uma placa específica.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `src/ESP32DC.ino` | `struct`, coleta, Wi-Fi/MQTT, NTP, JSON e o ciclo completo em `setup()`, terminando em deep sleep |
| `src/DC_Ambiente.hpp` | Inicialização, leitura e índice de calor do DHT22 |
| `src/DC_Comunicacao.hpp` | Clientes Wi-Fi/MQTT, identidade e composição dos tópicos |
| `src/DC_Display.hpp` | OLED SSD1306: layout, cabeçalho com horário, caixas e formatação dos valores |
| `include/config.hpp` | Configuração local de rede, GPIO, sono, limites de espera, NTP e versão |

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

O módulo usado é o bicolor: as 16 primeiras linhas são amarelas e o restante azul. O layout reserva a faixa amarela para o cabeçalho de duas linhas — `FUNDACENTRO` com o horário da medição à direita, e o `device_id` — e inicia as caixas em `y = 17`, de modo que bordas e rótulos não fiquem partidos entre as duas cores. Trocar por um painel monocromático não exige alteração — apenas a faixa superior deixa de ser amarela.

O `device_id` na segunda linha cabe com folga: 18 caracteres ocupam 108 dos 128 px. É o mesmo texto do tópico MQTT, da tag do InfluxDB e do host no Zabbix, então dá para ir até uma placa no rack e saber qual série ela alimenta.

O horário (`HH:MM`, fuso `FUSO_HORARIO`) diz a quem olha a tela de quando é a medição. O display continua alimentado durante o deep sleep e mantém a última imagem; se a placa parar de acordar, o horário congelado denuncia que o valor está velho. `--:--` indica que o relógio ainda não foi sincronizado por NTP desde a energização.

Se o DHT22 for o sensor avulso, use resistor pull-up de aproximadamente 10 kΩ entre VCC e DATA. Módulos prontos normalmente já possuem o resistor.

## Configuração

```bash
cp include/config.example.hpp include/config.hpp
```

Edite `include/config.hpp` com Wi-Fi, IP do servidor, credenciais MQTT, GPIO, tempo de sono, servidor NTP e versão. Em rede sem saída para a internet, aponte `NTP_SERVIDOR` para o NTP interno. Esse arquivo é ignorado pelo Git. A senha encontrada no protótipo original deve ser considerada exposta e rotacionada.

Como o `config.hpp` é local, uma atualização do repositório não muda a versão que a placa informa. Ao gravar o firmware 1.5.0, ajuste `VERSAO_FIRMWARE` para `"1.5.0"` no seu `config.hpp`, conforme `config.example.hpp`.

## Compilar e gravar

```bash
pio run
pio run -t upload
pio device monitor
```

Monitor serial: 115200 baud.

Ao conectar ao Wi-Fi, o monitor serial mostra o endereço recebido, por exemplo:

```text
[INFO] Wi-Fi conectado em 1840 ms. IP: 10.32.8.120
```

Na lista de leases do DHCP a placa aparece pelo próprio `device_id`, e não pelo nome padrão do fabricante — útil quando há várias na mesma rede.

## Vários dispositivos

O firmware é o mesmo em todas as placas. O que as distingue vem do hardware:

| O que | Valor | Origem |
|---|---|---|
| `device_id` | `esp32-18B4C0D8CBB0` | `ESP.getEfuseMac()` |
| Tópicos MQTT | `fdctmon/{device_id}/data`, `/status` e `/cmd` (reservado) | derivados do `device_id` |
| Client-id MQTT | `{device_id}` | derivado do `device_id`; a ACL do broker depende dele |
| Hostname na rede | `{device_id}` | `WiFi.setHostname()` |

Não há nada por dispositivo em `config.hpp`: gravar uma placa nova é compilar e enviar, sem editar arquivo nem controlar planilha de IDs. O client-id único importa — dois clientes MQTT com o mesmo id derrubam um ao outro em ciclo. Ele também precisa ser o `device_id`: a ACL do Mosquitto só deixa cada cliente publicar em `fdctmon/{client-id}/...` e descarta sem aviso o que vier fora desse ramo.

Nomes legíveis para o NOC — local e nome amigável — ficam no servidor, não no firmware: no cadastro de dispositivos (`http://SERVIDOR:1880/admin/`), que alimenta o Grafana, e no nome visível do host no Zabbix. Renomear um ponto de medição não exige regravar a placa.

## Ciclo com deep sleep

Todo o trabalho acontece em `setup()`; o despertar do deep sleep é um boot novo, então `loop()` nunca executa.

```text
acorda ─► inicia Wi-Fi ─► lê DHT22 ─► aguarda Wi-Fi ─► NTP (se preciso)
      ─► MQTT: status "online" + telemetria ─► desconecta ─► display ─► dorme 60 s
```

| Parâmetro (`config.hpp`) | Padrão | Papel |
|---|---|---|
| `TEMPO_SONO_S` | 60 | Sono entre ciclos; o período real é o sono mais o tempo acordado (tipicamente 3 a 6 s) |
| `ATRASO_PRIMEIRA_MEDICAO_MS` | 2000 | Estabilização do DHT22, só na partida a frio |
| `TEMPO_MAXIMO_WIFI_MS` | 10000 | Limite para associar ao Wi-Fi, contado desde o boot |
| `TEMPO_MAXIMO_MQTT_S` | 5 | Limite de resposta do broker |
| `TEMPO_MAXIMO_NTP_MS` | 3000 | Limite para a resposta do NTP |
| `LIMITE_CICLO_ACORDADO_S` | 30 | Watchdog: ciclo acordado acima disso reinicia a placa |
| `CICLOS_ENTRE_SINCRONIZACOES` | 60 | O relógio RTC segue contando no sono; o NTP é consultado na primeira vez e depois a cada 60 ciclos (~1 h) |

O monitor serial mostra o boot completo só na partida a frio. Nos despertares aparecem apenas as linhas do ciclo, terminando em `[INFO] Ciclo concluído em ... ms; dormindo 60 s.`

## MQTT

- Telemetria: `fdctmon/{device_id}/data`, QoS 0, não retida. Até o firmware 1.4.0 o tópico era `.../attrs`, que o broker agora nega.
- Estado: `fdctmon/{device_id}/status`, retido; `online` a cada despertar. A sessão termina com `DISCONNECT` limpo, então o Last Will `offline` só é publicado se a placa falhar no meio de um ciclo. Placa desligada ou sem rede é detectada pela falta de telemetria (gatilho `nodata` no Zabbix), não por este tópico.
- Comandos: `fdctmon/{device_id}/cmd` está reservado e liberado para leitura na ACL, mas o firmware ainda não assina. Com deep sleep, um comando futuro terá de ser mensagem retida, lida pela placa ao acordar.
- Publicação: uma por ciclo, a cada ~60 segundos (cerca de 1.400 mensagens/dia por placa).
- Identidade: derivada do identificador único do chip.
- Diagnóstico de enlace: `rssi` em dBm, lido de `WiFi.RSSI()` no instante da publicação. Acima de -70 dBm o sinal é bom; abaixo de -80 dBm há risco de desconexão.

Exemplo:

```json
{"schema_version":1,"device_id":"esp32-A1B2C3D4E5F6","sensor":"DHT22","firmware_version":"1.5.0","temp":24.7,"umid":53.2,"ic":24.6,"rssi":-67}
```

## Comportamento em falhas

- Cada espera tem limite (Wi-Fi 10 s desde o boot, MQTT 5 s, NTP 3 s). Estourou, a placa dorme e tenta de novo no próximo ciclo.
- O watchdog reinicia a placa se o ciclo acordado passar de 30 s; o display volta a `Iniciando...` em vez de manter uma leitura velha com aparência de atual.
- Leitura inválida do DHT22 ganha uma segunda tentativa após 2,1 s. Persistindo, não é publicada e o display mostra `Falha no DHT22` com o horário.
- Sem NTP, o relógio interno continua valendo; sem nenhuma sincronização desde a energização, o horário aparece como `--:--`.
- O display acompanha o sensor mesmo sem Wi-Fi ou MQTT; só a publicação depende da rede.
- Display ausente ou com endereço I2C diferente apenas gera aviso no serial; o firmware segue publicando.
- Não há armazenamento local: se a rede cair, aquela medição não é reenviada.
- QoS 0 foi escolhido pela simplicidade e pela repetição da telemetria a cada ciclo.

## Wokwi

O projeto contém a configuração do Wokwi, mas ainda não possui `diagram.json`. A simulação deve ser validada separadamente do hardware físico e precisa de um `config.hpp` apropriado à rede simulada.

Os antigos fluxos de aula foram removidos daqui. Os fluxos oficiais ficam em `node-red/` e `n8n/` na raiz do repositório.
