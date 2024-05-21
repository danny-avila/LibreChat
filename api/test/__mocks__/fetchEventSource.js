jest.mock('@waylaidwanderer/fetch-event-source', () => ({
  fetchEventSource: jest
    .fn()
    .mockImplementation((url, { onopen, onmessage, onclose, onerror, error }) => {
      // Simulating the onopen event
      onopen && onopen({ status: 200 });

      // Simulating a few onmessage events
      onmessage &&
        onmessage({ data: JSON.stringify({ message: 'First message' }), event: 'message' });
      onmessage &&
        onmessage({ data: JSON.stringify({ message: 'Second message' }), event: 'message' });
      onmessage &&
        onmessage({ data: JSON.stringify({ message: 'Third message' }), event: 'message' });

      // Simulate the onclose event
      onclose && onclose();

      if (error) {
        // Simulate the onerror event
        onerror && onerror({ status: 500 });
      }

      // Return a Promise that resolves to simulate async behavior
      return Promise.resolve();
    }),
}));
