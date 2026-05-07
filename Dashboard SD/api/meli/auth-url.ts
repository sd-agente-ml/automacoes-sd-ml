import type { VercelRequest, VercelResponse } from "@vercel/node";

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

export default function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const clientId = requiredEnv("MELI_CLIENT_ID");
    const redirectUri = requiredEnv("MELI_REDIRECT_URI");
    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");

    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);

    response.status(200).json({ authUrl: authUrl.toString() });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Unexpected error",
    });
  }
}
