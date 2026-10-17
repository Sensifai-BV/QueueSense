export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import {
  generatePkce,
  getOidcDiscovery,
  getLogtoClientId,
  getSafeBaseUrl,
} from "@/lib/sensifai/auth";

export async function GET(req: NextRequest) {
  const safeBaseUrl = getSafeBaseUrl(req);
  const clientId = getLogtoClientId();

  if (!clientId) {
    return NextResponse.json(
      { error: "missing_client_id", message: "LOGTO_CLIENT_ID is not configured." },
      { status: 500 }
    );
  }

  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const discovery = await getOidcDiscovery();
  const redirectUri = `${safeBaseUrl}/callback`;

  const { code_verifier, code_challenge, state, nonce } = generatePkce();

  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    process.env.LOGTO_SCOPES || "openid profile email"
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", code_challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl.toString());

  // Set secure cookies for PKCE validation (10 minutes max age)
  const isSecure =
    process.env.NODE_ENV === "production" && safeBaseUrl.startsWith("https");
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };

  response.cookies.set("sensifai_oidc_state", state, cookieOptions);
  response.cookies.set("sensifai_oidc_verifier", code_verifier, cookieOptions);
  response.cookies.set("sensifai_oidc_nonce", nonce, cookieOptions);
  if (returnTo && returnTo.startsWith("/")) {
    response.cookies.set("sensifai_return_to", returnTo, cookieOptions);
  }

  return response;
}
