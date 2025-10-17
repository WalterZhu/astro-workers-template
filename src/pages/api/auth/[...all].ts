import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";

export const prerender = false;

export const ALL: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;

  try {
    // 创建一个新的请求对象，确保URL正确
    const authRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const authHandler = createAuth(runtime.env);
    
    return await authHandler(authRequest);
  } catch (error) {
    console.error("Auth error:", error);
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};