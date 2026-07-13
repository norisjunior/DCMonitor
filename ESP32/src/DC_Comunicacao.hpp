#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "config.hpp"

namespace Comunicacao {

WiFiClient clienteWifi;
PubSubClient clienteMqtt(clienteWifi);

char idDispositivo[24];
char topicoTelemetria[64];
char topicoStatus[64];

void configurarIdentidade() {
  const uint64_t chipId = ESP.getEfuseMac();

  snprintf(idDispositivo, sizeof(idDispositivo), "esp32-%04X%08X",
           static_cast<uint16_t>(chipId >> 32),
           static_cast<uint32_t>(chipId));

  snprintf(topicoTelemetria, sizeof(topicoTelemetria),
           "%s/%s/attrs", Config::MQTT_TOPICO_BASE, idDispositivo);

  snprintf(topicoStatus, sizeof(topicoStatus),
           "%s/%s/status", Config::MQTT_TOPICO_BASE, idDispositivo);
}

}  // namespace Comunicacao
