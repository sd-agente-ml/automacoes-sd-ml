import type { VercelRequest, VercelResponse } from "@vercel/node";

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user_id: number;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST") {
    response.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const code = String(request.body?.code ?? "");

    if (!code) {
      response.status(400).json({ message: "Authorization code is required" });
      return;
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: requiredEnv("MELI_CLIENT_ID"),
      client_secret: requiredEnv("MELI_CLIENT_SECRET"),
      code,
      redirect_uri: requiredEnv("MELI_REDIRECT_URI"),
    });

    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const tokenPayload = (await tokenResponse.json()) as
      | TokenResponse
      | { message?: string; error?: string };

    if (!tokenResponse.ok) {
      response.status(tokenResponse.status).json({
        message:
          "message" in tokenPayload
            ? tokenPayload.message
            : "Mercado Livre token exchange failed",
      });
      return;
    }

    response.status(200).json({
      message:
        "Autorizacao concluida. Copie o refresh_token do log local e salve como MELI_REFRESH_TOKEN na Vercel para chamadas automaticas.",
      userId: (tokenPayload as TokenResponse).user_id,
      refreshToken: (tokenPayload as TokenResponse).refresh_token,
    });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Unexpected error",
    });
  }
}
