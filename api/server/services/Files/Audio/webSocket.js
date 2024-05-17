let token = '';

function updateTokenWebsocket(newToken) {
  console.log('Token:', newToken);
  token = newToken;
}

function sendTextToWebsocket(ws, onDataReceived) {
  if (token === '[DONE]') {
    ws.send(' ');
    return;
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(token);

    ws.onmessage = function (event) {
      console.log('Received:', event.data);
      if (onDataReceived) {
        onDataReceived(event.data); // Pass the received data to the callback function
      }
    };
  } else {
    console.error('WebSocket is not open. Ready state is: ' + ws.readyState);
  }
}

module.exports = {
  updateTokenWebsocket,
  sendTextToWebsocket,
};
