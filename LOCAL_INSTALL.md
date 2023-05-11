# Local

## Locally run the app

### Install the prerequisites on your machine

  - **Download chatgpt-clone**
    - Download the latest release here: https://github.com/danny-avila/chatgpt-clone/releases/
    - Or by clicking on the green code button in the top of the page and selecting "Download ZIP"
    - Or (Recommended if you have Git installed) pull the latest release from the main branch
    - If you downloaded a zip file, extract the content in "C:/chatgpt-clone/" 
    - **IMPORTANT : If you install the files somewhere else modify the instructions accordingly**
  
  - **To enable the Conversation search feature:**
    - **IF YOU DON'T WANT THIS FEATURE YOU CAN SKIP THIS STEP**

    - Download MeileSearch latest release from : https://github.com/meilisearch/meilisearch/releases
    - Copy it to "C:/chatgpt-clone/"
    - Rename the file to "meilisearch.exe"
    - Open it by double clicking on it
    - Copy the generated Master Key and save it somewhere (You will need it later)

  - **Download and Install Node.js**
    - Navigate to https://nodejs.org/en/download and to download the latest Node.js version for your OS (The Node.js installer includes the NPM package manager.)
  - **Create a MongoDB database**
    - Navigate to https://www.mongodb.com/ and Sign In or Create an account
    - Create a new project
    - Build a Database using the free plan and name the cluster (example: chatgpt-clone)
    - Use the "Username and Password" method for authentication
    - Add your current IP to the access list
    - Then in the Database Deployment tab click on Connect
    - In "Choose a connection method" select "Connect your application"
    - Driver = Node.js / Version = 4.1 or later
    - Copy the connection string and save it somewhere(you will need it later)
  - **Get your OpenAI API key** here: https://platform.openai.com/account/api-keys and save it somewhere safe (you will need it later)

  - **Get your Bing Access Token**
    - Using MS Edge, navigate to bing.com
    - Make sure you are logged in
    - Open the DevTools by pressing F12 on your keyboard
    - Click on the tab "Application" (On the left of the DevTools)
    - Expand the "Cookies" (Under "Storage")
    - You need to copy the value of the "\_U" cookie, save it somewhere, you will need it later

- **Create the ".env" File** You will need all your credentials, (API keys, access tokens, and Mongo Connection String, MeileSearch Master Key)
  - Open "C:/chatgpt-clone/api/.env.example" in a text editor
  - At this line **MONGO_URI="mongodb://127.0.0.1:27017/chatgpt-clone"**
    Replace mongodb://127.0.0.1:27017/chatgpt-clone with the MondoDB connection string you saved earlier, **remove "&w=majority" at the end**
    - It should look something like this: "MONGO_URI="mongodb+srv://username:password@chatgpt-clone.lfbcwz3.mongodb.net/?retryWrites=true"
  - At this line **OPENAI_KEY=** you need to add your openai API key
  - Add your Bing token to this line **BINGAI_TOKEN=** (needed for BingChat & Sydney)
  - If you want to enable Search, **SEARCH=TRUE** if you do not want to enable search **SEARCH=FALSE**
  - Add your previously saved MeiliSearch Master key to this line **MEILI_MASTER_KEY=** (the key is needed if search is enabled even on local install or you may encounter errors)
  - Save the file as **"C:/chatgpt-clone/api/.env"**

### Run the app

#### Using the command line

- **Run** `npm ci` in the "C:/chatgpt-clone/api" directory
- **Run** `npm ci` in the "C:/chatgpt-clone/client" directory
- **Run** `npm run build` in the "C:/chatgpt-clone/client"
- **Run** `"meilisearch --master-key put_your_meilesearch_Master_Key_here"` in the "C:/chatgpt-clone" directory (Only if SEARCH=TRUE)
- **Run** `npm start` in the "C:/chatgpt-clone/api" directory

- **Visit** http://localhost:3080 (default port) & enjoy

#### Using a batch file

- **Make a batch file to automate the starting process**
  - Open a text editor
  - Paste the following code in a new document
  - Put your MeiliSearch master key instead of "your_master_key_goes_here"
  - Save the file as "C:/chatgpt-clone/chatgpt-clone.bat"
  - you can make a shortcut of this batch file and put it anywhere

```
REM the meilisearch executable needs to be at the root of the chatgpt-clone directory

start "MeiliSearch" cmd /k "meilisearch --master-key your_master_key_goes_here

REM ↑↑↑ meilisearch is the name of the meilisearch executable, put your own master key there

start "ChatGPT-Clone" cmd /k "cd api && npm start"

REM this batch file goes at the root of the chatgpt-clone directory (C:/chatgpt-clone/)
```

## Update the app version

If you update the chatgpt-clone project files, mannually redo the `npm ci` and `npm run build` steps

## Locally test the app during development

### Run the app

#### Option 1: Run the app using Docker

For reproducibility and ease of use, you can use
the provided docker-compose file:

1. Comment out the portion pointing at the already built image

   ```yaml
   image: chatgptclone/app:0.3.3
   ```
   
2. Uncomment the portion pointing at the local source code

   ```yaml
   # image: node-api
   # build:
   #   context: .
   #   target: node-api
   ``` 

3. Build your local source code for the `node-api` target

   ```shell
   docker build `
     --target=node-api `
     -t node-api `
     .
   ```

4. Docker-compose up

   ```shell
   docker-compose up
   ```

#### Option 2: Run the app by installing on your machine

1. Install the prerequisites on your machine. 
   See [section above](#install-the-prerequisites-on-your-machine).

2. Run the app on your machine. 
   See [section above](#run-the-app).

### Run the tests

1. Install the global dependencies

   ```shell
   npm ci
   npx playwright install --with-deps
   ```

2. Run tests

   ```shell
   npx playwright test
   ```
   
If everything goes well, you should see a `passed` message.

<img src="https://user-images.githubusercontent.com/22865959/235321489-9be48fd6-77d4-4e21-97ad-0254e140b934.png">

# Shared

To share within network or serve as a public server, set `HOST` to `0.0.0.0` in `.env` file.
