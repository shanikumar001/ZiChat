# ZiChat — System Design & Architecture

This document details the internal architecture, data flow, real-time messaging pipeline, and system design decisions behind ZiChat.

> For project overview, features, setup, and API reference, see [README.md](./README.md).

---

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Request Lifecycle](#request-lifecycle)
- [Authentication System](#authentication-system)
- [Database Design](#database-design)
- [Real-Time Messaging Pipeline](#real-time-messaging-pipeline)
- [Data Fetching & State Management](#data-fetching--state-management)
- [Media Upload Pipeline](#media-upload-pipeline)
- [Client-Side Architecture](#client-side-architecture)
- [Connection Management](#connection-management)
- [Local Storage Strategy](#local-storage-strategy)
- [Security Considerations](#security-considerations)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT BROWSER                            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  AuthContext  │  │ SocketContext│  │   TanStack React Query    │ │
│  │  (JWT State)  │  │ (Socket.io)  │  │   (Cache + Polling)       │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬──────────────┘ │
│         │                 │                        │                │
│         └─────────────────┼────────────────────────┘                │
│                           │                                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              │ HTTPS/REST  │  WebSocket   │
              ▼             ▼              │
┌─────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS 16 SERVER                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Serverless API Route Handlers                   │   │
│  │  /api/auth/*  /api/messages/*  /api/users/*  /api/media     │   │
│  └──────────┬──────────────┬──────────────┬────────────────────┘   │
│             │              │              │                         │
│             ▼              ▼              ▼                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Mongoose    │  │     JWT      │  │  Cloudinary  │             │
│  │   (ODM)       │  │  (Auth)      │  │  (Upload)    │             │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘             │
└─────────┼───────────────────────────────────┼──────────────────────┘
          │                                   │
          ▼                                   ▼
┌──────────────────┐              ┌──────────────────┐
│  MongoDB Atlas   │              │   Cloudinary CDN  │
│  (Document DB)   │              │   (Media Storage)  │
└──────────────────┘              └──────────────────┘
```

The system follows a **unified fullstack architecture** where the Next.js application serves both the React frontend and the serverless API backend. There is no separate Express server for REST endpoints — all API routes are Next.js App Router route handlers (`app/api/*/route.ts`).

A separate Socket.io server handles real-time WebSocket connections for typing indicators, online presence, and push-style message notifications. The client falls back to HTTP polling via React Query when the Socket connection is unavailable.

---

## Request Lifecycle

A typical user action follows this path:

```
User Action
    │
    ▼
React Component (e.g., chat/page.tsx)
    │
    ├── Calls React Query hook (useMessages, useSendMessage)
    │       │
    │       ▼
    │   fetchApi() → /api/messages (Next.js Route Handler)
    │       │
    │       ├── JWT verification (Authorization header)
    │       ├── Mongoose query to MongoDB Atlas
    │       └── JSON response to client
    │
    └── Socket.io emit (typing, stopTyping)
            │
            ▼
        Socket.io Server → broadcasts to recipient
```

For **message sending** specifically, the flow uses optimistic updates:

1. User types a message and submits
2. `useSendMessage` mutation fires
3. `onSuccess` callback immediately appends the returned message to the local React Query cache via `setQueryData`
4. The message renders on screen in **0ms**
5. Background: POST request to `/api/messages` persists the message in MongoDB
6. Background: React Query invalidates the conversation list cache

---

## Authentication System

### Flow

```
Login Form → POST /api/auth/login
                │
                ├── Find user by email/username (case-insensitive)
                ├── Compare password with bcrypt.compare()
                ├── Generate JWT (7-day expiry)
                └── Return { token, user } to client

Client receives response
                │
                ├── AuthContext.login(token, user)
                ├── Stores token in localStorage (key: zichat_token)
                ├── Stores user JSON in localStorage (key: zichat_user)
                └── Redirects to /chat
```

### Token Strategy

| Aspect | Implementation |
|:---|:---|
| Token type | JWT (JSON Web Token) |
| Storage | `localStorage` under keys `zichat_token` and `zichat_user` |
| Expiry | 7 days |
| Transmission | `Authorization: Bearer <token>` header on every API request |
| Password hashing | bcrypt.js with salt rounds of 10 |

### Session Restoration

On page load, `AuthContext` reads the token and user from `localStorage`. If both exist, the user session is restored without a network call. If either is missing or the JSON parse fails, the user is redirected to `/login`.

---

## Database Design

### MongoDB Collections

The application uses two primary Mongoose models stored in MongoDB Atlas.

#### User Collection

```typescript
{
  _id: ObjectId,           // Auto-generated MongoDB ID
  name: String,            // Full display name (required)
  email: String,           // Unique, lowercase, indexed
  username: String,        // Unique, lowercase, indexed
  password: String,        // Bcrypt hash (salt 10)
  bio: String,             // Profile bio (default: "")
  profilePhoto: String,    // Cloudinary CDN URL (default: "")
  createdAt: Date,         // Auto-managed by Mongoose timestamps
  updatedAt: Date          // Auto-managed by Mongoose timestamps
}
```

**Indexes**: `email` (unique), `username` (unique) — both indexed for fast lookup during login and user search.

#### Message Collection

```typescript
{
  _id: ObjectId,
  senderId: String,        // User ID of the sender (indexed)
  receiverId: String,      // User ID of the recipient (indexed, default: "")
  groupId: String,         // Group ID for group messages (indexed, default: "")
  text: String,            // Message text content (default: "")
  mediaUrl: String,        // Cloudinary CDN URL for attachments
  mediaType: String,       // "image" | "video" | "audio" | "document"
  fileName: String,        // Original filename for downloads
  fileSize: Number,        // File size in bytes
  status: String,          // "sent" | "delivered" | "seen" (default: "sent")
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**: `senderId`, `receiverId`, `groupId` — indexed for efficient conversation queries.

### Connection Management

Database connections use a **global cache pattern** to prevent connection leaks during Next.js Hot Module Replacement (HMR):

```typescript
// lib/mongodb.ts — Simplified pattern
const cached = global.mongooseCache || { conn: null, promise: null };

export async function connectToDatabase() {
  if (cached.conn) return cached.conn;          // Reuse existing
  if (!cached.promise) {
    cached.promise = mongoose.connect(URI);      // Create new
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

This ensures that during development, serverless function invocations reuse the same Mongoose connection instead of opening a new one on every request.

---

## Real-Time Messaging Pipeline

### Socket.io Architecture

```
┌──────────┐     WebSocket      ┌──────────────────┐
│ Client A │ ◄────────────────► │                  │
└──────────┘                    │   Socket.io       │
                                │   Server          │
┌──────────┐     WebSocket      │                  │
│ Client B │ ◄────────────────► │  (Separate        │
└──────────┘                    │   Deployment)     │
                                └──────────────────┘
```

### Connection Initialization

When a user authenticates, the `SocketProvider` creates a Socket.io connection:

```typescript
const newSocket = io(socketUrl, {
  auth: { token },                    // JWT for server-side auth
  transports: ['polling', 'websocket'], // Start with polling, upgrade
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  reconnectionAttempts: 3,
  timeout: 5000,
});
```

**Transport strategy**: The client starts with HTTP long-polling and upgrades to WebSocket. This ensures connectivity through corporate proxies and firewalls that may block WebSocket connections.

### Event Flow

| Event | Direction | Purpose |
|:---|:---|:---|
| `userOnline` | Server → Client | Notify when a user comes online |
| `userOffline` | Server → Client | Notify when a user goes offline |
| `typing` | Client → Server → Client | Broadcast typing indicator |
| `stopTyping` | Client → Server → Client | Clear typing indicator |
| `newMessage` | Server → Client | Push new message to recipient |

### Fallback Strategy

If the Socket.io server is unreachable (all 3 reconnection attempts fail), the application falls back gracefully:

- **Messages**: React Query polls `/api/messages` every **2 seconds**
- **Conversations**: React Query polls `/api/messages/conversations` every **3 seconds**
- **Presence**: React Query polls `/api/presence/check` periodically

This dual strategy (WebSocket primary + HTTP polling fallback) ensures the chat remains functional even without a dedicated Socket server.

### Message Status Transitions

```
Message Created → status: "sent" (single tick)
        │
        ▼
Saved in MongoDB → status: "delivered" (double grey tick)
        │
        ▼
Recipient opens chat → POST /api/messages/read
        │
        ▼
MongoDB update → status: "seen" (double green tick)
```

The `useMarkMessagesRead` hook fires when a user opens a conversation, updating all unread messages from that sender to `"seen"` status.

---

## Data Fetching & State Management

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,            // Data fresh for 30 seconds
      refetchOnWindowFocus: false,   // No refetch when tab gains focus
      retry: 1,                      // Retry failed requests once
    },
  },
});
```

### Query Hooks Summary

| Hook | Query Key | Polling | Purpose |
|:---|:---|:---|:---|
| `useConversations` | `['conversations']` | 3s | Active chat list with last message |
| `useMessages` | `['messages', userId]` | 2s | Message history for a conversation |
| `useSearchUsers` | `['users', 'search', q]` | None | Search results (stale: 10s) |
| `useUserProfile` | `['user', userId]` | None | Public profile lookup |
| `useCheckPresence` | `['presence', ids]` | Default | Online status for user list |
| `useGroupDetails` | `['group', groupId]` | None | Group metadata and members |
| `usePresenceHeartbeat` | `['presence-heartbeat']` | 2min | Keep-alive heartbeat |

### Optimistic Updates (Message Sending)

The `useSendMessage` mutation uses an optimistic cache update pattern:

```typescript
onSuccess: (data, variables) => {
  // 1. Immediately append to cache (0ms render)
  queryClient.setQueryData(targetKey, (old) => {
    if (old.some(m => m.id === data.id)) return old;
    return [...old, data];
  });

  // 2. Invalidate to sync with server truth
  queryClient.invalidateQueries({ queryKey: targetKey });
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
};
```

This ensures messages appear instantly on screen while the background sync ensures eventual consistency with the server.

---

## Media Upload Pipeline

```
User selects file
    │
    ▼
Client-side validation (max 50MB, type check)
    │
    ▼
FormData with file → POST /api/media
    │
    ▼
Next.js Route Handler
    │
    ├── Reads file buffer from request
    ├── Pipes buffer to Cloudinary Upload Stream
    ├── Receives permanent CDN URL from Cloudinary
    └── Returns { success, url, fileName, fileSize }
    │
    ▼
Client receives URL → sends message with mediaUrl field
    │
    ▼
POST /api/messages (text: "", mediaUrl: "https://res.cloudinary.com/...")
    │
    ▼
Stored in MongoDB as a media message
```

Supported media types:
- **Images** — Rendered inline with click-to-open
- **Videos** — Rendered with native HTML5 video controls
- **PDFs** — Displayed as file card with download link
- **Other files** — Displayed as generic file card with download link

---

## Client-Side Architecture

### Provider Hierarchy

```
<html>
  <body>
    <QueryClientProvider>        ← React Query cache
      <AuthProvider>             ← JWT session state
        <SocketProvider>         ← Socket.io connection
          {children}             ← Page components
          <Toaster />            ← Toast notifications
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  </body>
</html>
```

The provider order is intentional:
1. **QueryClientProvider** wraps everything because both Auth and Socket providers may trigger queries
2. **AuthProvider** sits inside Query because some queries depend on auth state
3. **SocketProvider** requires auth context to authenticate the WebSocket connection

### Page Routing

| Route | Component | Auth Required | Description |
|:---|:---|:---|:---|
| `/` | `page.tsx` | — | Redirect: authenticated → `/chat`, otherwise → `/login` |
| `/login` | `login/page.tsx` | No | Login form with ZiName + Google OAuth |
| `/signup` | `signup/page.tsx` | No | Redirects to ZiName registration portal |
| `/chat` | `chat/page.tsx` | Yes | Main chat interface (sidebar + conversation) |
| `/profile` | `profile/page.tsx` | Yes | Profile editor |

Auth-guarded pages check `useAuth()` on mount and redirect to `/login` if no user session exists.

---

## Connection Management

### Mongoose (MongoDB)

- Uses a **global singleton cache** to survive HMR reloads in development
- `bufferCommands: false` — fails fast if the connection drops instead of queuing operations
- Connection string from `MONGODB_URI` environment variable

### Socket.io

- Starts with polling transport, upgrades to WebSocket
- **3 reconnection attempts** with exponential backoff (2s → 10s max)
- On disconnect: gracefully degrades to polling-based data fetching
- On user logout: socket is explicitly disconnected and cleaned up

---

## Local Storage Strategy

The application uses `localStorage` for client-side persistence beyond authentication:

| Key Pattern | Data | Purpose |
|:---|:---|:---|
| `zichat_token` | JWT string | Authentication token |
| `zichat_user` | User JSON | Cached user session |
| `zichat_theme` | `"dark"` or `"light"` | Theme preference |
| `chat_cleared_at_{userId}_{targetId}` | ISO timestamp | Local chat clear timestamp |
| `chat_hidden_ids_{userId}_{targetId}` | JSON array | Locally hidden message IDs |
| `chat_pinned_ids_{userId}` | JSON array | Pinned conversation IDs |
| `chat_hidden_conversations_{userId}` | JSON array | Hidden conversation IDs |
| `chat_sort_type_{userId}` | String | Conversation sort preference |

All chat management actions (clear, hide, pin) are **local-only** — they do not modify the database and only affect the current user's view.

---

## Security Considerations

| Area | Implementation |
|:---|:---|
| Password storage | bcrypt.js with 10 salt rounds — passwords are never stored in plaintext |
| Token security | JWT with configurable secret, 7-day expiry |
| API protection | All sensitive endpoints verify the `Authorization: Bearer` header |
| Input validation | Usernames sanitized to lowercase alphanumeric; emails validated and lowercased |
| File uploads | Client-side size limit (50MB), server-side type validation |
| CORS | Configured via Next.js and the Socket.io server |
| XSS prevention | React's built-in JSX escaping; no `dangerouslySetInnerHTML` usage |
