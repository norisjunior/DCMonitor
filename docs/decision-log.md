# Log de decisões

> Entradas mais recentes primeiro.

## 2026-11-25 — Credencial MQTT por dispositivo pelo plugin dynamic security

**Decisão:** Cada placa autentica no Mosquitto com usuário igual ao `device_id` e senha própria, gerada na página `/admin/`. O Mosquitto passa a usar o plugin dynamic security: o Node-RED, como cliente administrador, cria, troca e revoga credenciais por mensagens em `$CONTROL/dynamic-security/v1`, sem reiniciar o broker. Cada placa recebe o papel `disp-<device_id>`, com permissão apenas para publicar em `fdctmon/<device_id>/data` e `/status` e ler `fdctmon/<device_id>/cmd`. A senha compartilhada da frota e o `acl_file` por client-id saem. Na placa, a senha fica na NVS e é entregue uma única vez pela serial; sem senha, a placa não dorme e espera a linha `credencial <device_id> <senha>`. Substitui a decisão de 2026-11-25 sobre ACL por client-id.

**Justificativa:** O client-id é declarado pelo próprio cliente; com a senha compartilhada, qualquer placa podia se passar por outra. Com senha própria, a identidade vem da autenticação. O plugin evita editar arquivo de senhas e enviar sinal ao broker a cada placa nova, e o Node-RED já fala MQTT. A entrega pela serial mantém um binário único para a frota. A senha só existe em claro na resposta HTTP que a página mostra uma vez; o broker guarda o hash.

**Alternativas descartadas:** `password_file` com recarga por SIGHUP, que exigiria um processo com acesso ao container do Mosquitto; senha compilada por placa, que acaba com o binário único; portal Wi-Fi de configuração na placa, mais firmware para o mesmo resultado; ACL por padrão `%u` no plugin, que o Mosquitto 2.0.22 não substitui (verificado em protótipo: a regra literal funciona e a mesma regra com `%u` não autoriza nada).

**Consequências:** Placa nova só conecta depois de ter a senha gerada na página e colada na serial; ela não aparece mais sozinha como "novo" antes disso. Trocar a senha de uma placa exige apagar a flash e gravar de novo (`pio run -t erase`). A porta interna 1884 deixa de aceitar anônimo: o Node-RED usa `MQTT_ADMIN_USER`/`MQTT_ADMIN_PASSWORD`, e a contingência do n8n precisará de cliente próprio. Com `per_listener_settings false`, o administrador também autentica na 8883; por isso o `iniciar.sh` exige senha de ao menos 24 caracteres e o firewall limita a 8883 às redes das placas. A API só aceita IDs no formato `esp32-XXXXXXXXXXXX`, exige o cabeçalho `X-DCMonitor` contra CSRF e separa criar (POST, nunca sobrescreve) de trocar (PUT). A senha fica na flash da placa, legível por quem tiver acesso físico enquanto a criptografia de flash do ESP32 não for ativada. O arquivo de credenciais fica no host (`MQTT_SEGURANCA_DIR`) e entra no backup.

## 2026-11-25 — TLS na porta 8883 com CA própria

**Decisão:** As placas conectam somente pela porta 8883, com TLS, e verificam o certificado do broker contra uma CA própria do DCMonitor. `scripts/gerar_certificados.sh` cria a CA (10 anos) uma vez, emite o certificado do servidor (825 dias) com os nomes `vplviot.ctn.fundacentro.intra`, `mosquitto` e `localhost` e o IP `10.32.8.115`, e gera `ESP32/include/ca_cert.hpp` com o certificado público da CA. A porta 1883 deixa de existir.

**Justificativa:** Sem TLS, senha e telemetria trafegam em claro pelo Wi-Fi. Uma CA própria serve à rede apartada sem depender de autoridade externa. Com CA separada do certificado do servidor, renovar o certificado do servidor não exige regravar placas. O mbedTLS 2.28 do ESP32 compara o host só com entradas DNS do certificado, por isso o IP entra também como DNS.

**Alternativas descartadas:** Certificado do servidor autoassinado sem CA, que obrigaria a regravar a frota a cada renovação; `setInsecure()` no firmware, que cifra sem autenticar o broker; manter a 1883 em paralelo, que deixaria a senha exposta em placas mal configuradas.

**Consequências:** O handshake TLS se repete a cada despertar, com 1 a 2 s a mais por ciclo, e o firmware cresce cerca de 150 KB (flash em ~74,5 %). O `WiFiClientSecure` espera 30 s por padrão na conexão; o firmware limita a `TEMPO_MAXIMO_MQTT_S` para não estourar o watchdog do ciclo com o broker fora do ar. Uma CA nova exige regravar todas as placas, e é o único jeito de invalidar um certificado de servidor comprometido, porque a placa não verifica expiração nem revogação. A chave da CA (`pki/ca/ca.key`) é o segredo mais sensível da instalação e vai para cofre. É o passo intermediário até certificado de cliente por placa (mTLS com `use_identity_as_username`), que reaproveita a mesma CA e o mesmo usuário igual ao `device_id`.

## 2026-11-25 — Servidor como NTP das placas

**Decisão:** O chrony do servidor passa a servir hora às redes das placas (`allow` para `10.32.8.0/24`, `172.16.40.0/24` e `172.16.200.0/23`, `local stratum 10`), e o `NTP_SERVIDOR` do firmware aponta para ele.

**Justificativa:** A rede vai ficar apartada da internet, e as placas já alcançam o servidor para o MQTT; `local stratum 10` mantém o serviço sem fonte externa. O horário serve ao display e ao registro.

**Alternativas descartadas:** Piso de relógio pela data de compilação, avaliado para o TLS funcionar sem NTP e descartado ao confirmar que o mbedTLS do framework (Arduino-ESP32 2.0.17) é compilado sem verificação de datas (`CONFIG_MBEDTLS_HAVE_TIME_DATE` desligado): o TLS da placa já funciona sem relógio.

**Consequências:** Sem NTP, o display mostra `--:--` e o NTP é tentado a cada ciclo, com até 3 s a mais. A placa nunca verifica a expiração do certificado do broker, com ou sem NTP: um certificado de servidor vencido ou de chave vazada continua aceito até a CA ser trocada. Se uma versão futura do framework passar a verificar datas, o NTP do servidor se torna obrigatório para o TLS. A porta 123/udp precisa estar liberada no servidor para as redes das placas.

## 2026-11-25 — Segundo servidor Zabbix

**Decisão:** O Node-RED envia os mesmos itens a um segundo servidor Zabbix (`ZABBIX_SERVER_2`, hoje `10.32.8.69`), com os mesmos hosts e chaves. Vazio, o envio fica desligado. Os debugs `MSG RAW ESP32` e `MSG ZABBIX`, criados na interface em produção, passam a ser versionados no fluxo.

**Justificativa:** O segundo servidor existia só como edição feita na interface do Node-RED, com o IP fixo no nó; a recriação do volume exigida pelas mudanças de fluxo o apagaria sem aviso.

**Consequências:** Os dois servidores precisam dos mesmos hosts e itens trapper. Um erro de envio ao segundo servidor aparece no log, mas não afeta o primeiro nem o InfluxDB.

## 2026-11-25 — Tópicos `data`, `status` e `cmd`, sem local no tópico

**Decisão:** A telemetria passa de `fdctmon/{device_id}/attrs` para `fdctmon/{device_id}/data`. `fdctmon/{device_id}/status` continua como está e `fdctmon/{device_id}/cmd` fica reservado para comandos futuros. O local do dispositivo não entra no tópico. Firmware 1.5.0.

**Justificativa:** `attrs` era herança do FIWARE e não descreve o conteúdo. Com o local fora do tópico, o firmware continua igual em toda a frota e uma placa muda de lugar sem ser regravada: o local passa a ser um dado do servidor (cadastro de dispositivos). A versão do contrato segue no payload (`schema_version`), não no tópico.

**Alternativas descartadas:** `fdctmon/{local}/{device_id}/...` com uma credencial MQTT por local, que obriga uma gravação de firmware por local e outra a cada mudança de lugar; convenções como Sparkplug B e Homie, pesadas demais para um sensor por placa.

**Consequências:** O Node-RED assina `fdctmon/+/data` e rejeita payload cujo `device_id` difere do tópico. Placas com firmware anterior a 1.5.0 deixam de ser ingeridas até serem regravadas. Comandos futuros em `cmd` precisarão ser mensagens retidas, lidas pela placa ao acordar, por causa do deep sleep.

## 2026-11-25 — ACL por client-id com credencial única da frota

**Decisão:** A porta 1883 do Mosquitto passa a ter `acl_file`: cada cliente só escreve em `fdctmon/%c/data` e `fdctmon/%c/status` e só lê `fdctmon/%c/cmd`, onde `%c` é o client-id, que o firmware já define como o `device_id`. A credencial MQTT continua única para a frota. A porta interna 1884 não muda.

**Justificativa:** Uma linha `pattern` cobre a frota inteira, sem regra por dispositivo, e é o mesmo princípio das plataformas de IoT gerenciadas (política por identidade do dispositivo). Impede que uma placa com defeito ou mal configurada publique no tópico de outra e bloqueia a leitura do tráfego alheio na porta externa.

**Alternativas descartadas:** Credencial por local, que só ganha sentido com o local no tópico; credencial ou certificado por dispositivo, que daria identidade forte mas exige provisionamento individual, desproporcional à frota atual.

**Consequências:** O client-id é declarado pelo próprio cliente: quem tem a credencial da frota ainda pode se conectar com o client-id de outra placa. A ACL limita erro e abuso casual, não um atacante com a senha. Publicação negada é descartada sem erro para o cliente. Testes com `mosquitto_pub` na 1883 precisam de `-i` igual ao `device_id` do tópico, e `mosquitto_sub` na 1883 não recebe nada; a observação é feita pela 1884, dentro do container.

## 2026-11-25 — Cadastro de dispositivos no host, editado por página servida pelo Node-RED

**Decisão:** O local e o nome amigável de cada `device_id` ficam em `dispositivos.json`, num diretório do host (`CADASTRO_DIR`) montado em `/data/cadastro`. Uma página estática em `/admin/`, servida pelo próprio Node-RED (`httpStatic`), lê e grava o cadastro pela API `GET`/`PUT /api/cadastro` do fluxo, com login próprio (`httpNodeAuth`/`httpStaticAuth`), separado do editor. O fluxo de telemetria grava as tags `local` e `nome` no InfluxDB; placa sem cadastro grava `local=sem-local` e `nome={device_id}`. O Zabbix não muda.

**Justificativa:** O cadastro é dado operacional, não configuração: muda sem deploy e não pertence ao Git. No host, o arquivo é lido, copiado e restaurado sem ferramentas de volume Docker. Servir a página pelo Node-RED evita um serviço novo e deixa quem usa o cadastro (o fluxo) como único responsável por gravá-lo. O controle de revisão no `PUT` impede que duas janelas sobrescrevam uma à outra sem aviso.

**Alternativas descartadas:** Node-RED Dashboard 2.0, que adiciona dependência e lida mal com tabela editável; serviço web próprio (Flask ou similar), fora do escopo desde a saída da plataforma antiga; arquivo versionado no repositório, que exigiria commit e deploy para renomear uma placa; nome visível do Zabbix como fonte, que deixaria o Grafana sem os nomes; credencial MQTT por local como fonte do local (ver decisão de tópicos).

**Consequências:** O diretório precisa existir e pertencer ao UID 1000 antes de subir a stack. `CADASTRO_ADMIN_PASSWORD_HASH` é obrigatório: sem ele o Node-RED não sobe. A página compartilha a origem do editor, então todo texto do cadastro entra no DOM por `textContent`. Renomear ou mudar o local de uma placa vale para as medições seguintes; no histórico, o trecho anterior fica como série separada, com o nome antigo. A lista de placas vistas fica em memória e se refaz em um ciclo após reiniciar o Node-RED. Substitui, na decisão de 2026-09-17 sobre identidade, a ideia de manter nomes legíveis no Zabbix e no Grafana: o cadastro passa a ser a fonte, e o nome visível do Zabbix pode ser alimentado por ele no futuro.

## 2026-11-24 — ESP32 em deep sleep com transmissão a cada minuto

**Decisão:** O firmware 1.4.0 passa a trabalhar em ciclos: acorda, lê o DHT22, conecta ao Wi-Fi, publica `online` retido e a telemetria, desconecta com `DISCONNECT` limpo, atualiza o display e dorme 60 s fixos (`TEMPO_SONO_S`). Cada espera de rede tem limite e um watchdog de tarefa reinicia a placa se o ciclo acordado passar de 30 s. O cabeçalho do display ganha o horário da medição, sincronizado por NTP. Substitui D-015 (publicação a cada 30 s) e redefine RF-007.

**Justificativa:** O deep sleep reduz o consumo e o aquecimento do módulo, e a cadência de um minuto é suficiente para a inércia térmica de uma sala de datacenter. O sono fixo, em vez de um período compensado pelo tempo acordado, mantém o código simples; a variação de 3 a 6 s no período não afeta painéis nem alertas. A desconexão limpa evita que o Last Will publique `offline` a cada sono, o que tornaria o tópico de status ruído. Como o OLED segue alimentado e mantém a última imagem durante o sono, o horário na tela é o que permite a quem está no rack reconhecer um valor antigo; o watchdog garante que uma placa travada não fique acordada exibindo leitura velha.

**Alternativas descartadas:** Publicar `sleeping` antes de dormir, que faz o status oscilar a cada minuto e muda o contrato do tópico; remover o tópico de status; período fixo compensando o tempo acordado; desligar o display durante o sono, que deixaria a tela apagada quase o tempo todo; data completa no cabeçalho, que não cabe ao lado de `FUNDACENTRO` na fonte atual.

**Consequências:** O volume cai de 2.880 para cerca de 1.400 mensagens/dia por placa. O status retido fica `online` mesmo com a placa desligada; a disponibilidade passa a depender de gatilho `nodata` no Zabbix (sugestão: alguns minutos, acima de dois ciclos). A primeira leitura após energizar leva ~2 s a mais pela estabilização do DHT22. Sem acesso ao `NTP_SERVIDOR`, o horário aparece como `--:--` até a primeira sincronização; em rede sem internet é preciso apontar para o NTP interno. O `config.hpp` local precisa receber as constantes novas do `config.example.hpp`.

## 2026-09-17 — Identidade da frota derivada do chip, nomes legíveis no servidor

**Decisão:** Todo ESP32 recebe o mesmo binário. O `device_id` continua derivado de `ESP.getEfuseMac()` e passa a ser também o hostname de rede (`WiFi.setHostname()`) e o cabeçalho do display. Nomes legíveis para o NOC — sala, rack, andar — ficam no nome visível do host no Zabbix e nos rótulos do Grafana, nunca no firmware.

**Justificativa:** Uma placa nova entra em operação compilando e gravando, sem editar `config.hpp`, sem planilha de IDs e sem risco de dois dispositivos assumirem a mesma identidade — o que, no MQTT, derruba os dois em ciclo, porque o client-id também vem daí. Renomear um ponto de medição passa a ser uma edição no servidor, não uma regravação de firmware com a placa em campo.

**Alternativas descartadas:** `DEVICE_ID` fixo em `config.hpp` por dispositivo, que exige um build por placa e permite duplicidade silenciosa; publicar um campo `local`/`sala` no payload, que coloca no firmware uma informação que muda quando o equipamento é remanejado e obriga a regravar para corrigir um rótulo; tópico por sala em vez de por dispositivo, que perde a rastreabilidade de qual placa gerou a medição.

**Consequências:** O `device_id` atravessa MQTT, InfluxDB, Zabbix, DHCP e display sem tradução, e é o texto que se lê na placa para achar a série correspondente. Em troca, o identificador não é mnemônico: a correspondência entre `esp32-18B4C0D8CBB0` e "Sala Cofre" precisa existir em algum lugar do servidor — hoje no nome visível do host do Zabbix. O Node-RED assina `fdctmon/+/attrs`, então nenhuma placa nova exige alteração no fluxo; no Zabbix, cada uma exige um host homônimo criado antes do primeiro envio.

## 2026-09-17 — Raspberry Pi fora do escopo

**Decisão:** O Raspberry Pi deixa de fazer parte da plataforma. `raspberry/` sai do repositório e o ESP32 passa a ser o único dispositivo de campo. Substitui a decisão de 2026-07-13 sobre o contrato MQTT compatível durante a migração.

**Justificativa:** O dispositivo não será mais usado, então manter publicador, simulador, testes e a narrativa de coexistência espalhada pela documentação descreve um estado que não existe mais — e o que a documentação afirma sobre o sistema precisa ser verificável nele.

**Alternativas descartadas:** Mover `raspberry/` para `OLD_PROJECT/`, que preserva código morto no repositório sem ganho sobre o histórico do Git; manter os arquivos e apenas marcar como obsoletos na documentação, que mantém o custo de leitura e o risco de alguém reativá-los.

**Consequências:** `ic`, `rssi`, `sensor`, `schema_version` e `firmware_version` continuam opcionais na validação do Node-RED, agora por robustez — uma versão de firmware sem eles ainda grava temperatura e umidade — e não mais por compatibilidade com o payload legado. O fallback da tag `sensor` passa de `legacy` para `desconhecido`. `scripts/run_project_checks.sh` deixa de rodar `pytest`, que não tem mais alvo. O código do publicador permanece recuperável pelo histórico do Git.

## 2026-09-17 — Itens do Zabbix em array de arrays e host igual ao `device_id`

**Decisão:** O nó `Montar itens do Zabbix` passa a emitir `[[host, chave, valor], ...]`, com `host` igual ao `device_id` da medição e as chaves `temp`, `umid`, `headindex` e `rssi`. O campo `Default hostname` do nó `zabbix-sender` fica vazio e `ZABBIX_HOST_NAME` sai do serviço `node-red`.

**Justificativa:** O nó chama `addItem(...item)` da biblioteca `node-zabbix-sender`, cuja assinatura é `(host, key, value)` ou `(key, value)`. Qualquer outro formato — inclusive o array de objetos `{host, key, value}` — passa pela validação `Array.isArray`, não lança exceção e chega ilegível ao servidor: o fluxo fica verde e o Zabbix não registra nada. As chaves e o nome do host reproduzem o que já existe no Zabbix: o host `esp32-18B4C0D8CBB0` com os itens `temp`, `umid`, `headindex` e `rssi`.

**Alternativas descartadas:** Manter um host fixo por `ZABBIX_HOST_NAME`, que obriga a reconfigurar o serviço a cada dispositivo novo e mistura medições de origens diferentes no mesmo host; renomear os itens no Zabbix para `temperatura`, `umidade` e `indice_calor`, que altera um template compartilhado com outros hosts sem ganho funcional.

**Consequências:** Cada dispositivo precisa de um host no Zabbix com o nome exatamente igual ao seu `device_id`; um `device_id` sem host correspondente é recusado pelo servidor sem erro no Node-RED. As chaves do Zabbix deixam de coincidir com os fields do InfluxDB, e a correspondência passa a viver na constante `CHAVES` do nó. `headindex` mantém a grafia cadastrada no Zabbix; corrigir o item para `heatindex` exige alterar a constante na mesma sessão. `ZABBIX_HOST_NAME` continua apenas no serviço `n8n`, para a contingência `flow_zabbix.json`.

## 2026-09-10 — Node-RED envia ao Zabbix

**Decisão:** O fluxo Node-RED que grava no InfluxDB passa a enviar as mesmas medições aos itens trapper do Zabbix, em uma segunda saída do nó de validação. Substitui a decisão de 2026-07-13, que concentrava o Zabbix no n8n.

**Justificativa:** A validação de faixa e de `device_id` já acontece na ingestão; enviar dali reaproveita o dado validado, elimina o segundo consumidor MQTT e reduz a configuração manual do deploy — o n8n exigia criar credencial, importar e ativar o workflow a cada instalação.

**Alternativas descartadas:** Manter o envio no n8n, que duplica validação e depende de configuração manual; enviar dos dois, que grava cada medição duas vezes no Zabbix; ESP32→Zabbix, que acoplaria firmware a infraestrutura externa.

**Consequências:** O n8n fica sem workflow ativo, reservado às notificações Telegram; `n8n/flow_zabbix.json` e o `zabbix_sender` da imagem permanecem como contingência e não devem ser ativados junto com o fluxo do Node-RED. O item `rssi` entra no Zabbix. O nó `zabbix-sender` só acusa erro de transporte: item trapper inexistente é recusado pelo servidor sem aparecer no log.

## 2026-09-10 — Nó nativo do InfluxDB e credencial por variável de ambiente

**Decisão:** Trocar `function` + `http request` pelo nó `influxdb out` do `node-red-contrib-influxdb` na configuração 2.0. O token vai para `node-red/flows_cred.json` como o texto `${INFLUXDB_TOKEN}`.

**Justificativa:** O nó nativo escapa tags e fields, trata a resposta HTTP e mantém a conexão; o fluxo deixa de montar line protocol e cabeçalho `Authorization` à mão. O Node-RED resolve variáveis de ambiente também em credenciais, então a provisão automática continua sem segredo no repositório.

**Alternativas descartadas:** Manter `http request`, que obriga o fluxo a escapar caracteres de tag e a conferir `statusCode`; digitar o token na UI a cada instalação, que quebra o provisionamento automático; instalar o nó pelo palette manager, que não sobrevive à recriação do container.

**Consequências:** A imagem passa a instalar `node-red-contrib-influxdb@0.7.0`; `flows_cred.json` é provisionado em texto puro e regravado cifrado pelo Node-RED no primeiro deploy. Sem confirmação por `statusCode`, a falha de gravação chega apenas pelo nó `catch`. Measurement, tags e fields não mudaram, então o dashboard Grafana continua válido.

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

> Substituída pela decisão de 2026-09-10 — Node-RED envia ao Zabbix.

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

> Substituída pela decisão de 2026-09-17 — Raspberry Pi fora do escopo.

**Decisão:** O contrato mínimo é `device_id`, `temp` e `umid`; ESP32 v1 adiciona `ic`, `sensor`, `schema_version` e `firmware_version`.

**Justificativa:** Raspberry continua ativo sem exigir uma alteração arriscada no dispositivo legado.

**Alternativas descartadas:** Exigir imediatamente o payload ESP32 no Raspberry; tópicos diferentes por tecnologia.

**Consequências:** `ic` é nullable durante a transição e campos extras do Raspberry são ignorados.

## 2026-07-13 — Firmware ESP32 didático e não bloqueante

**Decisão:** Um `.ino` principal como orquestrador, dois headers por responsabilidade, configuração local, `millis()` para temporização e PubSubClient para MQTT.

**Justificativa:** Mantém o exemplo legível para aula sem sacrificar reconexão, Last Will e separação de segredos.

**Alternativas descartadas:** FreeRTOS/AsyncMqttClient nesta fase, por complexidade sem ganho necessário; código de motor/acelerômetro do protótipo, fora do domínio.

**Consequências:** Telemetria usa QoS 0 e se repete a cada 30 s; não há fila offline local.
