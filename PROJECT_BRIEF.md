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
| RF-001 | `Dispositivo IoT deve se basear no código existente, conforme consta em OLD_PROJECT\FdctMonSys-App` | Alta | `Payload MQTT transmitido para o n8n` |
| RF-002 | `Armazenamento das medições do dispositivo IoT` | Alta | `Armazenamento na base de dados Postgres, com timestamp, de todas as medições coletadas pelo dispositivo` |
| RF-003 | `Fluxo n8n simples e funcional, suficiente para armazenamento das medições no banco` | Baixa | `Consulta das medições no banco` |
| RF-004 | `Dispositivo IoT não precisa mais armazenar as medições localmente, apenas transmite as medições para o n8n` | Média | `Armazenamento das medições no servidor` |
| RF-005 | `Páginas web para visualização das condições atuais de operação (temperatura, umidade, fumaça, presença)` | Alta | `Visualização das medições em tempo real em uma página web` |

## 4. Requisitos não-funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| RNF-001 | Segurança | `Se houver chaves de API ou algo do gênero, que fique em um .env que nunca é transmitido, ou que seja em variáveis de ambiente, desde que documentado. OWASP top 10 revisado.` |
| RNF-002 | Desempenho | `Conectividade disposotivo -> n8n -> interface web verificável` |
| RNF-003 | Disponibilidade | `Como é tudo local, conectividade é suficiente` |
| RNF-004 | Manutenibilidade | `Cobertura de testes unitários da página web e na consulta ao banco é suficiente` |

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
