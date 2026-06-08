# PROJECT_BRIEF.md

## 1. Visão geral

- **Nome do projeto:** `FdctMonSys`
- **Responsável / cliente:** `Norisvaldo Ferraz Junior`
- **Problema a resolver:** `Substituir a infraestrutura FIWARE por n8n + PostgreSQL, mantendo a coleta de sensores e a página de visualização. Dispositivo Raspberry Pi contém 3 sensores: DHT (temperatura e umidade), MQ-2 (fumaça) e HC-SR04 (presença/distância) e está instalado em um datacenter. O projeto deve permitir que a coleta de dados desse dispositivo seja publicada em uma interface Web, cujo servidor está hospedado em outro IP. Esse servidor é interno e deve hospedar tanto a base de dados quanto o fluxo automatizado usando n8n quanto a interface web`
- **Resultado esperado:** `Ter uma página web que será publicada em um telão do NOC que mostrará a temperatura, umidade, nível de fumaça e presença, bem como enviar essas informações para o zabbix.`
- **Usuários-alvo:** `NOC e responsáveis pela área de suporte e sustentação de infraestrutura`

## 2. Stack

Preencha apenas o que se aplica. Deixe os demais como `N/A`.

- **Firmware / IoT:** `Raspberry Pi, PRETTY_NAME="Debian GNU/Linux 11 (bullseye)"`
- **Backend:** `Dispositivo IoT: python + MQTT. Servidor: Ferramenta de Fluxo: n8n + postgres + Mosquitto MQTT Broker`
- **Frontend:** `Mesmo servidor que o back-end: Python/Flask`
- **Banco de dados:** `PostgreSQL`
- **ML / Clássico:** `N/A`
- **ML / Deep Learning:** `N/A`
- **Infraestrutura:** `Dispositivo IoT: python. Servidor: Docker.`


## 3. Requisitos funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-001 | Dispositivo IoT publica JSON unificado no tópico `fdctmon/{device_id}/attrs` via MQTT a cada 2 s; temperatura usa cache local entre leituras de 30 s | Alta | Mensagem JSON `{"temp":X,"umid":X,"fumaca":X,"presenca_notificavel":X,"distancia":X,"device_id":"..."}` visível no broker; n8n recebe e armazena |
| RF-002 | Todas as medições armazenadas no PostgreSQL com timestamp | Alta | Tabela `medicoes` contém linha para cada mensagem MQTT recebida; SELECT retorna registros com timestamp correto |
| RF-003 | Fluxo n8n principal: subscribe MQTT → parse JSON → INSERT PostgreSQL | Alta | n8n executa sem erros; registro inserido no banco após cada publicação do Pi |
| RF-003b | Fluxo n8n de retenção: executa diariamente e deleta registros com mais de 90 dias | Baixa | Após execução manual do fluxo, registros com `timestamp < NOW() - INTERVAL '90 days'` são removidos |
| RF-004 | Dispositivo IoT não armazena medições localmente; apenas publica via MQTT | Média | Nenhum arquivo local ou banco é gravado no Pi; todo armazenamento ocorre no servidor |
| RF-005 | Dashboard web (Flask) exibe temperatura, umidade, fumaça, presença notificável e distância em tempo real | Alta | Página atualiza via AJAX a cada 5 s; valores refletem última medição do banco; alerta visual exibido se último registro tiver mais de 2 min |
| RF-006 | Servidor encaminha medições ao Zabbix (host `10.32.8.57`, chaves: `temperatura`, `umidade`, `fumaca`, `presenca`) | Alta | `zabbix_sender` executado no servidor a cada mensagem MQTT; itens atualizados no Zabbix confirmados via latest data |

## 4. Requisitos não-funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| RNF-001 | Segurança | Credenciais em `.env` / variáveis de ambiente; `.env` no `.gitignore`; OWASP Top 10 revisado antes de entrega |
| RNF-002 | Desempenho | Latência Pi → banco ≤ 5 s em condições normais de rede local; verificável por inspeção no banco |
| RNF-003 | Disponibilidade | Todos os serviços do servidor sobem com `docker compose up`; Pi reconecta automaticamente ao broker após queda |
| RNF-004 | Manutenibilidade | Testes unitários para rotas Flask e queries ao banco; cobertura mínima das rotas `/` e `/api/status` |
| RNF-005 | Observabilidade de dispositivo | Dashboard exibe aviso "Dispositivo offline" se nenhum registro foi inserido nos últimos 2 minutos |
| RNF-007 | Simplicidade de código | Sem ORM, sem classes abstratas, sem design patterns desnecessários; cada arquivo tem responsabilidade única; qualquer desenvolvedor rastreia o fluxo de um dado lendo no máximo 3 arquivos |
| RNF-008 | Observabilidade do ciclo de dados | Cada etapa Pi → Broker → n8n → PostgreSQL → Flask → Browser verificável de forma independente; logs em cada etapa visíveis via `docker compose logs`; ver tabela de pontos de verificação em `docs/REQUIREMENTS.md` |

## 5. Decisões tomadas na sessão de requisitos (2026-06-08)

| # | Decisão | Alternativas descartadas |
|---|---|---|
| D-001 | Zabbix integrado no servidor via n8n (não no Pi) | Pi chama `zabbix_sender` diretamente (era o comportamento anterior) |
| D-002 | Tópico único JSON: `fdctmon/{device_id}/attrs` | Tópico por sensor; tópicos FIWARE legados |
| D-003 | "Presença" no dashboard = `presenca_notificavel` (lógica 22h–6h) + distância bruta em cm | Presença booleana simples; distância bruta isolada |
| D-004 | Threshold de dispositivo offline = 2 minutos | 30 s; 5 min; configurável por env |
| D-005 | Retenção de dados = 90 dias via fluxo n8n agendado | Sem retenção; pg_cron; cron Linux |
| D-006 | Atualização do dashboard via polling AJAX a cada 5 s | SSE; WebSocket; auto-refresh de página |

## 5. Restrições

- **Stack obrigatória (não negociável):** `Python no dispositivo, n8n no fluxo, PostgreSQL no banco, Flask no frontend`
- **Hardware obrigatório:** `Raspberry Pi model 3 B`
- **Ambiente de execução:** `Raspberry Pi, Linux <ex.: VPS Linux, Raspberry Pi, navegador>`
- **Prazo:** `N/A`
- **Restrições de custo:** `tudo será local, raspberry pi em rede 10.X.X.X e servidor na rede 192.168.X.X, sendo que os IP's se conversarão e hoje já se conversam`
- **Restrições de dados:** `N/A`

## 6. Fora do escopo

- `Não use FIWARE, deverá ser totalmente substituído`

## 7. Riscos conhecidos

| Risco | Impacto | Mitigação |
|---|---|---|
| `Dispositivo IoT não envia medições` | Alto | `observar se há conectividade, ser notificado na página Web que dispositivo está sem comunicação` |

## 8. Referências e projetos existentes

> Use esta seção quando o projeto reutiliza código, contratos ou conhecimento de outros repositórios.
> Para cada referência, informe: onde está, o que contém e o que deve ser reaproveitado ou substituído.

| O quê | Localização | Reaproveitar | Substituir |
|---|---|---|---|
| `Dispositivo IoT` | `OLD_PROJECT\FdctMonSys-App` | `lógica de leitura, envio de dados via payload MQTT` | `armazenamento de medições não precisa existir, tópicos MQTT podem ser refatorados para melhor organização` |
| `FIWARE` | `OLD_PROJECT\FdctMonSys-Cloud` | `nada` | `a intenção é remover o fiware` |
| `Página web` | `OLD_PROJECT\FdctMonSys-Web` | `node.js, axios` | `não precisa manter nada, quero substituir por python` |

**Instrução para o agente:** antes de propor arquitetura ou plano, leia os arquivos referenciados acima para entender contratos existentes e evitar retrabalho.
