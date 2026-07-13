#include <Arduino.h>

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

LeituraAmbiente coletarLeitura() {
  float temperatura = Ambiente::lerTemperatura();
  float umidade = Ambiente::lerUmidade();
  bool valida = Ambiente::leituraValida(temperatura, umidade);
  float indiceCalor = valida
      ? Ambiente::calcularIndiceCalor(temperatura, umidade)
      : NAN;

  return {temperatura, umidade, indiceCalor, valida};
}

void setup() {
  Serial.begin(115200);

  Ambiente::inicializar(Config::PINO_DHT);
  Comunicacao::inicializar();

  ultimaPublicacao = millis();
  Serial.println("\n[INFO] DCMonitor iniciado.");
}

void loop() {
  Comunicacao::manter();
  const unsigned long agora = millis();

  if (!Comunicacao::conectada() ||
      agora - ultimaPublicacao < Config::INTERVALO_PUBLICACAO_MS) {
    return;
  }

  ultimaPublicacao = agora;
  LeituraAmbiente leitura = coletarLeitura();

  if (!leitura.valida) {
    Serial.println("[WARN] Leitura inválida do DHT22; publicação ignorada.");
    return;
  }

  Comunicacao::publicar(
      leitura.temperatura,
      leitura.umidade,
      leitura.indiceCalor);
}
