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
################################################################################
#versão 1.0
################################################################################
#

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

#Função de medição de distância
def distance():
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


######Plataforma em nuvem FIWARE configs:
#Endereço deste dispositivo: b827eb00f6d0, capturado via:
dispositivo_iot=hex(uuid.getnode())[2:]



################Variáveis de controle do MQTT e transmissão

broker = "192.168.10.90" #servidor 192.168.10.90, que está o Mosquitto MQTT Broker
client = mqtt.Client("dispositivo_iot")
sub_topic = "/19662024/b827eb00f6d0/cmd"
pub_topic = "/ul/19662024/b827eb00f6d0/attrs"
Connected = False
transmission_delay = 30


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



# Publicando
def on_publish():
    #Coleta as medições dos sensores do raspberry pi

    ###################### Coletando medições de temperatura e umidade:
    #Medições de temperatura e umidade (sensor DHT11):
    umid, temp = Adafruit_DHT.read_retry(dht_sensor, dht_sensor_pin)
    print("\n\n----------------------------------------------------------")
    print("Medições do sensor DHT11:")
    if umid is not None and temp is not None:
        print('Temp={0:0.1f}ºC  -  Umid={1:0.1f}%'.format(temp, umid))
        payload_temp = '033030|%0.2f' % (temp)
        payload_umid = '033040|%0.2f' % (umid)
        print('PayloadTemp={}'.format(payload_temp))
        print('PayloadUmid={}'.format(payload_umid))
    else:
        print("DHT11 Sensor failure. Check wiring.")

    ###################### Coletando medições de gás/fumaça:
    #Medições de fumaça (sensor MQ2):
    gas_present = GPIO.input(mq2_do_pin)
    print("\n----------------------------------------------------------")
    print("Medições do sensor MQ2:")
    if gas_present == GPIO.LOW:
        gas_state = "FUMAÇA!"
        gas_presente = 1
    else:
        gas_state = "Sem fumaça"
        gas_presente = 0
    print(f"Status da Fumaça: {gas_state}")
    payload_gas = '033250|%d' % gas_presente
    print('PayloadGas={}'.format(payload_gas))

    ###################### Coletando medições de temperatura e umidade:
    #Verifica distância
    print("\n----------------------------------------------------------")
    print("Medições do sensor HC-SR04:")
    dist = distance()
    print(f"Distância até a porta: %0.2f cm" % dist)

    if dist <= 3:
        presence = 0
    else:
        presence = 1

    now = datetime.datetime.now()
    dezdanoite = now
    dezdanoite = dezdanoite.replace(hour=22, minute=0, second=0, microsecond=0)
    seisdamanha = now
    seisdamanha = seisdamanha.replace(hour=6, minute=0, second=0, microsecond=0)

    print(f"now: {now:%H:%M:%S}; dezdanoite: {dezdanoite:%H:%M:%S}; seisdamanha: {seisdamanha:%H:%M:%S}")
    if (now.time() >= dezdanoite.time()) and (now.time() <= seisdamanha.time()):
        print(f"now: %s, dezdanoite: %s, seisdamanha: %s" % now.time(), dezdanoite.time(), seisdamanha.time())
        if presence == 1:
            presence_notify = 1
        else:
            presence_notify = 0
    else:
        presence_notify = 0

    print(f"presence_notify: %s" % presence_notify)

    payload_presence = '033020|%d' % presence_notify
    print('PayloadPresence={}'.format(payload_presence))


    #Transmite temperatura para a plataforma FIWARE
    #Transmite temperatura
    client.publish(pub_topic, payload_temp)
    time.sleep(3)
    client.publish(pub_topic, payload_umid)
    time.sleep(3)
    client.publish(pub_topic, payload_gas)
    time.sleep(3)
    client.publish(pub_topic, payload_presence)

    # END on_publish() #########################################################


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

    ############################################################################
    #Uma vez conectado no MQTT, inicia as transmissões sem interrupção

    try:
        while True:
            #Continuamente envia as medições
            on_publish()
            time.sleep(transmission_delay)


    except KeyboardInterrupt:
        print("App finalizado...")
        client.loop_stop()
        client.disconnect()

    finally:
        GPIO.cleanup()
