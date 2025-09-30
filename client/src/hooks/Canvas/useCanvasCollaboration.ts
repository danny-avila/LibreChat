import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { debounce } from "lodash";
import store from "~/store";

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  selection?: { start: number; end: number };
}

export interface UseCanvasCollaborationProps {
  documentId?: string;
  userId?: string;
  userName?: string;
  onContentChange?: (content: string) => void;
  onUsersChange?: (users: CollaborationUser[]) => void;
}

export function useCanvasCollaboration({
  documentId,
  userId,
  userName,
  onContentChange,
  onUsersChange,
}: UseCanvasCollaborationProps = {}) {
  const [canvasData, setCanvasData] = useRecoilState(store.canvasState);
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // WebSocket connection (placeholder for real implementation)
  const wsRef = useRef<WebSocket | null>(null);
  const lastContentRef = useRef<string>("");
  const syncingRef = useRef(false);

  // Initialize WebSocket connection (placeholder)
  useEffect(() => {
    if (!documentId || !userId) return;

    // In a real implementation, you would connect to your WebSocket server here
    // For now, we'll simulate collaborative features

    setIsConnected(true);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [documentId, userId]);

  // Debounced content sync
  const debouncedSync = debounce((content: string) => {
    if (syncingRef.current || content === lastContentRef.current) return;

    lastContentRef.current = content;

    // In a real implementation, send content changes to other users

    // Simulate updating canvas data
    if (canvasData) {
      setCanvasData({
        ...canvasData,
        content,
      });
    }
  }, 300);

  // Handle content changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      onContentChange?.(newContent);
      debouncedSync(newContent);
    },
    [onContentChange, debouncedSync],
  );

  // Handle cursor position updates
  const handleCursorMove = useCallback(
    (_position: { x: number; y: number }) => {
      if (!userId || !isConnected) return;

      // In a real implementation, broadcast cursor position to other users
    },
    [userId, isConnected],
  );

  // Handle text selection updates
  const handleSelectionChange = useCallback(
    (_selection: { start: number; end: number }) => {
      if (!userId || !isConnected) return;

      // In a real implementation, broadcast selection to other users
    },
    [userId, isConnected],
  );

  // Add current user to collaborators
  useEffect(() => {
    if (!userId || !userName) return;

    const currentUser: CollaborationUser = {
      id: userId,
      name: userName,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`, // Random color for demo
    };

    setCollaborators((prev) => {
      const filtered = prev.filter((user) => user.id !== userId);
      const updated = [...filtered, currentUser];
      onUsersChange?.(updated);
      return updated;
    });
  }, [userId, userName, onUsersChange]);

  // Simulate receiving changes from other users (for demo)
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      // Simulate other users joining/leaving
      if (Math.random() > 0.95) {
        const simulatedUser: CollaborationUser = {
          id: `user_${Math.random().toString(36).substr(2, 9)}`,
          name: `User ${Math.floor(Math.random() * 100)}`,
          color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        };

        setCollaborators((prev) => {
          if (prev.length < 3) {
            const updated = [...prev, simulatedUser];
            onUsersChange?.(updated);
            return updated;
          }
          return prev;
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected, onUsersChange]);

  // Apply remote changes (placeholder)
  const applyRemoteChange = useCallback(
    (change: { content?: string; userId: string; timestamp: number }) => {
      if (change.content && !syncingRef.current) {
        syncingRef.current = true;
        onContentChange?.(change.content);
        setTimeout(() => {
          syncingRef.current = false;
        }, 100);
      }
    },
    [onContentChange],
  );

  // Get user color for display
  const getUserColor = useCallback(
    (userId: string) => {
      const user = collaborators.find((u) => u.id === userId);
      return user?.color || "#3b82f6";
    },
    [collaborators],
  );

  return {
    collaborators,
    isConnected,
    handleContentChange,
    handleCursorMove,
    handleSelectionChange,
    applyRemoteChange,
    getUserColor,
    debouncedSync,
  };
}
