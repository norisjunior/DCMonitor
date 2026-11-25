# n8n — automações

O envio ao Zabbix passou para o Node-RED, no mesmo fluxo que grava no InfluxDB. Veja [node-red/README.md](../node-red/README.md).

O n8n permanece na stack para as automações que ainda não têm regra definida — notificações Telegram, quando limiares e política anti-repetição forem confirmados. Hoje ele não tem workflow ativo.

`flow_zabbix.json` e o `zabbix_sender` embutido na imagem continuam versionados como contingência. O workflow assina `fdctmon/+/data` na porta interna 1884, como o Node-RED. Se o workflow for importado e ativado enquanto o fluxo do Node-RED estiver rodando, o Zabbix receberá cada medição duas vezes.

**Pendência:** a porta 1884 não aceita mais conexão anônima. Antes de reativar qualquer workflow MQTT, o n8n precisa de um cliente próprio no broker, com o papel `ingestao` (lê `fdctmon/#`). Esse cliente ainda não é criado pela instalação e o fluxo não foi testado com ele.

## Configuração inicial

Necessária apenas quando houver um workflow a usar.

1. Acesse `http://IP_DO_SERVIDOR:5678` e crie o usuário proprietário.
2. Crie o cliente `n8n` no broker e dê a ele o papel `ingestao`. O primeiro comando pede a senha do novo cliente; o login do administrador vem de `/root/.config/mosquitto_ctrl`, dentro do container, e `-h`/`-p` vão explícitos porque esse arquivo aponta para a porta da subida inicial:

   ```bash
   docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec createClient n8n
   docker compose exec mosquitto mosquitto_ctrl -h 127.0.0.1 -p 1884 dynsec addClientRole n8n ingestao
   ```

   A API da página `/admin/` só altera IDs no formato do firmware (`esp32-...`), então não mexe nesse cliente. Ele aparece na tabela da página, mas "Trocar senha" e "Revogar" respondem 400 para ele.

3. Em **Credentials**, crie uma credencial MQTT chamada `DCMonitor MQTT interno`:

   - Host: `mosquitto`
   - Port: `1884`
   - Protocol: `mqtt`
   - Usuário: `n8n`; senha: a definida no passo 2

4. Importe o workflow desejado e selecione a credencial no nó `Telemetria MQTT`.
5. Ative o workflow.

## Contingência Zabbix

Antes de reativar `flow_zabbix.json`, desative o nó `Enviar ao Zabbix` no Node-RED para não duplicar valores. Os itens trapper são os descritos em [node-red/README.md](../node-red/README.md). A contingência difere em um ponto: envia a um host fixo, o de `ZABBIX_HOST_NAME`, e não ao host homônimo ao `device_id`.

Teste o executável dentro do container:

```bash
docker compose exec n8n zabbix_sender --version
docker compose exec n8n sh -lc \
  'zabbix_sender -z "$ZABBIX_SERVER" -p "$ZABBIX_PORT" \
  -s "$ZABBIX_HOST_NAME" -k temp -o 25.0'
```
