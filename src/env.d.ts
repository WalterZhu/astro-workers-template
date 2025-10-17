interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cloudflare Workers 环境变量类型
export interface CloudflareEnv {
  KV: KVNamespace;
  DB: D1Database;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_SECRET?: string;
  SESSION_TTL_DAYS?: number;
}

// 用户类型定义
export interface User {
  id: string;
}

declare namespace App {
  interface Locals {
    user?: User;
    runtime?: {
      env: CloudflareEnv;
    };
  }
}
