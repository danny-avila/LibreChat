# Code Interpreter Plugin

## Configuration

### Required
- To get started, create a folder named 'pyassets' in your LibreChat/client/public/assests directory.
    - The output from Python env will be stored here.

### Start the Python Env Server
- Pull the docker container: 
```sh
docker pull ronith128/code-interpreter-librechat:0.1
```
- Start the container with BASE_URL env variable.
    - BASE_URL is the domain/IP of LibreChat instance. 
```sh
sudo docker run -v path/to/assets/pyassets:/app/pyassets -p 3380:3380 -e BASE_URL='https://baseurl' python-server
```

## Optional 

## Change Python Server Default Port
During the docker run command, specify the desired port number. For example, to use port 5000, you can run the command as follows:

```bash
docker run -p 5000:3380 openai/code-interpreter
```
This will map port 5000 on your local machine to port 3380 inside the Docker container.

After changing the port, you also need to update the CodeInterpreter.js file. Look for the following line:

```js
const websocket = new WebSocket('ws://localhost:3380');
```
Change the port number from 3380 to your desired port number. For example, if you used port 5000 in the docker run command, the line should be:

```js
const websocket = new WebSocket('ws://localhost:5000');
```
Save the file after making the change.

### Install new modules from Pip

```python
from pip._internal import main as pipmain
pipmain(['install', 'module_name'])
```

## Demo Prompt 
```
plot sepal.length to petal.length of this dataset https://gist.githubusercontent.com/netj/8836201/raw/6f9306ad21398ea43cba4f7d537619d0e07d5ae3/iris.csv and save as png
```
### Output

![Demo](https://i.ibb.co/5FMc72R/Screenshot-2023-09-01-235043.png)