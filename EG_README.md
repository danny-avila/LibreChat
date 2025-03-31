# E-gineering Librechat changes

Keeping track of custom features added to `e-gineering/LibreChat`.

- Google key location
  - Environment variable: `GOOGLE_KEY_JSON_FILENAME`
  - (Optional) The path to where the Google key JSON file is mounted to inside the container, instead of the hardcoded path `~/data/auth.json`.

- Google key contents
  - Environment variable: `GOOGLE_KEY_FILE_CONTENTS`
  - (Optional) The contents of the Google key JSON file, that will then be written to the file specified by `GOOGLE_KEY_JSON_FILENAME`.

- Custom favicon link
  - Environment variable: `FAVICON_PNG_URL`
  - (Optional) A URL to a custom favicon image that will be downloaded at runtime, to overwrite the 3 locations where the favicon is used in the Docker container:
    - `/app/client/dist/assets/favicon-16x16.png`
    - `/app/client/dist/assets/favicon-32x32.png`
    - `/app/client/dist/assets/apple-touch-icon-180x180.png`
  - Should be a `.png` file since we're just overwriting the existing PNG files that are referenced in the index.html.
