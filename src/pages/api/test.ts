import type { APIRoute } from "astro";
import type { CloudflareEnv } from "../../env";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const runtime = (locals as any).runtime;
  const env = runtime?.env as CloudflareEnv;

  if (!env) {
    return new Response(
      JSON.stringify({
        error: "Cloudflare Worker runtime env is not available on this request.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const {
    KV,
    DB,
    AUTH_SECRET,
    SESSION_TTL_DAYS,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
  } = env;

  let kvRoundTrip: string | null = null;
  if (KV) {
    try {
      const demoKey = `test:kv-demo:${crypto.randomUUID()}`;
      await KV.put(demoKey, "demo-value", { expirationTtl: 60 });
      kvRoundTrip = await KV.get(demoKey);
    } catch (error) {
      console.error("[TEST] KV round trip failed:", error);
    }
  }

  console.log("[TEST] Worker env keys:", Object.keys(env));

  return new Response(
    JSON.stringify(
      {
        message: "Cloudflare Worker runtime bindings available in this request.",
        bindings: {
          hasKV: Boolean(KV),
          hasDB: Boolean(DB),
          hasGitHubCredentials: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
          hasGoogleCredentials: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
        },
        examples: {
          authSecretSet: typeof AUTH_SECRET === "string" && AUTH_SECRET.length > 0,
          sessionTTL: SESSION_TTL_DAYS ?? null,
          kvRoundTrip,
        },
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
