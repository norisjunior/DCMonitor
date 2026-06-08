################################################################################
########################### Fundacentro - FdctMonSys ###########################
#
# App para envio das informações medidas no raspberry para o srvraspberry
# o srvraspberry roda uma plataforma em nuvem (FIWARE)
# Essa plataforma contém:
# Mosquitto: MQTT Broker responsável por fazer a troca de mensagens entre
#            o dispositivo raspberry e a plataforma em nuvem, entregando
#            as mensagens para (e recebendo do) IoT Agent
#            As mensagens estão no formato:
#            Transmissão do dispositivo para a plataforma:
#            - /ul/19662024/b827eb00f6d0/attrs
#            Recepção de comandos vindos da plataforma para o dispositivo:
#            - /19662024/b827eb00f6d0/cmd
#            '19662024' é a api-key usada nesse projeto
#            'b827eb00f6d0' é o identificador do dispositivo usado neste projeto
# IoT Agent: faz interface com o raspberry pi, pegando as medições e enviando
#            comandos para o dispositivo
# Orion    : Context-Broker, responsável pela comunicação via HTTP com o
#            usuário final. Toda a comunicação com o app é via requests HTTP
# MongoDB  : Base de dados que contém a última medição coletada, e contém
#            a estrutura de base de dados de execução do Orion e IoT Agent
# MySQL    : Base de dados que contém o histórico de medições coletadas pelo
#            dispositivo
#
# Autor: Norisvaldo Ferraz Junior, norisjunior@fundacentro.gov.br
#
################################################################################
#versão 1.0 - janeiro/2024
################################################################################

######imports sensores raspberry
import RPi.GPIO as GPIO
import Adafruit_DHT

######imports mac address
import uuid

######imports gerais
import time
import datetime
import os
import random

######imports para conexão MQTT
import paho.mqtt.client as mqtt



################Configurações dos sensores
######GPIO configs
GPIO.setmode(GPIO.BCM)

######DHT11 config
dht_sensor = Adafruit_DHT.DHT11
dht_sensor_pin = 26

######MQ2 config
mq2_do_pin = 4
GPIO.setup(mq2_do_pin, GPIO.IN)

######HC-SR04
dist_trig = 17 #cabo verde
dist_echo = 27 #cabo amarelo
GPIO.setup(dist_trig, GPIO.OUT)
GPIO.setup(dist_echo, GPIO.IN)



################Funções de medição dos sensores dos dispositivos

## Função de medição de distância (sensor HC-SR04)
def mede_distancia():
    # set Trigger to HIGH
    GPIO.output(dist_trig, True)

    # set Trigger after 0.01ms to LOW
    time.sleep(0.00001)
    GPIO.output(dist_trig, False)

    StartTime = time.time()
    StopTime = time.time()

    # save StartTime
    while GPIO.input(dist_echo) == 0:
        StartTime = time.time()

    # save time of arrival
    while GPIO.input(dist_echo) == 1:
        StopTime = time.time()

    # time difference between start and arrival
    TimeElapsed = StopTime - StartTime
    # multiply with the sonic speed (34300 cm/s)
    # and divide by 2, because there and back
    distance = (TimeElapsed * 34300) / 2

    return distance

## Função de medição de temperatura e umidade (sensor DHT_11)
def mede_temp_umid():
    umid, temp = Adafruit_DHT.read_retry(dht_sensor, dht_sensor_pin)
    if umid is not None and temp is not None:
        print('Temp={0:0.1f}ºC  -  Umid={1:0.1f}%'.format(temp, umid))
    else:
        print("DHT11 Sensor failure. Check wiring.")

    return temp, umid


## Função de medição de gas/fumaça (sensor MQ2)
def mede_fumaca():
    gas_present = GPIO.input(mq2_do_pin)
    if gas_present == GPIO.LOW:
        gas_presente = 1
    else:
        gas_presente = 0

    return gas_presente


######Plataforma em nuvem FIWARE configs:
#Endereço deste dispositivo: b827eb00f6d0, capturado via:
dispositivo_iot=hex(uuid.getnode())[2:]






################Variáveis de controle do MQTT e transmissão
broker = "192.168.10.90" #servidor 192.168.10.90, que está o Mosquitto MQTT Broker
client = mqtt.Client("dispositivo_iot")
sub_topic = "/19662024/b827eb00f6d0/cmd"
pub_topic = "/ul/19662024/b827eb00f6d0/attrs"
Connected = False
transmission_delay = 2


#Configurações do comando zabbix_sender
cmd_zabbix = 'zabbix_sender -z 10.32.8.57 -s \"SALA COFRE\" '
cmd_param_temp = '-k temperatura -o {}'
cmd_param_umid = '-k umidade -o {}'
cmd_param_fumaca = '-k fumaca -o {}'
cmd_param_presenca = '-k presenca -o {}'







################################################################################
# Funções para conexão com MQTT Broker:
#Conexão com o MQTT Broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        global Connected                #Use global variable
        Connected = True                #Signal connection

        # Subscribing in on_connect() - if we lose the connection and
        # reconnect then subscriptions will be renewed.
        client.subscribe(sub_topic)
    else:
        print("Falha na conexão com o Broker... ", rc)

# Recebendo mensagem MQTT
def on_message(client, userdata, msg):
    print('\nMensagem recebida')
    print(" - tópico: ", msg.topic)
    print(" - mensagem: " , msg.payload)










################################################################################
# Funções para coleta de medições dos sensores

###################### Coletando medições distância/presença e gás/fumaça:
def coleta_presenca_fumaca():
    #Verifica distância
    print("\n---------------------------------------------------------")
    print("Medições do sensor HC-SR04:")
    dist = mede_distancia()
    print(f"Distância até a porta: %0.2f cm" % dist)

    #Caso a distância seja menor que 2 metros marca como presença
    presence = 0
    presence_notify = 0
    if dist < 200: #2 metros, 200 centímetros
        presence = 1
    else:
        presence = 0

    now = datetime.datetime.now()
    dezdanoite = now
    dezdanoite = dezdanoite.replace(hour=22, minute=0, second=0, microsecond=0)
    seisdamanha = now
    seisdamanha = seisdamanha.replace(hour=6, minute=0, second=0, microsecond=0)
    print(f"now: {now:%H:%M:%S}; dezdanoite: {dezdanoite:%H:%M:%S}; seisdamanha: {seisdamanha:%H:%M:%S}")

    #Se tiver presença depois das 22h e antes das 6h, envia notificação
    if (now.time() >= dezdanoite.time()) or (now.time() <= seisdamanha.time()):
        if presence == 1:
            presence_notify = 1

    print(f"presence_notify: %s" % presence_notify)

    payload_presenca = '033020|%d' % presence_notify
    print('PayloadPresence={}'.format(payload_presenca))


    #Medições de fumaça (sensor MQ2):
    print("\n----------------------------------------------------------")
    print("Medições do sensor MQ2:")
    fumaca = mede_fumaca()
    if fumaca:
        gas_state = "FUMAÇA!"
    else:
        gas_state = "Sem fumaça"
    print(f"Status da Fumaça: {gas_state}")
    payload_gas = '033250|%d' % fumaca
    print('PayloadGas={}'.format(payload_gas))

    return presence_notify, payload_presenca, fumaca, payload_gas




###################### Coletando medições de temperatura, umidade e fumaça:
def coleta_temp_umid():
    #Medições de temperatura e umidade (sensor DHT11):
    print("\n\n----------------------------------------------------------")
    print("Medições do sensor DHT11:")
    temperatura, umidade = mede_temp_umid()
    payload_temperatura = '033030|%0.2f' % (temperatura)
    payload_umidade = '033040|%0.2f' % (umidade)
    print('PayloadTemp={}'.format(payload_temperatura))
    print('PayloadUmid={}'.format(payload_umidade))

    return temperatura, umidade, payload_temperatura, payload_umidade
################################################################################




################################################################################
# Funções para transmissão dos valores medidos
# Transmite para a plataforma FIWARE e para o zabbix

###################### Transmite presença:
def envia_presenca_fumaca(notifica_presenca, payload_presence, fumaca, payload_fumaca):
    print("\n---------------------------------------------------------")
    print('Transmissão de presença e fumaça:')
    #print(f"PRESENÇA ANTES DE ENVIAR: payload_presence {payload_presence}, notifica_presenca {notifica_presenca}, payload_fumaca {payload_fumaca}, fumaca {fumaca}")
    #Transmite presença
    client.publish(pub_topic, payload_presence)
    os.system((cmd_zabbix+cmd_param_presenca) .format(notifica_presenca))
    #Transmite fumaça
    client.publish(pub_topic, payload_fumaca)
    os.system((cmd_zabbix+cmd_param_fumaca) .format(fumaca))


###################### Transmite temperatura, umidade e fumaça:
def envia_temp_umid(temp, umid, payload_temp, payload_umid):
    #Transmite para a plataforma FIWARE e para o zabbix
    print("\n---------------------------------------------------------")
    print('Transmissão de temperatura, umidade:')
    #print(f"TEMP, UMID, FUMAÇA ANTES DE ENVIAR: payload_temp {payload_temp}, payload_umid {payload_umid}, temp {temp}, umid {umid}")

    #Transmite temperatura
    client.publish(pub_topic, payload_temp)
    os.system((cmd_zabbix+cmd_param_temp) .format(temp))
    #Transmite umidade
    client.publish(pub_topic, payload_umid)
    os.system((cmd_zabbix+cmd_param_umid) .format(umid))
################################################################################




################################################################################
################################################################################
#Inicialização do app:

if __name__ == "__main__":
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(broker, 1883, 60)
    client.loop_start()         #start the loop
    while Connected != True:    #Wait for connection
        time.sleep(0.1)

    interval = 0

    ############################################################################
    #Uma vez conectado no MQTT, inicia as transmissões sem interrupção

    try:
        while True:
            # Verifica distância a cada 2 segundos
            notifica_presenca, payload_presence, fumaca, payload_fumaca = coleta_presenca_fumaca()
            envia_presenca_fumaca(notifica_presenca, payload_presence, fumaca, payload_fumaca)
            # A cada 30 segundos envia medições de temp, umid e fumaça
            if interval == 30:
                temp, umid, payload_temp, payload_umid = coleta_temp_umid()
                envia_temp_umid(temp, umid, payload_temp, payload_umid)
                interval = 0
            interval += 2
            time.sleep(transmission_delay)


    except KeyboardInterrupt:
        print("App finalizado...")
        client.loop_stop()
        client.disconnect()

    finally:
        GPIO.cleanup()
