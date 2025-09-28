import type { APIRoute } from 'astro';

interface Env {
  CHATROOM: DurableObjectNamespace;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const { roomId } = params;
  if (!roomId) {
    return new Response('Room ID required', { status: 400 });
  }

  const upgradeHeader = request.headers.get('upgrade');
  
  // 处理 WebSocket 升级请求
  if (upgradeHeader === 'websocket') {
    const env = locals.runtime?.env as Env;
    if (!env?.CHATROOM) {
      return new Response('Chat service not available', { status: 503 });
    }

    // 获取用户信息（简化版本，实际项目中应该从认证中获取）
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || `user_${Math.random().toString(36).substr(2, 9)}`;
    const username = url.searchParams.get('username') || '匿名用户';
    
    // 将用户信息添加到查询参数
    const newUrl = new URL(request.url);
    newUrl.searchParams.set('userId', userId);
    newUrl.searchParams.set('username', username);

    // 创建带用户信息的请求
    const authenticatedRequest = new Request(newUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    // 转发到 Durable Object
    const id = env.CHATROOM.idFromName(roomId);
    const roomStub = env.CHATROOM.get(id);
    
    return roomStub.fetch(authenticatedRequest);
  }

  // 非 WebSocket 请求返回房间信息
  return new Response(JSON.stringify({
    success: true,
    roomInfo: {
      roomId,
      name: `聊天室-${roomId}`,
      userCount: 0,
      maxUsers: 50,
      isPrivate: false
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

// 获取房间消息历史
export const POST: APIRoute = async ({ params, request, locals }) => {
  const { roomId } = params;
  if (!roomId) {
    return new Response('Room ID required', { status: 400 });
  }

  const env = locals.runtime?.env as Env;
  if (!env?.CHATROOM) {
    return new Response('Chat service not available', { status: 503 });
  }

  // 转发到 Durable Object
  const id = env.CHATROOM.idFromName(roomId);
  const roomStub = env.CHATROOM.get(id);
  
  // 创建获取消息的请求
  const messagesRequest = new Request(`${request.url}/messages`, {
    method: 'GET',
    headers: request.headers
  });

  return roomStub.fetch(messagesRequest);
};