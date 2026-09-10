# n8n — automações

O envio ao Zabbix passou para o Node-RED, no mesmo fluxo que grava no InfluxDB. Veja [node-red/README.md](../node-red/README.md).

O n8n permanece na stack para as automações que ainda não têm regra definida — notificações Telegram, quando limiares e política anti-repetição forem confirmados. Hoje ele não tem workflow ativo.

`flow_zabbix.json` e o `zabbix_sender` embutido na imagem continuam versionados como contingência. Se o workflow for importado e ativado enquanto o fluxo do Node-RED estiver rodando, o Zabbix receberá cada medição duas vezes.

## Configuração inicial

Necessária apenas quando houver um workflow a usar.

1. Acesse `http://IP_DO_SERVIDOR:5678` e crie o usuário proprietário.
2. Em **Credentials**, crie uma credencial MQTT chamada `DCMonitor MQTT interno`:

   - Host: `mosquitto`
   - Port: `1884`
   - Protocol: `mqtt`
   - Usuário e senha: vazios

3. Importe o workflow desejado e selecione a credencial no nó `Telemetria MQTT`.
4. Ative o workflow.

## Contingência Zabbix

Antes de reativar `flow_zabbix.json`, desative o nó `Enviar ao Zabbix` no Node-RED para não duplicar valores. Os itens trapper e o host são os mesmos descritos em [node-red/README.md](../node-red/README.md).

Teste o executável dentro do container:

```bash
docker compose exec n8n zabbix_sender --version
docker compose exec n8n sh -lc \
  'zabbix_sender -z "$ZABBIX_SERVER" -p "$ZABBIX_PORT" \
  -s "$ZABBIX_HOST_NAME" -k temperatura -o 25.0'
```
