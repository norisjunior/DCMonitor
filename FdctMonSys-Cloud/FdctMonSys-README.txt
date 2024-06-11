######################################
Informações para uso da plataforma:

Acesso ao banco MySQL:
docker exec -it  db-mysql mysql -h mysql-db -P 3306  -u root -pFdctMonD@t@

Tabelas onde estão as medições:
fundacentro.b827eb00f6d0_Raspberry

# Buscando as medições mais recentes de temperatura
SELECT      recvTime, attrName, attrType, attrValue
FROM (
    SELECT      recvTime, attrName, attrType, attrValue, recvTimeTs
    FROM        fundacentro.b827eb00f6d0_Raspberry
    WHERE       attrName = "033030"
    ORDER BY    recvTimeTs DESC
    LIMIT       5000
) AS subquery
ORDER BY    recvTimeTs ASC;



# TRAZ TUDO DE TEMPERATURA LIMITANDO AOS 10 ÚLTIMOS:
# SELECT
#   CONCAT_WS(',', recvTime, attrType, attrValue, recvTimeTs) AS csv_row
# FROM (
#   SELECT recvTime, attrType, attrValue, recvTimeTs
#   FROM fundacentro.b827eb00f6d0_Raspberry
#   WHERE attrType = 'actual_temp'
#   ORDER BY recvTimeTs DESC
#   LIMIT 10
# ) AS subquery
# ORDER BY recvTimeTs ASC;


# TODAS AS MEDIÇÕES DE TEMPERATURA DE ONTEM:
# SELECT
#   CONCAT_WS(',', recvTime, attrType, attrValue, recvTimeTs, CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo')) AS csv_row
# FROM fundacentro.b827eb00f6d0_Raspberry
# WHERE attrType = 'actual_temp'
#   AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') >= CURDATE() - INTERVAL 1 DAY
#   AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') < CURDATE()
# ORDER BY recvTimeTs ASC;


# TODAS AS MEDIÇÕES DE TODOS OS SENSORES DE ONTEM:
#SELECT
#    CONCAT_WS(',', recvTime, attrType, attrValue, recvTimeTs, CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo')) AS csv_row
#
#FROM
#    fundacentro.b827eb00f6d0_Raspberry
#
#WHERE
#    (attrType = 'actual_temp' OR
#    attrType = 'actual_umid' OR
#    attrType = 'actual_presence' OR
#    attrType = 'actual_smoke')
#    AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') >= CURDATE() - INTERVAL 1 DAY
#    AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') < CURDATE()
#
#ORDER BY
#    recvTimeTs ASC;


# No dispositivo raspberry, buscando nos logs a temperatura:
sudo journalctl -u FdctMonSys --since "2024-05-29" --until "2024-06-06 10:00" | grep "PayloadTemp"


# Fazendo a consulta via Orion:
curl -X GET   'http://temp.fundacentro.gov.br:1026/v2/entities/b827eb00f6d0?type=Raspberry&options=keyValues'   -H 'fiware-service: Fundacentro'   -H 'fiware-servicepath: /' | python3 -m json.tool
