#!/bin/bash

# Kill all processes on port 3080
echo "Killing all processes on port 3080..."
lsof -ti tcp:3080 | xargs kill -9

# Check if the kill command was successful
if [ $? -eq 0 ]; then
  echo "Processes on port 3080 have been terminated."
else
  echo "No processes were found on port 3080 or there was an error killing them."
fi

# Run the backend development server
echo "Starting the backend development server..."
npm run backend:dev
