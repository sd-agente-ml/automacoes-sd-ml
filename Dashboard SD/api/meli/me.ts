import type { VercelRequest, VercelResponse } from "@vercel/node";

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type UserResponse = {
  id: number;
  nickname: string;
  site_id: string;
};

const refreshAccessToken = async () => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    client_secret: requiredEnv("MELI_CLIENT_SECRET"),
    refresh_token: requiredEnv("MELI_REFRESH_TOKEN"),
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel renovar o token do Mercado Livre.");
  }

  return (await response.json()) as RefreshResponse;
};

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const token = await refreshAccessToken();
    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Nao foi possivel carregar a conta Mercado Livre.");
    }

    const user = (await userResponse.json()) as UserResponse;

    response.status(200).json({
      connected: true,
      id: user.id,
      nickname: user.nickname,
      siteId: user.site_id,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message: error instanceof Error ? error.message : "Conta nao conectada.",
    });
  }
}
