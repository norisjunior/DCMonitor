# n8n — Zabbix e automações

O n8n recebe a mesma telemetria MQTT que o Node-RED, mas não grava no InfluxDB. Sua responsabilidade atual é encaminhar valores ao Zabbix; regras Telegram serão adicionadas quando limiares e política anti-repetição forem definidos.

## Configuração inicial

1. Acesse `http://IP_DO_SERVIDOR:5678` e crie o usuário proprietário.
2. Em **Credentials**, crie uma credencial MQTT chamada `DCMonitor MQTT interno`:

   - Host: `mosquitto`
   - Port: `1884`
   - Protocol: `mqtt`
   - Usuário e senha: vazios

3. Importe `n8n/flow_zabbix.json`.
4. Selecione a credencial no nó `Telemetria MQTT`.
5. Ative o workflow.

## Pré-requisito Zabbix

No host cujo nome está em `ZABBIX_HOST_NAME`, crie itens do tipo **Zabbix trapper**:

| Chave | Tipo sugerido |
|---|---|
| `temperatura` | Numeric (float) |
| `umidade` | Numeric (float) |
| `indice_calor` | Numeric (float) |

O Raspberry legado não envia `indice_calor`; nesse caso, os outros dois itens continuam sendo enviados.

Teste o executável dentro do container:

```bash
docker compose exec n8n zabbix_sender --version
docker compose exec n8n sh -lc \
  'zabbix_sender -z "$ZABBIX_SERVER" -p "$ZABBIX_PORT" \
  -s "$ZABBIX_HOST_NAME" -k temperatura -o 25.0'
```

Consulte **Executions** no n8n e **Latest Data** no Zabbix para validar o caminho completo.
