import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type UserResponse = {
  id: number;
  site_id?: string;
};

type ItemsSearchResponse = {
  paging?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
  results?: string[];
};

type ItemLookupResponse = {
  code: number;
  body?: {
    id?: string;
    title?: string;
    thumbnail?: string;
    price?: number;
    currency_id?: string;
    catalog_listing?: boolean;
    catalog_product_id?: string | null;
    seller_custom_field?: string | null;
    attributes?: Array<{
      id?: string;
      value_name?: string | null;
    }>;
  };
};

type VisitsResponse = {
  item_id?: string;
  total_visits?: number;
};

type VisitsByItemResponse = Record<string, number> | VisitsResponse[];

type PriceToWinResponse = {
  status?: string;
  reason?: string;
  price?: number;
  currency_id?: string;
  price_to_win?: number | { amount?: number };
  suggested_price?: number | { amount?: number };
  winner?: {
    item_id?: string;
    price?: number;
    currency_id?: string;
  };
};

type CatalogRow = {
  id: string;
  image: string | null;
  sku: string;
  title: string;
  currentPrice: number;
  currencyId: string;
  status: "winning" | "competing" | "sharing_first_place" | "listed" | "unknown";
  statusLabel: string;
  priceToWin: number | null;
  visits60d: number;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

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

const tokenCookie = (token: string) =>
  [
    `meli_refresh_token=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=15552000",
  ].join("; ");

const refreshAccessToken = async (refreshToken: string) => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    client_secret: requiredEnv("MELI_CLIENT_SECRET"),
    refresh_token: refreshToken,
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

const getBrazilLast60DaysRange = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const todayStartUtc = new Date(`${today}T03:00:00.000Z`);
  const fromDate = new Date(todayStartUtc);

  fromDate.setUTCDate(fromDate.getUTCDate() - 60);

  return {
    fromDate: formatter.format(fromDate),
    toDate: today,
  };
};

const fetchSellerItemIds = async (accessToken: string, sellerId: number) => {
  const ids: string[] = [];
  const limit = 50;
  let offset = 0;
  let total = 0;

  do {
    const url = new URL(
      `https://api.mercadolibre.com/users/${sellerId}/items/search`,
    );

    url.searchParams.set("status", "active");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel consultar anuncios ativos.");
    }

    const payload = (await response.json()) as ItemsSearchResponse;

    ids.push(...(payload.results ?? []));
    total = payload.paging?.total ?? ids.length;
    offset += payload.paging?.limit ?? limit;
  } while (offset < total && offset < 1000);

  return ids;
};

const getSellerSkuAttribute = (
  attributes: Array<{ id?: string; value_name?: string | null }> | undefined,
) => attributes?.find((attribute) => attribute.id === "SELLER_SKU")?.value_name;

const fetchCatalogItems = async (accessToken: string, itemIds: string[]) => {
  const items: NonNullable<ItemLookupResponse["body"]>[] = [];

  for (let index = 0; index < itemIds.length; index += 20) {
    const batch = itemIds.slice(index, index + 20);
    const url = new URL("https://api.mercadolibre.com/items");

    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set(
      "attributes",
      "id,title,thumbnail,price,currency_id,catalog_listing,catalog_product_id,seller_custom_field,attributes",
    );

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as ItemLookupResponse[];

    payload.forEach((itemResponse) => {
      const item = itemResponse.body;

      if (item?.id && (item.catalog_listing || item.catalog_product_id)) {
        items.push(item);
      }
    });
  }

  return items;
};

const fetchVisits60d = async (
  accessToken: string,
  itemIds: string[],
) => {
  const visits = new Map<string, number>();

  for (let index = 0; index < itemIds.length; index += 50) {
    const batch = itemIds.slice(index, index + 50);
    const url = new URL("https://api.mercadolibre.com/items/visits/time_window");

    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("last", "60");
    url.searchParams.set("unit", "day");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      batch.forEach((itemId) => visits.set(itemId, 0));
      continue;
    }

    const payload = (await response.json()) as VisitsByItemResponse;

    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        if (item.item_id) {
          visits.set(item.item_id, item.total_visits ?? 0);
        }
      });
    } else {
      Object.entries(payload).forEach(([itemId, total]) => {
        visits.set(itemId, typeof total === "number" ? total : 0);
      });
    }
  }

  return visits;
};

const fetchPriceToWin = async (
  accessToken: string,
  itemId: string,
  siteId: string,
) => {
  const url = new URL(
    `https://api.mercadolibre.com/items/${itemId}/price_to_win`,
  );

  url.searchParams.set("siteId", siteId);
  url.searchParams.set("version", "v2");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as PriceToWinResponse;
};

const extractAmount = (value: number | { amount?: number } | undefined) => {
  if (typeof value === "number") {
    return value;
  }

  return value?.amount;
};

const getPriceToWinAmount = (priceToWin: PriceToWinResponse | undefined) =>
  extractAmount(priceToWin?.price_to_win) ??
  extractAmount(priceToWin?.suggested_price) ??
  priceToWin?.winner?.price ??
  null;

const normalizeStatus = (status: string | undefined): CatalogRow["status"] => {
  if (
    status === "winning" ||
    status === "competing" ||
    status === "sharing_first_place" ||
    status === "listed"
  ) {
    return status;
  }

  return "unknown";
};

const statusLabel = (status: CatalogRow["status"]) => {
  const labels: Record<CatalogRow["status"], string> = {
    winning: "Ganhando",
    competing: "Perdendo",
    sharing_first_place: "Dividindo",
    listed: "Nao competindo",
    unknown: "Nao identificado",
  };

  return labels[status];
};

const statusRank = (status: CatalogRow["status"]) => {
  const ranks: Record<CatalogRow["status"], number> = {
    competing: 0,
    listed: 1,
    sharing_first_place: 2,
    winning: 3,
    unknown: 4,
  };

  return ranks[status];
};

const buildCatalogRow = async (
  accessToken: string,
  item: NonNullable<ItemLookupResponse["body"]>,
  siteId: string,
  visits60d: number,
) => {
  if (!item.id || visits60d <= 0) {
    return undefined;
  }

  const competition = await fetchPriceToWin(accessToken, item.id, siteId);
  const status = normalizeStatus(competition?.status);
  const sku =
    getSellerSkuAttribute(item.attributes) ?? item.seller_custom_field ?? item.id;

  return {
    id: item.id,
    image: item.thumbnail ?? null,
    sku,
    title: item.title ?? item.id,
    currentPrice: item.price ?? competition?.price ?? 0,
    currencyId:
      item.currency_id ??
      competition?.currency_id ??
      competition?.winner?.currency_id ??
      "BRL",
    status,
    statusLabel: statusLabel(status),
    priceToWin: getPriceToWinAmount(competition),
    visits60d,
  } satisfies CatalogRow;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const refreshToken =
      parseCookie(request.headers.cookie, "meli_refresh_token") ??
      process.env.MELI_REFRESH_TOKEN;

    if (!refreshToken) {
      response.status(200).json({
        connected: false,
        message: "Conta Mercado Livre ainda nao conectada.",
      });
      return;
    }

    const token = await refreshAccessToken(refreshToken);
    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Nao foi possivel identificar o vendedor.");
    }

    const user = (await userResponse.json()) as UserResponse;
    const siteId = user.site_id ?? "MLB";
    const range = getBrazilLast60DaysRange();
    const itemIds = await fetchSellerItemIds(token.access_token, user.id);
    const catalogItems = await fetchCatalogItems(token.access_token, itemIds);
    const visitsByItem = await fetchVisits60d(
      token.access_token,
      catalogItems.flatMap((item) => (item.id ? [item.id] : [])),
    );
    const rows: CatalogRow[] = [];

    for (let index = 0; index < catalogItems.length; index += 8) {
      const batch = catalogItems.slice(index, index + 8);
      const batchRows = await Promise.all(
        batch.map((item) =>
          buildCatalogRow(
            token.access_token,
            item,
            siteId,
            item.id ? visitsByItem.get(item.id) ?? 0 : 0,
          ),
        ),
      );

      rows.push(...batchRows.filter((row): row is CatalogRow => Boolean(row)));
    }

    rows.sort((left, right) => {
      const statusDiff = statusRank(left.status) - statusRank(right.status);

      if (statusDiff !== 0) {
        return statusDiff;
      }

      return right.visits60d - left.visits60d;
    });

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      fromDate: range.fromDate,
      toDate: range.toDate,
      items: rows,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar catalogos.",
    });
  }
}
