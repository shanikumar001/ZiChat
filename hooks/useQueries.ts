'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getApiBase, fetchApi } from '../lib/utils';

function useApiHeaders() {
  const { getToken } = useAuth();
  return () => ({
    Authorization: `Bearer ${getToken()}`,
  });
}

export function useSearchUsers(query: string) {
  const getHeaders = useApiHeaders();
  const q = query.trim();

  return useQuery({
    queryKey: ['users', 'search', q],
    queryFn: async () => {
      if (!q) return [];
      const res = await fetchApi(`/users/search?q=${encodeURIComponent(q)}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: q.length > 0,
    staleTime: 10000,
  });
}

export function useUserProfile(userId: string | undefined) {
  const isEnabled = !!userId && !userId.startsWith('admin_');
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await fetchApi(`/users/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    enabled: isEnabled,
  });
}

export function useConversations() {
  const { user } = useAuth();
  const getHeaders = useApiHeaders();

  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await fetchApi(`/messages/conversations`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 3000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();
  const getHeaders = useApiHeaders();

  return useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const res = await fetchApi(`/messages/unread-count`, {
        headers: getHeaders(),
      });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!user,
  });
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient();
  const getHeaders = useApiHeaders();

  return useMutation({
    mutationFn: async (withUserId: string) => {
      const res = await fetchApi(`/messages/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ with: withUserId }),
      });
      if (!res.ok) throw new Error('Failed to mark read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useGroupDetails(groupId: string | undefined) {
  const getHeaders = useApiHeaders();
  return useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const res = await fetchApi(`/groups/${groupId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch group details');
      return res.json();
    },
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const getHeaders = useApiHeaders();

  return useMutation({
    mutationFn: async (payload: { name: string; description?: string; icon?: string; memberIds: string[] }) => {
      const res = await fetchApi(`/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create group');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  const getHeaders = useApiHeaders();

  return useMutation({
    mutationFn: async ({ groupId, name, description, icon }: { groupId: string; name?: string; description?: string; icon?: string }) => {
      const res = await fetchApi(`/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ name, description, icon }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update group');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useMessages(targetId: string | undefined, isGroup: boolean = false) {
  const getHeaders = useApiHeaders();

  return useQuery({
    queryKey: isGroup ? ['messages', 'group', targetId] : ['messages', targetId],
    queryFn: async () => {
      const url = isGroup ? `/messages?groupId=${targetId}` : `/messages?with=${targetId}`;
      const res = await fetchApi(url, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!targetId,
    refetchInterval: 2000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const getHeaders = useApiHeaders();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetchApi(`/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      const toUserId = variables.toUserId as string;
      const groupId = variables.groupId as string;
      const targetKey = groupId ? ['messages', 'group', groupId] : ['messages', toUserId];

      if (data && data.id) {
        queryClient.setQueryData(targetKey, (oldData: Record<string, unknown>[] | undefined) => {
          const list = Array.isArray(oldData) ? oldData : [];
          if (list.some(m => m.id === data.id)) return list;
          return [...list, data];
        });
      }
      queryClient.invalidateQueries({ queryKey: targetKey });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

export function useConnections() {
  const { user } = useAuth();
  const getHeaders = useApiHeaders();

  return useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await fetch(`${getApiBase()}/users/connections`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
    enabled: !!user,
  });
}

export function useCheckPresence(userIds: string[]) {
  return useQuery({
    queryKey: ['presence', userIds?.sort()?.join(',')],
    queryFn: async () => {
      const res = await fetch(`${getApiBase()}/presence/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: userIds || [] }),
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: Array.isArray(userIds) && userIds.length > 0,
  });
}

export function usePresenceHeartbeat() {
  const { user, getToken } = useAuth();
  
  // Using useQuery with a long refetchInterval as a heartbeat
  return useQuery({
    queryKey: ['presence-heartbeat'],
    queryFn: async () => {
      await fetch(`${getApiBase()}/presence/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
      return { ok: true };
    },
    enabled: !!user,
    refetchInterval: 2 * 60 * 1000, // every 2 min
  });
}
