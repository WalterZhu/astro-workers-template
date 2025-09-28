import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ChatRoom } from './ChatRoom';
import type { SessionData } from './types';

// Export the Durable Object class
export { ChatRoom };

interface Env {
  CHATROOM: DurableObjectNamespace;
  KV: KVNamespace;
  DB: D1Database;
}

interface Variables {
  user: SessionData;
}

// 从 Cookie 中提取 sessionId
function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  
  const match = cookieHeader.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
}

// 验证用户 Session
async function validateSession(env: Env, request: Request): Promise<SessionData | null> {
  const sessionId = getSessionIdFromCookie(request.headers.get('Cookie'));
  
  if (!sessionId) {
    return null;
  }
  
  try {
    const sessionDataStr = await env.KV.get(`session:${sessionId}`);
    if (!sessionDataStr) {
      return null;
    }
    
    const sessionData: SessionData = JSON.parse(sessionDataStr);
    
    // KV TTL 会自动处理过期，无需手动检查和删除
    return sessionData;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

// 认证中间件
async function authMiddleware(c: any, next: any) {
  const sessionData = await validateSession(c.env, c.req.raw);
  
  if (!sessionData) {
    return c.json({ error: 'Unauthorized: Please login first' }, 401);
  }
  
  c.set('user', sessionData);
  await next();
}

// WebSocket 升级处理
async function handleWebSocketUpgrade(c: any) {
  const { roomId } = c.req.param();
  const sessionData = c.get('user');
  
  if (!sessionData) {
    return c.text('Unauthorized: Please login first', 401);
  }
  
  // 将用户信息作为查询参数传递给 Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.searchParams.set('userId', sessionData.userId);
  newUrl.searchParams.set('username', sessionData.username);
  if (sessionData.avatar) {
    newUrl.searchParams.set('avatar', sessionData.avatar);
  }
  newUrl.searchParams.set('roles', JSON.stringify(sessionData.roles));
  
  // 创建带用户信息的请求
  const authenticatedRequest = new Request(newUrl.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body
  });
  
  // 转发到 Durable Object
  const id = c.env.CHATROOM.idFromName(roomId);
  const roomStub = c.env.CHATROOM.get(id);
  
  return roomStub.fetch(authenticatedRequest);
}

// 转发到 Durable Object 的辅助函数
async function forwardToDurableObject(c: any, subPath: string = '') {
  const { roomId } = c.req.param();
  const sessionData = c.get('user');
  
  const id = c.env.CHATROOM.idFromName(roomId);
  const roomStub = c.env.CHATROOM.get(id);
  
  // 创建新的 URL 用于转发到 Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = subPath;
  
  // 添加用户信息到请求头
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User-Id', sessionData.userId);
  headers.set('X-Username', sessionData.username);
  headers.set('X-User-Roles', JSON.stringify(sessionData.roles));
  
  // 转发请求到 Durable Object
  const authenticatedRequest = new Request(newUrl.toString(), {
    method: c.req.method,
    headers: headers,
    body: c.req.raw.body
  });
  
  return roomStub.fetch(authenticatedRequest);
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS 中间件
app.use('/chat/*', cors({
  origin: ['https://adventure.wildcloud.app', 'http://localhost:8787'],
  credentials: true
}));

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'adventure-chat-worker' });
});

// API 文档
app.get('/chat', (c) => {
  return c.json({
    service: 'Adventure Chat API',
    version: '1.0.0',
    endpoints: {
      'POST /chat/rooms': '创建新房间',
      'GET /chat/rooms': '获取房间列表',
      'GET /chat/room/:roomId': 'WebSocket连接',
      'GET /chat/room/:roomId/info': '获取房间详情',
      'GET /chat/room/:roomId/messages': '获取消息历史',
      'GET /chat/room/:roomId/users': '获取在线用户',
      'POST /chat/room/:roomId/join': '加入房间',
      'POST /chat/room/:roomId/leave': '离开房间'
    }
  });
});

// 房间管理 API
app.post('/chat/rooms', authMiddleware, async (c) => {
  const sessionData = c.get('user');
  
  try {
    const body = await c.req.json();
    
    // 生成房间ID
    const roomId = crypto.randomUUID().substring(0, 8);
    const roomName = body.name || `${sessionData.username}的聊天室`;
    const isPrivate = body.isPrivate || false;
    const maxUsers = Math.min(body.maxUsers || 50, 100);
    
    // 在数据库中创建房间记录
    const stmt = c.env.DB.prepare(`
      INSERT INTO chat_rooms (id, name, description, created_by, is_private, max_users, allow_anonymous)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      roomId, 
      roomName, 
      body.description || null,
      parseInt(sessionData.userId),
      isPrivate,
      maxUsers,
      body.allowAnonymous !== false
    ).run();
    
    // 将创建者添加为房间管理员
    const memberStmt = c.env.DB.prepare(`
      INSERT INTO chat_room_members (room_id, user_id, role)
      VALUES (?, ?, 'admin')
    `);
    
    await memberStmt.bind(roomId, parseInt(sessionData.userId)).run();
    
    // 初始化 Durable Object
    const id = c.env.CHATROOM.idFromName(roomId);
    const roomStub = c.env.CHATROOM.get(id);
    
    const initRequest = new Request(`http://localhost/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': sessionData.userId,
        'X-Username': sessionData.username
      },
      body: JSON.stringify({
        roomId,
        name: roomName,
        isPrivate,
        maxUsers,
        createdBy: sessionData.userId
      })
    });
    
    await roomStub.fetch(initRequest);
    
    return c.json({
      success: true,
      roomId,
      name: roomName,
      isPrivate,
      maxUsers,
      createdBy: sessionData.userId,
      createdAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Create room error:', error);
    return c.json({ 
      error: 'Failed to create room',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 获取房间列表
app.get('/chat/rooms', authMiddleware, async (c) => {
  try {
    const { searchParams } = new URL(c.req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.is_private,
        r.max_users,
        r.created_at,
        u.name as creator_name,
        COUNT(m.user_id) as member_count
      FROM chat_rooms r
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN chat_room_members m ON r.id = m.room_id
    `;
    
    const params: any[] = [];
    
    if (search) {
      query += ` WHERE r.name LIKE ? OR r.description LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` GROUP BY r.id ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = c.env.DB.prepare(query);
    const result = await stmt.bind(...params).all();
    
    // 获取总数
    let countQuery = `SELECT COUNT(*) as total FROM chat_rooms r`;
    const countParams: any[] = [];
    
    if (search) {
      countQuery += ` WHERE r.name LIKE ? OR r.description LIKE ?`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const countStmt = c.env.DB.prepare(countQuery);
    const countResult = await countStmt.bind(...countParams).first();
    const total = (countResult as any)?.total || 0;
    
    return c.json({
      success: true,
      rooms: result.results || [],
      pagination: {
        page,
        limit,
        total,
        hasMore: total > page * limit
      }
    });
    
  } catch (error) {
    console.error('Get rooms error:', error);
    return c.json({
      error: 'Failed to get rooms',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// WebSocket 连接 - 特殊处理升级请求
app.get('/chat/room/:roomId', async (c) => {
  const upgradeHeader = c.req.header('upgrade');
  if (upgradeHeader === 'websocket') {
    // 对于 WebSocket 连接，需要先验证身份
    const sessionData = await validateSession(c.env, c.req.raw);
    if (!sessionData) {
      return c.text('Unauthorized: Please login first', 401);
    }
    c.set('user', sessionData);
    return handleWebSocketUpgrade(c);
  }
  
  // 非 WebSocket 请求返回房间信息
  await authMiddleware(c, () => {});
  return forwardToDurableObject(c, '/info');
});

// 房间信息 API
app.get('/chat/room/:roomId/info', authMiddleware, async (c) => {
  return forwardToDurableObject(c, '/info');
});

// 获取消息历史
app.get('/chat/room/:roomId/messages', authMiddleware, async (c) => {
  return forwardToDurableObject(c, '/messages');
});

// 获取在线用户
app.get('/chat/room/:roomId/users', authMiddleware, async (c) => {
  return forwardToDurableObject(c, '/users');
});

// 加入房间
app.post('/chat/room/:roomId/join', authMiddleware, async (c) => {
  return forwardToDurableObject(c, '/join');
});

// 离开房间
app.post('/chat/room/:roomId/leave', authMiddleware, async (c) => {
  return forwardToDurableObject(c, '/leave');
});

// 404 处理
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;