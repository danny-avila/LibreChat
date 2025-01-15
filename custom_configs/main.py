import http.server
import socketserver
import os

# Define the port and directory to serve
PORT = 8002
DIRECTORY = os.getcwd()  # Current working directory

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

# Set up the HTTP server
handler = MyHandler
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving files from {DIRECTORY} at http://localhost:{PORT}")
    httpd.serve_forever()
