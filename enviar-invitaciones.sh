#!/bin/bash
for email in $(cat emails.txt); do
    echo "Enviando invitación a: $email"
    npm run invite-user "$email"
done
echo "¡Listo! Todas las invitaciones enviadas."