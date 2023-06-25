# Locally test the app during development

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

