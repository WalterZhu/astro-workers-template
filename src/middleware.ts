import { defineMiddleware } from "astro:middleware";
import { validateSession } from "./lib/session";
import type { CloudflareEnv } from "./env";

// 需要认证的路径
const protectedPaths = ["/profile", "/api/profile"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;
  const pathname = url.pathname;

  // 检查是否需要认证
  const requiresAuth = protectedPaths.some((path) => pathname.startsWith(path));

  // 如果不需要认证，直接通过
  if (!requiresAuth) {
    return next();
  }

  // 需要认证的路径处理
  const runtime = (context.locals as any).runtime;
  const env = runtime?.env as CloudflareEnv;

  if (!env) {
    return Response.redirect(new URL("/", url.origin));
  }

  try {
    // 从cookie中获取session token
    const cookies = request.headers.get("cookie") || "";

    // 匹配 Auth.js 的 session token cookie
    let sessionMatch = cookies.match(
      /__Secure-authjs\.session-token=([^;]+)/
    );

    if (!sessionMatch) {
      return Response.redirect(new URL("/", url.origin));
    }

    const sessionToken = decodeURIComponent(sessionMatch[1]);

    // 直接解析 base64 编码的 token
    let jti = null;
    try {
      const decoded = JSON.parse(atob(sessionToken));
      jti = decoded.jti;
    } catch (error) {
      return Response.redirect(new URL("/", url.origin));
    }

    if (!jti) {
      return Response.redirect(new URL("/", url.origin));
    }

    // 使用lib/session.ts中的validateSession函数，传递环境变量
    const userId = await validateSession(jti, env);

    if (!userId) {
      return Response.redirect(new URL("/", url.origin));
    }

    // 将用户信息设置到locals中供页面使用
    (context.locals as any).user = { id: userId };
  } catch (error) {
    console.error("Session validation error:", error);
    return Response.redirect(new URL("/", url.origin));
  }

  // 继续处理请求
  return next();
});
