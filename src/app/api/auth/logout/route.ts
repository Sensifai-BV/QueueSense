export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getOidcDiscovery, getSafeBaseUrl } from "@/lib/sensifai/auth";

export async function GET(req: NextRequest) {
  return handleLogout(req);
}

export async function POST(req: NextRequest) {
  return handleLogout(req);
}

async function handleLogout(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const safeBaseUrl = isLocal ? `http://${host}` : getSafeBaseUrl(req);
  const clientId = process.env.LOGTO_CLIENT_ID;

  let targetUrl = safeBaseUrl;

  // Only redirect to remote Logto end_session if in production and dedicated client is configured
  if (!isLocal && clientId && clientId.length > 5) {
    try {
      const discovery = await getOidcDiscovery();
      if (discovery.end_session_endpoint) {
        const endSessionUrl = new URL(discovery.end_session_endpoint);
        endSessionUrl.searchParams.set("client_id", clientId);
        endSessionUrl.searchParams.set("post_logout_redirect_uri", safeBaseUrl);
        targetUrl = endSessionUrl.toString();
      }
    } catch {}
  }

  const response = NextResponse.redirect(targetUrl);
  const clearCookieOpts = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax" as const,
  };

  response.cookies.set("sensifai_session", "", clearCookieOpts);
  response.cookies.set("app_session", "", clearCookieOpts);
  response.cookies.set("sensifai_user_id", "", clearCookieOpts);

  return response;
}
