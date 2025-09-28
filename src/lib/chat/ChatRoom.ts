import type { 
  ChatMessage, 
  ChatUser, 
  ChatRoomState, 
  WSMessage, 
  WSResponse 
} from './types';

export class ChatRoom {
  private state: DurableObjectState;
  private roomState!: ChatRoomState;
  private connections: Map<string, WebSocket> = new Map();
  
  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
  }

  // 处理所有进入的请求（WebSocket 和 REST API）
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 处理 WebSocket 升级
    if (request.headers.get('upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // REST API 端点
    switch (pathname) {
      case '/info':
        return this.handleGetRoomInfo();
      case '/messages':
        return this.handleGetMessages(request);
      case '/users':
        return this.handleGetUsers();
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  // 初始化或恢复房间状态
  private async initializeRoom() {
    if (this.roomState) return;

    const stored = await this.state.storage.get<ChatRoomState>('roomState');
    
    if (stored) {
      this.roomState = {
        ...stored,
        activeUsers: stored.activeUsers || {}
      };
    } else {
      // 创建新房间
      this.roomState = {
        roomId: this.state.id.toString().substring(0, 8),
        name: `聊天室-${Date.now()}`,
        createdAt: Date.now(),
        messageHistory: [],
        activeUsers: {},
        settings: {
          maxUsers: 50,
          isPrivate: false,
          allowAnonymous: true
        }
      };
      await this.saveRoomState();
    }
  }

  // 保存房间状态到持久化存储
  private async saveRoomState() {
    await this.state.storage.put('roomState', this.roomState);
  }

  // 处理 WebSocket 连接建立和消息传递
  private async handleWebSocket(request: Request): Promise<Response> {
    await this.initializeRoom();
    
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const username = url.searchParams.get('username') || '匿名用户';

    if (!userId) {
      return new Response('Missing userId parameter', { status: 400 });
    }

    // 检查房间是否已满
    const userCount = Object.keys(this.roomState.activeUsers).length;
    if (userCount >= this.roomState.settings.maxUsers) {
      return new Response('聊天室已满', { status: 403 });
    }

    server.accept();
    
    // 添加用户到房间
    const user: ChatUser = {
      id: userId,
      username,
      joinedAt: Date.now()
    };

    this.roomState.activeUsers[userId] = user;
    this.connections.set(userId, server);
    await this.saveRoomState();

    // 发送加入消息
    const joinMessage: ChatMessage = {
      id: crypto.randomUUID(),
      userId: 'system',
      username: '系统',
      content: `${username} 加入了聊天室`,
      timestamp: Date.now(),
      type: 'join'
    };

    this.roomState.messageHistory.push(joinMessage);
    await this.broadcastMessage(joinMessage);

    // 发送房间信息给新用户
    this.sendToUser(userId, {
      type: 'room-info',
      data: {
        roomId: this.roomState.roomId,
        name: this.roomState.name,
        userCount: Object.keys(this.roomState.activeUsers).length,
        users: Object.values(this.roomState.activeUsers)
      }
    });

    // 发送历史消息（最近50条）
    const recentMessages = this.roomState.messageHistory.slice(-50);
    this.sendToUser(userId, {
      type: 'message-history',
      data: recentMessages
    });

    // 处理消息
    server.addEventListener('message', async (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        await this.handleWebSocketMessage(userId, message);
      } catch (error) {
        console.error('处理 WebSocket 消息错误:', error);
        this.sendToUser(userId, {
          type: 'error',
          data: { message: '消息格式错误' }
        });
      }
    });

    // 处理连接关闭
    server.addEventListener('close', async () => {
      await this.handleUserDisconnect(userId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // 处理来自客户端的 WebSocket 消息
  private async handleWebSocketMessage(userId: string, message: WSMessage) {
    const user = this.roomState.activeUsers[userId];
    if (!user) return;

    switch (message.type) {
      case 'send-message':
        if (!message.data?.content) return;

        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          userId,
          username: user.username,
          content: message.data.content.trim(),
          timestamp: Date.now(),
          type: 'message'
        };

        this.roomState.messageHistory.push(chatMessage);
        
        // 保持历史消息在合理数量（最多1000条）
        if (this.roomState.messageHistory.length > 1000) {
          this.roomState.messageHistory = this.roomState.messageHistory.slice(-1000);
        }

        await this.broadcastMessage(chatMessage);
        await this.saveRoomState();
        break;

      case 'typing':
        // 广播打字状态（不保存）
        this.broadcastToOthers(userId, {
          type: 'user-typing',
          data: {
            userId,
            username: user.username,
            isTyping: message.data?.isTyping || false
          }
        });
        break;
    }
  }

  // 广播聊天消息给所有在线用户
  private async broadcastMessage(message: ChatMessage) {
    const response: WSResponse = {
      type: 'new-message',
      data: message
    };
    
    await this.broadcastToAll(response);
  }

  // 向所有连接的用户广播消息
  private async broadcastToAll(response: WSResponse) {
    const payload = JSON.stringify(response);

    for (const [userId, ws] of this.connections) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      } catch (error) {
        console.error(`向用户 ${userId} 发送消息失败:`, error);
        await this.cleanupConnection(userId);
      }
    }
  }

  // 向除指定用户外的其他用户广播消息
  private broadcastToOthers(excludeUserId: string, response: WSResponse) {
    const payload = JSON.stringify(response);

    for (const [userId, ws] of this.connections) {
      if (userId !== excludeUserId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch (error) {
          console.error(`向用户 ${userId} 广播失败:`, error);
          this.connections.delete(userId);
        }
      }
    }
  }

  // 向指定用户发送消息
  private sendToUser(userId: string, response: WSResponse) {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(response));
      } catch (error) {
        console.error(`向用户 ${userId} 发送消息失败:`, error);
      }
    }
  }

  // 处理用户断开连接
  private async handleUserDisconnect(userId: string) {
    const user = this.roomState.activeUsers[userId];
    if (!user) return;

    // 从房间中移除用户
    delete this.roomState.activeUsers[userId];
    await this.cleanupConnection(userId);

    // 发送离开消息
    const leaveMessage: ChatMessage = {
      id: crypto.randomUUID(),
      userId: 'system',
      username: '系统',
      content: `${user.username} 离开了聊天室`,
      timestamp: Date.now(),
      type: 'leave'
    };

    this.roomState.messageHistory.push(leaveMessage);
    await this.broadcastMessage(leaveMessage);
    await this.saveRoomState();
  }

  // 清理用户连接
  private async cleanupConnection(userId: string) {
    this.connections.delete(userId);
  }

  // 获取房间信息
  private async handleGetRoomInfo(): Promise<Response> {
    await this.initializeRoom();
    
    return new Response(JSON.stringify({
      success: true,
      roomInfo: {
        roomId: this.roomState.roomId,
        name: this.roomState.name,
        createdAt: this.roomState.createdAt,
        userCount: Object.keys(this.roomState.activeUsers).length,
        maxUsers: this.roomState.settings.maxUsers,
        isPrivate: this.roomState.settings.isPrivate
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 获取消息历史
  private async handleGetMessages(request: Request): Promise<Response> {
    await this.initializeRoom();
    
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    
    const messages = this.roomState.messageHistory.slice(-limit);
    
    return new Response(JSON.stringify({
      success: true,
      messages
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 获取在线用户列表
  private async handleGetUsers(): Promise<Response> {
    await this.initializeRoom();
    
    return new Response(JSON.stringify({
      success: true,
      users: Object.values(this.roomState.activeUsers)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}