#!/bin/bash
# Pull the latest changes from your repository
git pull

# Stop and remove all containers
sudo docker-compose down

# Rebuild the services
sudo docker-compose build --no-cache --force-recreate

# Start up the services
sudo docker-compose up --force-recreate -d
