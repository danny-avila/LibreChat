#!/bin/bash

for email in $(cat emails.txt); do
    echo "Enviando invitación a: $email"
    docker exec -it LibreChat-API /bin/sh -c "cd .. && npm run invite-user $email"
    sleep 2
done

echo "¡Listo! Todas las invitaciones enviadas."
