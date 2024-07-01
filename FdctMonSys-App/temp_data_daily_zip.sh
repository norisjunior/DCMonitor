#!/bin/bash

# Get the current year and month
CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%m)

# Calculate the previous month and year
if [ "$CURRENT_MONTH" -eq 01 ]; then
  PREVIOUS_YEAR=$((CURRENT_YEAR - 1))
  PREVIOUS_MONTH=12
else
  PREVIOUS_YEAR=$CURRENT_YEAR
  PREVIOUS_MONTH=$(printf "%02d" $((10#$CURRENT_MONTH - 1)))
fi

# Define the directory and log file
DIRECTORY="/Fundacentro/temp_data_daily"
LOG_FILE="/var/log/temp_data_daily-${PREVIOUS_YEAR}${PREVIOUS_MONTH}.log"

# Define the zip file name
ZIP_FILE="${DIRECTORY}/${PREVIOUS_YEAR}${PREVIOUS_MONTH}-temp_data.zip"

# Log the start of the script
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting zip and clean process for ${PREVIOUS_YEAR}-${PREVIOUS_MONTH}" >> "$LOG_FILE"

# Navigate to the directory
cd "$DIRECTORY" || { echo "$(date '+%Y-%m-%d %H:%M:%S') - Failed to change directory to $DIRECTORY" >> "$LOG_FILE"; exit 1; }

# Create the zip file of the previous month's .csv files
zip "$ZIP_FILE" ${PREVIOUS_YEAR}${PREVIOUS_MONTH}*-temp_data.csv >> "$LOG_FILE" 2>&1

# Check if the zip command was successful
if [ $? -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Successfully created zip file $ZIP_FILE" >> "$LOG_FILE"
  # Remove the original .csv files if the zip was successful
  rm -f ${PREVIOUS_YEAR}${PREVIOUS_MONTH}*-temp_data.csv
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Deleted original .csv files for ${PREVIOUS_YEAR}-${PREVIOUS_MONTH}" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Failed to create zip file. The .csv files will not be deleted." >> "$LOG_FILE"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Zip and clean process completed" >> "$LOG_FILE"
