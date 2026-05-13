import type { VercelRequest, VercelResponse } from "@vercel/node";

const parseCookie = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : undefined;
};

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  const token = parseCookie(request.headers.cookie, "meli_refresh_token");

  if (!token) {
    response.status(200).json({
      connected: false,
      message: "Cookie meli_refresh_token nao encontrado nesta sessao.",
    });
    return;
  }

  response.status(200).json({
    connected: true,
    refreshToken: token,
  });
}
