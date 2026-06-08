# Etapa 1: Alpine padrão (tem apk) — apenas para obter o binário zabbix_sender
FROM alpine:3.22 AS zabbix-stage
RUN apk add --no-cache zabbix-utils

# Etapa 2: imagem final — copia só o binário para não precisar de apk
FROM n8nio/n8n:2.18.4
USER root
COPY --from=zabbix-stage /usr/bin/zabbix_sender /usr/local/bin/zabbix_sender
USER node
