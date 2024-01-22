######################################
Informações para uso da plataforma:


Acesso ao banco MySQL:
docker exec -it  db-mysql mysql -h mysql-db -P 3306  -u root -pFdctMonD@t@

Tabelas onde estão as medições:
fundacentro.b827eb00f6d0_Raspberry

#Buscando todas as medições:
SELECT * FROM fundacentro.b827eb00f6d0_Raspberry
ORDER BY recvTimeTs DESC
LIMIT 20;


SELECT * FROM (
    SELECT * FROM fundacentro.b827eb00f6d0_Raspberry
    ORDER BY recvTimeTs
    DESC LIMIT 20)
    sub ORDER BY recvTimeTs ASC;

