#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "ca_cert.hpp"
#include "config.hpp"
#include "DC_Credencial.hpp"

namespace Comunicacao {

// TLS com verificacao do certificado do broker pela CA do DCMonitor.
WiFiClientSecure clienteSeguro;
PubSubClient clienteMqtt(clienteSeguro);

// Senha MQTT desta placa, lida da NVS no boot (usuario = idDispositivo).
char senhaMqtt[Credencial::TAMANHO_MAXIMO + 1];

char idDispositivo[24];
char topicoTelemetria[64];
char topicoStatus[64];

void configurarIdentidade() {
  const uint64_t chipId = ESP.getEfuseMac();

  snprintf(idDispositivo, sizeof(idDispositivo), "esp32-%04X%08X",
           static_cast<uint16_t>(chipId >> 32),
           static_cast<uint32_t>(chipId));

  snprintf(topicoTelemetria, sizeof(topicoTelemetria),
           "%s/%s/data", Config::MQTT_TOPICO_BASE, idDispositivo);

  snprintf(topicoStatus, sizeof(topicoStatus),
           "%s/%s/status", Config::MQTT_TOPICO_BASE, idDispositivo);
}

}  // namespace Comunicacao
