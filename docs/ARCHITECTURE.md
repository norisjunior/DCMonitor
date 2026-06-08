# ARCHITECTURE.md

> Mantido por: `software-architect`. Atualize a cada decisão estrutural.

## Visão geral

```text
[Usuário / Dispositivo]
         |
         v
[Frontend ou ESP32] --> [Backend / API] --> [Banco de dados]
                               |
                               v
                         [Modelo ML / DL]
```

## Componentes

| Componente | Responsabilidade | Tecnologia | Observações |
|---|---|---|---|
| Firmware | `<...>` | `<ex.: ESP32-S3 + PlatformIO>` | `<...>` |
| Backend / API | `<...>` | `<ex.: Python 3.12 + FastAPI>` | `<...>` |
| Frontend | `<...>` | `<ex.: React + Vite>` | `<...>` |
| Banco de dados | `<...>` | `<ex.: PostgreSQL>` | `<...>` |
| ML / DL | `<...>` | `<ex.: scikit-learn / PyTorch>` | `<...>` |
| Infraestrutura | `<...>` | `<ex.: Docker + GitHub Actions>` | `<...>` |

## Contratos de integração

### ESP32 → Backend (MQTT ou HTTP)

- Protocolo: `<MQTT / HTTP>`
- Tópico / endpoint: `<ex.: device/{id}/telemetry>`
- Payload:

```json
{
  "device_id": "esp32-001",
  "timestamp": "2026-01-01T12:00:00Z",
  "value": 0
}
```

### Backend → Frontend

- Endpoint: `<ex.: GET /api/v1/leituras>`
- Auth: `<ex.: Bearer token>`
- Resposta: `<schema>`

### Backend → Modelo ML

- Entrada: `<schema do vetor de features>`
- Saída: `<schema da predição>`
- Versão do modelo: `<...>`

## Decisões arquiteturais

Veja `docs/decision-log.md` para justificativas detalhadas.

## Riscos arquiteturais

| Risco | Impacto | Mitigação |
|---|---|---|
| `<...>` | Alto / Médio / Baixo | `<...>` |
