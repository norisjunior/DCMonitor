#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_sleep.h>
#include <esp_sntp.h>
#include <esp_task_wdt.h>
#include <time.h>

#include "config.hpp"
#include "DC_Ambiente.hpp"
#include "DC_Comunicacao.hpp"
#include "DC_Display.hpp"

// Ciclo do firmware com deep sleep. Tudo acontece em setup(); ao final a placa
// dorme e o despertar e um novo boot, entao loop() nunca chega a executar:
//
//   acorda -> inicia Wi-Fi -> le DHT22 -> aguarda Wi-Fi -> NTP (se preciso)
//          -> MQTT: status "online" + telemetria -> desconecta -> display -> dorme

struct LeituraAmbiente {
  float temperatura;
  float umidade;
  float indiceCalor;
  bool valida;
};

// A RAM comum e apagada a cada despertar; RTC_DATA_ATTR sobrevive ao sono.
RTC_DATA_ATTR uint32_t ciclosDesdeSincronizacao = 0;

// Qualquer instante antes disso indica relogio nunca sincronizado.
constexpr time_t INICIO_HORA_VALIDA = 1700000000;  // 2023-11-14

// Folga para o TCP entregar os ultimos pacotes antes de desligar o radio.
constexpr unsigned long ESPERA_ENVIO_MS = 100;

bool horaValida() {
  return time(nullptr) > INICIO_HORA_VALIDA;
}

LeituraAmbiente coletarLeitura() {
  float temperatura = Ambiente::lerTemperatura();
  float umidade = Ambiente::lerUmidade();
  bool valida = Ambiente::leituraValida(temperatura, umidade);
  float indiceCalor = valida
      ? Ambiente::calcularIndiceCalor(temperatura, umidade)
      : NAN;

  return {temperatura, umidade, indiceCalor, valida};
}

// Com um ciclo por minuto, perder uma leitura custa 60 s de lacuna. Uma segunda
// tentativa respeita o intervalo minimo do DHT22 e evita a maioria das falhas
// esporadicas de temporizacao do sensor.
LeituraAmbiente coletarLeituraComRetentativa() {
  LeituraAmbiente leitura = coletarLeitura();

  if (!leitura.valida) {
    Serial.println("[WARN] Leitura inválida do DHT22; nova tentativa.");
    delay(Config::INTERVALO_MINIMO_DHT_MS);
    leitura = coletarLeitura();
  }

  return leitura;
}

void armarWatchdog() {
  // Nenhuma etapa alimenta o watchdog: se o ciclo inteiro passar do limite,
  // a placa reinicia em vez de ficar acordada mostrando uma leitura velha.
  esp_task_wdt_init(Config::LIMITE_CICLO_ACORDADO_S, true);
  esp_task_wdt_add(nullptr);
}

void iniciarWifi() {
  // Com um begin() por minuto, nao regravar as credenciais na flash (NVS).
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);

  // O hostname vai ao DHCP entre o modo e o begin. Com varios ESP32 na rede,
  // cada placa aparece na lista de leases pelo proprio device_id em vez do
  // nome padrao do fabricante, repetido em todas.
  WiFi.setHostname(Comunicacao::idDispositivo);

  Serial.printf("[INFO] Conectando ao Wi-Fi %s...\n", Config::WIFI_SSID);
  WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD);
}

// A associacao corre em segundo plano desde iniciarWifi(); aqui so se espera
// o restante. O limite conta desde o boot, porque o radio ja estava tentando
// enquanto o sensor era lido.
bool aguardarWifi() {
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() >= Config::TEMPO_MAXIMO_WIFI_MS) {
      Serial.printf("[WARN] Wi-Fi indisponível; status=%d. Nova tentativa "
                    "no próximo ciclo.\n", WiFi.status());
      return false;
    }
    delay(50);
  }

  Serial.printf("[INFO] Wi-Fi conectado em %lu ms. IP: %s\n", millis(),
                WiFi.localIP().toString().c_str());
  return true;
}

// O relogio RTC continua contando durante o deep sleep, entao o NTP so e
// consultado na primeira vez e depois a cada CICLOS_ENTRE_SINCRONIZACOES.
void sincronizarHorario() {
  if (horaValida() &&
      ciclosDesdeSincronizacao < Config::CICLOS_ENTRE_SINCRONIZACOES) {
    ciclosDesdeSincronizacao++;
    return;
  }

  sntp_set_sync_status(SNTP_SYNC_STATUS_RESET);
  configTzTime(Config::FUSO_HORARIO, Config::NTP_SERVIDOR);

  const unsigned long inicio = millis();
  while (sntp_get_sync_status() != SNTP_SYNC_STATUS_COMPLETED) {
    if (millis() - inicio >= Config::TEMPO_MAXIMO_NTP_MS) {
      // O contador nao zera: o proximo ciclo tenta de novo.
      Serial.println("[WARN] NTP sem resposta; mantendo o relógio interno.");
      return;
    }
    delay(50);
  }

  ciclosDesdeSincronizacao = 0;
  Serial.println("[INFO] Horário sincronizado por NTP.");
}

bool publicarLeitura(const LeituraAmbiente &leitura) {
  JsonDocument payload;
  payload["schema_version"] = 1;
  payload["device_id"] = Comunicacao::idDispositivo;
  payload["sensor"] = "DHT22";
  payload["firmware_version"] = Config::VERSAO_FIRMWARE;
  payload["temp"] = roundf(leitura.temperatura * 10.0F) / 10.0F;
  payload["umid"] = roundf(leitura.umidade * 10.0F) / 10.0F;
  payload["ic"] = roundf(leitura.indiceCalor * 10.0F) / 10.0F;
  payload["rssi"] = WiFi.RSSI();

  char mensagem[256];
  const size_t tamanho = serializeJson(payload, mensagem, sizeof(mensagem));

  if (tamanho == 0 || tamanho >= sizeof(mensagem)) {
    Serial.println("[ERROR] Payload MQTT excedeu o buffer.");
    return false;
  }

  if (!Comunicacao::clienteMqtt.publish(
          Comunicacao::topicoTelemetria, mensagem, false)) {
    Serial.println("[WARN] Falha ao publicar; nova tentativa no próximo ciclo.");
    return false;
  }

  Serial.printf("[INFO] Publicado em %s: %s\n",
                Comunicacao::topicoTelemetria, mensagem);
  return true;
}

// Uma sessao MQTT por ciclo: conecta, anuncia, publica e desconecta.
bool publicarCiclo(const LeituraAmbiente &leitura) {
  Comunicacao::clienteMqtt.setServer(Config::MQTT_HOST, Config::MQTT_PORT);
  Comunicacao::clienteMqtt.setBufferSize(256);
  Comunicacao::clienteMqtt.setSocketTimeout(Config::TEMPO_MAXIMO_MQTT_S);

  Serial.printf("[INFO] Conectando ao MQTT %s:%u...\n",
                Config::MQTT_HOST, Config::MQTT_PORT);

  // O Last Will "offline" continua registrado: so e publicado se a sessao
  // cair sem DISCONNECT, isto e, se a placa falhar no meio do ciclo.
  const bool conectou = Comunicacao::clienteMqtt.connect(
      Comunicacao::idDispositivo,
      Config::MQTT_USERNAME,
      Config::MQTT_PASSWORD,
      Comunicacao::topicoStatus,
      1,
      true,
      "offline");

  if (!conectou) {
    Serial.printf("[WARN] MQTT indisponível, código=%d\n",
                  Comunicacao::clienteMqtt.state());
    return false;
  }

  Comunicacao::clienteMqtt.publish(Comunicacao::topicoStatus, "online", true);

  bool publicou = false;
  if (leitura.valida) {
    publicou = publicarLeitura(leitura);
  }

  // Desconexao limpa: o broker descarta o Last Will e o status retido segue
  // "online". Placa sem energia ou sem rede e detectada pela falta de
  // telemetria (nodata no Zabbix), nao por este topico.
  Comunicacao::clienteMqtt.loop();
  delay(ESPERA_ENVIO_MS);
  Comunicacao::clienteMqtt.disconnect();
  delay(ESPERA_ENVIO_MS);

  return publicou;
}

void formatarHorario(char *destino, size_t tamanho) {
  if (!horaValida()) {
    snprintf(destino, tamanho, "--:--");
    return;
  }

  const time_t agora = time(nullptr);
  struct tm local;
  localtime_r(&agora, &local);
  strftime(destino, tamanho, "%H:%M", &local);
}

[[noreturn]] void dormir() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  Serial.printf("[INFO] Ciclo concluído em %lu ms; dormindo %lu s.\n",
                millis(), static_cast<unsigned long>(Config::TEMPO_SONO_S));
  Serial.flush();

  esp_sleep_enable_timer_wakeup(
      static_cast<uint64_t>(Config::TEMPO_SONO_S) * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  armarWatchdog();

  const bool despertouDoSono =
      esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;

  // O fuso vive em variavel de ambiente na RAM e se perde a cada despertar;
  // o relogio em si fica no RTC e nao precisa de rede para continuar valido.
  setenv("TZ", Config::FUSO_HORARIO, 1);
  tzset();

  // A identidade vem primeiro: display, topicos MQTT, client-id e hostname de
  // rede usam o mesmo identificador derivado do chip.
  Comunicacao::configurarIdentidade();
  Display::definirIdentificador(Comunicacao::idDispositivo);

  Ambiente::inicializar(Config::PINO_DHT);

  // No despertar a tela segue mostrando a ultima leitura ate ser redesenhada;
  // so a partida a frio (energizacao ou reinicio pelo watchdog) avisa o boot.
  if (!Display::inicializar(Config::PINO_OLED_SDA, Config::PINO_OLED_SCL,
                            Config::ENDERECO_OLED)) {
    Serial.println("[WARN] SSD1306 não encontrado; seguindo sem display.");
  } else if (!despertouDoSono) {
    Display::mostrarMensagem("Iniciando...");
  }

  if (!despertouDoSono) {
    Serial.printf("\n[INFO] DCMonitor %s iniciado; motivo do reset=%d.\n",
                  Config::VERSAO_FIRMWARE, esp_reset_reason());
    Serial.printf("[INFO] Dispositivo: %s | DHT22: GPIO %u\n",
                  Comunicacao::idDispositivo, Config::PINO_DHT);
  }

  // O Wi-Fi associa em segundo plano enquanto o sensor e lido.
  iniciarWifi();

  if (!despertouDoSono) {
    delay(Config::ATRASO_PRIMEIRA_MEDICAO_MS);
  }

  const LeituraAmbiente leitura = coletarLeituraComRetentativa();
  if (!leitura.valida) {
    Serial.println("[WARN] Leitura inválida do DHT22; publicação ignorada.");
  }

  if (aguardarWifi()) {
    sincronizarHorario();
    publicarCiclo(leitura);
  }

  // O horario mostra a quem olha a tela de quando e a medicao. Se a placa
  // parar de acordar, a hora congelada denuncia que o valor esta velho.
  char horario[6];
  formatarHorario(horario, sizeof(horario));
  Display::definirHorario(horario);

  if (leitura.valida) {
    Display::mostrarAmbiente(leitura.temperatura, leitura.umidade);
  } else {
    Display::mostrarMensagem("Falha no DHT22");
  }

  dormir();
}

void loop() {
  // Nunca executa: setup() termina sempre em deep sleep.
}
