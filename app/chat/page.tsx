'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkMessagesRead,
  useUserProfile,
  useCheckPresence,
  useSearchUsers,
  useCreateGroup,
  useGroupDetails,
  useUpdateGroup,
} from '../../hooks/useQueries';
import { useSocketMessages, useTypingIndicator, useMessageNotifications } from '../../hooks/useSocket';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import { CallModal } from './components/CallModal';
import { getMediaUrl, getApiBase, fetchApi } from '../../lib/utils';
import { toast } from 'sonner';
import {
  MessageSquare, ArrowLeft, Send, Clock, Circle,
  MoreVertical, Trash2, Plus, File, FileText, X,
  Download, FileIcon, Pin, WifiOff, Check, CheckCheck,
  LogOut, Search, UserPlus, MessageSquarePlus, User, Sun, Moon, Users, UserCheck, Camera, Loader2,
  Phone, Video
} from 'lucide-react';

function ChatPageContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') || undefined;

  const call = useWebRTCCall();

  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Local persistence for chat hiding/clearing
  const [clearedAt, setClearedAt] = useState<string | null>(() => {
    if (typeof window === 'undefined' || !user || !userId) return null;
    return localStorage.getItem(`chat_cleared_at_${user.id}_${userId}`);
  });
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    if (typeof window === 'undefined' || !user || !userId) return [];
    try {
      const saved = localStorage.getItem(`chat_hidden_ids_${user.id}_${userId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined' || !user) return [];
    try {
      const saved = localStorage.getItem(`chat_pinned_ids_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [hiddenConversations, setHiddenConversations] = useState<string[]>(() => {
    if (typeof window === 'undefined' || !user) return [];
    try {
      const saved = localStorage.getItem(`chat_hidden_conversations_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [sortType, setSortType] = useState<string>(() => {
    if (typeof window === 'undefined' || !user) return 'latest';
    return localStorage.getItem(`chat_sort_type_${user.id}`) || 'latest';
  });

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = (localStorage.getItem('zichat_theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('zichat_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
    toast.success(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} theme`);
  };

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && userId) {
      setClearedAt(localStorage.getItem(`chat_cleared_at_${user.id}_${userId}`));
      try {
        const saved = localStorage.getItem(`chat_hidden_ids_${user.id}_${userId}`);
        setHiddenIds(saved ? JSON.parse(saved) : []);
      } catch { setHiddenIds([]); }
    }
  }, [user, userId]);

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [groupIconInput, setGroupIconInput] = useState('');
  const [isUploadingGroupIcon, setIsUploadingGroupIcon] = useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);

  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const { data: memberSearchResults = [] } = useSearchUsers(groupMemberSearch);

  const handleGroupPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>, targetGroupId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be under 10MB');
      return;
    }

    setIsUploadingGroupIcon(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetchApi('/media', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Group photo upload failed');
      }

      setGroupIconInput(data.url);

      if (targetGroupId) {
        await updateGroup.mutateAsync({
          groupId: targetGroupId,
          icon: data.url,
        });
        toast.success('Group photo updated!');
      } else {
        toast.success('Group photo selected!');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to upload group photo');
    } finally {
      setIsUploadingGroupIcon(false);
    }
  };

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: searchResults = [], isLoading: isSearching } = useSearchUsers(searchQuery);

  const selectedConversation = (conversations as Record<string, unknown>[]).find((c) => c.id === userId);
  const isSelectedGroup = !!(selectedConversation as Record<string, unknown>)?.isGroup;

  const { data: messages = [], isLoading: messagesLoading } = useMessages(userId, isSelectedGroup);
  const { data: groupDetails } = useGroupDetails(isSelectedGroup ? userId : undefined);

  const presenceUserIds = [...new Set([
    ...(userId ? [userId] : []),
    ...((conversations as Record<string, unknown>[])?.map((c: Record<string, unknown>) => c.id as string) || []),
  ])];
  const { data: presenceMap = {} } = useCheckPresence(presenceUserIds);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const { data: otherUser } = useUserProfile(isSelectedGroup ? undefined : userId);

  // Real-time socket hooks
  const { isConnected: socketConnected, onlineUsers } = useSocketContext();
  useSocketMessages(userId);
  const { isOtherTyping, handleTypingInput, emitStopTyping } = useTypingIndicator(userId);
  useMessageNotifications(userId);

  const isOtherUserOnline = userId ? (onlineUsers.has(userId) || !!(presenceMap as Record<string, unknown>)[userId]) : false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { if (userId && !isSelectedGroup) markRead.mutate(userId); }, [userId, isSelectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearChat = () => {
    if (!window.confirm('Are you sure you want to clear chat history? This will only hide it for you.')) return;
    if (!user || !userId) return;
    const now = new Date().toISOString();
    localStorage.setItem(`chat_cleared_at_${user.id}_${userId}`, now);
    setClearedAt(now);
    setHiddenIds([]);
    localStorage.removeItem(`chat_hidden_ids_${user.id}_${userId}`);
    toast.success('Chat history cleared locally');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!user || !userId) return;
    const updated = [...hiddenIds, messageId];
    setHiddenIds(updated);
    localStorage.setItem(`chat_hidden_ids_${user.id}_${userId}`, JSON.stringify(updated));
    toast.success('Message hidden');
  };

  const handleTogglePin = (id: string) => {
    if (!user) return;
    const updated = pinnedIds.includes(id)
      ? pinnedIds.filter(pid => pid !== id)
      : [id, ...pinnedIds];
    setPinnedIds(updated);
    localStorage.setItem(`chat_pinned_ids_${user.id}`, JSON.stringify(updated));
    toast.success(pinnedIds.includes(id) ? 'Chat unpinned' : 'Chat pinned');
  };

  const handleHideConversation = (id: string) => {
    if (!user) return;
    const updated = [...hiddenConversations, id];
    setHiddenConversations(updated);
    localStorage.setItem(`chat_hidden_conversations_${user.id}`, JSON.stringify(updated));
    toast.success('Conversation hidden');
    if (userId === id) router.push('/chat');
  };

  const handleSortChange = (type: string) => {
    if (!user) return;
    setSortType(type);
    localStorage.setItem(`chat_sort_type_${user.id}`, type);
    toast.success(`Sorting by ${type}`);
  };

  const displayUser = selectedConversation
    ? {
      id: selectedConversation.id as string,
      name: selectedConversation.name as string,
      username: selectedConversation.username as string,
      profilePhoto: (selectedConversation.profilePhoto as string) || (selectedConversation.icon as string) || (groupDetails?.icon as string),
      isGroup: !!selectedConversation.isGroup,
      memberCount: (selectedConversation.memberCount as number) || (groupDetails?.memberCount as number),
      description: (selectedConversation.description as string) || (groupDetails?.description as string),
    }
    : otherUser
      ? { id: otherUser.id, name: otherUser.name, username: otherUser.username, profilePhoto: otherUser.profilePhoto, isGroup: false }
      : null;

  const getInitials = (name: string | undefined) =>
    name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const sizeLimit = 50 * 1024 * 1024;
      if (file.size > sizeLimit) { toast.error(`${file.name} is too large (max 50MB)`); return false; }
      return true;
    });
    setSelectedFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${getApiBase()}/media`, { method: 'POST', body: formData });
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.indexOf('application/json') !== -1) {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Upload failed');
        return data;
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server error: Upload failed.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error((err as Error).message || 'Upload failed');
      throw err;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!messageText.trim() && selectedFiles.length === 0) || !userId) return;

    const textToSubmit = messageText.trim();
    setMessageText('');
    const filesToUpload = [...selectedFiles];
    setSelectedFiles([]);

    try {
      if (filesToUpload.length > 0) {
        setIsUploading(true);
        for (const file of filesToUpload) {
          const uploadRes = await uploadFile(file);
          let mediaType = 'file';
          if (file.type.startsWith('image/')) mediaType = 'image';
          else if (file.type.startsWith('video/')) mediaType = 'video';
          else if (file.type === 'application/pdf') mediaType = 'pdf';

          const mediaPayload: Record<string, unknown> = isSelectedGroup
            ? { groupId: userId, text: '', mediaUrl: uploadRes.url, mediaType, fileName: uploadRes.fileName, fileSize: uploadRes.fileSize, messageType: 'media' }
            : { toUserId: userId, text: '', mediaUrl: uploadRes.url, mediaType, fileName: uploadRes.fileName, fileSize: uploadRes.fileSize, messageType: 'media' };

          await sendMessage.mutateAsync(mediaPayload);
        }
        setIsUploading(false);
      }

      if (textToSubmit) {
        const textPayload: Record<string, unknown> = isSelectedGroup
          ? { groupId: userId, text: textToSubmit }
          : { toUserId: userId, text: textToSubmit };

        await sendMessage.mutateAsync(textPayload);
      }
    } catch (err) {
      toast.error('Failed to send: ' + (err as Error).message);
      setIsUploading(false);
    }
  };

  const photoUrl = (photo: unknown) => getMediaUrl(photo);

  const formatTime = (date: string | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <main className="flex flex-col h-dvh max-w-6xl mx-auto px-0 sm:px-4 py-0 sm:py-2">

      <div className="flex flex-1 min-h-0 border-0 sm:border border-border rounded-none sm:rounded-xl overflow-hidden bg-card shadow-xl">
        {/* Sidebar */}
        <div className={`w-full md:w-80 border-r border-border bg-gradient-to-b from-muted/30 to-background flex flex-col ${userId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="flex items-center gap-2 p-1.5 px-2.5 rounded-xl border border-border bg-background/50 hover:bg-accent text-foreground transition-all"
                title="Edit Profile"
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-[10px] overflow-hidden ring-1 ring-primary/20">
                  {photoUrl(user.profilePhoto) ? (
                    <img src={photoUrl(user.profilePhoto) || ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(user.name)
                  )}
                </div>
                <span className="text-xs font-semibold">{user.name}</span>
              </Link>
              
            </div>
            {/* Sort menu */}
            <div className="relative">
              <button onClick={() => setMenuOpen(menuOpen === 'sidebar' ? null : 'sidebar')}
                className="p-2 rounded-lg hover:bg-accent transition-colors">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
              {menuOpen === 'sidebar' && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border/80 rounded-xl shadow-2xl z-50 py-1.5 animate-fade-in ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-xl max-h-[80vh] max-h-[80dvh] overflow-y-auto">
                  <button onClick={() => { setShowCreateGroupModal(true); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 cursor-pointer text-foreground font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    <span>New Group</span>
                  </button>
                  <div className="border-t border-border my-1" />
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by</div>
                  {['latest', 'unread', 'alpha'].map((type) => (
                    <button key={type} onClick={() => { handleSortChange(type); setMenuOpen(null); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between ${sortType === type ? 'text-primary font-semibold bg-accent/50' : 'text-foreground'}`}>
                      <div className="flex items-center gap-2">
                        {type === 'latest' ? <Clock className="h-4 w-4" /> : type === 'unread' ? <Circle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        <span>{type === 'latest' ? 'Latest Message' : type === 'unread' ? 'Unread First' : 'Alphabetical'}</span>
                      </div>
                      {sortType === type && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                  <div className="border-t border-border my-1" />
                  <button onClick={() => { toggleTheme(); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between text-foreground cursor-pointer">
                    <div className="flex items-center gap-2">
                      {theme === 'dark' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-warning" />}
                      <span>Theme Mode</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {theme === 'dark' ? 'Dark' : 'Light'}
                    </span>
                  </button>
                  <button onClick={() => { handleLogout(); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive font-medium transition-colors flex items-center gap-2 cursor-pointer">
                    <LogOut className="h-4 w-4" /> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* User Search Bar */}
          <div className="p-2.5 sm:p-3 border-b border-border bg-card/60 relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search user by email or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-muted-foreground hover:text-foreground p-1 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search Results overlay OR Conversations List */}
          {searchQuery.trim() ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Search Results</span>
                {isSearching && <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
              </div>

              {searchResults.length > 0 ? (
                searchResults.map((foundUser: { id: string; name: string; username: string; email: string; profilePhoto?: string }) => (
                  <div
                    key={foundUser.id}
                    onClick={() => {
                      router.push(`/chat?userId=${foundUser.id}`);
                      setSearchQuery('');
                      toast.success(`Started chat with ${foundUser.name}`);
                    }}
                    className="p-3 rounded-xl bg-card border border-border/60 hover:bg-accent hover:border-primary/30 transition-all duration-200 cursor-pointer flex items-center gap-3 group shadow-sm"
                  >
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary ring-2 ring-primary/20 overflow-hidden shrink-0">
                      {photoUrl(foundUser.profilePhoto) ? (
                        <img src={photoUrl(foundUser.profilePhoto) || ''} alt="" className="h-full w-full object-cover" />
                      ) : (
                        getInitials(foundUser.name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs truncate text-foreground group-hover:text-primary transition-colors">{foundUser.name}</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <MessageSquarePlus className="h-3 w-3" /> Chat
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">@{foundUser.username}</p>
                      <p className="text-[10px] text-muted-foreground/70 truncate">{foundUser.email}</p>
                    </div>
                  </div>
                ))
              ) : !isSearching ? (
                <div className="p-4 text-center space-y-3 bg-muted/20 rounded-xl border border-dashed border-border my-2">
                  <p className="text-xs text-muted-foreground">No user found matching &quot;{searchQuery}&quot;</p>
                  <button
                    onClick={() => {
                      const targetId = searchQuery.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
                      if (targetId) {
                        router.push(`/chat?userId=${targetId}`);
                        setSearchQuery('');
                        toast.success(`Direct chat started with ${searchQuery}`);
                      }
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Direct Chat with &quot;{searchQuery}&quot;
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {conversationsLoading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Loading conversations...</div>
              ) : (conversations as Record<string, unknown>[]).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No conversations yet</p>
                  <p className="text-xs mt-1">Start chatting from the main app</p>
                </div>
              ) : (
                (conversations as Record<string, unknown>[])
                  .filter((c) => !hiddenConversations.includes(c.id as string))
                  .sort((a, b) => {
                    const aTyping = (a.id as string) === userId && isOtherTyping;
                    const bTyping = (b.id as string) === userId && isOtherTyping;
                    if (aTyping && !bTyping) return -1;
                    if (!aTyping && bTyping) return 1;
                    const aPinned = pinnedIds.includes(a.id as string);
                    const bPinned = pinnedIds.includes(b.id as string);
                    if (aPinned && !bPinned) return -1;
                    if (!aPinned && bPinned) return 1;
                    if (sortType === 'unread') {
                      if ((a.unreadCount as number) !== (b.unreadCount as number)) return (b.unreadCount as number) - (a.unreadCount as number);
                    } else if (sortType === 'alpha') {
                      return (a.name as string).localeCompare(b.name as string);
                    }
                    const aDate = (a.lastMessage as Record<string, unknown>) ? new Date(((a.lastMessage as Record<string, unknown>)?.createdAt as string) || 0) : new Date(0);
                    const bDate = (b.lastMessage as Record<string, unknown>) ? new Date(((b.lastMessage as Record<string, unknown>)?.createdAt as string) || 0) : new Date(0);
                    return bDate.getTime() - aDate.getTime();
                  })
                  .map((c) => (
                    <button
                      key={c.id as string}
                      onClick={() => router.push(`/chat?userId=${c.id}`)}
                      className={`w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-accent/70 active:bg-accent/90 transition-all duration-200 text-left border-b border-border/50 relative group ${userId === c.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                    >
                      <div className="relative">
                        {pinnedIds.includes(c.id as string) && (
                          <span className="absolute -top-1 -left-1 z-10 text-[8px]">📌</span>
                        )}
                        {(c.unreadCount as number) > 0 && (
                          <span className="absolute -top-1 -right-1 z-10 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
                            {(c.unreadCount as number) > 99 ? '99+' : c.unreadCount as number}
                          </span>
                        )}
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary ring-2 ring-primary/20 ring-offset-2 ring-offset-background overflow-hidden">
                          {photoUrl(c.profilePhoto || c.icon) ? (
                            <img src={photoUrl(c.profilePhoto || c.icon) || ''} alt="" className="h-full w-full object-cover" />
                          ) : c.isGroup ? (
                            <div className="h-full w-full bg-primary/20 flex items-center justify-center text-primary">
                              <Users className="h-6 w-6" />
                            </div>
                          ) : (
                            getInitials(c.name as string)
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="font-semibold truncate block text-sm">{c.name as string}</span>
                          {!!(presenceMap as Record<string, unknown>)[c.id as string] && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-success">
                              <Circle className="h-1.5 w-1.5 fill-current animate-pulse" />
                            </span>
                          )}
                          {(c.lastMessage as Record<string, unknown>) && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                              {formatTime(((c.lastMessage as Record<string, unknown>)?.createdAt as string))}
                            </span>
                          )}
                        </div>
                        {(c.id as string) === userId && isOtherTyping ? (
                          <span className="text-xs text-primary font-medium flex items-center gap-1">
                            typing
                            <span className="inline-flex gap-0.5">
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </span>
                        ) : (c.lastMessage as Record<string, unknown>) ? (
                          <span className="text-xs text-muted-foreground truncate block">
                            {((c.lastMessage as Record<string, unknown>)?.isMe as boolean) && <span className="text-primary">You: </span>}
                            {(c.lastMessage as Record<string, unknown>)?.text as string}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Conversation area */}
        <div className={`flex-1 flex flex-col bg-gradient-to-b from-background to-muted/10 ${userId ? 'flex' : 'hidden md:flex'}`} style={{ maxHeight: '100%' }}>
          {userId ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border bg-card/95 backdrop-blur-md relative z-30">
                <button className="md:hidden p-2 rounded-lg hover:bg-accent active:bg-accent/80 shrink-0" onClick={() => router.push('/chat')}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {displayUser && (
                  <>
                    <div
                      onClick={() => displayUser.isGroup && setShowGroupDetailsModal(true)}
                      className={`h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary ring-2 ring-primary/20 overflow-hidden ${displayUser.isGroup ? 'cursor-pointer hover:ring-primary/40' : ''}`}
                      title={displayUser.isGroup ? 'View Group Info & Change Photo' : ''}
                    >
                      {photoUrl(displayUser.profilePhoto) ? (
                        <img src={photoUrl(displayUser.profilePhoto) || ''} alt="" className="h-full w-full object-cover" />
                      ) : displayUser.isGroup ? (
                        <div className="h-full w-full bg-primary/20 flex items-center justify-center text-primary">
                          <Users className="h-5 w-5" />
                        </div>
                      ) : (
                        getInitials(displayUser.name)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="font-semibold text-sm sm:text-base block truncate">{displayUser.name}</span>
                        {displayUser.isGroup && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">Group</span>
                        )}
                        {!displayUser.isGroup && displayUser.username && (
                          <span className="text-xs text-muted-foreground font-normal">@{displayUser.username}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {displayUser.isGroup ? (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-primary" />
                            {displayUser.memberCount || 2} members
                            {displayUser.description ? ` • ${displayUser.description}` : ''}
                          </span>
                        ) : isOtherTyping ? (
                          <span className="text-primary font-medium flex items-center gap-1">
                            typing
                            <span className="inline-flex gap-0.5">
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </span>
                        ) : isOtherUserOnline ? (
                          <>
                            <Circle className="h-2 w-2 fill-success text-success animate-pulse" />
                            Active now
                          </>
                        ) : (
                          'Offline'
                        )}
                      </p>
                    </div>

                    {/* Call Actions & Chat menu */}
                    <div className="flex items-center gap-1">
                      {!displayUser.isGroup && (
                        <>
                          <button
                            onClick={() =>
                              call.startCall(
                                {
                                  id: displayUser.id,
                                  name: displayUser.name,
                                  username: displayUser.username,
                                  avatar: displayUser.profilePhoto,
                                },
                                'audio'
                              )
                            }
                            className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors cursor-pointer"
                            title="Voice Call"
                          >
                            <Phone className="h-5 w-5" />
                          </button>

                          <button
                            onClick={() =>
                              call.startCall(
                                {
                                  id: displayUser.id,
                                  name: displayUser.name,
                                  username: displayUser.username,
                                  avatar: displayUser.profilePhoto,
                                },
                                'video'
                              )
                            }
                            className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors cursor-pointer"
                            title="Video Call"
                          >
                            <Video className="h-5 w-5" />
                          </button>
                        </>
                      )}

                      <div className="relative">
                        <button onClick={() => setMenuOpen(menuOpen === 'chat' ? null : 'chat')}
                          className="p-2 rounded-lg hover:bg-accent transition-colors">
                          <MoreVertical className="h-5 w-5 text-muted-foreground" />
                        </button>
                        {menuOpen === 'chat' && (
                          <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border/80 rounded-xl shadow-2xl z-50 py-1.5 animate-fade-in ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-xl max-h-[80vh] max-h-[80dvh] overflow-y-auto">
                            {displayUser.isGroup && (
                              <button onClick={() => { setShowGroupDetailsModal(true); setMenuOpen(null); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 cursor-pointer">
                                <Camera className="h-4 w-4 text-primary" />
                                <span>Edit Group Photo & Info</span>
                              </button>
                            )}
                            <button onClick={() => { handleTogglePin(userId); setMenuOpen(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2">
                              <Pin className={`h-4 w-4 ${pinnedIds.includes(userId) ? 'text-primary' : ''}`} />
                              {pinnedIds.includes(userId) ? 'Unpin Chat' : 'Pin Chat'}
                            </button>
                            <button onClick={() => { handleHideConversation(userId); setMenuOpen(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2">
                              <X className="h-4 w-4" /> Hide/Delete Chat
                            </button>
                            <div className="border-t border-border my-1" />
                            <button onClick={() => { handleClearChat(); setMenuOpen(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2">
                              <Trash2 className="h-4 w-4" /> Clear History
                            </button>
                            <button onClick={() => { toggleTheme(); setMenuOpen(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between text-foreground cursor-pointer">
                              <div className="flex items-center gap-2">
                                {theme === 'dark' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-warning" />}
                                <span>Theme Mode</span>
                              </div>
                              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {theme === 'dark' ? 'Dark' : 'Light'}
                              </span>
                            </button>
                            <button onClick={() => { handleLogout(); setMenuOpen(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive font-medium transition-colors flex items-center gap-2 cursor-pointer">
                              <LogOut className="h-4 w-4" /> Log Out
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 custom-scrollbar" onClick={() => setMenuOpen(null)}>
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground text-sm py-8">Loading messages...</div>
                ) : (messages as Record<string, unknown>[]).filter((m) => {
                  if (hiddenIds.includes(m.id as string)) return false;
                  if (clearedAt && new Date(m.createdAt as string) <= new Date(clearedAt)) return false;
                  return true;
                }).length === 0 ? (
                  <div className="text-center text-muted-foreground py-16 animate-fade-in">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-1">No messages yet</p>
                    <p className="text-sm">Say hello to start the conversation!</p>
                  </div>
                ) : (
                  (messages as Record<string, unknown>[])
                    .filter((m) => {
                      if (hiddenIds.includes(m.id as string)) return false;
                      if (clearedAt && new Date(m.createdAt as string) <= new Date(clearedAt)) return false;
                      return true;
                    })
                    .map((m, idx, filtered) => {
                      const showTime = idx === 0 ||
                        new Date(m.createdAt as string).getTime() - new Date((filtered[idx - 1] as Record<string, unknown>).createdAt as string).getTime() > 300000;
                      return (
                        <div key={m.id as string}>
                          {showTime && (
                            <div className="flex items-center justify-center my-4">
                              <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(m.createdAt as string)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${(m.isMe as boolean) ? 'justify-end' : 'justify-start'} group relative`}>
                            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm shadow-sm transition-all duration-200 relative ${(m.isMe as boolean)
                              ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm'
                              : 'bg-muted border border-border/50 rounded-tl-sm text-foreground'
                              }`}>
                              {isSelectedGroup && !(m.isMe as boolean) && (
                                <div className="text-[10px] font-bold text-primary mb-1 flex items-center gap-1.5 opacity-90">
                                  <span>{(m.senderName as string) || 'Group Member'}</span>
                                </div>
                              )}
                              {/* Media */}
                              {(m.messageType as string) === 'media' && (m.mediaUrl as string) && (
                                <div className="mb-2 overflow-hidden rounded-lg">
                                  {(m.mediaType as string) === 'image' ? (
                                    <img src={getMediaUrl(m.mediaUrl) || ''} alt={m.fileName as string || ''} className="max-w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity rounded-lg" onClick={() => window.open(getMediaUrl(m.mediaUrl) || '', '_blank')} />
                                  ) : (m.mediaType as string) === 'video' ? (
                                    <video src={getMediaUrl(m.mediaUrl) || ''} controls className="max-w-full h-auto rounded-lg" />
                                  ) : (
                                    <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/50 hover:bg-background/80 transition-colors">
                                      <div className="bg-primary/10 p-2 rounded-lg text-primary">
                                        {(m.mediaType as string) === 'pdf' ? <FileText className="h-6 w-6" /> : <FileIcon className="h-6 w-6" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate text-xs">{(m.fileName as string) || 'Attachment'}</p>
                                        <p className="text-[10px] opacity-60">
                                          {(m.fileSize as number) ? `${((m.fileSize as number) / 1024 / 1024).toFixed(2)} MB` : ''}
                                        </p>
                                      </div>
                                      <a href={getMediaUrl(m.mediaUrl) || ''} download={m.fileName as string} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-primary/20 rounded-full transition-colors">
                                        <Download className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                              {(m.text as string) && <p className="break-words">{m.text as string}</p>}

                              {/* Status */}
                              {(m.isMe as boolean) && (
                                <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                                  <span className="text-[10px] opacity-60">
                                    {new Date(m.createdAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {(m.status as string) === 'seen' ? (
                                    <CheckCheck className="h-3.5 w-3.5 text-emerald-400 font-bold" />
                                  ) : (m.status as string) === 'delivered' ? (
                                    <CheckCheck className="h-3.5 w-3.5 opacity-80" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 opacity-80" />
                                  )}
                                </div>
                              )}
                              {!(m.isMe as boolean) && (
                                <div className="flex items-center gap-1 mt-0.5 -mb-0.5">
                                  <span className="text-[10px] opacity-60">
                                    {new Date(m.createdAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}

                              {/* Delete button */}
                              <button
                                onClick={() => handleDeleteMessage(m.id as string)}
                                className={`absolute -top-2 ${(m.isMe as boolean) ? '-left-2 sm:-left-7' : '-right-2 sm:-right-7'} p-1.5 bg-card border border-border rounded-full shadow-sm text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200`}
                                title="Delete for me"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
                {/* Typing indicator */}
                {isOtherTyping && (
                  <div className="flex justify-start">
                    <div className="bg-muted border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-border bg-card/80 backdrop-blur-sm pb-safe-input">
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto p-2 bg-muted/30 rounded-lg border border-dashed border-primary/20">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="relative group bg-card rounded-lg border border-border p-2 flex items-center gap-2 pr-8 animate-fade-in">
                        {file.type.startsWith('image/') ? (
                          <div className="h-10 w-10 bg-muted rounded overflow-hidden">
                            <img src={URL.createObjectURL(file)} alt="preview" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                            {file.type === 'application/pdf' ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium truncate w-20">{file.name}</p>
                          <p className="text-[8px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button type="button" onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 p-0.5 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-full transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
                  <button type="button"
                    className="rounded-full h-10 w-10 shrink-0 flex items-center justify-center hover:bg-primary/10 text-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-5 w-5" />
                  </button>
                  <div className="flex-1 relative">
                    <input
                      placeholder={isUploading ? 'Uploading...' : 'Type a message...'}
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value);
                        if (e.target.value.trim()) handleTypingInput();
                        else emitStopTyping();
                      }}
                      className="w-full h-10 px-4 rounded-full border-2 border-border bg-background/50 text-foreground placeholder:text-muted-foreground transition-all focus:border-primary/50 text-sm"
                      disabled={sendMessage.isPending || isUploading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          emitStopTyping();
                          handleSend(e);
                        }
                      }}
                    />
                  </div>
                  <button type="submit"
                    disabled={(!messageText.trim() && selectedFiles.length === 0) || sendMessage.isPending || isUploading}
                    className="rounded-full h-10 w-10 shrink-0 bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {isUploading ? <Circle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted/10 to-transparent">
              <div className="text-center max-w-md px-4 sm:px-6 animate-fade-in">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 mb-3 sm:mb-4">
                  <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10 text-primary opacity-40" />
                </div>
                <p className="text-lg font-semibold mb-2">No conversation selected</p>
                <p className="text-sm">Select a conversation from the sidebar to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full shadow-2xl p-5 sm:p-6 relative animate-slide-up mobile-modal-scroll">
            <button
              onClick={() => setShowCreateGroupModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Create New Group</h3>
                <p className="text-xs text-muted-foreground">Start a group chat with multiple members</p>
              </div>
            </div>

            {/* Group Photo Upload */}
            <div className="flex flex-col items-center justify-center mb-4">
              <div
                className="relative group cursor-pointer"
                onClick={() => groupPhotoInputRef.current?.click()}
              >
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-dashed border-primary/40 flex items-center justify-center text-primary overflow-hidden shadow-sm hover:border-primary transition-colors">
                  {groupIconInput ? (
                    <img src={getMediaUrl(groupIconInput) || ''} alt="Group" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="h-8 w-8 text-primary opacity-60" />
                  )}
                  {isUploadingGroupIcon && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md">
                  <Camera className="h-3.5 w-3.5" />
                </div>
              </div>
              <input
                type="file"
                ref={groupPhotoInputRef}
                onChange={(e) => handleGroupPhotoSelect(e)}
                accept="image/*"
                className="hidden"
              />
              <span className="text-[11px] text-muted-foreground mt-1.5 font-medium">Set Group Photo (Optional)</span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!groupNameInput.trim()) {
                  toast.error('Group name is required');
                  return;
                }
                try {
                  const newGroup = await createGroup.mutateAsync({
                    name: groupNameInput.trim(),
                    description: groupDescInput.trim(),
                    icon: groupIconInput,
                    memberIds: selectedMemberIds,
                  });
                  toast.success(`Group "${newGroup.name}" created!`);
                  setShowCreateGroupModal(false);
                  setGroupNameInput('');
                  setGroupDescInput('');
                  setGroupIconInput('');
                  setSelectedMemberIds([]);
                  router.push(`/chat?userId=${newGroup.id}`);
                } catch (err: unknown) {
                  toast.error((err as Error).message);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Group Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Project Team"
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Work discussions & updates"
                  value={groupDescInput}
                  onChange={(e) => setGroupDescInput(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Add Members</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search users to add..."
                    value={groupMemberSearch}
                    onChange={(e) => setGroupMemberSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto custom-scrollbar border border-border/60 rounded-xl p-1 space-y-1 bg-background/30">
                  {groupMemberSearch.trim() ? (
                    memberSearchResults.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">No users found</p>
                    ) : (
                      memberSearchResults.map((u: Record<string, unknown>) => {
                        const isSelected = selectedMemberIds.includes(u.id as string);
                        return (
                          <div
                            key={u.id as string}
                            onClick={() => {
                              setSelectedMemberIds((prev) =>
                                isSelected ? prev.filter((id) => id !== u.id) : [...prev, u.id as string]
                              );
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-[10px]">
                                {getInitials(u.name as string)}
                              </div>
                              <div>
                                <span className="font-semibold block">{u.name as string}</span>
                                <span className="text-[10px] text-muted-foreground">@{u.username as string}</span>
                              </div>
                            </div>
                            {isSelected && <UserCheck className="h-4 w-4 text-primary" />}
                          </div>
                        );
                      })
                    )
                  ) : (
                    (conversations as Record<string, unknown>[])
                      .filter((c) => !c.isGroup)
                      .map((c) => {
                        const isSelected = selectedMemberIds.includes(c.id as string);
                        return (
                          <div
                            key={c.id as string}
                            onClick={() => {
                              setSelectedMemberIds((prev) =>
                                isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id as string]
                              );
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-[10px]">
                                {getInitials(c.name as string)}
                              </div>
                              <div>
                                <span className="font-semibold block">{c.name as string}</span>
                                <span className="text-[10px] text-muted-foreground">@{c.username as string}</span>
                              </div>
                            </div>
                            {isSelected && <UserCheck className="h-4 w-4 text-primary" />}
                          </div>
                        );
                      })
                  )}
                </div>
                {selectedMemberIds.length > 0 && (
                  <p className="text-[10px] text-primary font-medium mt-1">
                    {selectedMemberIds.length} member(s) selected
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 h-10 rounded-xl border border-border text-foreground hover:bg-accent text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createGroup.isPending}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {createGroup.isPending ? <Circle className="h-4 w-4 animate-spin" /> : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Group Info & Photo Modal */}
      {showGroupDetailsModal && isSelectedGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full shadow-2xl p-5 sm:p-6 relative animate-slide-up mobile-modal-scroll">
            <button
              onClick={() => setShowGroupDetailsModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Group Settings</h3>
                <p className="text-xs text-muted-foreground">Change group photo, name & description</p>
              </div>
            </div>

            {/* Change Group Photo */}
            <div className="flex flex-col items-center justify-center mb-5">
              <div
                className="relative group cursor-pointer"
                onClick={() => groupPhotoInputRef.current?.click()}
              >
                <div className="w-24 h-24 rounded-full bg-primary/10 ring-4 ring-primary/20 shadow-lg flex items-center justify-center text-primary overflow-hidden">
                  {photoUrl(displayUser?.profilePhoto) || groupIconInput ? (
                    <img
                      src={getMediaUrl(groupIconInput || displayUser?.profilePhoto) || ''}
                      alt="Group Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users className="h-10 w-10 text-primary" />
                  )}
                  {isUploadingGroupIcon && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-lg group-hover:scale-110 transition-transform">
                  <Camera className="h-4 w-4" />
                </div>
              </div>
              <input
                type="file"
                ref={groupPhotoInputRef}
                onChange={(e) => handleGroupPhotoSelect(e, userId)}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => groupPhotoInputRef.current?.click()}
                className="mt-2.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Change Group Photo
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!userId) return;
                try {
                  await updateGroup.mutateAsync({
                    groupId: userId,
                    name: groupNameInput.trim() || displayUser?.name,
                    description: groupDescInput.trim() || displayUser?.description,
                    icon: groupIconInput || displayUser?.profilePhoto,
                  });
                  toast.success('Group details updated!');
                  setShowGroupDetailsModal(false);
                } catch (err: unknown) {
                  toast.error((err as Error).message);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Group Name</label>
                <input
                  type="text"
                  defaultValue={displayUser?.name || ''}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Group Description</label>
                <input
                  type="text"
                  defaultValue={displayUser?.description || ''}
                  onChange={(e) => setGroupDescInput(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {groupDetails?.members && (
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">
                    Group Members ({groupDetails.members.length})
                  </label>
                  <div className="max-h-36 overflow-y-auto custom-scrollbar border border-border rounded-xl p-2 space-y-1.5 bg-background">
                    {groupDetails.members.map((m: Record<string, unknown>) => (
                      <div key={m.id as string} className="flex items-center gap-2 text-xs p-1">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-[10px]">
                          {getInitials(m.name as string)}
                        </div>
                        <span className="font-medium text-foreground">{m.name as string}</span>
                        {Boolean(m.username) && <span className="text-[10px] text-muted-foreground">@{m.username as string}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroupDetailsModal(false)}
                  className="flex-1 h-10 rounded-xl border border-border text-foreground hover:bg-accent text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={updateGroup.isPending}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground hover:opacity-90 text-xs font-semibold shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  {updateGroup.isPending ? <Circle className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* WebRTC Audio & Video Calling Modal */}
      <CallModal {...call} />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
