# Stable Diffusion Plugin

To use Stable Diffusion with this project, you will either need to download and install [stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) or, for a dockerized deployment, you can also use [stable-diffusion-webui-docker](https://github.com/AbdBarho/stable-diffusion-webui-docker)

With the docker deployment you can skip step 2 and step 3, use the setup instructions from their repository instead.

- Note: you need a compatible GPU ("CPU-only" is possible but very slow). Nvidia is recommended, but there is no clear resource on incompatible GPUs. Any decent GPU should work.

## 1. Follow download and installation instructions from [stable-diffusion-webui readme](https://github.com/AUTOMATIC1111/stable-diffusion-webui)

## 2. Edit your run script settings

### Windows

 - Edit your **webui-user.bat** file by adding the following line before the call command:
- `set COMMANDLINE_ARGS=--api`

    - Your .bat file should like this with all other settings default
    ```shell 
    @echo off

    set PYTHON=
    set GIT=
    set VENV_DIR=
    set COMMANDLINE_ARGS=--api

    call webui.bat
    ```
### Others (not tested but should work)

 - Edit your **webui-user.sh** file by adding the following line:
 - `export COMMANDLINE_ARGS="--api"`

     - Your .sh file should like this with all other settings default
    ```bash 

    export COMMANDLINE_ARGS="--api"

    #!/bin/bash
    #########################################################
    # Uncomment and change the variables below to your need:#
    #########################################################

    # ...rest
    ```

## 3. Run Stable Diffusion (either .sh or .bat file according to your operating system)

## 4. In the app, select the plugins endpoint, open the plugins store, and install Stable Diffusion
### **Note: The default port for Gradio is `7860`. If you changed it, please update the value accordingly.**
### Docker Install
- Use `SD_WEBUI_URL=http://host.docker.internal:7860` in the `.env` file 
- Or `http://host.docker.internal:7860` from the webui
### Local Install
- Use `SD_WEBUI_URL=http://127.0.0.1:7860` in the `.env` file 
- Or `http://127.0.0.1:7860` from the webui


### Select the plugins endpoint

![plugins_endpoint](https://github.com/danny-avila/LibreChat/assets/32828263/9717e111-2e9e-43da-bd08-c5a0bbbc4d6d)

### Open the Plugin store and Install Stable Diffusion
![plugin_store](https://github.com/danny-avila/LibreChat/assets/32828263/add4d6a8-e5d6-4129-a334-4ff9290c0e2d)
![stable_diffusion-1](https://github.com/danny-avila/LibreChat/assets/32828263/b4364f41-0f7e-4197-af86-7d6061797366)


## 5. Select the plugin and enjoy!
![stable_diffusion-2](https://github.com/danny-avila/LibreChat/assets/32828263/8fa898b9-0826-42eb-bba4-6f85ec5f6ec2)
