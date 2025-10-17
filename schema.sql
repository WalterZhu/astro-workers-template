-- Auth.js 最简表结构（使用KV存储session）

-- 用户表
CREATE TABLE IF NOT EXISTS "users" (
    "id" text NOT NULL,
    "name" text,
    "email" text UNIQUE,
    "emailVerified" datetime,
    "image" text,
    PRIMARY KEY (id)
);

-- 账户表（OAuth 提供商）
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" number,
    "token_type" text,
    "scope" text,
    "id_token" text,
    PRIMARY KEY (id)
);

-- 用户配置表
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" text NOT NULL,
    "userId" text NOT NULL UNIQUE,
    "bio" text,
    "avatar" text,
    "theme" text DEFAULT 'light',
    "language" text DEFAULT 'zh-CN',
    "createdAt" datetime DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS "idx_accounts_userId" ON "accounts"("userId");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_user_profiles_userId" ON "user_profiles"("userId");