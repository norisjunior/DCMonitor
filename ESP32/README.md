# Firmware ESP32 — DCMonitor

Firmware didático para ESP32 DevKit com um DHT22 e um display OLED SSD1306. Lê temperatura e umidade, calcula o índice de calor, reporta a potência do sinal Wi-Fi, mostra as medições no display e publica via MQTT com TLS. Entre uma medição e outra a placa fica em deep sleep por 60 segundos.

O mesmo binário serve a toda a frota: nada no código identifica uma placa específica. O que é próprio de cada placa é a senha MQTT, gravada pela serial na memória não volátil (NVS) depois da gravação do firmware.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `src/ESP32DC.ino` | `struct`, coleta, Wi-Fi/MQTT, NTP, JSON e o ciclo completo em `setup()`, terminando em deep sleep |
| `src/DC_Ambiente.hpp` | Inicialização, leitura e índice de calor do DHT22 |
| `src/DC_Comunicacao.hpp` | Cliente TLS (`WiFiClientSecure`) e MQTT, senha carregada, identidade e composição dos tópicos |
| `src/DC_Credencial.hpp` | Leitura, validação e gravação da senha MQTT na NVS (`Preferences`, namespace `dcmonitor`) |
| `src/DC_Display.hpp` | OLED SSD1306: layout, cabeçalho com horário, caixas e formatação dos valores |
| `include/config.hpp` | Configuração local de rede, broker, GPIO, sono, limites de espera, NTP e versão |
| `include/ca_cert.hpp` | Certificado público da CA do DCMonitor, gerado por `scripts/gerar_certificados.sh` |

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

O horário (`HH:MM`, fuso `FUSO_HORARIO`) diz a quem olha a tela de quando é a medição. O display continua alimentado durante o deep sleep e mantém a última imagem; se a placa parar de acordar, o horário congelado denuncia que o valor está velho. `--:--` indica que o relógio ainda não foi sincronizado por NTP desde a energização. Sem credencial, o display mostra `Sem credencial` (veja "Provisionamento").

Se o DHT22 for o sensor avulso, use resistor pull-up de aproximadamente 10 kΩ entre VCC e DATA. Módulos prontos normalmente já possuem o resistor.

## Configuração

```bash
cp include/config.example.hpp include/config.hpp
```

Edite `include/config.hpp` com Wi-Fi, broker, GPIO, tempo de sono, servidor NTP e versão. Esse arquivo é ignorado pelo Git. A senha Wi-Fi encontrada no protótipo original deve ser considerada exposta e rotacionada.

- `MQTT_HOST`: nome ou IP do servidor que esteja no certificado do broker, por exemplo `10.32.8.115` ou `vplviot.ctn.fundacentro.intra`. Com outro endereço, a placa recusa a conexão TLS.
- `MQTT_PORT`: `8883`. A porta 1883 não existe mais.
- Não há usuário nem senha MQTT no `config.hpp`: `MQTT_USERNAME` e `MQTT_PASSWORD` saíram. O usuário é o `device_id`; a senha vem da serial.
- `NTP_SERVIDOR`: o servidor do DCMonitor, que serve hora às placas (chrony; veja `docs/DEPLOY_PROD.md`). A hora serve só ao display; o TLS não depende dela.

Como o `config.hpp` é local, uma atualização do repositório não muda a configuração nem a versão que a placa informa. Ao gravar o firmware 1.6.0, compare seu `config.hpp` com `config.example.hpp`: remova `MQTT_USERNAME` e `MQTT_PASSWORD` e ajuste `MQTT_PORT` para `8883`, `NTP_SERVIDOR` para o servidor do DCMonitor e `VERSAO_FIRMWARE` para `"1.6.0"`.

### Certificado da CA (`ca_cert.hpp`)

A placa só conversa com um broker cujo certificado foi assinado pela CA do DCMonitor. O certificado público dessa CA entra no firmware por `include/ca_cert.hpp`, gerado no servidor por `scripts/gerar_certificados.sh`. Copie o arquivo do servidor para `ESP32/include/` antes de compilar.

- Não é segredo: só a chave da CA é. Mesmo assim é ignorado pelo Git, porque é específico de cada instalação.
- É o mesmo para toda a frota.
- Renovar o certificado do servidor não muda o `ca_cert.hpp`. Só uma CA nova exige gerar outro e regravar todas as placas.
- `include/ca_cert.example.hpp` é um modelo que só serve para compilar (é o que `scripts/run_project_checks.sh` usa). Com ele, a placa não conecta.

## Compilar e gravar

```bash
pio run
pio run -t upload
pio device monitor
```

Monitor serial: 115200 baud. Com TLS, o firmware ocupa cerca de 74,5 % da flash.

Ao conectar ao Wi-Fi, o monitor serial mostra o endereço recebido, por exemplo:

```text
[INFO] Wi-Fi conectado em 1840 ms. IP: 10.32.8.120
```

Na lista de leases do DHCP a placa aparece pelo próprio `device_id`, e não pelo nome padrão do fabricante — útil quando há várias na mesma rede.

## Provisionamento

Uma placa nova, ou com a flash apagada, não tem senha MQTT. Nesse estado ela não lê o sensor, não conecta e não dorme: mostra `Sem credencial` no display e espera a senha pela serial. O watchdog fica desligado durante a espera.

1. Grave o firmware e abra o monitor serial (`pio device monitor`, 115200 baud). A placa imprime:

   ```text
   [CREDENCIAL] Este dispositivo ainda não tem senha MQTT.
   [CREDENCIAL] ID: esp32-18B4C0D8CBB0
   [CREDENCIAL] Gere a senha na página /admin/ do DCMonitor e cole aqui a linha indicada, no formato:
   credencial esp32-18B4C0D8CBB0 <senha>
   [CREDENCIAL] Tecle Enter para ver estas instruções de novo.
   ```

   Se o monitor foi aberto depois do boot, tecle Enter numa linha vazia: a placa repete o ID e as instruções.

2. Na página `https://SERVIDOR:1880/admin/`, no formulário "Placa nova: ID mostrado na serial", digite o ID e clique em "Gerar senha". A página só aceita IDs no formato do firmware, `esp32-` seguido de 12 dígitos hexadecimais maiúsculos.
3. A página mostra a linha `credencial <device_id> <senha>` uma única vez. Clique em "Copiar linha".
4. Cole a linha no monitor serial e tecle Enter. A placa confere o ID, grava a senha na NVS e reinicia:

   ```text
   [CREDENCIAL] Senha gravada. Reiniciando...
   ```

5. Em seguida ela conecta na 8883 e publica. Na página, a credencial aparece como `ativa desde <data>`.

Respostas da placa a uma linha errada:

| Mensagem | Causa |
|---|---|
| `Linha não reconhecida` | a linha não tem o formato `credencial <device_id> <senha>` |
| `A linha é do dispositivo X; este é Y.` | a senha foi gerada para outra placa |
| `Senha inválida ou falha ao gravar` | senha fora de 16 a 64 caracteres ASCII visíveis, ou erro na NVS |

Se a página for fechada antes de copiar a linha, gere de novo com "Trocar senha": a senha anterior deixa de valer.

### Trocar a senha

A placa só pede senha quando não tem nenhuma gravada. Para trocar:

1. Na página, clique em "Trocar senha" e confirme. A senha antiga deixa de valer na hora.
2. Apague a flash e grave de novo, o que zera a NVS:

   ```bash
   pio run -t erase && pio run -t upload
   ```

3. Cole a nova linha no monitor serial, como no provisionamento.

Para tirar uma placa de serviço, use "Revogar": ela perde o acesso ao broker imediatamente. Com a credencial recusada, a placa segue medindo e mostrando os valores no display e avisa no serial a cada ciclo:

```text
[WARN] O broker recusou a credencial desta placa. Gere nova senha em /admin/ e regrave: pio run -t erase && pio run -t upload.
```

## Horário e TLS

O mbedTLS do framework Arduino-ESP32 usado aqui é compilado sem verificação de datas (`CONFIG_MBEDTLS_HAVE_TIME_DATE` desligado). A placa confere a cadeia do certificado do broker e o nome do servidor, mas não as datas de validade. Por isso o TLS funciona mesmo sem NTP, e a placa nunca percebe um certificado do broker vencido, nem com NTP.

O NTP serve só ao horário do display. Enquanto a hora não foi sincronizada desde a energização, a placa consulta o NTP (`NTP_SERVIDOR`) a cada ciclo e o display mostra `--:--`; depois, a cada `CICLOS_ENTRE_SINCRONIZACOES`.

## Vários dispositivos

O firmware é o mesmo em todas as placas. O que as distingue vem do hardware:

| O que | Valor | Origem |
|---|---|---|
| `device_id` | `esp32-18B4C0D8CBB0` | `ESP.getEfuseMac()` |
| Tópicos MQTT | `fdctmon/{device_id}/data`, `/status` e `/cmd` (reservado) | derivados do `device_id` |
| Usuário e client-id MQTT | `{device_id}` | derivados do `device_id`; o papel `disp-{device_id}` do broker vale só para esse usuário |
| Senha MQTT | 32 caracteres | gerada em `/admin/`, colada na serial e gravada na NVS |
| Hostname na rede | `{device_id}` | `WiFi.setHostname()` |

Não há nada por dispositivo em `config.hpp`: gravar uma placa nova é compilar, enviar e colar a linha da credencial, sem editar arquivo nem controlar planilha de IDs. O client-id único importa — dois clientes MQTT com o mesmo id derrubam um ao outro em ciclo. O broker só deixa o usuário `{device_id}` publicar em `fdctmon/{device_id}/...` e descarta sem aviso o que vier fora desse ramo.

Nomes legíveis para o NOC — local e nome amigável — ficam no servidor, não no firmware: no cadastro de dispositivos (`https://SERVIDOR:1880/admin/`), que alimenta o Grafana, e no nome visível do host no Zabbix. Renomear um ponto de medição não exige regravar a placa.

## Ciclo com deep sleep

Todo o trabalho acontece em `setup()`; o despertar do deep sleep é um boot novo, então `loop()` nunca executa.

```text
acorda ─► senha na NVS? ── não ──► espera a credencial na serial ─► grava e reinicia
              │ sim
              ▼
         inicia Wi-Fi ─► lê DHT22 ─► aguarda Wi-Fi ─► NTP (se preciso)
      ─► MQTT/TLS: status "online" + telemetria ─► desconecta ─► display ─► dorme 60 s
```

| Parâmetro (`config.hpp`) | Padrão | Papel |
|---|---|---|
| `TEMPO_SONO_S` | 60 | Sono entre ciclos; o período real é o sono mais o tempo acordado (tipicamente 3 a 6 s) |
| `ATRASO_PRIMEIRA_MEDICAO_MS` | 2000 | Estabilização do DHT22, só na partida a frio |
| `TEMPO_MAXIMO_WIFI_MS` | 10000 | Limite para associar ao Wi-Fi, contado desde o boot |
| `TEMPO_MAXIMO_MQTT_S` | 5 | Limite da conexão, do handshake TLS e da resposta do broker |
| `TEMPO_MAXIMO_NTP_MS` | 3000 | Limite para a resposta do NTP |
| `LIMITE_CICLO_ACORDADO_S` | 30 | Watchdog: ciclo acordado acima disso reinicia a placa |
| `CICLOS_ENTRE_SINCRONIZACOES` | 60 | O relógio RTC segue contando no sono; o NTP é consultado a cada ciclo até a primeira sincronização e depois a cada 60 ciclos (~1 h) |

O monitor serial mostra o boot completo só na partida a frio. Nos despertares aparecem apenas as linhas do ciclo, terminando em `[INFO] Ciclo concluído em ... ms; dormindo 60 s.`

## MQTT

- Conexão: `MQTT_HOST:8883` com TLS (`WiFiClientSecure` e `setCACert`), usuário = `device_id`, senha lida da NVS. A placa confere a cadeia pela CA do `ca_cert.hpp` e o nome do servidor antes de enviar a senha.
- Telemetria: `fdctmon/{device_id}/data`, QoS 0, não retida. Até o firmware 1.4.0 o tópico era `.../attrs`, que o broker agora nega.
- Estado: `fdctmon/{device_id}/status`, retido; `online` a cada despertar. A sessão termina com `DISCONNECT` limpo, então o Last Will `offline` só é publicado se a placa falhar no meio de um ciclo. Placa desligada ou sem rede é detectada pela falta de telemetria (gatilho `nodata` no Zabbix), não por este tópico.
- Comandos: `fdctmon/{device_id}/cmd` está reservado e liberado para leitura no papel da placa, mas o firmware ainda não assina. Com deep sleep, um comando futuro terá de ser mensagem retida, lida pela placa ao acordar.
- Publicação: uma por ciclo, a cada ~60 segundos (cerca de 1.400 mensagens/dia por placa).
- Identidade: derivada do identificador único do chip.
- Diagnóstico de enlace: `rssi` em dBm, lido de `WiFi.RSSI()` no instante da publicação. Acima de -70 dBm o sinal é bom; abaixo de -80 dBm há risco de desconexão.

Exemplo:

```json
{"schema_version":1,"device_id":"esp32-A1B2C3D4E5F6","sensor":"DHT22","firmware_version":"1.6.0","temp":24.7,"umid":53.2,"ic":24.6,"rssi":-67}
```

## Comportamento em falhas

- Cada espera tem limite (Wi-Fi 10 s desde o boot, MQTT 5 s, NTP 3 s). Estourou, a placa dorme e tenta de novo no próximo ciclo.
- O watchdog reinicia a placa se o ciclo acordado passar de 30 s; o display volta a `Iniciando...` em vez de manter uma leitura velha com aparência de atual.
- Leitura inválida do DHT22 ganha uma segunda tentativa após 2,1 s. Persistindo, não é publicada e o display mostra `Falha no DHT22` com o horário.
- Sem NTP, o relógio interno continua valendo; sem nenhuma sincronização desde a energização, o horário aparece como `--:--`. A publicação não depende do NTP.
- Credencial recusada pelo broker (senha trocada ou revogada): aviso no serial a cada ciclo; o display continua mostrando as medições.
- Certificado do broker não assinado pela CA do `ca_cert.hpp`, ou sem o `MQTT_HOST` entre os nomes: a conexão TLS falha e a placa tenta de novo no próximo ciclo.
- O display acompanha o sensor mesmo sem Wi-Fi ou MQTT; só a publicação depende da rede.
- Display ausente ou com endereço I2C diferente apenas gera aviso no serial; o firmware segue publicando.
- Não há armazenamento local: se a rede cair, aquela medição não é reenviada.
- QoS 0 foi escolhido pela simplicidade e pela repetição da telemetria a cada ciclo.

## Wokwi

O projeto contém a configuração do Wokwi, mas ainda não possui `diagram.json`. A simulação deve ser validada separadamente do hardware físico e precisa de um `config.hpp` apropriado à rede simulada, de um `ca_cert.hpp` e de uma senha colada na serial.

Os antigos fluxos de aula foram removidos daqui. Os fluxos oficiais ficam em `node-red/` e `n8n/` na raiz do repositório.
