import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    
    // 简化的房间列表，实际项目中从数据库获取
    const rooms = [
      {
        id: 'general',
        name: '综合讨论',
        description: '欢迎大家自由交流',
        is_private: false,
        max_users: 50,
        created_at: new Date().toISOString(),
        creator_name: 'System',
        member_count: 0
      },
      {
        id: 'tech',
        name: '技术讨论',
        description: '技术相关话题交流',
        is_private: false,
        max_users: 30,
        created_at: new Date().toISOString(),
        creator_name: 'System',
        member_count: 0
      }
    ];

    return new Response(JSON.stringify({
      success: true,
      rooms,
      pagination: {
        page,
        limit,
        total: rooms.length,
        hasMore: false
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get rooms',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as any;
    const roomId = crypto.randomUUID().substring(0, 8);
    const roomName = body.name || `聊天室-${Date.now()}`;
    
    return new Response(JSON.stringify({
      success: true,
      roomId,
      name: roomName,
      isPrivate: body.isPrivate || false,
      maxUsers: body.maxUsers || 50,
      createdBy: 'anonymous',
      createdAt: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to create room',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};