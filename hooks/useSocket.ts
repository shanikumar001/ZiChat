'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketContext } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

/**
 * Hook that syncs socket.io message events with the React Query cache.
 */
export function useSocketMessages(activeUserId: string | undefined) {
  const { socket, isConnected } = useSocketContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const handleNewMessage = (msg: Record<string, unknown>) => {
      const senderId = msg.senderId?.toString();
      const receiverId = msg.receiverId?.toString();
      const myId = user.id;

      const otherUserId = senderId === myId ? receiverId : senderId;
      if (!otherUserId) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['messages', otherUserId], (old: any) => {
        if (!old) return old;
        const msgId = (msg.id || msg._id?.toString()) as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (old.some((m: any) => m.id === msgId)) return old;
        return [
          ...old,
          {
            id: msgId,
            senderId: msg.senderId?.toString(),
            receiverId: msg.receiverId?.toString(),
            groupId: msg.groupId?.toString(),
            text: msg.text,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            messageType: msg.messageType || 'text',
            status: msg.status || 'sent',
            read: msg.read || false,
            createdAt: msg.createdAt,
            isMe: senderId === myId,
            isGroup: msg.isGroup || false,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
          },
        ];
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });

      if (activeUserId && otherUserId === activeUserId && senderId !== myId) {
        socket.emit('markConversationSeen', { senderId: otherUserId });
      }
    };

    const handleMessageSent = (msg: Record<string, unknown>) => {
      const receiverId = msg.receiverId?.toString();
      if (!receiverId) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['messages', receiverId], (old: any) => {
        if (!old) return old;
        const msgId = (msg.id || msg._id?.toString()) as string;

        if (msg.tempId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const idx = old.findIndex(
            (m: any) => m.id === msg.tempId || m.tempId === msg.tempId
          );
          if (idx !== -1) {
            const updated = [...old];
            updated[idx] = {
              ...(updated[idx] as object),
              id: msgId,
              status: msg.status || 'sent',
              createdAt: msg.createdAt,
              tempId: undefined,
            };
            return updated;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (old.some((m: any) => m.id === msgId)) return old;
        return [
          ...old,
          {
            id: msgId,
            senderId: msg.senderId?.toString(),
            receiverId,
            text: msg.text,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            messageType: msg.messageType || 'text',
            status: msg.status || 'sent',
            read: msg.read || false,
            createdAt: msg.createdAt,
            isMe: true,
            isGroup: false,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
          },
        ];
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleMessageDelivered = ({ messageId }: { messageId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['messages'] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        let changed = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = old.map((m: any) => {
          if (m.id === messageId?.toString() && m.status === 'sent') {
            changed = true;
            return { ...m, status: 'delivered' };
          }
          return m;
        });
        return changed ? updated : old;
      });
    };

    const handleMessageSeen = ({ messageId }: { messageId: string; seenBy?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['messages'] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        let changed = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = old.map((m: any) => {
          if (m.id === messageId?.toString() && m.status !== 'seen') {
            changed = true;
            return { ...m, status: 'seen', read: true };
          }
          return m;
        });
        return changed ? updated : old;
      });
    };

    const handleConversationSeen = ({ by }: { by: string; senderId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['messages'] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        let changed = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = old.map((m: any) => {
          if (
            m.isMe &&
            m.senderId === user.id &&
            m.receiverId === by &&
            m.status !== 'seen'
          ) {
            changed = true;
            return { ...m, status: 'seen', read: true };
          }
          return m;
        });
        return changed ? updated : old;
      });
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messageSent', handleMessageSent);
    socket.on('messageDelivered', handleMessageDelivered);
    socket.on('messageSeen', handleMessageSeen);
    socket.on('conversationSeen', handleConversationSeen);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messageSent', handleMessageSent);
      socket.off('messageDelivered', handleMessageDelivered);
      socket.off('messageSeen', handleMessageSeen);
      socket.off('conversationSeen', handleConversationSeen);
    };
  }, [socket, isConnected, user, activeUserId, queryClient]);
}

/**
 * Hook for typing indicator — emits typing/stopTyping events
 */
export function useTypingIndicator(activeUserId: string | undefined) {
  const { socket, isConnected } = useSocketContext();
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!socket || !isConnected || !activeUserId) return;

    const handleTyping = ({ userId }: { userId: string }) => {
      if (userId === activeUserId) {
        setIsOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setIsOtherTyping(false);
        }, 3000);
      }
    };

    const handleStopTyping = ({ userId }: { userId: string }) => {
      if (userId === activeUserId) {
        setIsOtherTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    };

    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);

    return () => {
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsOtherTyping(false);
    };
  }, [socket, isConnected, activeUserId]);

  const emitTyping = useCallback(() => {
    if (!socket || !isConnected || !activeUserId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing', { to: activeUserId });
    }
  }, [socket, isConnected, activeUserId]);

  const emitStopTyping = useCallback(() => {
    if (!socket || !isConnected || !activeUserId) return;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit('stopTyping', { to: activeUserId });
    }
  }, [socket, isConnected, activeUserId]);

  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTypingInput = useCallback(() => {
    emitTyping();
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(() => {
      emitStopTyping();
    }, 2000);
  }, [emitTyping, emitStopTyping]);

  useEffect(() => {
    return () => {
      emitStopTyping();
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    };
  }, [activeUserId, emitStopTyping]);

  return { isOtherTyping, handleTypingInput, emitStopTyping };
}

/**
 * Hook for global message notifications (toast popups).
 */
export function useMessageNotifications(activeUserId: string | undefined) {
  const { socket, isConnected } = useSocketContext();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const handleNewMessage = (msg: Record<string, unknown>) => {
      const senderId = msg.senderId?.toString();
      const myId = user.id;

      if (senderId === myId) return;
      if (activeUserId && senderId === activeUserId) return;

      const senderName = (msg.senderName as string) || 'New message';
      const text = msg.text as string;
      const messagePreview = text
        ? text.slice(0, 80) + (text.length > 80 ? '...' : '')
        : msg.mediaType
          ? `Sent a ${msg.mediaType}`
          : 'New message';

      toast(senderName, {
        description: messagePreview,
        duration: 5000,
        action: {
          label: 'View',
          onClick: () => {
            window.location.href = `/chat?userId=${senderId}`;
          },
        },
      });
    };

    socket.on('newMessage', handleNewMessage);

    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, isConnected, user, activeUserId]);
}
