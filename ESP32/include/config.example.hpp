#pragma once

#include <Arduino.h>

// Copie este arquivo para config.hpp e preencha apenas na sua máquina.
// config.hpp é ignorado pelo Git.

namespace Config {

constexpr char WIFI_SSID[] = "SEU_WIFI";
constexpr char WIFI_PASSWORD[] = "SUA_SENHA_WIFI";

// Broker MQTT com TLS. Use um nome ou IP presente no certificado do servidor
// (scripts/gerar_certificados.sh), por exemplo o IP do servidor ou
// vplviot.ctn.fundacentro.intra. Usuario e senha MQTT nao ficam aqui: o
// usuario e o device_id e a senha e gravada pela serial (DC_Credencial.hpp).
constexpr char MQTT_HOST[] = "192.168.x.x";
constexpr uint16_t MQTT_PORT = 8883;
constexpr char MQTT_TOPICO_BASE[] = "fdctmon";

constexpr uint8_t PINO_DHT = 25;

// OLED SSD1306 128x64 por I2C. Nao reaproveite PINO_DHT aqui.
constexpr uint8_t PINO_OLED_SDA = 27;
constexpr uint8_t PINO_OLED_SCL = 26;
constexpr uint8_t ENDERECO_OLED = 0x3C;

// Ciclo com deep sleep: acorda, mede, publica, desconecta e dorme TEMPO_SONO_S.
// O periodo real e o sono mais o tempo acordado (tipicamente 3 a 6 s).
constexpr uint32_t TEMPO_SONO_S = 60;

// Espera do DHT22 apos energizar; aplicada apenas na partida a frio, porque
// no despertar o sensor seguiu alimentado durante o sono.
constexpr unsigned long ATRASO_PRIMEIRA_MEDICAO_MS = 2000;
constexpr unsigned long INTERVALO_MINIMO_DHT_MS = 2100;

// Limites de espera por ciclo. Estourou, a placa dorme e tenta no proximo.
constexpr unsigned long TEMPO_MAXIMO_WIFI_MS = 10000;
constexpr uint16_t TEMPO_MAXIMO_MQTT_S = 5;
constexpr unsigned long TEMPO_MAXIMO_NTP_MS = 3000;

// Watchdog: se o ciclo acordado passar disso, a placa reinicia sozinha.
constexpr uint32_t LIMITE_CICLO_ACORDADO_S = 30;

// Horario do display. Aponte para o servidor do DCMonitor, que serve NTP as
// placas (chrony; docs/DEPLOY_PROD.md). O TLS nao depende do horario.
constexpr char NTP_SERVIDOR[] = "192.168.x.x";
constexpr char FUSO_HORARIO[] = "<-03>3";  // America/Sao_Paulo, sem horario de verao
constexpr uint32_t CICLOS_ENTRE_SINCRONIZACOES = 60;

constexpr char VERSAO_FIRMWARE[] = "1.6.0";

}  // namespace Config
