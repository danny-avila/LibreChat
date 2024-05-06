---
title: 🛤️ Railway (one-click)
description: Deploying LibreChat on Railway
weight: -9
---

# Deploying LibreChat on Railway (One-Click Install)

Railway provides a one-click install option for deploying LibreChat, making the process even simpler. Here's how you can do it:

## Steps

### **Visit the LibreChat repository**

Go to the [LibreChat repository](https://github.com/danny-avila/LibreChat) on GitHub.

### **Click the "Deploy on Railway" button**

<p align="left">
    <a href="https://railway.app/template/b5k2mn?referralCode=myKrVZ">
        <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="30"/>
    </a>
</p>

(The button is also available in the repository's README file)

### **Log in or sign up for Railway**

If you're not already logged in to Railway, you'll be prompted to log in or sign up for a free account.

### **Configure environment variables**

Railway will automatically detect the required environment variables for LibreChat. Review the configuration of the three containers and click `Save Config` after reviewing each of them.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/4417e997-621c-44b6-8d2d-94d7e4e1a2bf)

The default configuration will get you started, but for more advanced features, you can consult our documentation on the subject: [Environment Variables](../install/configuration/dotenv.md)

### **Deploy**

Once you've filled in the required environment variables, click the "Deploy" button. Railway will handle the rest, including setting up a PostgreSQL database and building/deploying your LibreChat instance.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/d94e20c6-0ae7-42af-8937-7fbd34d63a3b)

### **Access your LibreChat instance**

After the deployment is successful, Railway will provide you with a public URL where you can access your LibreChat instance.

That's it! You have successfully deployed LibreChat on Railway using the one-click install process. You can now start using and customizing your LibreChat instance as needed.

## Additional Tips

- Regularly check the LibreChat repository for updates and redeploy your instance to receive the latest features and bug fixes.

For more detailed instructions and troubleshooting, refer to the official LibreChat documentation and the Railway guides.