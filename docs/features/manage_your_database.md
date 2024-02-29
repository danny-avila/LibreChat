---
title: 🍃 Manage Your Database
description: How to install and configure Mongo Express to securely access and manage your MongoDB database in Docker.
weight: -5
---

<img src="https://github.com/danny-avila/LibreChat/assets/32828263/4572dd35-8489-4cb1-a968-4fb5a871d6e5" height="50">


# Manage Your MongoDB Database with Mongo Express

To enhance the security of your data, external ports for MongoDB are not exposed outside of the docker environment. However, you can safely access and manage your MongoDB database using Mongo Express, a convenient web-based administrative interface. Follow this guide to set up Mongo Express in your Docker environment.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/612cee31-7fc2-4660-98c0-06627e581bd8)


## Mongo-Express Setup

Mongo Express allows you to interact with your MongoDB database through your browser. To set it up, perform the following steps:

### Setting up Mongo Express service
- Create a new file named `docker-compose.override.yml` in the same directory as your main `docker-compose.yml` file for LibreChat.
- Copy the following contents into the `docker-compose.override.yml` file:

```yaml
version: '3.4'

services:
  mongo-express:
    image: mongo-express
    container_name: mongo-express
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: password
    ports:
      - '8081:8081'
    depends_on:
      - mongodb
    restart: always
```
### Security Notice
- Before using this configuration, replace `admin` and `password` with a unique username and password for accessing Mongo Express. These credentials should be strong and not easily guessable to prevent unauthorized access.
- Optional: You can also add native authentication to your database. See the [`docker-compose.override` guide](../install/configuration/docker_override.md#mongodb-authentication) for instructions on how to do so.
    - If utilizing authentication, ensure the admin user has the "clusterAdmin" and "readAnyDatabase" permissions. These steps are detailed in the [docker-compose.override guide](../install/configuration/docker_override.md#step-1-creating-an-admin-user).
    - After following the guide to authenticate MongoDB, you will need these variables under the environment section for mongo-express:

    ```yaml
        environment:
          ME_CONFIG_MONGODB_SERVER: mongodb
          ME_CONFIG_BASICAUTH_USERNAME: admin
          ME_CONFIG_BASICAUTH_PASSWORD: password
          # database authentication variables, using example credentials from guide
          ME_CONFIG_MONGODB_URL: 'mongodb://adminUser:securePassword@mongodb:27017'
          ME_CONFIG_MONGODB_ADMINUSERNAME: adminUser
          ME_CONFIG_MONGODB_ADMINPASSWORD: securePassword
    ```

### Launching and accessing Mongo Express
- Save the `docker-compose.override.yml` file and run the following command from the directory where your `docker-compose.yml` file is located to start Mongo-Express along with your other Docker services:

```
docker compose up -d
```
This command will merge the `docker-compose.override.yml` with your `docker-compose.yml` and apply the configuration.

- Once Mongo-Express is up and running, access it by navigating to `http://localhost:8081` in your web browser. You'll need to enter the username and password you specified for `ME_CONFIG_BASICAUTH_USERNAME` and `ME_CONFIG_BASICAUTH_PASSWORD`.

---

## Removing Mongo Express
If you wish to remove Mongo-Express from your Docker environment, follow these straightforward steps:
- Navigate to the directory containing your `docker-compose.yml` and `docker-compose.override.yml` files.

- Bring down the current Docker environment, which will stop and remove all running containers defined in the `docker-compose.yml` and `docker-compose.override.yml` files. Use the following command:
```sh
docker compose down
```

- Now you can either rename or delete the `docker-compose.override.yml` file, which contains the Mongo Express configuration.

- Finally, bring your Docker environment back up, which will now exclude Mongo Express:
```
docker compose up -d
```

> By following these steps, you will have successfully removed Mongo Express from your Docker environment. If you want to reinstate Mongo Express at a later time, you can either rename the backup file back to `docker-compose.override.yml` or recreate the original `docker-compose.override.yml` file with the Mongo Express configuration.
