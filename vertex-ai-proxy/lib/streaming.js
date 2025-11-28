/**
 * Parse SSE events from Vertex AI response stream
 * @param {ReadableStream} stream - Response body stream
 * @param {function} onEvent - Callback for each parsed event
 */
export async function parseSSEStream(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          processBuffer(buffer, onEvent);
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete events (separated by double newlines)
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer
      
      for (const event of events) {
        if (event.trim()) {
          processBuffer(event, onEvent);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Process a single SSE event buffer
 * @param {string} buffer - Raw SSE event text
 * @param {function} onEvent - Callback for parsed event
 */
function processBuffer(buffer, onEvent) {
  const lines = buffer.split('\n');
  let eventType = 'message';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    } else if (line.startsWith(':')) {
      // Comment, ignore
      continue;
    }
  }

  if (data) {
    try {
      const parsed = JSON.parse(data);
      onEvent({ type: eventType, data: parsed });
    } catch (e) {
      // If not JSON, pass raw data
      onEvent({ type: eventType, data: data });
    }
  }
}

/**
 * Format Anthropic SSE event for client
 * @param {string} eventType - Event type (message_start, content_block_delta, etc.)
 * @param {object} data - Event data
 * @returns {string} Formatted SSE string
 */
export function formatSSE(eventType, data) {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Create a message_start event
 * @param {string} id - Message ID
 * @param {string} model - Model name
 * @returns {object} Message start event data
 */
export function createMessageStart(id, model) {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0
      }
    }
  };
}

/**
 * Create a content_block_start event
 * @param {number} index - Block index
 * @returns {object} Content block start event data
 */
export function createContentBlockStart(index) {
  return {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'text',
      text: ''
    }
  };
}

/**
 * Create a content_block_delta event
 * @param {number} index - Block index
 * @param {string} text - Delta text
 * @returns {object} Content block delta event data
 */
export function createContentBlockDelta(index, text) {
  return {
    type: 'content_block_delta',
    index,
    delta: {
      type: 'text_delta',
      text
    }
  };
}

/**
 * Create a content_block_stop event
 * @param {number} index - Block index
 * @returns {object} Content block stop event data
 */
export function createContentBlockStop(index) {
  return {
    type: 'content_block_stop',
    index
  };
}

/**
 * Create a message_delta event
 * @param {string} stopReason - Stop reason
 * @param {object} usage - Token usage
 * @returns {object} Message delta event data
 */
export function createMessageDelta(stopReason, usage) {
  return {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null
    },
    usage
  };
}

/**
 * Create a message_stop event
 * @returns {object} Message stop event data
 */
export function createMessageStop() {
  return {
    type: 'message_stop'
  };
}
