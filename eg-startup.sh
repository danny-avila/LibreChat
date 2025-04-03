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

# If FAVICON_PATH is set, download the favicon and overwrite the existing files
if env | grep -q FAVICON_PATH; then
    echo "Found FAVICON_PATH set to: $FAVICON_PATH"
    
    FAVICON_SOURCE_FILE_NAMES="
        favicon-16x16.png
        favicon-32x32.png
        apple-touch-icon-180x180.png
    "

    for FILE_NAME in $FAVICON_SOURCE_FILE_NAMES; do
        echo "Downloading $FILE_NAME from $FAVICON_PATH to /tmp/$FILE_NAME"
        curl -sL "$FAVICON_PATH/$FILE_NAME" -o /tmp/$FILE_NAME
    done

    # The places in the docker image where the favicons built by vite are put
    FAVICON_DESTINATION_FILE_PATHS="
        /app/client/dist/assets/favicon-16x16.png
        /app/client/dist/assets/favicon-32x32.png
        /app/client/dist/assets/apple-touch-icon-180x180.png
    "

    for FILE_PATH in $FAVICON_DESTINATION_FILE_PATHS; do
        FILE_NAME=$(basename "$FILE_PATH")
        echo "Overwriting $FILE_PATH with /tmp/$FILE_NAME"
        cp /tmp/$FILE_NAME "$FILE_PATH"
    done
else
    echo "FAVICON_PATH not set, skipping custom favicon setup"
fi
