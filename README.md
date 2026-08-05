# ZiChat — Real-Time Chat Application

A modern, full-stack, real-time messaging web application built with Next.js 16 (App Router), React 19, MongoDB Atlas, Cloudinary CDN, Socket.io, and TanStack React Query.

> ZiChat uses [ZiName](https://zeename.onrender.com/) as its identity provider — users authenticate with their ZiName credentials to access the chat platform.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

ZiChat is a production-ready messaging platform that delivers instant communication through WebSockets with automatic HTTP polling fallback. The application features optimistic UI updates for zero-latency message rendering, WhatsApp-style delivery ticks, live typing indicators, media sharing via Cloudinary CDN, and full profile customization.

The frontend and backend are unified in a single Next.js 16 application — client pages use React 19 with TanStack React Query for data management, while serverless API route handlers manage authentication, database operations, and media uploads.

---

## Features

### Authentication
- **ZiName SSO** — Sign in using your ZiName (username) and password, authenticated against the ZiName identity service.
- **Google OAuth** — One-click Google sign-in as an alternative login method.
- **JWT Sessions** — Stateless authentication with JSON Web Tokens stored in the browser.

### Messaging
- **Instant Delivery** — Messages render in 0ms using optimistic UI updates. The message appears on screen immediately while the POST request completes in the background.
- **Delivery Status Ticks** — Three-state message tracking:
  - Single tick — Message sent to the server.
  - Double grey tick — Message delivered to the recipient.
  - Double green tick — Recipient opened and read the conversation.
- **Live Typing Indicators** - Animated bouncing dots appear when the other user is typing. Active typing conversations are automatically promoted to the top of the sidebar.
- **Media Sharing** - Send images, videos, PDFs, and documents. Files are uploaded to Cloudinary CDN and streamed back as permanent HTTPS URLs.

### Chat Management
- **User Search** — Find registered users by email or `@username` and start a direct conversation.
- **Group Chats** — Create groups with a name, description, custom photo, and multiple members.
- **Conversation Sorting** — Sort chats by latest message, unread count, or alphabetical order.
- **Pin & Hide** — Pin important conversations to the top or hide chats you no longer need.
- **Clear History** — Clear message history locally without affecting the other participant.

### User Profile
- **Custom Avatar** — Upload a profile photo via Cloudinary with instant preview.
- **Editable Fields** — Update your full name, `@username`, and bio (up to 200 characters).
- **Email Display** — View your linked email address (read-only).

### Interface
- **Dark & Light Themes** — Toggle between dark and light mode, persisted in local storage.
- **Responsive Design** — Fully optimized for desktop, tablet, and mobile phones with safe-area support for notched devices.
- **Glassmorphism UI** — Modern interface with backdrop blur, smooth gradients, and micro-animations.
- **Toast Notifications** — Contextual success/error notifications via Sonner.

---

## Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| Frontend | Next.js 16 (App Router) | Server components, client hooks, Turbopack |
| UI | React 19, Lucide Icons | Component rendering and icon system |
| Styling | Tailwind CSS 4, Vanilla CSS | Design system, glassmorphism, responsive layout |
| Data | TanStack React Query v5 | Caching, background polling, optimistic updates |
| Database | MongoDB Atlas, Mongoose 9 | Cloud NoSQL document storage |
| Media | Cloudinary | Image and file upload CDN |
| Real-Time | Socket.io-client | WebSockets with automatic reconnection |
| Auth | JWT, Bcrypt.js | Stateless tokens, salted password hashing |
| Notifications | Sonner | Toast notification system |

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# API Base URL (for client-side fetch calls)
NEXT_PUBLIC_API_URL=/api

# Socket.io Server URL
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.onrender.com

# JWT Secret Key
JWT_SECRET=your_jwt_secret_key

# MongoDB Atlas Connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/zichat?retryWrites=true&w=majority

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MongoDB Atlas cluster configured
- Cloudinary account created

### Installation

```bash
# Clone the repository
git clone https://github.com/shanikumar001/ZiChat.git
cd next-app

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|:---|:---|
| `npm run dev` | Start development server with Webpack |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint checks |

---

## Project Structure

```
next-app/
├── app/
│   ├── api/                         # Serverless API route handlers
│   │   ├── auth/
│   │   │   ├── login/               # POST — JWT authentication
│   │   │   └── signup/              # POST — User registration
│   │   ├── media/                   # POST — Cloudinary file upload
│   │   ├── messages/
│   │   │   ├── route.ts             # GET/POST — Retrieve and send messages
│   │   │   ├── conversations/       # GET — Active conversation list
│   │   │   └── read/                # POST — Mark messages as seen
│   │   ├── groups/                  # POST — Create group, GET/PUT group details
│   │   ├── presence/
│   │   │   └── check/               # POST — User online status check
│   │   └── users/
│   │       ├── profile/             # GET/PUT — Edit user profile
│   │       ├── search/              # GET — Search by email or username
│   │       └── [id]/                # GET — Public user profile lookup
│   ├── chat/page.tsx                # Main chat interface
│   ├── login/page.tsx               # Login page
│   ├── signup/page.tsx              # Signup redirect
│   ├── profile/page.tsx             # Profile editor
│   ├── globals.css                  # Design system and utilities
│   ├── layout.tsx                   # Root layout with providers
│   └── page.tsx                     # Entry redirect (login or chat)
├── context/
│   ├── AuthContext.tsx               # JWT auth state and session management
│   └── SocketContext.tsx             # Socket.io connection and event handling
├── hooks/
│   ├── useQueries.ts                # React Query hooks for all data operations
│   └── useSocket.ts                 # Socket hooks for typing, presence, notifications
├── lib/
│   ├── mongodb.ts                   # Mongoose connection cache (prevents HMR leaks)
│   └── utils.ts                     # API base URL helper and utilities
├── models/
│   ├── User.ts                      # Mongoose user schema
│   └── Message.ts                   # Mongoose message schema
├── public/                          # Static assets (logo, favicon)
├── .env.local                       # Environment secrets (not committed)
├── next.config.ts                   # Next.js configuration
├── package.json                     # Dependencies and scripts
└── tsconfig.json                    # TypeScript configuration
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Authenticate and receive JWT |

### Messages

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/messages?userId=<id>` | Retrieve messages with a user |
| POST | `/api/messages` | Send a new message |
| GET | `/api/messages/conversations` | List all active conversations |
| POST | `/api/messages/read` | Mark messages as seen |

### Users

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/users/search?q=<query>` | Search users by email or username |
| GET | `/api/users/<id>` | Get public user profile |
| GET | `/api/users/profile` | Get own profile |
| PUT | `/api/users/profile` | Update own profile |

### Groups

| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/api/groups` | Create a new group |
| GET | `/api/groups/<id>` | Get group details |
| PUT | `/api/groups/<id>` | Update group info |

### Media & Presence

| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/api/media` | Upload file to Cloudinary |
| POST | `/api/presence/check` | Check online status of users |

---

## Deployment

ZiChat is deployed on **Render** with the following configuration:

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment**: Node.js (auto-detected)
- **Environment Variables**: Set all `.env.local` values in the Render dashboard.

The Socket.io real-time server is deployed separately and connected via the `NEXT_PUBLIC_SOCKET_URL` environment variable.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
