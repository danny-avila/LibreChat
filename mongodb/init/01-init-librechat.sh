#!/bin/bash
# MongoDB initialization script for LibreChat

# Create the application database and user
mongosh --eval "
use LibreChat;

// Create indexes for better performance
db.users.createIndex({ 'email': 1 }, { unique: true });
db.conversations.createIndex({ 'user': 1, 'createdAt': -1 });
db.messages.createIndex({ 'conversationId': 1, 'createdAt': 1 });
db.sessions.createIndex({ 'expires': 1 }, { expireAfterSeconds: 0 });

// Create application user if it doesn't exist
try {
  db.createUser({
    user: '$MONGODB_APP_USER',
    pwd: '$MONGODB_APP_PASSWORD',
    roles: [
      {
        role: 'readWrite',
        db: 'LibreChat'
      }
    ]
  });
  print('Application user created successfully');
} catch (e) {
  print('Application user might already exist: ' + e.message);
}

print('LibreChat database initialized successfully');
"
