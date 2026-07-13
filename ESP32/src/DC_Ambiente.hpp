#pragma once

#include <Arduino.h>
#include <DHT.h>

namespace Ambiente {

DHT dht(0, DHT22);

void inicializar(uint8_t pinoDados) {
  dht = DHT(pinoDados, DHT22);
  dht.begin();
}

float lerTemperatura() {
  return dht.readTemperature();
}

float lerUmidade() {
  return dht.readHumidity();
}

float calcularIndiceCalor(float temperatura, float umidade) {
  return dht.computeHeatIndex(temperatura, umidade, false);
}

bool leituraValida(float temperatura, float umidade) {
  return !isnan(temperatura) && !isnan(umidade);
}

}  // namespace Ambiente
