# Guia de teste local — WSL / Ubuntu

Este guia permite testar todo o stack em localhost sem precisar do Raspberry Pi
nem de rede entre máquinas. Os testes estão divididos em dois níveis:

- **Nível 1 — Testes unitários:** rodam sem Docker, sem banco, sem hardware.
- **Nível 2 — Testes de integração:** rodam com Docker Compose no WSL.

---

## Pré-requisitos

| Ferramenta | Como verificar |
|---|---|
| Docker Desktop com integração WSL2 ativa | `docker --version` |
| Python 3.11+ | `python3 --version` |
| mosquitto-clients (para simular o Pi) | `sudo apt install -y mosquitto-clients` |

---

## Nível 1 — Testes unitários (sem Docker)

Testam as regras de negócio do Flask e a lógica de presença notificável.
Banco de dados, GPIO e MQTT são mockados — **não precisam de `.env`, Docker nem hardware**.
As variáveis de ambiente necessárias são injetadas diretamente pelos próprios testes.

```bash
# Clone a branch (se ainda não tiver)
git clone -b dcmon2026 https://github.com/norisjunior/DCMonitor.git
cd DCMonitor

# Ambiente virtual
python3 -m venv venv
source venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install flask psycopg2-binary pytest

# Executar todos os testes — nenhum .env necessário
pytest web/tests/ -v
```

Saída esperada (16 testes, todos PASSED):
```
web/tests/test_app.py::test_index_retorna_200                     PASSED
web/tests/test_app.py::test_index_contem_threshold                PASSED
web/tests/test_app.py::test_api_status_online                     PASSED
web/tests/test_app.py::test_api_status_retorna_todos_campos       PASSED
web/tests/test_app.py::test_api_status_offline_por_tempo          PASSED
web/tests/test_app.py::test_api_status_offline_sem_registros      PASSED
web/tests/test_app.py::test_api_status_offline_no_limite          PASSED
web/tests/test_app.py::test_api_status_online_antes_do_limite     PASSED
web/tests/test_app.py::test_api_status_erro_banco_retorna_503     PASSED
web/tests/test_app.py::test_api_status_temperatura_nula           PASSED
web/tests/test_sensor_logic.py::test_sem_presenca_...             PASSED
web/tests/test_sensor_logic.py::test_presenca_durante_horario...  PASSED
web/tests/test_sensor_logic.py::test_presenca_a_meia_noite...     PASSED
web/tests/test_sensor_logic.py::test_presenca_as_22h_notifica     PASSED
web/tests/test_sensor_logic.py::test_presenca_as_5h59_notifica    PASSED
web/tests/test_sensor_logic.py::test_presenca_as_6h_nao_notifica  PASSED
16 passed
```

---

## Nível 2 — Testes de integração com Docker (stack completo)

> Os `.env` abaixo são necessários **apenas a partir deste nível**.
> Os testes unitários do Nível 1 não os utilizam.

### 2.1 Configurar os arquivos .env

**`DCMonitor/.env`** (para o servidor/Docker):

```bash
cp .env.example .env
```

Edite `.env` com os seguintes valores para localhost:

```env
# PostgreSQL
POSTGRES_DB=fdctmon
POSTGRES_USER=fdctmon
POSTGRES_PASSWORD=senha_local_123

# n8n
N8N_USER=admin
N8N_PASSWORD=admin_local_123
N8N_ENCRYPTION_KEY=chave_local_32_caracteres_aqui__

# Flask
DEVICE_OFFLINE_THRESHOLD_MINUTES=2

# Referência (não usada internamente pelo Docker — só pelo script do Pi)
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=fdctmon_iot
MQTT_PASSWORD=senha_mqtt_local_123

# Zabbix — pode deixar o valor real ou um placeholder para teste local
ZABBIX_SERVER=10.32.8.57
ZABBIX_HOST_NAME=SALA COFRE
```

> **Nota sobre N8N_ENCRYPTION_KEY:** deve ter exatamente 32+ caracteres.
> Exemplo rápido: `openssl rand -hex 16`

**`DCMonitor/raspberry/.env`** (para simular o Pi no WSL):

```bash
cp raspberry/.env.example raspberry/.env
```

Edite com:

```env
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=fdctmon_iot
MQTT_PASSWORD=senha_mqtt_local_123
```

---

### 2.2 Subir o Docker Compose

```bash
docker compose up -d --build
```

Aguarde ~30 s e verifique se todos os serviços estão saudáveis:

```bash
docker compose ps
```

Saída esperada:
```
NAME            STATUS          PORTS
dcmonitor-mosquitto-1   Up (healthy)    0.0.0.0:1883->1883/tcp
dcmonitor-postgres-1    Up (healthy)    5432/tcp
dcmonitor-n8n-1         Up              0.0.0.0:5678->5678/tcp
dcmonitor-web-1         Up              0.0.0.0:5000->5000/tcp
```

> Se o container `web` falhar na primeira tentativa (antes do postgres estar
> pronto), rode `docker compose restart web`.

---

### 2.3 Configurar os fluxos n8n

1. Acesse `http://localhost:5678` (usuário/senha definidos no `.env`)
2. Crie as credenciais conforme [n8n/README.md](../n8n/README.md)
3. Importe `n8n/flow_principal.json` e `n8n/flow_retencao.json`
4. Ative o fluxo principal com o toggle

---

### 2.4 Simular o Raspberry Pi (publicar mensagem MQTT)

Com os serviços no ar, publique uma mensagem como se fosse o Pi:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "fdctmon/b827eb00f6d0/attrs" \
  -m '{"device_id":"b827eb00f6d0","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'
```

---

### 2.5 Verificar cada etapa do ciclo de dados (RNF-008)

#### Broker — mensagens chegando ao Mosquitto
```bash
# Em um terminal separado, antes de publicar:
mosquitto_sub -h localhost -p 1883 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "fdctmon/#" -v
```
Deve exibir a mensagem JSON assim que for publicada.

#### n8n — execução do fluxo
Acesse `http://localhost:5678` → abra o fluxo principal → aba **Executions**.
Deve aparecer uma execução bem-sucedida com os dados da mensagem em cada nó.

#### PostgreSQL — registro gravado no banco
```bash
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "SELECT id, timestamp, device_id, temperatura, fumaca, distancia FROM medicoes ORDER BY timestamp DESC LIMIT 3;"
```

#### Flask API — endpoint de status
```bash
curl -s http://localhost:5000/api/status | python3 -m json.tool
```

Saída esperada:
```json
{
    "online": true,
    "registro": {
        "timestamp": "2026-06-08T...",
        "device_id": "b827eb00f6d0",
        "temperatura": 25.3,
        "umidade": 60.0,
        "fumaca": 0,
        "presenca_notificavel": 0,
        "distancia": 185.5
    }
}
```

#### Dashboard no browser
Abra `http://localhost:5000` — deve exibir os valores e badge **ONLINE**.

#### Testar banner de dispositivo offline
Aguarde 2+ minutos sem publicar nada e recarregue o dashboard.
O badge deve mudar para **OFFLINE** e o banner vermelho deve aparecer.

Ou force instantaneamente com uma mensagem com timestamp antigo via SQL:
```bash
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "UPDATE medicoes SET timestamp = NOW() - INTERVAL '5 minutes' WHERE id = (SELECT MAX(id) FROM medicoes);"
```
Aguarde até 10 s (próximo polling) e o banner aparece.

---

### 2.6 Testar a retenção de 90 dias

```bash
# Inserir registro antigo manualmente
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "INSERT INTO medicoes (timestamp, device_id, temperatura, umidade, fumaca, presenca_notificavel, distancia)
      VALUES (NOW() - INTERVAL '91 days', 'b827eb00f6d0', 22.0, 55.0, 0, 0, 200.0);"

# Confirmar que existe
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "SELECT COUNT(*) FROM medicoes WHERE timestamp < NOW() - INTERVAL '90 days';"
# → 1

# No n8n: abrir flow_retencao → Test workflow
# Depois:
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "SELECT COUNT(*) FROM medicoes WHERE timestamp < NOW() - INTERVAL '90 days';"
# → 0
```

---

### 2.7 Encerrar o ambiente

```bash
docker compose down          # para e remove containers (dados preservados nos volumes)
docker compose down -v       # para, remove containers E apaga volumes (banco zerado)
```

---

---

## Nível 3 — Homologação com simulador (fluxo completo sem Zabbix)

Simula o Raspberry Pi com valores aleatórios em loop contínuo.
Ideal para validar o fluxo Dispositivo → MQTT → n8n → Dashboard sem hardware real.

### 3.1 Pré-requisitos

Docker Compose no ar (Nível 2) e fluxo n8n importado.
Ao importar no n8n, use `n8n/flow_principal_sem_zabbix.json` — é idêntico ao
principal mas sem o nó Zabbix, evitando timeouts de conexão ao servidor 10.32.8.57.

### 3.2 Instalar dependências do simulador

```bash
# No mesmo venv do Nível 1 (ou um novo)
pip install paho-mqtt python-dotenv
```

### 3.3 Configurar o .env do simulador

```bash
cp raspberry/.env.example raspberry/.env
```

Conteúdo para homologação local:

```env
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=fdctmon_iot
MQTT_PASSWORD=senha_mqtt_local_123
```

Opcionalmente, defina um nome para identificar o dispositivo simulado no banco:

```env
SIMULATOR_DEVICE_ID=homolog_001
```

### 3.4 Abrir os terminais

Abra **3 terminais** lado a lado:

**Terminal 1 — observar o broker em tempo real:**
```bash
mosquitto_sub -h localhost -p 1883 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "fdctmon/#" -v
```

**Terminal 2 — rodar o simulador:**
```bash
cd DCMonitor
source venv/bin/activate
cd raspberry
python3 sensor_simulator.py
```

Você verá logs de amostragem a cada 2 s e publicação MQTT a cada 10 s:
```
2026-06-08 14:30:00 [INFO] Simulador iniciando — device_id=homolog_001
2026-06-08 14:30:00 [INFO] Conectando ao broker localhost:1883 ...
2026-06-08 14:30:00 [INFO] MQTT conectado ao broker localhost:1883
2026-06-08 14:30:00 [INFO] MQ-2 simulado: raw=0 historico=[0] confirmado=0
2026-06-08 14:30:00 [INFO] → fdctmon/homolog_001/attrs: {"device_id": "homolog_001", "temp": 24.7, "umid": 58.3, "fumaca": 0, "presenca_notificavel": 0, "distancia": 287.4}
2026-06-08 14:30:02 [INFO] MQ-2 simulado: raw=0 historico=[0, 0] confirmado=0
```

**Terminal 3 — confirmar gravação no banco:**
```bash
watch -n 3 'docker compose exec -T postgres psql -U fdctmon -d fdctmon \
  -c "SELECT id, timestamp::time, device_id, temperatura, fumaca, presenca_notificavel, distancia FROM medicoes ORDER BY timestamp DESC LIMIT 5;"'
```

### 3.5 Verificar o dashboard

Abra `http://localhost:5000` no browser.
Os valores devem atualizar a cada 10 s com os dados gerados pelo simulador.

Para testar o banner de offline, encerre o simulador com `Ctrl+C` e aguarde 2 minutos.

### 3.6 Verificar execuções no n8n

Acesse `http://localhost:5678` → abra o fluxo `FdctMonSys - Principal SEM Zabbix`
→ aba **Executions**. Deve mostrar uma execução bem-sucedida a cada 10 s.

---

## Resumo dos comandos por nível

| O que testar | Comando | Docker necessário? |
|---|---|---|
| Regras de negócio Flask | `pytest web/tests/ -v` | Não |
| Lógica de presença notificável | `pytest web/tests/ -v` | Não |
| Stack completo | `docker compose up -d` | Sim |
| Simular Pi (mensagem única) | `mosquitto_pub ...` | Sim |
| Simulador contínuo (homologação) | `python3 raspberry/sensor_simulator.py` | Sim |
| Verificar banco | `docker compose exec postgres psql ...` | Sim |
| Verificar API | `curl http://localhost:5000/api/status` | Sim |
| Dashboard visual | Browser em `http://localhost:5000` | Sim |
