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

# No dispositivo raspberry, buscando nos logs a temperatura:
sudo journalctl -u FdctMonSys --since "2024-05-29" --until "2024-06-06 10:00" | grep "PayloadTemp"


# Fazendo a consulta via Orion:
curl -X GET   'http://temp.fundacentro.gov.br:1026/v2/entities/b827eb00f6d0?type=Raspberry&options=keyValues'   -H 'fiware-service: Fundacentro'   -H 'fiware-servicepath: /' | python3 -m json.tool
