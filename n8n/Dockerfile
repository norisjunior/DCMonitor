FROM n8nio/n8n:latest

# n8n v1.x é baseado em Debian (não Alpine) — usa apt-get, não apk
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends zabbix-sender \
    && rm -rf /var/lib/apt/lists/*
USER node
