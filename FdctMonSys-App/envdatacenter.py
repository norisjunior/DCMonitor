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
import os
import random

######imports para conexão MQTT
import paho.mqtt.client as mqtt



################Configurações dos sensores

######DHT11 config
dht_sensor = Adafruit_DHT.DHT11
dht_sensor_pin = 26

######MQ2 config
GPIO.setmode(GPIO.BCM)
mq2_do_pin = 4
GPIO.setup(mq2_do_pin, GPIO.IN)





######Plataforma em nuvem FIWARE configs:
#Endereço deste dispositivo: b827eb00f6d0, capturado via:
dispositivo_iot=hex(uuid.getnode())[2:]



################Variáveis de controle do MQTT e transmissão

broker = "192.168.10.90" #servidor 192.168.10.90, que está o Mosquitto MQTT Broker
client = mqtt.Client("dispositivo_iot")
sub_topic = "/19662024/b827eb00f6d0/cmd"
pub_topic = "/ul/19662024/b827eb00f6d0/attrs"
Connected = False
transmission_delay = 60


###################################################################################
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
    #Medições de temperatura e umidade (sensor DHT11):
    umid, temp = Adafruit_DHT.read_retry(dht_sensor, dht_sensor_pin)
    print("\n\nMedições do sensor DHT11:")
    if umid is not None and temp is not None:
        print('Temp={0:0.1f}ºC  -  Umid={1:0.1f}%'.format(temp, umid))
        payload_temp = '033030|%0.2f' % (temp)
        payload_umid = '033040|%0.2f' % (umid)
        print('PayloadTemp={}'.format(payload_temp))
        print('PayloadUmid={}'.format(payload_umid))
    else:
        print("DHT11 Sensor failure. Check wiring.")

    #Medições de fumaça (sensor MQ2):
    gas_present = GPIO.input(mq2_do_pin)
    print("\nMedições do sensor MQ2:")
    if gas_present == GPIO.LOW:
        gas_state = "FUMAÇA!"
        gas_presente = 1
    else:
        gas_state = "Sem fumaça"
        gas_presente = 0
    print(f"Status da Fumaça: {gas_state}")
    payload_gas = '033250|%d' % gas_presente
    print('PayloadGas={}'.format(payload_gas))

    #Transmite temperatura para a plataforma FIWARE
    #Transmite temperatura
    client.publish(pub_topic, payload_temp)
    time.sleep(3)
    client.publish(pub_topic, payload_umid)
    time.sleep(3)
    client.publish(pub_topic, payload_gas)


#########################################################################################
#########################################################################################
#Inicialização do app:

if __name__ == "__main__":
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(broker, 1883, 60)
    client.loop_start()         #start the loop
    while Connected != True:    #Wait for connection
        time.sleep(0.1)

    #####################################################################################
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
