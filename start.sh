REMOTE_PATH=$1
CONTAINER_NAME=$2
cd $REMOTE_PATH
yarn 
yarn run dev:build

pid="$(pm2 pid $CONTAINER_NAME)"
exitCode=$?
if [[ $pid == 0 ]] && [[ $exitCode == 0 ]]; then
    pm2 start dist/bundle.js --name $CONTAINER_NAME
else
    pm2 restart $CONTAINER_NAME
fi

pm2 logs $CONTAINER_NAME
