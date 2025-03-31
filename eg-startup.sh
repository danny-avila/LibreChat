#!/bin/sh

# Exit immediately on error
set -o errexit

# If GOOGLE_KEY_FILE_CONTENTS is set, write it to the file specified by GOOGLE_KEY_JSON_FILENAME
if env | grep -q GOOGLE_KEY_FILE_CONTENTS; then
    echo "Found GOOGLE_KEY_FILE_CONTENTS, writing to GOOGLE_KEY_JSON_FILENAME: $GOOGLE_KEY_JSON_FILENAME"

    # Create the parent directory if it doesn't exist
    mkdir -p $(dirname "$GOOGLE_KEY_JSON_FILENAME")

    echo "$GOOGLE_KEY_FILE_CONTENTS" > "$GOOGLE_KEY_JSON_FILENAME"
else
    echo "GOOGLE_KEY_FILE_CONTENTS not set, skipping Google key setup"
fi

# If FAVICON_PNG_URL is set, download the favicon and overwrite the existing files
if env | grep -q FAVICON_PNG_URL; then
    echo "Found FAVICON_PNG_URL, downloading favicon $FAVICON_PNG_URL to /tmp/favicon.png"

    curl -sL "$FAVICON_PNG_URL" -o /tmp/favicon.png

    FAVICON_FILES="
        /app/client/dist/assets/favicon-16x16.png
        /app/client/dist/assets/favicon-32x32.png
        /app/client/dist/assets/apple-touch-icon-180x180.png
    "

    for FILE in $FAVICON_FILES; do
        echo "Overwriting $FILE"
        cp /tmp/favicon.png "$FILE"
    done
else
    echo "FAVICON_PNG_URL not set, skipping custom favicon setup"
fi
