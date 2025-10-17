import { Auth } from "@auth/core";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import Credentials from "@auth/core/providers/credentials";
import { createSession, validateSession } from "./session";
import type { CloudflareEnv } from "../env";

export function createAuth(env: CloudflareEnv) {
  const config = {
    basePath: "/api/auth",
    // 不使用adapter，采用自定义session管理
    providers: [
      Credentials({
        name: "credentials",
        credentials: {
          email: { label: "邮箱", type: "email" },
          password: { label: "密码", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          try {
            // 查找用户
            const user = await env.DB.prepare(
              "SELECT * FROM users WHERE email = ?"
            )
              .bind(credentials.email)
              .first();

            if (!user) {
              return null;
            }

            // 查找密码（在账户表中）
            const account = await env.DB.prepare(
              "SELECT * FROM accounts WHERE userId = ? AND provider = 'credentials'"
            )
              .bind(user.id)
              .first();

            if (!account || !account.access_token) {
              return null;
            }

            // 验证密码（简单的SHA-256比较）
            const encoder = new TextEncoder();
            const data_encoded = encoder.encode(credentials.password as string);
            const hashBuffer = await crypto.subtle.digest(
              "SHA-256",
              data_encoded
            );
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const passwordHash = hashArray
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");

            if (passwordHash !== account.access_token) {
              return null;
            }

            return {
              id: user.id as string,
              email: user.email as string,
              name: user.name as string,
              image: user.image as string | null,
            };
          } catch (error) {
            console.error("Auth error:", error);
            return null;
          }
        },
      }),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? [
            GitHub({
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            }),
          ]
        : []),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? [
            Google({
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            }),
          ]
        : []),
    ],
    callbacks: {
      async jwt({ token, user }: any) {
        if (user) {
          try {
            // 登录时创建KV session记录
            const jti = await createSession(user, env);

            // 只返回 jti，其他信息通过 KV + 数据库查询获取
            return {
              jti,
            };
          } catch (error) {
            console.error("[AUTH] Failed to create session:", error);
            throw error;
          }
        } else if (token?.jti) {
          // 对于现有token，验证session是否仍然有效
          try {
            const userId = await validateSession(token.jti as string, env);
            if (!userId) {
              return null; // session无效，清除token
            }
            return token; // session有效，保持token
          } catch (error) {
            console.error("[AUTH] Session validation error:", error);
            return null;
          }
        }

        return token;
      },
    },
    secret: env.AUTH_SECRET || "your-secret-key-change-this",
    trustHost: true,
    jwt: {
      encode: async (params: any) => {
        // 只存储必要的 token 数据，过期时间由 KV TTL 管理
        return btoa(JSON.stringify(params.token));
      },
      decode: async (params: any) => {
        try {
          if (!params.token) return null;
          return JSON.parse(atob(params.token));
        } catch {
          return null;
        }
      },
    },
  };

  return (request: Request) => Auth(request, config);
}
