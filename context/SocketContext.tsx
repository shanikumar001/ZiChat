'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Set<string>;
  emitEvent: (event: string, data?: unknown) => void;
}

// teset : 
const SocketContext = createContext<SocketContextType | null>(null);

function getSocketUrl(): string {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (socketUrl && typeof socketUrl === 'string' && socketUrl.trim()) {
    return socketUrl.replace(/\/+$/, '');
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl && typeof apiUrl === 'string' && apiUrl.startsWith('http')) {
    return apiUrl.replace(/\/+$/, '');
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
        setOnlineUsers(new Set());
      }
      return;
    }

    const token = getToken();
    if (!token) return;

    const socketUrl = getSocketUrl();

    const newSocket = io(socketUrl.startsWith('http') ? socketUrl : typeof window !== 'undefined' ? window.location.origin : '', {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 3,
      timeout: 5000,
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('⚡ Socket connected:', newSocket.id);
      setIsConnected(true);
      reconnectAttempts.current = 0;
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      reconnectAttempts.current += 1;
      if (reconnectAttempts.current <= 3) {
        console.warn(`Socket server offline (attempt ${reconnectAttempts.current}/3):`, err.message);
      }
      setIsConnected(false);
    });

    newSocket.on('userOnline', (userId: string) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    });

    newSocket.on('userOffline', (userId: string) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    newSocket.on('onlineUsersList', (userIds: string[]) => {
      setOnlineUsers(new Set(userIds));
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [user, getToken]);

  const emitEvent = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUsers, emitEvent }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocketContext must be used within SocketProvider');
  }
  return ctx;
}
