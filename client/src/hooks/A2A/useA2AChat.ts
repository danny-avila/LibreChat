import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface A2AChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  artifacts?: Array<{
    id: string;
    type: string;
    name: string;
    content: unknown;
  }>;
  metadata?: Record<string, unknown>;
}

interface A2AChatOptions {
  agentId: string;
  taskBased?: boolean;
  streaming?: boolean;
  conversationId?: string;
}

interface A2AChatState {
  messages: A2AChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  currentTaskId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

/**
 * Hook for A2A chat communication
 */
export const useA2AChat = () => {
  const [chatState, setChatState] = useState<A2AChatState>({
    messages: [],
    isLoading: false,
    error: null,
    conversationId: null,
    currentTaskId: null,
    connectionStatus: 'disconnected',
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  /**
   * Send message to A2A agent
   */
  const sendMessage = useCallback(async (
    message: string,
    options: A2AChatOptions
  ): Promise<void> => {
    const { agentId, taskBased = false, streaming = true, conversationId } = options;

    // Cleanup any existing connections
    cleanup();

    setChatState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      connectionStatus: 'connecting',
    }));

    // Add user message to state
    const userMessage: A2AChatMessage = {
      id: uuidv4(),
      role: 'user',
      text: message,
      timestamp: new Date(),
      agentId,
    };

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      conversationId: conversationId || prev.conversationId || uuidv4(),
    }));

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      if (streaming) {
        // Use Server-Sent Events for streaming
        await handleStreamingResponse(message, options, token);
      } else {
        // Use regular HTTP request
        await handleRegularResponse(message, options, token);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setChatState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        connectionStatus: 'error',
      }));
    }
  }, [cleanup]);

  /**
   * Handle streaming response via SSE
   */
  const handleStreamingResponse = async (
    message: string,
    options: A2AChatOptions,
    token: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const { agentId, taskBased = false, conversationId } = options;
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Prepare request data
      const requestData = {
        agentId,
        message,
        taskBased,
        streaming: true,
        conversationId: conversationId || chatState.conversationId,
      };

      // Create EventSource-like functionality with fetch
      fetch('/api/a2a/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestData),
        signal: abortControllerRef.current.signal,
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage: A2AChatMessage | null = null;

        const processStream = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    await handleStreamEvent(data, assistantMessage, resolve, reject);
                    
                    // Update assistant message reference
                    if (data.type === 'created' || data.created) {
                      assistantMessage = {
                        id: data.message?.messageId || uuidv4(),
                        role: 'assistant',
                        text: '',
                        timestamp: new Date(),
                        agentId: options.agentId,
                      };
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse SSE data:', parseError);
                  }
                }
              }
            }
          } catch (streamError) {
            if (streamError.name !== 'AbortError') {
              reject(streamError);
            }
          }
        };

        processStream();
      })
      .catch(reject);
    });
  };

  /**
   * Handle regular HTTP response
   */
  const handleRegularResponse = async (
    message: string,
    options: A2AChatOptions,
    token: string
  ): Promise<void> => {
    const { agentId, taskBased = false, conversationId } = options;
    
    const requestData = {
      agentId,
      message,
      taskBased,
      streaming: false,
      conversationId: conversationId || chatState.conversationId,
    };

    const response = await fetch('/api/a2a/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `Request failed: ${response.status}`);
    }

    const responseData = await response.json();
    
    // Add response message
    const assistantMessage: A2AChatMessage = {
      id: responseData.responseMessage?.messageId || uuidv4(),
      role: 'assistant',
      text: responseData.responseMessage?.text || 'No response received',
      timestamp: new Date(),
      agentId: options.agentId,
      metadata: responseData.responseMessage?.metadata,
    };

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMessage],
      isLoading: false,
      connectionStatus: 'connected',
      conversationId: responseData.conversation?.conversationId || prev.conversationId,
    }));
  };

  /**
   * Handle individual stream events
   */
  const handleStreamEvent = async (
    data: any,
    assistantMessage: A2AChatMessage | null,
    resolve: (value: void) => void,
    reject: (reason?: any) => void
  ): Promise<void> => {
    switch (data.type) {
      case 'connection':
        setChatState(prev => ({
          ...prev,
          connectionStatus: 'connected',
          error: null,
        }));
        break;

      case 'created':
        if (data.created) {
          setChatState(prev => ({
            ...prev,
            conversationId: data.conversationId || prev.conversationId,
          }));
        }
        break;

      case 'content':
        if (assistantMessage && data.text) {
          setChatState(prev => {
            const updatedMessages = [...prev.messages];
            let messageIndex = updatedMessages.findIndex(msg => msg.id === assistantMessage.id);
            
            if (messageIndex === -1) {
              // Add new assistant message
              updatedMessages.push({
                ...assistantMessage,
                text: data.text,
              });
            } else {
              // Update existing message
              updatedMessages[messageIndex] = {
                ...updatedMessages[messageIndex],
                text: updatedMessages[messageIndex].text + data.text,
              };
            }
            
            return {
              ...prev,
              messages: updatedMessages,
            };
          });
        }
        break;

      case 'task_created':
        setChatState(prev => ({
          ...prev,
          currentTaskId: data.taskId,
        }));
        break;

      case 'task_update':
        // Handle task status updates
        console.log('Task update:', data);
        break;

      case 'final':
        if (data.final) {
          const finalMessage: A2AChatMessage = {
            id: data.responseMessage?.messageId || uuidv4(),
            role: 'assistant',
            text: data.responseMessage?.text || 'Response completed',
            timestamp: new Date(),
            agentId: data.responseMessage?.metadata?.agentId,
            agentName: data.responseMessage?.metadata?.agentName,
            taskId: data.responseMessage?.metadata?.taskId,
            artifacts: data.responseMessage?.metadata?.artifacts,
            metadata: data.responseMessage?.metadata,
          };

          setChatState(prev => ({
            ...prev,
            messages: [...prev.messages.filter(msg => msg.id !== finalMessage.id), finalMessage],
            isLoading: false,
            connectionStatus: 'connected',
            conversationId: data.conversation?.conversationId || prev.conversationId,
          }));

          resolve();
        }
        break;

      case 'error':
      default:
        if (data.error) {
          const errorMessage = data.message || 'Unknown error occurred';
          setChatState(prev => ({
            ...prev,
            error: errorMessage,
            isLoading: false,
            connectionStatus: 'error',
          }));
          reject(new Error(errorMessage));
        }
        break;
    }
  };

  /**
   * Clear chat history
   */
  const clearChat = useCallback(() => {
    cleanup();
    setChatState({
      messages: [],
      isLoading: false,
      error: null,
      conversationId: null,
      currentTaskId: null,
      connectionStatus: 'disconnected',
    });
  }, [cleanup]);

  /**
   * Cancel current request
   */
  const cancelRequest = useCallback(() => {
    cleanup();
    setChatState(prev => ({
      ...prev,
      isLoading: false,
      connectionStatus: 'disconnected',
    }));
  }, [cleanup]);

  /**
   * Retry last message
   */
  const retryLastMessage = useCallback((options: A2AChatOptions) => {
    const lastUserMessage = chatState.messages
      .filter(msg => msg.role === 'user')
      .pop();

    if (lastUserMessage) {
      // Remove any assistant messages after the last user message
      const messageIndex = chatState.messages.findIndex(msg => msg.id === lastUserMessage.id);
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.slice(0, messageIndex + 1),
        error: null,
      }));

      // Resend the message
      sendMessage(lastUserMessage.text, options);
    }
  }, [chatState.messages, sendMessage]);

  return {
    // State
    messages: chatState.messages,
    isLoading: chatState.isLoading,
    error: chatState.error,
    conversationId: chatState.conversationId,
    currentTaskId: chatState.currentTaskId,
    connectionStatus: chatState.connectionStatus,

    // Actions
    sendMessage,
    clearChat,
    cancelRequest,
    retryLastMessage,
  };
};