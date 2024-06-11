#!/bin/bash
############################################
# Backup temperatura diária #
############################################

# Está schedulado para rodar todo dia à 01:00 AM
# 0 1 * * * /Fundacentro/bkp_temp_data.sh

####################################################################################
# Container info
contid=$(sudo docker ps | grep mysql | awk '{print $1}')
#echo "Container: $contid"

#Nome do arquivo:
day=$(date +%Y%m%d -d yesterday)
filename="$day-temp_data.csv"
log_filename="/var/log/temp_data_history-$day.log"

echo "Backup temperatura diária $day " > $log_filename

echo "Container: $contid" >> $log_filename

# Mostra mensagemI
echo "Extração temperatura diária em andamento" >> $log_filename
date
echo

# Realiza o comando

#Diretório onde ficará gravado o backup
bkp_dir="/Fundacentro/temp_data_daily"

#Entra no diretório SEI-backups
cd $bkp_dir

#Gera dump do MySQL
echo "Executando..." >> $log_filename

# Só temperatura de ontem:
#$(sudo docker exec $contid sh -c "exec mysql -h mysql-db -P 3306 -u root -pFdctMonD@t@ -e \"SELECT CONCAT_WS(',', recvTime, attrType, attrValue, recvTimeTs, CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo')) AS csv_row FROM fundacentro.b827eb00f6d0_Raspberry WHERE attrType = 'actual_temp' AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') >= CURDATE() - INTERVAL 1 DAY AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') < CURDATE() ORDER BY recvTimeTs ASC;\"" > $filename) >> $log_filename

# Valores de todos os sensores de ontem:
$(sudo docker exec $contid sh -c "exec mysql -h mysql-db -P 3306 -u root -pFdctMonD@t@ -e \"SELECT CONCAT_WS(',', recvTime, attrType, attrValue, recvTimeTs, CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo')) AS csv_row FROM fundacentro.b827eb00f6d0_Raspberry WHERE (attrType = 'actual_temp' OR attrType = 'actual_umid' OR attrType = 'actual_presence' OR attrType = 'actual_smoke') AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') >= CURDATE() - INTERVAL 1 DAY AND CONVERT_TZ(recvTime, '+00:00', 'America/Sao_Paulo') < CURDATE() ORDER BY recvTimeTs ASC;\"" > $filename) >> $log_filename

# Sincronização com o SRVFS:
echo "Sync ONEDRIVE " >> $log_filename

#Monta diretório
sudo mount.cifs //37841sp.ctn.fundacentro.intra/BKP_SEI /mnt/37841sp/ -o username=seibackup,password=copiatudo@1

# Sincroniza
cd $bkp_dir ; sudo rsync --rsync-path=/usr/bin/rsync -avz /Fundacentro/temp_data_daily/ /mnt/37841sp/temp_data_daily --delete

#Desmonta unidade
sudo umount -f /mnt/37841sp

echo "\nEnd" >> $log_filename
