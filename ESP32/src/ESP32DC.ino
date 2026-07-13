#include <Arduino.h>
#include <ArduinoJson.h>

#include "config.hpp"
#include "DC_Ambiente.hpp"
#include "DC_Comunicacao.hpp"

struct LeituraAmbiente {
  float temperatura;
  float umidade;
  float indiceCalor;
  bool valida;
};

unsigned long ultimaPublicacao = 0;
unsigned long ultimaTentativaWifi = 0;
unsigned long ultimaTentativaMqtt = 0;
bool wifiEstavaConectado = false;

LeituraAmbiente coletarLeitura() {
  float temperatura = Ambiente::lerTemperatura();
  float umidade = Ambiente::lerUmidade();
  bool valida = Ambiente::leituraValida(temperatura, umidade);
  float indiceCalor = valida
      ? Ambiente::calcularIndiceCalor(temperatura, umidade)
      : NAN;

  return {temperatura, umidade, indiceCalor, valida};
}

void inicializarComunicacao() {
  Comunicacao::configurarIdentidade();

  WiFi.mode(WIFI_STA);
  Serial.printf("[INFO] Conectando ao Wi-Fi %s...\n", Config::WIFI_SSID);
  WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD);

  Comunicacao::clienteMqtt.setServer(Config::MQTT_HOST, Config::MQTT_PORT);
  Comunicacao::clienteMqtt.setBufferSize(256);
  Comunicacao::clienteMqtt.setKeepAlive(60);

  ultimaTentativaWifi = millis();
  ultimaTentativaMqtt = millis() - Config::INTERVALO_TENTATIVA_MQTT_MS;

  Serial.printf("[INFO] Dispositivo: %s | DHT22: GPIO %u\n",
                Comunicacao::idDispositivo, Config::PINO_DHT);
}

void manterConexoes() {
  const unsigned long agora = millis();
  const wl_status_t estadoWifi = WiFi.status();

  if (estadoWifi != WL_CONNECTED) {
    wifiEstavaConectado = false;

    const bool conexaoFalhou =
        estadoWifi == WL_DISCONNECTED ||
        estadoWifi == WL_CONNECTION_LOST ||
        estadoWifi == WL_CONNECT_FAILED ||
        estadoWifi == WL_NO_SSID_AVAIL;

    if (conexaoFalhou &&
        agora - ultimaTentativaWifi >= Config::INTERVALO_TENTATIVA_WIFI_MS) {
      ultimaTentativaWifi = agora;
      Serial.println("[INFO] Reconectando ao Wi-Fi...");

      if (!WiFi.reconnect()) {
        Serial.println("[WARN] Não foi possível reiniciar a conexão Wi-Fi.");
      }
    }
    return;
  }

  if (!wifiEstavaConectado) {
    wifiEstavaConectado = true;
    ultimaTentativaMqtt = agora - Config::INTERVALO_TENTATIVA_MQTT_MS;
    Serial.printf("[INFO] Wi-Fi conectado. IP: %s\n",
                  WiFi.localIP().toString().c_str());
  }

  if (!Comunicacao::clienteMqtt.connected() &&
      agora - ultimaTentativaMqtt >= Config::INTERVALO_TENTATIVA_MQTT_MS) {
    ultimaTentativaMqtt = agora;
    Serial.printf("[INFO] Conectando ao MQTT %s:%u...\n",
                  Config::MQTT_HOST, Config::MQTT_PORT);

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
    } else {
      Comunicacao::clienteMqtt.publish(
          Comunicacao::topicoStatus, "online", true);
      Serial.printf("[INFO] MQTT conectado; tópico=%s\n",
                    Comunicacao::topicoTelemetria);
    }
  }

  Comunicacao::clienteMqtt.loop();
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

void setup() {
  Serial.begin(115200);

  Ambiente::inicializar(Config::PINO_DHT);
  inicializarComunicacao();

  ultimaPublicacao = millis();
  Serial.println("\n[INFO] DCMonitor iniciado.");
}

void loop() {
  manterConexoes();
  const unsigned long agora = millis();

  if (!Comunicacao::clienteMqtt.connected() ||
      agora - ultimaPublicacao < Config::INTERVALO_PUBLICACAO_MS) {
    return;
  }

  ultimaPublicacao = agora;
  LeituraAmbiente leitura = coletarLeitura();

  if (!leitura.valida) {
    Serial.println("[WARN] Leitura inválida do DHT22; publicação ignorada.");
    return;
  }

  publicarLeitura(leitura);
}
