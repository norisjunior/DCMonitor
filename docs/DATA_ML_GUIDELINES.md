# DATA_ML_GUIDELINES.md

> Mantido por: `ml-engineering` e `mlops-dataops`.
> Remova este arquivo se não houver ML/DL no projeto.

## Divisão dos dados

| Conjunto | Proporção | Finalidade |
|---|---|---|
| Treino | 70% | Ajuste do modelo |
| Validação | 15% | Ajuste de hiperparâmetros |
| Teste | 15% | Avaliação final apenas |

**Regra:** A divisão é feita antes de qualquer fit-transform (scaler, encoder, imputer).
Nunca toque o conjunto de teste até a avaliação final.

## Checklist de prevenção de leakage

- [ ] Variável-alvo não presente nas features.
- [ ] Nenhuma informação futura em dados temporais.
- [ ] Scaler / encoder ajustado apenas no conjunto de treino.
- [ ] Sem deduplicação de linhas após a divisão.

## Métricas

| Tipo de problema | Métrica principal | Secundária |
|---|---|---|
| Classificação binária | F1-score ou AUC-ROC | Precisão, Recall |
| Classificação multi-classe | F1 macro | F1 por classe |
| Regressão | RMSE | MAE, R² |
| Detecção de objetos | mAP@0.5 | AP por classe |

## Versionamento de artefatos

Cada experimento produz:
- Arquivo do modelo (`.pkl`, `.pt`, `.onnx`) nomeado com data e versão: `modelo_v1.2_20260605.pkl`
- JSON de metadados: data de treino, versão do dataset, métricas, hiperparâmetros, seed.
- Artefatos de pré-processamento salvos junto com o modelo.

## Reprodutibilidade

- Seed aleatória: sempre definida e documentada.
- Versões de Python / bibliotecas: fixadas em `requirements.txt` ou `pyproject.toml`.
- Dataset: identificado por nome, versão e hash quando possível.

## Checklist de deploy

- [ ] Pré-processamento de inferência idêntico ao de treino.
- [ ] Limiares de confiança documentados.
- [ ] Estratégia de rollback do modelo definida.
- [ ] Latência de inferência medida no hardware-alvo.
