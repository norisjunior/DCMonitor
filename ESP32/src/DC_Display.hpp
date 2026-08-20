#pragma once

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <Wire.h>

namespace Display {

constexpr int16_t LARGURA_TELA = 128;
constexpr int16_t ALTURA_TELA = 64;

// Fonte padrao do Adafruit GFX: 6x8 px por caractere no tamanho 1.
constexpr int16_t LARGURA_CHAR = 6;
constexpr int16_t ALTURA_CHAR = 8;

// Painel bicolor: as linhas 0 a 15 sao amarelas e as demais azuis. As caixas
// comecam abaixo dessa fronteira para que borda e titulos fiquem inteiros no
// azul; so o titulo geral ocupa a faixa amarela.
constexpr int16_t FIM_FAIXA_AMARELA = 16;
constexpr int16_t CAIXA_Y = FIM_FAIXA_AMARELA + 1;
constexpr int16_t CAIXA_ALTURA = ALTURA_TELA - CAIXA_Y;

// "Temperatura" ocupa 66 px na fonte pequena, mais do que a metade da tela.
// Por isso a caixa da esquerda e mais larga do que a da direita.
constexpr int16_t CAIXA_ESQ_X = 0;
constexpr int16_t CAIXA_ESQ_LARGURA = 68;
constexpr int16_t CAIXA_DIR_X = CAIXA_ESQ_LARGURA;
constexpr int16_t CAIXA_DIR_LARGURA = LARGURA_TELA - CAIXA_ESQ_LARGURA;

Adafruit_SSD1306 tela(LARGURA_TELA, ALTURA_TELA, &Wire, -1);
bool disponivel = false;

int16_t larguraTexto(const char *texto, uint8_t tamanho) {
  return static_cast<int16_t>(strlen(texto)) * LARGURA_CHAR * tamanho;
}

void escreverCentralizado(const char *texto, int16_t origemX, int16_t largura,
                          int16_t y, uint8_t tamanho) {
  tela.setTextSize(tamanho);
  tela.setCursor(origemX + (largura - larguraTexto(texto, tamanho)) / 2, y);
  tela.print(texto);
}

void desenharCaixa(int16_t x, int16_t largura, const char *titulo, float valor,
                   const char *unidade) {
  tela.drawRect(x, CAIXA_Y, largura, CAIXA_ALTURA, SSD1306_WHITE);
  escreverCentralizado(titulo, x, largura, CAIXA_Y + 3, 1);

  // Uma casa decimal e o padrao. Valores largos como 100.0 perdem a casa
  // decimal para nao ultrapassar a borda da caixa.
  char medida[8];
  snprintf(medida, sizeof(medida), "%.1f", valor);
  int16_t larguraConjunto =
      larguraTexto(medida, 2) + 2 + larguraTexto(unidade, 1);

  if (larguraConjunto > largura - 4) {
    snprintf(medida, sizeof(medida), "%.0f", valor);
    larguraConjunto = larguraTexto(medida, 2) + 2 + larguraTexto(unidade, 1);
  }

  // A folga entre o titulo e o valor foi reduzida para compensar a descida da
  // caixa, mantendo o conjunto dentro dos 64 px da tela.
  const int16_t medidaX = x + (largura - larguraConjunto) / 2;
  const int16_t medidaY = CAIXA_Y + 22;

  tela.setTextSize(2);
  tela.setCursor(medidaX, medidaY);
  tela.print(medida);

  // Unidade em fonte pequena, alinhada pela base do numero grande.
  tela.setTextSize(1);
  tela.setCursor(medidaX + larguraTexto(medida, 2) + 2,
                 medidaY + ALTURA_CHAR);
  tela.print(unidade);
}

bool inicializar(uint8_t pinoSda, uint8_t pinoScl, uint8_t endereco) {
  Wire.begin(pinoSda, pinoScl);
  disponivel = tela.begin(SSD1306_SWITCHCAPVCC, endereco);

  if (disponivel) {
    tela.setTextColor(SSD1306_WHITE);
    tela.clearDisplay();
    tela.display();
  }

  return disponivel;
}

void mostrarMensagem(const char *mensagem) {
  if (!disponivel) {
    return;
  }

  tela.clearDisplay();
  escreverCentralizado("FUNDACENTRO", 0, LARGURA_TELA, 0, 1);
  escreverCentralizado(mensagem, 0, LARGURA_TELA, ALTURA_TELA / 2, 1);
  tela.display();
}

void mostrarAmbiente(float temperatura, float umidade) {
  if (!disponivel) {
    return;
  }

  tela.clearDisplay();
  escreverCentralizado("FUNDACENTRO", 0, LARGURA_TELA, 0, 1);
  desenharCaixa(CAIXA_ESQ_X, CAIXA_ESQ_LARGURA, "Temperatura", temperatura,
                "C");
  desenharCaixa(CAIXA_DIR_X, CAIXA_DIR_LARGURA, "Umidade", umidade, "%");
  tela.display();
}

}  // namespace Display
