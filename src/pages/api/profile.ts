import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('[API] Profile POST request received');
  
  const runtime = (locals as any).runtime;
  const user = (locals as any).user;
  
  if (!runtime?.env?.DB) {
    return new Response(JSON.stringify({ error: "数据库不可用" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 用户信息由中间件提供，此时已经验证过认证
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "用户未登录" }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    console.log('[API] Profile update data received for user:', user.id);
    
    // 更新或插入用户配置信息
    await runtime.env.DB.prepare(`
      INSERT INTO user_profiles (id, userId, bio, avatar, theme, language)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        bio = excluded.bio,
        avatar = excluded.avatar,
        theme = excluded.theme,
        language = excluded.language,
        updatedAt = CURRENT_TIMESTAMP
    `).bind(
      crypto.randomUUID(),
      user.id,
      data.bio || '',
      data.avatar || '',
      data.theme || 'light',
      data.language || 'zh-CN'
    ).run();
    
    console.log('[API] Profile updated successfully for user:', user.id);
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: "个人资料更新成功" 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[API] Profile update error:', error);
    return new Response(JSON.stringify({ error: "更新个人资料失败" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};