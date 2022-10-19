#!/bin/bash

REMOTE_PATH=/data/projects/discord/vvmc-discord-bot
CONTAINER_NAME=vvmc-discord-bot

rsync -av --exclude node_modules  ./ dirk.arends.com.au:$REMOTE_PATH/

ssh dirk.arends.com.au $REMOTE_PATH/start.sh $REMOTE_PATH $CONTAINER_NAME
