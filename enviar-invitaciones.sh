#!/bin/sh
for email in $(cat emails.txt); do
    echo "Enviando invitacion a: $email"
    npm run invite-user "$email"
done
echo "Listo! Todas las invitaciones enviadas."