# decision-log.md

> Mantido por: `software-architect`. Uma entrada por decisão arquitetural ou técnica relevante.
> Adicione novas entradas no topo (mais recente primeiro).

---

## Template para novas entradas

**Data:** AAAA-MM-DD
**Decisão:** `<título — ex.: "Usar PostgreSQL em vez de MongoDB">`
**Contexto:** `<por que esta decisão foi necessária>`
**Opção escolhida:** `<o que foi decidido>`
**Alternativas descartadas:** `<opção A — motivo; opção B — motivo>`
**Consequências:** `<o que muda, o que fica restrito, o que é habilitado>`

---

## Entradas

---

**Data:** 2026-06-09
**Decisão:** Publicar medições a cada 10 segundos com histerese de fumaça no dispositivo
**Contexto:** A leitura digital do MQ-2 pode oscilar e gerar falso positivo se cada pico isolado for enviado diretamente ao banco, dashboard e Zabbix. O envio a cada 2 s também gera mais registros do que o necessário para o painel do NOC.
**Opção escolhida:** O Raspberry Pi amostra fumaça/presença a cada 2 s, aplica histerese no campo `fumaca` (3 leituras consecutivas para entrar ou sair de alerta) e publica o payload MQTT a cada 10 s. O dashboard consulta `/api/status` a cada 10 s. O n8n permanece orientado a evento, executando a cada mensagem recebida.
**Alternativas descartadas:** Média de fumaça em 30 s — poderia atrasar ou mascarar evento real; histerese no dashboard — deixaria banco e Zabbix com ruído; publicação a cada 2 s — maior chance de flutuação e volume desnecessário.
**Consequências:** Falsos positivos isolados do MQ-2 deixam de acionar painel/Zabbix; alerta confirmado pode levar cerca de 6 a 10 s para aparecer na próxima publicação; volume esperado cai para ~8.640 registros/dia por dispositivo.

---

**Data:** 2026-06-09
**Decisão:** Exigir autenticação no Mosquitto sem versionar senha ou hash
**Contexto:** A revisão final identificou que `allow_anonymous true` permitia publish não autorizado na rede interna, podendo gerar medições falsas no PostgreSQL, dashboard e Zabbix.
**Opção escolhida:** Mosquitto com `allow_anonymous false`; `password_file` gerado em runtime pelo container a partir de `MQTT_USERNAME` e `MQTT_PASSWORD`; Pi, simulador e n8n configurados com as mesmas credenciais via `.env`/UI.
**Alternativas descartadas:** Senha hardcoded no código ou no `mosquitto.conf` — expõe segredo no repositório; arquivo de senha versionado — expõe hash reutilizável; TLS agora — desejável, mas exige certificados e distribuição operacional fora do escopo imediato.
**Consequências:** Publicações anônimas são rejeitadas; `.env` passa a ser obrigatório para subir o broker; testes manuais com `mosquitto_pub/sub` precisam usar `-u/-P`; TLS continua como melhoria futura dependente de rede/certificados.

---

**Data:** 2026-06-08
**Decisão:** Dashboard atualiza via polling AJAX (não SSE nem WebSocket)
**Contexto:** Dashboard exibido em telão do NOC; precisa mostrar alerta de dispositivo offline. Avaliadas 4 abordagens: auto-refresh, AJAX polling, SSE, WebSocket.
**Opção escolhida:** Polling AJAX a cada 10 s via `fetch()` no endpoint `/api/status`
**Alternativas descartadas:** SSE — mantém conexões abertas e exige async no Flask, complexidade desnecessária; WebSocket — bidirecional, overkill para leitura; auto-refresh — recarrega página inteira, UX ruim em telão
**Consequências:** Latência de exibição de até 10 s após inserção no banco; Flask sem dependências assíncronas; código de frontend simples e testável

---

**Data:** 2026-06-08
**Decisão:** Retenção de dados: 90 dias via fluxo n8n agendado
**Contexto:** Pi envia ~8.640 registros/dia; sem retenção o banco cresce indefinidamente. Avaliadas 3 abordagens: n8n scheduled, pg_cron, cron Linux.
**Opção escolhida:** Fluxo n8n com trigger Schedule executando `DELETE FROM medicoes WHERE timestamp < NOW() - INTERVAL '90 days'` diariamente
**Alternativas descartadas:** pg_cron — exige ativar extensão na imagem Docker do Postgres; cron Linux — peça fora do Docker, manutenção separada
**Consequências:** ~3,9 M linhas máximo no banco; retenção visível e editável via UI do n8n; sem nova dependência de infra

---

**Data:** 2026-06-08
**Decisão:** Threshold de dispositivo offline = 2 minutos
**Contexto:** Pi publica a cada 10 s; dashboard precisa alertar quando dispositivo para de enviar. Definir threshold muito baixo gera falsos alarmes em reinicializações.
**Opção escolhida:** 2 minutos sem novo registro → status `offline` retornado pelo endpoint `/api/status`
**Alternativas descartadas:** 30 s — muito sensível a reinicializações normais; 5 min — lento para NOC detectar falha real; configurável — aumenta complexidade sem benefício imediato
**Consequências:** Falhas reais detectadas em até 2 min + 10 s (threshold + polling); reinicializações do Pi não disparam alerta falso

---

**Data:** 2026-06-08
**Decisão:** Campo "presença" no dashboard = `presenca_notificavel` + distância bruta
**Contexto:** Código legado calcula 3 valores distintos: distância (cm), presença booleana (< 200 cm) e presença notificável (presença + horário 22h–6h). Dashboard exibido no NOC.
**Opção escolhida:** `presenca_notificavel` (lógica de horário mantida) como indicador de alarme; distância bruta exibida como métrica complementar
**Alternativas descartadas:** Presença booleana simples — perde contexto de horário crítico; distância bruta isolada — difícil interpretar sem threshold
**Consequências:** Lógica de 22h–6h permanece no script do Pi; Zabbix recebe `presenca_notificavel`; banco armazena ambos os campos

---

**Data:** 2026-06-08
**Decisão:** Tópico MQTT único com payload JSON unificado
**Contexto:** Tópicos FIWARE legados (`/ul/19662024/b827eb00f6d0/attrs`) serão descartados com a remoção do FIWARE. Pi amostra presença/fumaça a cada 2 s, publica a cada 10 s e temperatura/umidade a cada 30 s.
**Opção escolhida:** Tópico único `fdctmon/{device_id}/attrs` com payload JSON `{"temp":X,"umid":X,"fumaca":X,"presenca_notificavel":X,"distancia":X}`; temperatura usa cache local no Pi entre leituras de 30 s; fumaça é enviada já confirmada por histerese
**Alternativas descartadas:** Tópico por sensor — n8n precisaria correlacionar 4 mensagens antes de inserir, complexidade desnecessária; tópicos FIWARE — acoplados ao IoT Agent que será removido
**Consequências:** n8n recebe 1 mensagem e faz 1 INSERT; cache de temperatura no Pi pode ter valor desatualizado por até 30 s após reboot; JSON levemente maior que payload UL, irrelevante para rede local

---

**Data:** 2026-06-08
**Decisão:** Integração com Zabbix migrada do Pi para o servidor (n8n)
**Contexto:** Hoje `zabbix_sender` é chamado via `os.system()` diretamente no script Python do Pi. No novo projeto o Pi apenas publica MQTT.
**Opção escolhida:** n8n chama `zabbix_sender` no container do servidor a cada mensagem MQTT recebida, enviando os 4 valores ao host `10.32.8.57`
**Alternativas descartadas:** Manter no Pi — contradiz RF-004 (Pi não deve ter lógica além de coletar e publicar); redundância Pi + servidor — desnecessária
**Consequências:** Pi fica sem dependência do Zabbix; `zabbix_sender` precisa estar disponível no container/servidor; se n8n estiver fora do ar, Zabbix também perde as medições

---

**Data:** 2026-06-08
**Decisão:** Substituição completa do FIWARE por n8n + PostgreSQL + Mosquitto
**Contexto:** Stack FIWARE (Orion, IoT Agent, MongoDB, MySQL) estava em `OLD_PROJECT/FdctMonSys-Cloud`. Complexidade alta para o problema em questão (1 dispositivo, 4 sensores, 1 dashboard).
**Opção escolhida:** n8n como motor de fluxo, PostgreSQL como banco único, Mosquitto como broker MQTT, todos em Docker Compose no servidor
**Alternativas descartadas:** Manter FIWARE — proibido pelo escopo; Node-RED — fora da stack declarada; scripts Python puros no servidor — sem UI de fluxo para manutenção
**Consequências:** Elimina MongoDB e MySQL; reduz serviços de ~6 para 4 (Mosquitto, n8n, PostgreSQL, Flask); curva de aprendizado do n8n necessária
