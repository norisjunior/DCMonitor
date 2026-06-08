# ARCHITECTURE.md

> Mantido por: `software-architect`. Atualize a cada decisão estrutural.
> Última atualização: 2026-06-08

## Visão geral do fluxo de dados

```text
Raspberry Pi (10.x.x.x)                Servidor (192.168.x.x)
─────────────────────────               ──────────────────────────────────────
 sensor_publisher.py                     docker-compose
  ├─ DHT11 (temp/umid)                    ├─ mosquitto:1883  (MQTT Broker)
  ├─ MQ-2  (fumaça)       MQTT JSON       ├─ n8n:5678        (Flow Engine)
  └─ HC-SR04 (distância) ──────────────►  │   ├─ flow_principal
                                          │   │   ├─ INSERT → postgres
                                          │   │   └─ zabbix_sender → Zabbix
                                          │   └─ flow_retencao (DELETE 90d)
                                          ├─ postgres:5432   (PostgreSQL)
                                          └─ web:5000        (Flask Dashboard)
                                               └─ GET /api/status ◄── Browser NOC

                                          Zabbix Server (10.32.8.57)
```

## Componentes

| Componente | Responsabilidade | Tecnologia | Localização |
|---|---|---|---|
| Sensor Publisher | Coleta sensores e publica MQTT JSON a cada 2 s | Python 3 + paho-mqtt | Raspberry Pi |
| MQTT Broker | Roteamento de mensagens entre Pi e n8n | Mosquitto 2 (Docker) | Servidor |
| Flow Engine | MQTT→DB, Zabbix, retenção 90 d | n8n (Docker) | Servidor |
| Banco de dados | Armazenamento de todas as medições | PostgreSQL 16 (Docker) | Servidor |
| Dashboard Web | Exibição em tempo real para NOC | Python/Flask + HTML/JS (Docker) | Servidor |
| Monitoramento | Alertas e histórico de itens Zabbix | Zabbix (externo) | 10.32.8.57 |

## Contrato MQTT

- **Tópico:** `fdctmon/{device_id}/attrs`
- **Frequência:** a cada 2 s (temperatura usa cache entre leituras de 30 s)
- **Payload:**

```json
{
  "device_id":            "b827eb00f6d0",
  "temp":                 25.3,
  "umid":                 60.0,
  "fumaca":               0,
  "presenca_notificavel": 1,
  "distancia":            142.5
}
```

| Campo | Tipo | Nullable | Descrição |
|---|---|---|---|
| `device_id` | string | não | MAC address hex do Pi |
| `temp` | number | sim | Temperatura em °C (null se cache vazio após reboot) |
| `umid` | number | sim | Umidade relativa em % |
| `fumaca` | 0 ou 1 | não | 1 = fumaça detectada pelo MQ-2 |
| `presenca_notificavel` | 0 ou 1 | não | 1 = presença (dist < 200 cm) E horário 22h–6h |
| `distancia` | number | não | Distância em cm medida pelo HC-SR04 |

## Contrato Flask API

### `GET /`
- Retorna: HTML do dashboard NOC

### `GET /api/status`
- Retorna: JSON com último registro + status de conectividade
- Resposta OK (200):
```json
{
  "online": true,
  "registro": {
    "timestamp":            "2026-06-08T14:30:00+00:00",
    "device_id":            "b827eb00f6d0",
    "temperatura":          25.3,
    "umidade":              60.0,
    "fumaca":               0,
    "presenca_notificavel": 0,
    "distancia":            185.5
  }
}
```
- `online: false` quando `NOW() - timestamp > 2 min` ou banco vazio
- Resposta erro (503): `{"error": "Falha ao consultar banco de dados"}`

## Schema PostgreSQL

```sql
CREATE TABLE medicoes (
    id                   BIGSERIAL PRIMARY KEY,
    timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id            TEXT        NOT NULL,
    temperatura          NUMERIC(5,2),
    umidade              NUMERIC(5,2),
    fumaca               SMALLINT    NOT NULL,
    presenca_notificavel SMALLINT    NOT NULL,
    distancia            NUMERIC(7,2)
);
```

Índices: `idx_medicoes_timestamp` (DESC), `idx_medicoes_device_id`

## Decisões arquiteturais

Ver [decision-log.md](decision-log.md) para justificativas detalhadas de cada escolha.

## Riscos arquiteturais

| Risco | Impacto | Mitigação |
|---|---|---|
| `zabbix_sender` ausente no container n8n | Alto | Dockerfile customizado instala `zabbix-utils` via apk |
| n8n perde conexão MQTT silenciosamente | Alto | Monitorar aba Executions no n8n; reconexão automática configurada |
| Rede Pi → servidor instável | Alto | Threshold 2 min + banner offline no dashboard |
| Cache de temperatura nulo após reboot do Pi | Baixo | Flask trata null exibindo "—"; banco aceita NULL |
