# Node-RED — ingestão

O fluxo `flows.json` é carregado automaticamente na primeira criação do volume `node_red_data`.

Responsabilidades:

1. Assinar `fdctmon/+/attrs` no Mosquitto interno `mosquitto:1884`.
2. Interpretar e validar o JSON.
3. Converter a medição para InfluxDB line protocol.
4. Escrever na API interna do InfluxDB.

O fluxo não envia alertas ou dados ao Zabbix. Essas integrações pertencem ao n8n.

Se um volume Node-RED antigo já existir, o arquivo provisionado pela imagem não substituirá alterações persistidas. Para uma instalação limpa, confirme o conteúdo na UI ou recrie somente o volume após fazer backup.
