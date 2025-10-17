# Astro Template

A modern authentication template built with Astro and Cloudflare Workers, featuring user registration, login, and session management.

## 🚀 Features

- User registration and authentication
- JWT-based session management
- Cloudflare D1 database integration
- Cloudflare KV session storage
- OAuth support (GitHub, Google)
- Clean, responsive UI

## 🛠 Tech Stack

- **Framework**: Astro with Cloudflare adapter
- **Authentication**: Auth.js (NextAuth)
- **Database**: Cloudflare D1 (SQLite)
- **Session Storage**: Cloudflare KV
- **Deployment**: Cloudflare Workers

## 📋 Prerequisites

- Node.js 18+ 
- Cloudflare account
- Wrangler CLI installed globally

## ⚙️ Cloudflare Configuration

### 1. D1 Database Setup

Create a D1 database:
```bash
wrangler d1 create DEV_D1
```

Update `wrangler.jsonc` with your database ID:
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "DEV_D1", 
      "database_id": "your-database-id-here"
    }
  ]
}
```

Deploy the database schema:
```bash
wrangler d1 execute DEV_D1 --file=schema.sql --remote
```

### 2. KV Namespace Setup

Create a KV namespace:
```bash
wrangler kv:namespace create "DEV_KV"
```

Update `wrangler.jsonc` with your KV namespace ID:
```json
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "your-kv-namespace-id-here"
    }
  ]
}
```

### 3. Environment Variables

Set the following environment variables in your Cloudflare Dashboard (Workers & Pages > your-worker > Settings > Environment Variables):

#### Required:
- `AUTH_SECRET`: A random string for JWT signing (generate with `openssl rand -base64 32`)

#### Optional:
- `SESSION_TTL_DAYS`: Session expiry in days (default: 7)

#### Optional (for OAuth):
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth app client secret  
- `GOOGLE_CLIENT_ID`: Google OAuth app client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth app client secret

### 4. OAuth Setup (Optional)

#### GitHub OAuth:
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App
3. Set Homepage URL: `https://your-domain.com`
4. Set Authorization callback URL: `https://your-domain.com/api/auth/callback/github`

#### Google OAuth:
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create OAuth 2.0 Client ID
3. Set Authorized redirect URIs: `https://your-domain.com/api/auth/callback/google`

## 🚀 Installation & Development

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd astro-workers-template
npm install
```

2. **Local development:**
```bash
npm run dev
```

3. **Build and deploy:**
```bash
npm run deploy
```

## 📂 Project Structure

```text
/
├── public/
├── src/
│   ├── lib/
│   │   └── auth.ts          # Auth.js configuration
│   ├── middleware.ts        # Route protection middleware
│   ├── pages/
│   │   ├── index.astro      # Login page
│   │   ├── register.astro   # Registration page
│   │   └── api/auth/
│   │       ├── [...all].ts  # Auth.js API routes
│   │       └── register.ts  # Custom registration endpoint
├── schema.sql               # Database schema
├── wrangler.jsonc          # Cloudflare Workers configuration
└── package.json
```

## 🧞 Commands

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run deploy`          | Build and deploy to Cloudflare Workers           |
| `npm run preview`         | Preview your build locally, before deploying     |

## 🔐 Database Schema

The application uses a minimal Auth.js compatible schema:

- **users**: User profiles (id, email, name, emailVerified, image)
- **accounts**: OAuth and credentials data (passwords stored as hashed access_tokens)

## 🌐 API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/callback/credentials` - Email/password login
- `GET /api/auth/signin/github` - GitHub OAuth login
- `GET /api/auth/signin/google` - Google OAuth login
- `GET /api/auth/session` - Get current session
- `POST /api/auth/signout` - Sign out

## 📝 Notes

- Sessions are stored as JWT tokens with 7-day expiry
- Passwords are hashed using SHA-256 (consider upgrading to bcrypt for production)
- The application uses Cloudflare KV for session storage instead of database sessions
- All Auth.js routes are automatically handled by the `[...all].ts` catch-all route

## 🔧 Troubleshooting

1. **500 errors on auth endpoints**: Check that D1 database and KV namespace are properly configured
2. **OAuth not working**: Verify client IDs/secrets and callback URLs
3. **Database errors**: Ensure schema is deployed with `wrangler d1 execute`

## 📚 Learn More

- [Astro Documentation](https://docs.astro.build)
- [Auth.js Documentation](https://authjs.dev)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1)