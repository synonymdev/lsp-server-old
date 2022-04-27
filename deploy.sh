#!/bin/bash
set -e

if [ -z "$1" ]
  then
    echo "Please pass zip file"
    exit 1
fi

ZIP_FILE=$1
APP_DIR="./blocktank-server-master"
TMP_DIR="./.tmp-deploy"

rm -rf $TMP_DIR || echo "Tmp folder already deleted"
mkdir $TMP_DIR
cp -avr $APP_DIR/config $TMP_DIR
cp -avr $APP_DIR/status $TMP_DIR 

pm2 stop all || echo "Server already stopped?"
pm2 del all  || echo "PM2 already reset?"

rm -rf $APP_DIR

unzip $1

cd $APP_DIR
cp -avr ../${TMP_DIR}/config .
cp -avr ../${TMP_DIR}/status .

npm i

pm2 start ecosystem.config.js