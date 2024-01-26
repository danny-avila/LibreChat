---
title: 🖌️ Stable Diffusion
description: How to set up and configure the Stable Diffusion plugin
weight: -6
---

# Stable Diffusion Plugin

To use Stable Diffusion with this project, you will either need to download and install **[AUTOMATIC1111 - Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui)** or, for a dockerized deployment, you can also use **[stable-diffusion-webui-docker](https://github.com/AbdBarho/stable-diffusion-webui-docker)**

With the docker deployment you can skip step 2 and step 3, use the setup instructions from their repository instead.

- Note: you need a compatible GPU ("CPU-only" is possible but very slow). Nvidia is recommended, but there is no clear resource on incompatible GPUs. Any decent GPU should work.

## 1. Follow download and installation instructions from **[stable-diffusion-webui readme](https://github.com/AUTOMATIC1111/stable-diffusion-webui)**

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

![plugins-endpoint](https://github.com/danny-avila/LibreChat/assets/32828263/7db788a5-2173-4115-b34b-43ea132dae69)

### Open the Plugin store and Install Stable Diffusion
![plugin_store](https://github.com/danny-avila/LibreChat/assets/32828263/12a51feb-c030-4cf0-8429-16360270988d)
![stable_diffusion-1](https://github.com/danny-avila/LibreChat/assets/32828263/b4364f41-0f7e-4197-af86-7d6061797366)


## 5. Select the plugin and enjoy!
![stable_diffusion-2](https://github.com/danny-avila/LibreChat/assets/32828263/8fa898b9-0826-42eb-bba4-6f85ec5f6ec2)

## 6. Changing the default custom parameters
It is possible to change the stable diffusion model and parameters with the SD_WEBUI_DEFAULT_PARAMETERS variable.  By default, the Stable Diffusion model will use the below defaults:
```
sampler_name: 'DPM++ 2M Karras'
cfg_scale: 4.5
steps: 22
width: 1024
height: 1024
```
### SDXL Turbo
However, to use [SDXL Turbo](https://stable-diffusion-art.com/sdxl-turbo/) many of the paramters need to be changed for images to be generated in a much shorter period of time. For example, SDXL does not need a negative prompt or more than 1 step. To set these settings set the below variable.
```bash
SD_WEBUI_DEFAULT_PARAMETERS={"sd_model_name":"sd_xl_turbo_1.0_fp16", "negative_prompt":"", "sampler_name": "Euler a", "cfg_scale": 1, "steps": 1, "width": 512, "height": 512}
```
As Stable Diffusion releases more models, this variable may be changed at any time to take advantage of new functionality.

## 7. Docker option for installing Automatic1111 with SDXL Turbo
Using the Stable Diffusion WebUI Docker GitHub project: https://github.com/AbdBarho/stable-diffusion-webui-docker
```bash
git clone https://github.com/AbdBarho/stable-diffusion-webui-docker.git
cd stable-diffusion-webui-docker/
docker compose --profile download up --build
# For CPU use docker compose --profile auto-cpu up --build
# For Nvidia GPU use docker compose --profile auto up --build

# Notice: For me I had to comment out the line below in the docker-compose.yaml
# tty: true

cd data/models/Stable-diffusion
wget https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors

cd ../../../
docker compose --profile auto up -d
```
