# n8n — Configuração e importação dos fluxos

## 1. Subir o ambiente

```bash
cp .env.example .env   # preencha as variáveis
docker compose up -d
```

Acesse o n8n em http://<ip-servidor>:5678

## 2. Criar as credenciais (uma única vez)

### Credencial MQTT — "FdctMonSys MQTT"

Menu → Credentials → New → MQTT
| Campo    | Valor                       |
|----------|-----------------------------|
| Host     | mosquitto  *(nome do serviço Docker)* |
| Port     | 1883                        |
| Protocol | mqtt                        |

### Credencial PostgreSQL — "FdctMonSys PostgreSQL"

Menu → Credentials → New → Postgres
| Campo    | Valor                   |
|----------|-------------------------|
| Host     | postgres                |
| Port     | 5432                    |
| Database | (valor de POSTGRES_DB)  |
| User     | (valor de POSTGRES_USER)|
| Password | (valor de POSTGRES_PASSWORD) |

## 3. Fluxos disponíveis

| Arquivo | Usar quando | Zabbix necessário? |
|---|---|---|
| `flow_principal.json` | Produção — envia ao banco **e** ao Zabbix | Sim |
| `flow_principal_sem_zabbix.json` | Homologação / teste local — somente banco | Não |
| `flow_retencao.json` | Ambos os ambientes — limpeza de 90 dias | Não |

## 4. Importar os fluxos

Menu → Workflows → Import from file

**Produção:**
1. Importe `flow_principal.json`
2. Importe `flow_retencao.json`

**Homologação / teste local (sem Zabbix):**
1. Importe `flow_principal_sem_zabbix.json`
2. Importe `flow_retencao.json`

Após importar cada fluxo, abra-o, associe as credenciais nos nós indicados
e **ative o fluxo** com o toggle no canto superior direito.

## 5. Verificar funcionamento

### Fluxo principal
```bash
# Publicar mensagem de teste no broker
mosquitto_pub -h <ip-servidor> -t "fdctmon/b827eb00f6d0/attrs" \
  -m '{"device_id":"b827eb00f6d0","temp":25.3,"umid":60.0,"fumaca":0,"presenca_notificavel":0,"distancia":185.5}'

# Confirmar registro no banco
docker compose exec postgres psql -U fdctmon -d fdctmon \
  -c "SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 3;"
```

### Fluxo de retenção
Na UI do n8n: abra o fluxo → clique em "Test workflow" → confirme que não há erro.

## 6. Nós e responsabilidades

### flow_principal.json (produção)
| Nó | Responsabilidade |
|----|-----------------|
| MQTT Trigger | Recebe JSON do tópico `fdctmon/#` |
| Parse JSON | Valida e sanitiza campos; falha explícita se payload inválido |
| INSERT medicoes | Grava no banco com timestamp automático do servidor |
| Envia ao Zabbix | Chama `zabbix_sender` para os 4 itens; `continueOnFail=true` |

### flow_principal_sem_zabbix.json (homologação)
| Nó | Responsabilidade |
|----|-----------------|
| MQTT Trigger | Recebe JSON do tópico `fdctmon/#` |
| Parse JSON | Valida e sanitiza campos; idêntico ao fluxo de produção |
| INSERT medicoes | Grava no banco com timestamp automático do servidor |

### flow_retencao.json
| Nó | Responsabilidade |
|----|-----------------|
| Agenda Diária 02h | Dispara às 02:00 todos os dias |
| DELETE medicoes antigas | Remove registros com mais de 90 dias |
