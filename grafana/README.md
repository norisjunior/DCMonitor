# Grafana

O Compose provisiona automaticamente:

- datasource `DCMonitor InfluxDB`;
- pasta `DCMonitor`;
- dashboard `DCMonitor - Ambiente`.

O dashboard consulta o bucket `fdctmon` e atualiza a cada 30 segundos.

## Filtros

| Variável | Tag | Comportamento |
|---|---|---|
| `Local` | `local` | seleção múltipla, com "All"; valores vistos nos últimos 30 dias |
| `Dispositivo` | `nome` | seleção múltipla, com "All"; limitada aos locais escolhidos |

As tags vêm do cadastro de dispositivos (`http://SERVIDOR:1880/admin/`). Placa sem cadastro aparece no local `sem-local`, com o próprio `device_id` como nome. Legendas e valores atuais mostram o nome amigável.

Pontos gravados antes do cadastro não têm as tags `local` e `nome` e ficam fora dos painéis.

## Painéis

- **Situação das placas** (topo): última medição de cada placa nos últimos 30 dias, com local, nome, ID, horário e temperatura. "Sem dados há" fica laranja a partir de 3 min e vermelho a partir de 10 min. Placa sem dados há mais de 30 dias sai da tabela.
- Temperatura, umidade, índice de calor e sinal Wi-Fi atuais, por nome.
- Histórico de temperatura/índice de calor e do sinal Wi-Fi.

Renomear uma placa ou trocá-la de local vale dali em diante. No histórico, o trecho anterior continua com o nome antigo, como série separada. Os painéis de valor atual pegam a medição mais recente de cada `device_id` e exibem o nome amigável, então mesmo duas placas com o mesmo nome aparecem separadas; dê nomes distintos para diferenciá-las na tela.

Os arquivos em `provisioning/` e `dashboards/` são a fonte versionada. Alterações feitas somente pela UI não persistem como código; edite o JSON versionado para mudanças definitivas.
