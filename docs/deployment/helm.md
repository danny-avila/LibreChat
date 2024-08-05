---
title: 📦 Helm
description: Instructions for deploying LibreChat on Kubernetes using Helm
weight: -1
---
# Deployment as Helm Chart

The following instructions guide you to deploy LibreChat on Kubernetes using Helm. At the moment this installation method only provides running the LibreChat components, without any additional services like MongoDB or Redis. You will need to provide your own MongoDB and Redis instances.

## Prerequisites
* A running Kubernetes cluster
* `kubectl` installed
* Having a MongoDB instance running that can be accessed from the Kubernetes cluster
* Helm installed on your local machine

## Configuration
Similar to other Helm charts, there exists a [values file](https://github.com/danny-avila/LibreChat/blob/main/helmchart/values.yaml) that serves two primary functions: it outlines the default settings and indicates which configurations are adjustable. Essentially, any setting within this values file can be modified in two main ways. The first method involves creating a separate override file and specifying it when executing the install command. The second method involves directly setting each variable with the installation command itself. If you're planning to change numerous variables, it's advisable to use the override file approach to avoid an overly lengthy command. Conversely, for fewer adjustments, directly setting variables with the installation command might be more convenient.


The very end of the file sets some of environment variables of the application, that should look familiar if you deployed the application before. It is the base configuration without any sensitive data. 

```
  env:
    # Full list of possible values
    # https://github.com/danny-avila/LibreChat/blob/main/.env.example
    ALLOW_EMAIL_LOGIN: "true"
    ALLOW_REGISTRATION: "true"
    ALLOW_SOCIAL_LOGIN: "false"
    ALLOW_SOCIAL_REGISTRATION: "false"
    APP_TITLE: "Librechat"
    CUSTOM_FOOTER: "Provided with ❤️"
    DEBUG_CONSOLE: "true"
    DEBUG_LOGGING: "true"
    DEBUG_OPENAI: "true"
    DEBUG_PLUGINS: "true"
    DOMAIN_CLIENT: ""
    DOMAIN_SERVER: ""
    ENDPOINTS: "openAI,azureOpenAI,bingAI,chatGPTBrowser,google,gptPlugins,anthropic"
    SEARCH: false 
```

However, like the comment says you could have a look at which environment variables are generally available to be modified. Because with only these variables set the application won't start correctly. We need to set some more variables, but those contain sensitive data. We will show 2 different ways to make use of Kubernetes features in order to configure those in a secure way. 

### Create one Kubernetes Secret with different entries 
Assuming you have `kubectl` installed on your machine and you are connected to your Kubernetes cluster you can run the following command to create a respective Kubernetes secret, that can be used by the helm chart.

```
kubectl create secret generic librechat \
--from-literal=CREDS_KEY=0963cc1e5e5df9554c8dd32435d0eb2b1a8b6edde6596178d5c5418ade897673 \
--from-literal=CREDS_IV=46d727a066d5d8c4ebc94305d028fecc \
--from-literal=MONGO_URI=mongodb+srv://<user>:<password>@<mongodb-url> \
--from-literal=JWT_SECRET=83e5c1f0e037e4f027dbdb332d54ca1bd1f12af6798700c207ed817ebd7c544b \ --from-literal=JWT_REFRESH_SECRET=83e5c1f0c037e4f027dbab332d54ca1bd1f12af6798700c207ed817ebd7c544
```

### Create one Kubernetes Secret for each configuration
This one is a bit more complicated but also allows for more fine-grained control over the secrets. For each secret, you would like to create you can run the following command. 

```
kubectl create secret generic librechat-creds-key \
--from-literal=CREDS_KEY=0963cc1e5e5df9554c8dd32435d0eb2b1a8b6edde6596178d5c5418ade897673
```
... and so on for each secret.


## Install Helm Chart
In the root directory run: 

`helm install <deployment-name> helmchart`

Example: `helm install librechat helmchart --set config.envSecrets.secretRef=librechat` (using one Kubernetes secret for all credentials). 

If you used the approach where you created one Kubernetes secret for each credential you will need to do a more extensive configuration which is best placed in a separate file. Create a file with the following content: 

```
config:
  envSecrets:
    secretKeyRef:
    - name: CREDS_KEY
      secretName: librechat-creds-iv
      secretKey: CREDS_KEY
    <...>
```

After that you can run the following command: `helm install librechat helmchart --values <values-override-filel>`
     

## Uninstall Helm Chart

In order to uninstall the Helm Chart simply run: `helm uninstall <deployment-name>`

Example: `helm uninstall librechat`