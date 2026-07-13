# Etapa 1: obtém o zabbix_sender e todas as bibliotecas dinâmicas necessárias.
FROM alpine:3.22 AS zabbix-stage
RUN apk add --no-cache pax-utils zabbix-utils \
    && mkdir -p /zabbix-root/usr/bin /zabbix-root/usr/lib \
    && cp /usr/bin/zabbix_sender /zabbix-root/usr/bin/ \
    && lddtree -l /usr/bin/zabbix_sender \
      | grep '^/usr/lib/' \
      | while read -r library; do cp -L "$library" /zabbix-root/usr/lib/; done

# Etapa 2: imagem final continua sem apk, mas recebe o utilitário autocontido.
FROM n8nio/n8n:2.18.4
USER root
COPY --from=zabbix-stage /zabbix-root/ /
USER node
