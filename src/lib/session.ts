import type { CloudflareEnv } from "../env";

interface SessionData {
  userId: string;
  status: "active" | "revoked" | "expired";
}

function getSessionTTL(env: CloudflareEnv): number {
  const days =
    env.SESSION_TTL_DAYS && env.SESSION_TTL_DAYS > 0 ? env.SESSION_TTL_DAYS : 7;
  return days * 24 * 60 * 60; // 转换为秒
}

/**
 * 创建新的session
 * @param user - 用户对象，必须包含id属性
 * @param env - Cloudflare环境变量
 * @returns 生成的session ID (jti)
 */
export async function createSession(user: any, env: CloudflareEnv): Promise<string> {
  const jti = crypto.randomUUID();
  const sessionData: SessionData = {
    userId: user.id,
    status: "active",
  };

  try {
    const ttl = getSessionTTL(env);
    // 存储到KV，使用配置的TTL
    await env.KV.put(`session:${jti}`, JSON.stringify(sessionData), {
      expirationTtl: ttl,
    });


    return jti;
  } catch (error) {
    console.error("Failed to create session:", error);
    throw error;
  }
}

/**
 * 验证session状态
 * 检查session是否存在且有效
 * @param jti - session ID
 * @param env - Cloudflare环境变量
 * @returns 用户ID，无效或不存在返回null
 */
export async function validateSession(jti: string, env: CloudflareEnv): Promise<string | null> {
  try {
    const sessionDataStr = await env.KV.get(`session:${jti}`);
    if (!sessionDataStr) {
      return null;
    }

    const sessionData: SessionData = JSON.parse(sessionDataStr);

    // 检查状态
    if (sessionData.status !== "active") {
      return null;
    }

    return sessionData.userId;
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/**
 * 撤销指定的session
 * 将session状态设置为revoked，但保留在KV中
 * @param jti - 要撤销的session ID
 * @param env - Cloudflare环境变量
 */
export async function revokeSession(jti: string, env: CloudflareEnv): Promise<void> {
  try {
    const sessionDataStr = await env.KV.get(`session:${jti}`);
    if (sessionDataStr) {
      const sessionData: SessionData = JSON.parse(sessionDataStr);
      sessionData.status = "revoked";
      await env.KV.put(`session:${jti}`, JSON.stringify(sessionData));
    }
  } catch (error) {
    console.error("Session revocation error:", error);
  }
}
