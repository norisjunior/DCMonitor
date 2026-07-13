# Log de decisões

> Entradas mais recentes primeiro.

## 2026-07-13 — `.ino` como orquestrador e dois módulos de firmware

**Decisão:** Manter `LeituraAmbiente` no `.ino`; separar somente DHT22 em `DC_Ambiente.hpp` e conectividade/telemetria em `DC_Comunicacao.hpp`.

**Justificativa:** O arquivo principal passa a contar o fluxo da aplicação, como no projeto VaccineSense, sem criar `DC_Dados.hpp` para uma única `struct`.

**Alternativas descartadas:** Um header exclusivo de dados, por abstração desnecessária; um header por função, por fragmentar demais um firmware pequeno; manter toda a lógica no `.ino`, por reduzir a legibilidade didática.

**Consequências:** Os módulos de sensor e comunicação têm responsabilidades claras; a comunicação recebe valores escalares para não depender de um tipo declarado no `.ino`; contrato MQTT e robustez permanecem inalterados.

## 2026-07-13 — n8n concentra Zabbix e futuras notificações

**Decisão:** Node-RED valida e persiste telemetria; n8n envia ao Zabbix e receberá futuras regras Telegram.

**Justificativa:** Mantém ingestão de séries temporais pequena e previsível, enquanto integrações externas e regras de decisão ficam no motor de automação já incluído na stack.

**Alternativas descartadas:** Node-RED→Zabbix, que exigiria nó adicional ou execução de processo no serviço de ingestão; ESP32→Zabbix, que acoplaria firmware a infraestrutura externa.

**Consequências:** Node-RED e n8n assinam o mesmo tópico; falha Zabbix não afeta InfluxDB; n8n precisa conter `zabbix_sender`.

## 2026-07-13 — InfluxDB e Grafana substituem PostgreSQL e Flask

**Decisão:** InfluxDB é o banco de telemetria e Grafana é a interface de visualização.

**Justificativa:** A carga é uma série temporal e o Grafana fornece dashboard e histórico sem manter aplicação web própria.

**Alternativas descartadas:** Manter PostgreSQL/Flask em paralelo, que duplicaria persistência e dashboard sem requisito; manter FIWARE, explicitamente fora do escopo.

**Consequências:** Serviços e fluxos PostgreSQL/Flask deixam o deploy; retenção passa a ser política do bucket InfluxDB.

## 2026-07-13 — Porta MQTT interna isolada

**Decisão:** Dispositivos usam `1883` autenticada; consumidores Docker usam `1884` anônima e não publicada no host.

**Justificativa:** Permite provisionar flows sem armazenar credenciais MQTT exportadas, mantendo o acesso anônimo confinado à rede Docker.

**Alternativas descartadas:** Credenciais embutidas em flows; configuração manual obrigatória do Node-RED; broker externo anônimo.

**Consequências:** Comprometimento de um container na rede permite acesso ao broker interno; firewall e mínimo privilégio continuam necessários.

## 2026-07-13 — Contrato MQTT compatível durante a migração

**Decisão:** O contrato mínimo é `device_id`, `temp` e `umid`; ESP32 v1 adiciona `ic`, `sensor`, `schema_version` e `firmware_version`.

**Justificativa:** Raspberry continua ativo sem exigir uma alteração arriscada no dispositivo legado.

**Alternativas descartadas:** Exigir imediatamente o payload ESP32 no Raspberry; tópicos diferentes por tecnologia.

**Consequências:** `ic` é nullable durante a transição e campos extras do Raspberry são ignorados.

## 2026-07-13 — Firmware ESP32 didático e não bloqueante

**Decisão:** Um `.ino` principal como orquestrador, dois headers por responsabilidade, configuração local, `millis()` para temporização e PubSubClient para MQTT.

**Justificativa:** Mantém o exemplo legível para aula sem sacrificar reconexão, Last Will e separação de segredos.

**Alternativas descartadas:** FreeRTOS/AsyncMqttClient nesta fase, por complexidade sem ganho necessário; código de motor/acelerômetro do protótipo, fora do domínio.

**Consequências:** Telemetria usa QoS 0 e se repete a cada 30 s; não há fila offline local.
