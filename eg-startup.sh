#!/bin/sh

# Exit immediately on error
set -o errexit

BOLD="\033[1m"
RESET="\033[0m"

# If GOOGLE_KEY_FILE_CONTENTS is set, write it to the file specified by GOOGLE_KEY_JSON_FILENAME
if [ -n "$GOOGLE_KEY_FILE_CONTENTS" ]; then
    echo "Found ${BOLD}GOOGLE_KEY_FILE_CONTENTS${RESET}, writing to ${BOLD}GOOGLE_KEY_JSON_FILENAME${RESET}: $GOOGLE_KEY_JSON_FILENAME"

    # Create the parent directory if it doesn't exist
    mkdir -p $(dirname "$GOOGLE_KEY_JSON_FILENAME")

    echo "$GOOGLE_KEY_FILE_CONTENTS" > "$GOOGLE_KEY_JSON_FILENAME"
else
    echo "${BOLD}GOOGLE_KEY_FILE_CONTENTS${RESET} not set, skipping Google key setup"
fi

# If FAVICON_PNG_URL is set, download the favicon and overwrite the existing files
if [ -n "$FAVICON_PNG_URL" ]; then
    echo "Found ${BOLD}FAVICON_PNG_URL${RESET}, downloading favicon $FAVICON_PNG_URL to /tmp/favicon.png"

    curl -L "$FAVICON_PNG_URL" -o /tmp/favicon.png


    FAVICON_FILES="
        /app/client/dist/assets/favicon-16x16.png
        /app/client/dist/assets/favicon-32x32.png
        /app/client/dist/assets/apple-touch-icon-180x180.png
    "

    for FILE in $FAVICON_FILES; do
        echo "Overwriting ${BOLD}$FILE${RESET}"
        cp /tmp/favicon.png "$FILE"
    done
else
    echo "${BOLD}FAVICON_PNG_URL${RESET} not set, skipping custom favicon setup"
fi
