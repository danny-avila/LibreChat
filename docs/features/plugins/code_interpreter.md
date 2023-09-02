# Code Interpreter Plugin

## Configuration

### Required
- To get started, create a folder named 'pyassets' in your LibreChat/client/public/assests directory.
    - The output from Python env will be stored here.

### Start the Python Env Server
- Pull the docker container: 
```sh
sudo docker pull ronith128/code-interpreter-librechat:0.1
```
- Start the container with BASE_URL env variable and path to the pyassets folder created before.
    - BASE_URL is the domain/IP of LibreChat instance. 
```sh
sudo docker run -v path/to/pyassets:/app/pyassets -p 3380:3380 -e BASE_URL='https://domain.com' ronith128/code-interpreter-librechat:0.1
```

### Example
```bash
docker run -v /home/ubuntu/LibreChat/client/public/assets/pyassets/:/app/pyassets -p 5000:3380 -e BASE_URL='https://gpt.domain.com' ronith128/code-interpreter-librechat:0.1
```` 

## Optional 

## Change Python Server Default Port
During the docker run command, specify the desired port number. For example, to use port 5000, you can run the command as follows:

```bash
docker run -v path/to/pyassets:/app/pyassets -p 5000:3380 -e BASE_URL='https://yourdomain' ronith128/code-interpreter-librechat:0.1
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
Save the file and build to the project to save the changes

```js
npm run frontend
```

### Install new modules from Pip

```python
from pip._internal import main as pipmain
pipmain(['install', 'module_name'])
```

## Demo Prompt 
```
plot sepal.length to petal.length of this dataset https://gist.githubusercontent.com/netj/8836201/raw/6f9306ad21398ea43cba4f7d537619d0e07d5ae3/iris.csv and save as png
```

### Tutorial Video

[![Tutorial Video](https://img.youtube.com/vi/fC3ajXopn3c/0.jpg)](https://www.youtube.com/watch?v=fC3ajXopn3c)

### Output

![Demo](https://i.ibb.co/5FMc72R/Screenshot-2023-09-01-235043.png)