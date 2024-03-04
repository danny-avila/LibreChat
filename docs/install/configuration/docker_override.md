---
title: 🐋 Docker Compose Override
description: "How to Use the Docker Compose Override File: In Docker Compose, an override file is a powerful feature that allows you to modify the default configuration provided by the main `docker-compose.yml` without the need to directly edit or duplicate the whole file."
weight: -9
---

# How to Use the Docker Compose Override File

In Docker Compose, an override file is a powerful feature that allows you to modify the default configuration provided by the main `docker-compose.yml` without the need to directly edit or duplicate the whole file. The primary use of the override file is for local development customizations, and Docker Compose merges the configurations of the `docker-compose.yml` and the `docker-compose.override.yml` files when you run `docker compose up`.

Here's a quick guide on how to use the `docker-compose.override.yml`:

> Note: Please consult the `docker-compose.override.yml.example` for more examples 

See the official docker documentation for more info:

- **[docker docs - understanding-multiple-compose-files](https://docs.docker.com/compose/multiple-compose-files/extends/#understanding-multiple-compose-files)**
- **[docker docs - merge-compose-files](https://docs.docker.com/compose/multiple-compose-files/merge/#merge-compose-files)**
- **[docker docs - specifying-multiple-compose-files](https://docs.docker.com/compose/reference/#specifying-multiple-compose-files)**

## Step 1: Create a `docker-compose.override.yml` file

If you don't already have a `docker-compose.override.yml` file, you can create one by copying the example override content:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

This file will be picked up by Docker Compose automatically when you run docker-compose commands.

## Step 2: Edit the override file

Open your `docker-compose.override.yml` file with vscode or any text editor.

Make your desired changes by uncommenting the relevant sections and customizing them as needed.

> Warning: You can only specify every service name once (api, mongodb, meilisearch, ...) If you want to override multiple settings in one service you will have to edit accordingly.

For example, if you want to make sure Docker can use your `librechat.yaml` file for [custom configuration](./custom_config.md), it would look like this:

```yaml
version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
```

Or, if you want to use a prebuilt image for the `api` service, use the LibreChat config file, and expose MongoDB's port, your `docker-compose.override.yml` might look like this:

```yaml
version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
    image: ghcr.io/danny-avila/librechat-dev:latest

  mongodb:
    ports:
      - 27018:27017
```

> Note: Be cautious with exposing ports like MongoDB to the public, as it can make your database vulnerable to attacks.

## Step 3: Apply the changes

To apply your configuration changes, simply run Docker Compose as usual. Docker Compose automatically takes into account both the `docker-compose.yml` and the `docker-compose.override.yml` files:

```bash
docker compose up -d
```

If you want to invoke a build with the changes before starting containers:

```bash
docker compose build
docker compose up -d
```

## Step 4: Verify the changes

After starting your services with the modified configuration, you can verify that the changes have been applied using the `docker ps` command to list the running containers and their properties, such as ports.

## Important Considerations

- **Order of Precedence**: Values defined in the override file take precedence over those specified in the original `docker-compose.yml` file.
- **Security**: When customizing ports and publicly exposing services, always be conscious of the security implications. Avoid using defaults for production or sensitive environments.

By following these steps and considerations, you can easily and safely modify your Docker Compose configuration without altering the original `docker-compose.yml` file, making it simpler to manage and maintain different environments or local customizations.


## MongoDB Authentication

Use of the `docker-compose.override.yml` file allows us to enable explicit authentication for MongoDB.

**Notes:**

- The default configuration is secure by blocking external port access, but we can take it a step further with access credentials.
- As noted by the developers of MongoDB themselves, authentication in MongoDB is fairly complex. We will be taking a simple approach that will be good enough for most cases, especially for existing configurations of LibreChat. To learn more about how mongodb authentication works with docker, see here: https://hub.docker.com/_/mongo/
- This guide focuses exclusively on terminal-based setup procedures.
- While the steps outlined may also be applicable to Docker Desktop environments, or with non-Docker, local MongoDB, or other container setups, details specific to those scenarios are not provided.

**There are 3 basic steps:**

- Create an admin user within your mongodb container
- Enable authentication and create a "readWrite" user for "LibreChat"
- Configure the MONGO_URI with newly created user

### Step 1: Creating an Admin User

First, we must stop the default containers from running, and only run the mongodb container.

```bash
docker compose down
docker compose up -d mongodb
```

> Note: The `-d` flag detaches the current terminal instance as the container runs in the background. If you would like to see the mongodb log outputs, omit it and continue in a separate terminal.

Once running, we will enter the container's terminal and execute `mongosh`:

```bash
docker exec -it chat-mongodb mongosh
```
You should see the following output:

```bash
~/LibreChat$ docker exec -it chat-mongodb mongosh
Current Mongosh Log ID: 65bfed36f7d7e3c2b01bcc3d
Connecting to:          mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.1.1
Using MongoDB:          7.0.4
Using Mongosh:          2.1.1

For mongosh info see: https://docs.mongodb.com/mongodb-shell/

test> 
```

Optional: While we're here, we can disable telemetry for mongodb if desired, which is anonymous usage data collected and sent to MongoDB periodically:

Execute the command below.

> Notes:
> - All subsequent commands should be run in the current terminal session, regardless of the environment (Docker, Linux, `mongosh`, etc.)
> - I will represent the actual terminal view with # example input/output or simply showing the output in some cases

Command:

```bash
disableTelemetry()
```
Example input/output:
```bash
# example input/output
test> disableTelemetry()
Telemetry is now disabled.
```

Now, we must access the admin database, which mongodb creates by default to create our admin user:

```bash
use admin
```
> switched to db admin

Replace the credentials as desired and keep in your secure records for the rest of the guide.

Run command to create the admin user:
```bash
db.createUser({ user: "adminUser", pwd: "securePassword", roles: ["userAdminAnyDatabase", "readWriteAnyDatabase"] })
```

You should see an "ok" output:
> { ok: 1 }

You can also confirm the admin was created by running `show users`:
```bash
# example input/output
admin> show users
[
  {
    _id: 'admin.adminUser',
    userId: UUID('86e90441-b5b7-4043-9662-305540dfa6cf'),
    user: 'adminUser',
    db: 'admin',
    roles: [
      { role: 'userAdminAnyDatabase', db: 'admin' },
      { role: 'readWriteAnyDatabase', db: 'admin' }
    ],
    mechanisms: [ 'SCRAM-SHA-1', 'SCRAM-SHA-256' ]
  }
]
```

:warning: **Important:** if you are using `mongo-express` to [manage your database (guide here)](../../features/manage_your_database.md), you need the additional permissions for the `mongo-express` service to run correctly:

```bash
db.grantRolesToUser("adminUser", ["clusterAdmin", "readAnyDatabase"]);
```

Exit the Mongosh/Container Terminal by running `exit`:
```bash
# example input/output
admin> exit
```

And shut down the running container:
```bash
docker compose down
```

### Step 2: Enabling Authentication and Creating a User with `readWrite` Access

We must now create/edit the `docker-compose.override.yml` file to enable authentication for our mongodb container. You can use this configuration to start or reference:

```yaml
version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml # Optional for using the librechat config file.
  mongodb:
    command: mongod --auth # <--- Add this to enable authentication
```

After configuring the override file as above, run the mongodb container again:

```bash
docker compose up -d mongodb
```

And access mongosh as the admin user:

```bash
docker exec -it chat-mongodb mongosh -u adminUser -p securePassword --authenticationDatabase admin
```

Confirm you are authenticated:
```bash
db.runCommand({ connectionStatus: 1 })
```

```bash
# example input/output
test> db.runCommand({ connectionStatus: 1 })
{
  authInfo: {
    authenticatedUsers: [ { user: 'adminUser', db: 'admin' } ],
    authenticatedUserRoles: [
      { role: 'readWriteAnyDatabase', db: 'admin' },
      { role: 'userAdminAnyDatabase', db: 'admin' }
    ]
  },
  ok: 1
}
test>
```

Switch to the "LibreChat" database

> Note: This the default database unless you changed it via the MONGO_URI; default URI: `MONGO_URI=mongodb://mongodb:27017/LibreChat`

```bash
use LibreChat
```

Now we'll create the actual credentials to be used by our Mongo connection string, which will be limited to read/write access of the "LibreChat" database. As before, replace the example with your desired credentials:
```bash
db.createUser({ user: 'user', pwd: 'userpasswd', roles: [ { role: "readWrite", db: "LibreChat" } ] });
```

You should see an "ok" output again:
> { ok: 1 }

You can verify the user creation with the `show users` command.

Exit the Mongosh/Container Terminal again with `exit`, and bring the container down:

```bash
exit
```

```bash
docker compose down
```

I had an issue where the newly created user would not persist after creating it. To solve this, I simply repeated the steps to ensure it was created. Here they are for your convenience:

```bash
# ensure container is shut down
docker compose down
# start mongo container
docker compose up -d mongodb
# enter mongosh as admin
docker exec -it chat-mongodb mongosh -u adminUser -p securePassword --authenticationDatabase admin

# check LibreChat db users first; if persisted, exit after this
use LibreChat
show users

# Exit if you see user output. If not, run the create user command again
db.createUser({ user: 'user', pwd: 'userpasswd', roles: [ { role: "readWrite", db: "LibreChat" } ] });
```

If it's still not persisting, you can try running the commands with all containers running, but note that the `LibreChat` container will be in an error/retrying state.

### Step 3: Update the `MONGO_URI` to Use the New Credentials

Finally, we add the new connection string with our newly created credentials to our `docker-compose.override.yml` file under the `api` service:

```yaml
    environment:
      - MONGO_URI=mongodb://user:userpasswd@mongodb:27017/LibreChat
```

So our override file looks like this now:

```yaml
version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
    environment:
      - MONGO_URI=mongodb://user:userpasswd@mongodb:27017/LibreChat
  mongodb:
    command: mongod --auth
```

You should now run `docker compose up` successfully authenticated with read/write access to the LibreChat database

Example successful connection:
```bash
LibreChat         | 2024-02-04 20:59:43 info: Server listening on all interfaces at port 3080. Use http://localhost:3080 to access it
chat-mongodb      | {"t":{"$date":"2024-02-04T20:59:53.880+00:00"},"s":"I",  "c":"NETWORK",  "id":22943,   "ctx":"listener","msg":"Connection accepted","attr":{"remote":"192.168.160.4:58114","uuid":{"uuid":{"$uuid":"027bdc7b-a3f4-429a-80ee-36cd172058ec"}},"connectionId":17,"connectionCount":10}}
```

If you're having Authentication errors, run the last part of Step 2 again. I'm not sure why it's finicky but it will work after a few tries.

### TL;DR

These are all the necessary commands if you'd like to run through these quickly or for reference:

```bash
# Step 1:
docker compose down
docker compose up -d mongodb
docker exec -it chat-mongodb mongosh
use admin
db.createUser({ user: "adminUser", pwd: "securePassword", roles: ["userAdminAnyDatabase", "readWriteAnyDatabase"] })
exit
docker compose down
# Step 2:
# Edit override file with --auth flag
docker compose up -d mongodb
docker exec -it chat-mongodb mongosh -u adminUser -p securePassword --authenticationDatabase admin
use LibreChat
db.createUser({ user: 'user', pwd: 'userpasswd', roles: [ { role: "readWrite", db: "LibreChat" } ] });
exit
docker compose down
# Step 3:
# Edit override file with new connection string
docker compose up
```

## Example

Example `docker-compose.override.yml` file using the [`librechat.yaml` config file](./custom_config.md), MongoDB with [authentication](#mongodb-authentication), and `mongo-express` for [managing your MongoDB database](../../features/manage_your_database.md):

```yaml
version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
    environment:
      - MONGO_URI=mongodb://user:userpasswd@mongodb:27017/LibreChat
  mongodb:
    command: mongod --auth
  mongo-express:
    image: mongo-express
    container_name: mongo-express
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: password
      ME_CONFIG_MONGODB_URL: 'mongodb://adminUser:securePassword@mongodb:27017'
      ME_CONFIG_MONGODB_ADMINUSERNAME: adminUser
      ME_CONFIG_MONGODB_ADMINPASSWORD: securePassword
    ports:
      - '8081:8081'
    depends_on:
      - mongodb
    restart: always
```