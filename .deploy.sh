#!/bin/bash
# Pull the latest changes from your repository
git pull

# Stop and remove all containers
sudo docker-compose -f docker-compose.yml -f docker-compose.override.yml down --remove-orphans

# Rebuild the services
sudo docker-compose -f docker-compose.yml -f docker-compose.override.yml build --no-cache

# Start up the services
sudo docker-compose -f docker-compose.yml -f docker-compose.override.yml up --force-recreate -d
