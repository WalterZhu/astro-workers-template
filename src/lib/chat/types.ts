// 聊天室相关的共享类型定义

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  type: 'message' | 'join' | 'leave' | 'system';
}

export interface ChatUser {
  id: string;
  username: string;
  avatar?: string;
  joinedAt: number;
  roles?: string[];
}

export interface ChatRoomInfo {
  roomId: string;
  name: string;
  createdAt: number;
  userCount: number;
  maxUsers: number;
  isPrivate: boolean;
}

export interface ChatRoomState {
  roomId: string;
  name: string;
  createdAt: number;
  createdBy?: string;
  messageHistory: ChatMessage[];
  activeUsers: Record<string, ChatUser>;
  settings: {
    maxUsers: number;
    isPrivate: boolean;
    allowAnonymous: boolean;
    password?: string;
  };
}

// Session 数据结构
export interface SessionData {
  userId: string;
  username: string;
  avatar?: string;
  email?: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
}

// WebSocket 消息类型
export interface WSMessage {
  type: 'send-message' | 'typing' | 'join-room' | 'leave-room' | 'ping';
  data?: {
    content?: string;
    isTyping?: boolean;
  };
}

export interface WSResponse {
  type: 'new-message' | 'user-joined' | 'user-left' | 'user-typing' | 'room-info' | 'message-history' | 'error' | 'auth-required' | 'pong';
  data?: any;
}