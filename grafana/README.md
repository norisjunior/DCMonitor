# Grafana

O Compose provisiona automaticamente:

- datasource `DCMonitor InfluxDB`;
- pasta `DCMonitor`;
- dashboard `DCMonitor - Ambiente`.

O dashboard consulta o bucket `fdctmon`, atualiza a cada 30 segundos e exibe valores separados pela tag `device_id`.

Os arquivos em `provisioning/` e `dashboards/` são a fonte versionada. Alterações feitas somente pela UI não persistem como código; edite o JSON versionado para mudanças definitivas.
