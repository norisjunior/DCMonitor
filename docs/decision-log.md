# Log de decisões

> Entradas mais recentes primeiro.

## 2026-07-13 — Wi-Fi iniciado uma vez e reconectado por estado

**Decisão:** Executar `WiFi.begin()` somente na inicialização e chamar `WiFi.reconnect()` a cada 10 segundos apenas quando o ESP32 informar desconexão, perda de conexão, falha de autenticação ou SSID indisponível.

**Justificativa:** `WL_IDLE_STATUS` representa uma tentativa ainda em andamento. Reiniciá-la periodicamente pode atrasar ou impedir a associação, enquanto os estados terminais indicam que uma nova tentativa é necessária.

**Alternativas descartadas:** Chamar `WiFi.begin()` para qualquer estado diferente de conectado, por reiniciar tentativas em andamento; testar apenas `WL_DISCONNECTED`, por não cobrir perda de conexão, credencial inválida e SSID ausente.

**Consequências:** O fluxo permanece não bloqueante; a tentativa inicial acontece uma única vez; novas tentativas respeitam o intervalo configurado e o MQTT só é tratado após o Wi-Fi conectar.

## 2026-07-13 — Fluxo executável da comunicação no `.ino`

**Decisão:** Manter em `DC_Comunicacao.hpp` somente os clientes Wi-Fi/MQTT, a identidade e os tópicos; mover inicialização, reconexão e serialização JSON para `ESP32DC.ino`.

**Justificativa:** Para o objetivo didático, uma única função não bloqueante de manutenção deixa o caminho Wi-Fi → MQTT → publicação visível sem alternar entre várias funções auxiliares.

**Alternativas descartadas:** Três funções encadeadas de manutenção, por fragmentarem um fluxo pequeno; conexão bloqueante no `setup()`, por impedir o funcionamento resiliente sem rede.

**Consequências:** O `.ino` fica maior, porém conta toda a execução; `DC_Comunicacao.hpp` atua como contexto de comunicação; Last Will, intervalos de reconexão e contrato MQTT permanecem.

## 2026-07-13 — Bind em todas as interfaces separado do nome público

**Decisão:** Publicar as portas da stack explicitamente em `0.0.0.0`; clientes usam o IP atual `10.32.8.115` e, futuramente, um nome DNS.

**Justificativa:** O bind em todas as interfaces permite trocar ou adicionar DNS sem acoplar containers e firmware ao endereço público.

**Alternativas descartadas:** Bind fixo em `10.32.8.115`, que acopla o Compose à interface atual; usar `0.0.0.0` como hostname público, que não representa um destino roteável para clientes.

**Consequências:** O firewall deve restringir cada porta às redes autorizadas; HTTPS, URLs públicas e proxy reverso serão configurados em conjunto quando o nome DNS for definido.

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
