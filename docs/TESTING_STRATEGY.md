# TESTING_STRATEGY.md

> Mantido por: `qa-testing`.

## Níveis de teste

| Nível | Escopo | Ferramenta | Quando executar |
|---|---|---|---|
| Unitário | Rotas Flask + lógica de presença notificável | pytest | A cada commit |
| Integração | Stack completo (MQTT → n8n → DB → Flask) | Docker Compose + mosquitto_pub | Antes de entregar |
| Visual | Dashboard NOC no browser | Manual | Antes de entregar |

## Metas de cobertura

| Camada | Cobertura mínima |
|---|---|
| Rotas Flask (`/` e `/api/status`) | 100% dos casos feliz + principais erros |
| Lógica de presença notificável (22h–6h) | 100% dos limites de horário |
| Fluxo n8n | Verificação manual via aba Executions |

## Convenções

- Testes ficam em `web/tests/`.
- Hardware (GPIO, MQTT, banco) é mockado nos testes unitários.
- Nomes descrevem o comportamento: `test_api_status_offline_por_tempo`.

## Comandos

```bash
# Testes unitários (sem Docker)
source venv/bin/activate
pytest web/tests/ -v

# Stack completo (com Docker)
docker compose up -d --build
mosquitto_pub -h localhost -p 1883 \
  -t "fdctmon/b827eb00f6d0/attrs" \
  -m '{"device_id":"b827eb00f6d0","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'
curl http://localhost:5000/api/status
```

Para o guia completo de teste local no WSL, veja [TESTING_LOCAL.md](TESTING_LOCAL.md).
