# create a new directory to store the archive
mkdir archive

# create a new zip file excluding all "node_modules" directories inside "client" and "api"
zip -r archive/my_archive.zip . -x "*/node_modules/*" -x "*/client/node_modules/*" -x "*/api/node_modules/*"

# navigate to the "archive" directory to view the newly created archive
cd archive