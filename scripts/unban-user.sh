#!/bin/bash

# Script to unban LibreChat users
# Usage: ./unban-user.sh <email>
# Usage: ./unban-user.sh --all  (unbans all users)

set -e

USER_EMAIL="${1:-}"

if [ -z "$USER_EMAIL" ]; then
    echo "Usage: $0 <email>"
    echo "       $0 --all     (unban all users)"
    exit 1
fi

if [ "$USER_EMAIL" = "--all" ]; then
    echo "Unbanning all users..."
    docker compose exec -T mongodb mongosh chatdb --quiet --eval '
        const result = db.users.updateMany(
            {},
            { 
                $unset: { refreshTokens: "", bannedAt: "", banExpires: "" },
                $set: { isEnabled: true }
            }
        );
        print("Users updated: " + result.modifiedCount);
        
        // Also delete any ban records
        const banResult = db.bans.deleteMany({});
        print("Ban records deleted: " + banResult.deletedCount);
    '
    echo "✓ All users unbanned"
else
    echo "Unbanning user: $USER_EMAIL"
    docker compose exec -T mongodb mongosh chatdb --quiet --eval "
        const result = db.users.updateOne(
            { email: '$USER_EMAIL' },
            { 
                \$unset: { refreshTokens: '', bannedAt: '', banExpires: '' },
                \$set: { isEnabled: true }
            }
        );
        if (result.matchedCount === 0) {
            print('ERROR: User not found: $USER_EMAIL');
        } else if (result.modifiedCount === 0) {
            print('User was not banned: $USER_EMAIL');
        } else {
            print('✓ User unbanned: $USER_EMAIL');
        }
        
        // Also delete ban records for this user
        const user = db.users.findOne({ email: '$USER_EMAIL' });
        if (user) {
            const banResult = db.bans.deleteMany({ userId: user._id });
            if (banResult.deletedCount > 0) {
                print('Ban records deleted: ' + banResult.deletedCount);
            }
        }
    "
fi
