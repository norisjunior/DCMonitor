#pragma once

#include <Arduino.h>
#include <Preferences.h>

// Senha MQTT propria de cada placa, gravada na NVS (memoria nao volatil).
// O usuario MQTT e o proprio device_id; a senha e gerada na pagina /admin/ e
// entregue uma unica vez pela serial. Assim o mesmo binario serve a toda a
// frota e nenhuma senha fica no codigo.
//
// Para trocar a senha de uma placa: apagar a flash e gravar de novo
// (pio run -t erase && pio run -t upload); a NVS volta vazia e a placa pede
// a credencial na serial.

namespace Credencial {

constexpr char NAMESPACE_NVS[] = "dcmonitor";
constexpr char CHAVE_SENHA[] = "senha_mqtt";
constexpr size_t TAMANHO_MINIMO = 16;
constexpr size_t TAMANHO_MAXIMO = 64;

// Caracteres ASCII visiveis, sem espaco: a linha da serial separa por espaco.
bool senhaValida(const char *senha) {
  const size_t tamanho = strlen(senha);
  if (tamanho < TAMANHO_MINIMO || tamanho > TAMANHO_MAXIMO) {
    return false;
  }
  for (size_t i = 0; i < tamanho; i++) {
    if (senha[i] <= ' ' || senha[i] > '~') {
      return false;
    }
  }
  return true;
}

bool carregar(char *destino, size_t tamanho) {
  destino[0] = '\0';
  Preferences nvs;
  // Somente leitura: na primeira vez o namespace ainda nao existe.
  if (!nvs.begin(NAMESPACE_NVS, true)) {
    return false;
  }
  if (nvs.isKey(CHAVE_SENHA)) {
    nvs.getString(CHAVE_SENHA, destino, tamanho);
  }
  nvs.end();
  return senhaValida(destino);
}

bool salvar(const char *senha) {
  if (!senhaValida(senha)) {
    return false;
  }
  Preferences nvs;
  if (!nvs.begin(NAMESPACE_NVS, false)) {
    return false;
  }
  const size_t gravados = nvs.putString(CHAVE_SENHA, senha);
  nvs.end();
  return gravados == strlen(senha);
}

}  // namespace Credencial
