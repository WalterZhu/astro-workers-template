import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  
  if (!runtime?.env?.DB) {
    return new Response(JSON.stringify({ error: "Database not available" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json() as { email?: string; password?: string; name?: string };
    const { email, password, name } = data;

    // 基本验证
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: "请填写所有必填字段" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "密码长度至少6位" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查邮箱是否已存在
    const existingUser = await runtime.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).bind(email).first();

    if (existingUser) {
      return new Response(JSON.stringify({ error: "邮箱已被注册" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 创建用户ID
    const userId = crypto.randomUUID();
    
    // 简单的密码加密（实际项目中应该使用更强的加密）
    const encoder = new TextEncoder();
    const data_encoded = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data_encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 使用事务插入用户和账户数据
    await runtime.env.DB.batch([
      runtime.env.DB.prepare(
        "INSERT INTO users (id, email, name, emailVerified) VALUES (?, ?, ?, ?)"
      ).bind(
        userId,
        email,
        name,
        null
      ),
      runtime.env.DB.prepare(
        "INSERT INTO accounts (id, userId, type, provider, providerAccountId, access_token) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        userId,
        'credentials',
        'credentials',
        email,
        passwordHash  // 将密码hash存储在access_token字段中
      )
    ]);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "注册成功" 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({ error: "注册过程中发生错误" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};