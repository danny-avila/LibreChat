# Heroku Deployment

 *Thanks to @heathriel!*
##
 
 - To run the ChatGPT-Clone project on a server, you can use cloud hosting platforms like Heroku, DigitalOcean, or AWS. In this response, I'll provide instructions for deploying the project on Heroku. Other platforms will have slightly different deployment processes.

  - Sign up for a Heroku account: If you don't already have a Heroku account, sign up at https://signup.heroku.com/.
  - Install the Heroku CLI: Download and install the Heroku CLI from https://devcenter.heroku.com/articles/heroku-cli.
  - Login to Heroku: Open Terminal and run ***heroku login***. Follow the instructions to log in to your Heroku account.

  - Prepare the repository: You need to create a Procfile in the root directory of the ChatGPT-Clone project to specify the commands that will be executed to start the application. Create a new file named Procfile (without any file extension) and add the following line:

```
web: npm start --prefix api
```

  - Commit your changes: Commit the Procfile and any other changes to your GitHub repository.

Create a new Heroku app: Run the following command in the Terminal to create a new Heroku app:

```
heroku create your-app-name
```

  - Replace your-app-name with a unique name for your app.
  - Set environment variables: Configure the environment variables for your Heroku app. You can either use the Heroku CLI or the Heroku Dashboard.

**Using Heroku CLI:**

```
heroku config:set KEY_NAME=KEY_VALUE --app your-app-name
```

  - Replace KEY_NAME and KEY_VALUE with the appropriate key names and values from your .env file. Repeat this command for each environment variable.

**Using Heroku Dashboard:**
  - Go to your app's settings page in the Heroku Dashboard. Under the "Config Vars" section, add the required environment variables.
  - Deploy the app to Heroku: Run the following commands to deploy the ChatGPT-Clone project to Heroku:

```
git remote add heroku https://git.heroku.com/your-app-name.git
git push heroku main
```

  - Replace your-app-name with the name of your Heroku app.
  - Open the app: After the deployment is complete, you can open the app in your browser by running heroku open or by visiting the app's URL.

  - Here are the instructions for setting up MongoDB Atlas and deploying MeiliSearch on Heroku:

**Setting up MongoDB Atlas:**

  - Sign up for a MongoDB Atlas account: If you don't have an account, sign up at https://www.mongodb.com/cloud/atlas/signup.
  - Create a new cluster: After signing in, create a new cluster by following the on-screen instructions. For a free tier cluster, select the "Shared" option and choose the "M0 Sandbox" tier.

  - Configure database access: Go to the "Database Access" section and create a new database user. Set a username and a strong password, and grant the user the "Read and Write to any database" privilege.

  - Configure network access: Go to the "Network Access" section and add a new IP address. For testing purposes, you can allow access from anywhere by entering 0.0.0.0/0. For better security, whitelist only the specific IP addresses that need access to the database.
  - Get the connection string: Once the cluster is created, click the "Connect" button. Select the "Connect your application" option and choose "Node.js" as the driver. Copy the connection string and replace <username> and <password> with the credentials you created earlier.

**Deploying MeiliSearch on Heroku:**
  - Install the Heroku CLI: If you haven't already, download and install the Heroku CLI from https://devcenter.heroku.com/articles/heroku-cli.
  - Login to Heroku: Open Terminal and run heroku login. Follow the instructions to log in to your Heroku account.

**Create a new Heroku app for MeiliSearch:**

```
heroku create your-meilisearch-app-name
```

  - Replace your-meilisearch-app-name with a unique name for your MeiliSearch app.

**Set the buildpack:**

```
heroku buildpacks:set meilisearch/meilisearch-cloud-buildpack --app your-meilisearch-app-name
```

**Set the master key for MeiliSearch:**

```
heroku config:set MEILI_MASTER_KEY=your-master-key --app your-meilisearch-app-name
Replace your-master-key with a secure master key.
```

**Deploy MeiliSearch:**

```
git init
heroku git:remote -a your-meilisearch-app-name
git add .
git commit -m "Initial commit"
git push heroku master
```

  - Get the MeiliSearch URL: After deployment, you can find the MeiliSearch URL by visiting your app's settings page in the Heroku Dashboard. The URL will be displayed under the "Domains" section.

**Update environment variables in your ChatGPT-Clone app:**

  - Now that you have your MongoDB Atlas connection string and MeiliSearch URL, update the following environment variables in your Heroku app for ChatGPT-Clone:

  - `MONGODB_URI`: Set the value to the MongoDB Atlas connection string you obtained earlier.
  - `MEILISEARCH_URL`: Set the value to the MeiliSearch URL you obtained from your MeiliSearch app on Heroku.
  - `MEILISEARCH_KEY`: Set the value to the MeiliSearch master key you used when setting up the MeiliSearch app.
  - You can set these environment variables using the Heroku CLI or through the Heroku Dashboard, as described in the previous response.

  - Once you've updated the environment variables, your ChatGPT-Clone app should be able to connect to MongoDB Atlas and MeiliSearch on Heroku.

##

## [Go Back to ReadMe](../../README.md)
