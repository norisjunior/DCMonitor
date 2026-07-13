#pragma once

#include <Arduino.h>

// Copie este arquivo para config.hpp e preencha apenas na sua máquina.
// config.hpp é ignorado pelo Git.

namespace Config {

constexpr char WIFI_SSID[] = "SEU_WIFI";
constexpr char WIFI_PASSWORD[] = "SUA_SENHA_WIFI";

constexpr char MQTT_HOST[] = "192.168.x.x";
constexpr uint16_t MQTT_PORT = 1883;
constexpr char MQTT_USERNAME[] = "fdctmon_iot";
constexpr char MQTT_PASSWORD[] = "SUA_SENHA_MQTT";

constexpr uint8_t PINO_DHT = 25;
constexpr unsigned long INTERVALO_PUBLICACAO_MS = 30000;

constexpr char VERSAO_FIRMWARE[] = "1.0.0";

}  // namespace Config
