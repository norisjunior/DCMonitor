#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "config.hpp"

namespace Comunicacao {

constexpr unsigned long INTERVALO_TENTATIVA_WIFI_MS = 10000;
constexpr unsigned long INTERVALO_TENTATIVA_MQTT_MS = 5000;

WiFiClient clienteWifi;
PubSubClient clienteMqtt(clienteWifi);

char idDispositivo[24];
char topicoTelemetria[64];
char topicoStatus[64];

unsigned long ultimaTentativaWifi = 0;
unsigned long ultimaTentativaMqtt = 0;

void configurarIdentidade() {
  const uint64_t chipId = ESP.getEfuseMac();

  snprintf(idDispositivo, sizeof(idDispositivo), "esp32-%04X%08X",
           static_cast<uint16_t>(chipId >> 32),
           static_cast<uint32_t>(chipId));

  snprintf(topicoTelemetria, sizeof(topicoTelemetria),
           "fdctmon/%s/attrs", idDispositivo);

  snprintf(topicoStatus, sizeof(topicoStatus),
           "fdctmon/%s/status", idDispositivo);
}

void manterWifi(unsigned long agora) {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (agora - ultimaTentativaWifi < INTERVALO_TENTATIVA_WIFI_MS) {
    return;
  }

  ultimaTentativaWifi = agora;
  Serial.printf("[INFO] Conectando ao Wi-Fi %s...\n", Config::WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD);
}

void manterMqtt(unsigned long agora) {
  if (WiFi.status() != WL_CONNECTED || clienteMqtt.connected()) {
    return;
  }

  if (agora - ultimaTentativaMqtt < INTERVALO_TENTATIVA_MQTT_MS) {
    return;
  }

  ultimaTentativaMqtt = agora;
  Serial.printf("[INFO] Conectando ao MQTT %s:%u...\n",
                Config::MQTT_HOST, Config::MQTT_PORT);

  const bool conectou = clienteMqtt.connect(
      idDispositivo,
      Config::MQTT_USERNAME,
      Config::MQTT_PASSWORD,
      topicoStatus,
      1,
      true,
      "offline");

  if (!conectou) {
    Serial.printf("[WARN] MQTT indisponível, código=%d\n",
                  clienteMqtt.state());
    return;
  }

  clienteMqtt.publish(topicoStatus, "online", true);
  Serial.printf("[INFO] MQTT conectado; tópico=%s\n", topicoTelemetria);
}

void inicializar() {
  configurarIdentidade();

  clienteMqtt.setServer(Config::MQTT_HOST, Config::MQTT_PORT);
  clienteMqtt.setBufferSize(256);
  clienteMqtt.setKeepAlive(60);

  ultimaTentativaWifi = millis() - INTERVALO_TENTATIVA_WIFI_MS;
  ultimaTentativaMqtt = millis() - INTERVALO_TENTATIVA_MQTT_MS;

  Serial.printf("[INFO] Dispositivo: %s | DHT22: GPIO %u\n",
                idDispositivo, Config::PINO_DHT);
}

void manter() {
  const unsigned long agora = millis();

  manterWifi(agora);
  manterMqtt(agora);
  clienteMqtt.loop();
}

bool conectada() {
  return clienteMqtt.connected();
}

bool publicar(float temperatura, float umidade, float indiceCalor) {
  JsonDocument payload;
  payload["schema_version"] = 1;
  payload["device_id"] = idDispositivo;
  payload["sensor"] = "DHT22";
  payload["firmware_version"] = Config::VERSAO_FIRMWARE;
  payload["temp"] = roundf(temperatura * 10.0F) / 10.0F;
  payload["umid"] = roundf(umidade * 10.0F) / 10.0F;
  payload["ic"] = roundf(indiceCalor * 10.0F) / 10.0F;

  char mensagem[256];
  const size_t tamanho = serializeJson(payload, mensagem, sizeof(mensagem));

  if (tamanho == 0 || tamanho >= sizeof(mensagem)) {
    Serial.println("[ERROR] Payload MQTT excedeu o buffer.");
    return false;
  }

  if (!clienteMqtt.publish(topicoTelemetria, mensagem, false)) {
    Serial.println("[WARN] Falha ao publicar; nova tentativa no próximo ciclo.");
    return false;
  }

  Serial.printf("[INFO] Publicado em %s: %s\n",
                topicoTelemetria, mensagem);
  return true;
}

}  // namespace Comunicacao
