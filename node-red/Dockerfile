FROM nodered/node-red:4.1.11

# Nós extras embutidos na imagem, em vez de instalados pelo palette manager da UI.
# O destino é /usr/src/node-red/node_modules (WORKDIR da imagem), que já está no
# NODE_PATH e não é encoberto pelo volume node_red_data montado em /data.
RUN npm install --no-audit --no-fund --no-update-notifier --omit=dev \
      node-red-contrib-influxdb@0.7.0 \
      node-red-contrib-zabbix-sender@1.0.0

COPY --chown=node-red:root flows.json /data/flows.json
COPY --chown=node-red:root flows_cred.json /data/flows_cred.json
COPY --chown=node-red:root settings.js /data/settings.js
