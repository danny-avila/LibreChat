# Ngrok Installation

To use Ngrok for tunneling your local server to the internet, follow these steps:

## Sign up

1. Go to https://ngrok.com/ and sign up for an account.

## Docker Installation

1. Copy your auth token from https://dashboard.ngrok.com/get-started/your-authtoken.
2. Open a terminal and run the following command: `docker run -d -it -e NGROK_AUTHTOKEN=<your token> ngrok/ngrok http 80`

## Windows Installation

1. Download the ZIP file from https://ngrok.com/download.
2. Extract the contents of the ZIP file using 7zip or WinRar.
3. Run `ngrok.exe`.
4. Copy your auth token from https://dashboard.ngrok.com/get-started/your-authtoken.
5. In the `ngrok.exe` terminal, run the following command: `ngrok config add-authtoken <your token>`
6. If you haven't done so already, start LibreChat normally.
7. In the `ngrok.exe` terminal, run the following command: ngrok http 3080

You will see a link that can be used to access LibreChat.
![ngrok-1](https://github.com/danny-avila/LibreChat/assets/32828263/3cb4b063-541f-4f0a-bea8-a04dd36e6bf4)

---

### Note: 
This readme assumes some prior knowledge and familiarity with the command line, Docker, and running applications on your local machine. If you have any issues or questions, refer to the Ngrok documentation or open an issue on our [Discord server](https://discord.gg/NGaa9RPCft)
