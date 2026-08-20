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
constexpr char MQTT_TOPICO_BASE[] = "fdctmon";

constexpr uint8_t PINO_DHT = 25;

// OLED SSD1306 128x64 por I2C. Nao reaproveite PINO_DHT aqui.
constexpr uint8_t PINO_OLED_SDA = 27;
constexpr uint8_t PINO_OLED_SCL = 26;
constexpr uint8_t ENDERECO_OLED = 0x3C;

constexpr unsigned long INTERVALO_PUBLICACAO_MS = 30000;
constexpr unsigned long ATRASO_PRIMEIRA_MEDICAO_MS = 3000;
constexpr unsigned long INTERVALO_TENTATIVA_WIFI_MS = 10000;
constexpr unsigned long INTERVALO_TENTATIVA_MQTT_MS = 5000;

constexpr char VERSAO_FIRMWARE[] = "1.2.0";

}  // namespace Config
