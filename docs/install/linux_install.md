# Linux Installation Guide
## **Recommended:**

[![Watch the video](https://img.youtube.com/vi/w7VqivpdfZk/maxresdefault.jpg)](https://youtu.be/w7VqivpdfZk)
Click on the thumbnail to open the video☝️
---

In this video, you will learn how to install and run LibreChat, using Docker on Ubuntu 22.04 LTS.

#### Timestamps

- 0:00 - Intro
- 0:14 - Update the system
- 0:29 - Clone the repository
- 0:37 - Docker installation 
- 1:03 - Enter in the folder
- 1:07 - Create the .env file
- 1:14 - Build using docker-compose
- 1:29 - Start LibreChat
- 1:43 - Test

#### Instructions

Here are the steps to follow:
- Update the system: `sudo apt update`
- Clone LibreChat: `git clone https://github.com/danny-avila/LibreChat.git`
- Install Docker: `sudo apt install docker.io && apt install docker-compose -y`
- Enter the folder: `cd LibreChat`
- Create the .env file: `cp .env.example .env`
- Build the Docker image: `docker-compose build`
- Start LibreChat: `docker-compose up -d`

Note: If you run the command on the same computer and want to access it, navigate to `localhost:3080`. You should see a login page where you can create or sign in to your account. Then you can choose an AI model and start chatting. 

Have fun!

---
## **[Docker Install](docker_install.md)** (General documentation)
--- 

## **Manual Installation:**

## Prerequisites

Before installing LibreChat, make sure your machine has the following prerequisites installed:

- Git: To clone the repository.
- Node.js: To run the application.
- MongoDB: To store the chat history.

## Clone the repository:

```bash
git clone https://github.com/danny-avila/LibreChat.git
```

## Extract the content in your desired location:

```bash
cd LibreChat
unzip LibreChat.zip -d /usr/local/
```

Note: The above command extracts the files to "/usr/local/LibreChat". If you want to install the files to a different location, modify the instructions accordingly.

## Enable the Conversation search feature: (optional)

- Download MeiliSearch latest release from: https://github.com/meilisearch/meilisearch/releases
- Copy it to "/usr/local/LibreChat/"
- Rename the file to "meilisearch"
- Open a terminal and navigate to "/usr/local/LibreChat/"
- Run the following command:

```bash
./meilisearch --master-key=YOUR_MASTER_KEY
```

Note: Replace "YOUR_MASTER_KEY" with the generated master key, which you saved earlier.

## Install Node.js:

Open a terminal and run the following commands:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## [Create a MongoDB database](mongodb.md) (Required)

## [Get Your API keys and Tokens](apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.

## [User/Auth System](../install/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.

## Run the project

### Using the command line (in the root directory)
Setup the app:
1. Run `npm ci`
2. Run `npm run frontend`

## Start the app:
1. Run `npm run backend`
2. Run `meilisearch --master-key put_your_meilesearch_Master_Key_here` (Only if SEARCH=TRUE)
3. Visit http://localhost:3080 (default port) & enjoy

### Using a shell script

- Create a shell script to automate the starting process
- Open a text editor
- Paste the following code in a new document
- Put your MeiliSearch master key instead of "your_master_key_goes_here"
- Save the file as "/home/user/LibreChat/LibreChat.sh"
- You can make a shortcut of this shell script and put it anywhere

``` bash title="LibreChat.sh"
#!/bin/bash
# the meilisearch executable needs to be at the root of the LibreChat directory

gnome-terminal --tab --title="MeiliSearch" --command="bash -c 'meilisearch --master-key your_master_key_goes_here'"
# ↑↑↑ meilisearch is the name of the meilisearch executable, put your own master key there

gnome-terminal --tab --title="LibreChat" --working-directory=/home/user/LibreChat/ --command="bash -c 'npm run backend'"
# this shell script goes at the root of the LibreChat directory (/home/user/LibreChat/)
```

## Update the app version

If you update the LibreChat project files, manually redo the npm ci and npm run frontend steps.

---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
