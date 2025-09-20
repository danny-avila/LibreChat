import React, { useState, useEffect, useRef } from 'react';
import { Send, Square, AlertCircle } from 'lucide-react';
import { A2AChatMessage } from './A2AChatMessage';
import { useA2ASSE } from '~/hooks/A2A/useA2ASSE';

interface A2AAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  agentCardUrl: string;
  preferredTransport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
}

interface A2AMessage {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
  taskId?: string;
  taskResult?: any;
  isStreaming?: boolean;
}

interface A2AConversationHandlerProps {
  agent: A2AAgent;
  conversationId?: string;
  onMessageSent?: (message: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export const A2AConversationHandler: React.FC<A2AConversationHandlerProps> = ({
  agent,
  conversationId,
  onMessageSent,
  onError,
  className = ''
}) => {
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { sendMessage, cancelMessage, subscribeToAgent, unsubscribeFromAgent } = useA2ASSE();

  useEffect(() => {
    // Subscribe to the agent for real-time updates
    if (agent.id) {
      subscribeToAgent(agent.id, (data: any) => {
        handleStreamingMessage(data);
      });
    }

    return () => {
      if (agent.id) {
        unsubscribeFromAgent(agent.id);
      }
    };
  }, [agent.id]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStreamingMessage = (data: any) => {
    if (data.type === 'message_start') {
      const newMessage: A2AMessage = {
        id: data.taskId || Date.now().toString(),
        agentId: agent.id,
        agentName: agent.name,
        content: '',
        timestamp: new Date(),
        taskId: data.taskId,
        isStreaming: true
      };
      setMessages(prev => [...prev, newMessage]);
      setIsStreaming(true);
    } else if (data.type === 'message_chunk') {
      setMessages(prev => 
        prev.map(msg => 
          msg.taskId === data.taskId 
            ? { ...msg, content: msg.content + data.content }
            : msg
        )
      );
    } else if (data.type === 'message_end') {
      setMessages(prev => 
        prev.map(msg => 
          msg.taskId === data.taskId 
            ? { ...msg, isStreaming: false, taskResult: data.result }
            : msg
        )
      );
      setIsStreaming(false);
      setCurrentTaskId(null);
    } else if (data.type === 'error') {
      setMessages(prev => 
        prev.map(msg => 
          msg.taskId === data.taskId 
            ? { 
                ...msg, 
                isStreaming: false, 
                taskResult: { 
                  id: data.taskId,
                  status: 'failed', 
                  error: data.error 
                } 
              }
            : msg
        )
      );
      setIsStreaming(false);
      setCurrentTaskId(null);
      onError?.(data.error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || isStreaming) {
      return;
    }

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    // Add user message to chat
    const newUserMessage: A2AMessage = {
      id: Date.now().toString(),
      agentId: 'user',
      agentName: 'You',
      content: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await sendMessage(agent.id, {
        message: userMessage,
        conversationId: conversationId
      });

      if (response.taskId) {
        setCurrentTaskId(response.taskId);
      }

      onMessageSent?.(userMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      onError?.(errorMessage);
      
      // Add error message to chat
      const errorMsg: A2AMessage = {
        id: Date.now().toString() + '_error',
        agentId: 'system',
        agentName: 'System',
        content: `Error: ${errorMessage}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMessage = () => {
    if (currentTaskId) {
      cancelMessage(currentTaskId);
      setCurrentTaskId(null);
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (agent.status !== 'online') {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <AlertCircle className="h-5 w-5" />
          <span>Agent is {agent.status}. Cannot start conversation.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Start a conversation with {agent.name}</h3>
              <p className="text-sm">{agent.description}</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <A2AChatMessage
                key={message.id}
                agentName={message.agentName}
                agentId={message.agentId}
                message={message.content}
                timestamp={message.timestamp}
                taskId={message.taskId}
                taskResult={message.taskResult}
                isStreaming={message.isStreaming}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 dark:border-gray-700">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${agent.name}...`}
              disabled={isLoading || isStreaming}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1">
            {isStreaming && (
              <button
                onClick={handleCancelMessage}
                className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                title="Cancel message"
              >
                <Square className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading || isStreaming}
              className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default A2AConversationHandler;