import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type UserResponse = {
  id: number;
};

type OrderItem = {
  quantity?: number;
  item?: {
    id?: string;
    title?: string;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
    variation_id?: number | string | null;
  };
};

type Order = {
  id: number;
  order_items?: OrderItem[];
};

type OrdersResponse = {
  paging: {
    total: number;
    limit: number;
    offset: number;
  };
  results: Order[];
};

type ItemLookupResponse = {
  code: number;
  body?: {
    id?: string;
    title?: string;
    thumbnail?: string;
    available_quantity?: number;
    seller_custom_field?: string | null;
    attributes?: Array<{
      id?: string;
      value_name?: string | null;
    }>;
    variations?: Array<{
      id?: number;
      available_quantity?: number;
      seller_custom_field?: string | null;
      attributes?: Array<{
        id?: string;
        value_name?: string | null;
      }>;
    }>;
  };
};

type SkuSales = {
  sku: string;
  itemId: string;
  variationId?: string;
  title: string;
  unitsSold30d: number;
};

type StockInfo = {
  image: string | null;
  stock: number;
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

const getBrazilLast30CompleteDaysRange = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const saoPauloToday = formatter.format(new Date());
  const todayStartUtc = new Date(`${saoPauloToday}T03:00:00.000Z`);
  const fromDate = new Date(todayStartUtc);
  const toDate = new Date(todayStartUtc);

  fromDate.setUTCDate(fromDate.getUTCDate() - 30);
  toDate.setUTCDate(toDate.getUTCDate() - 1);

  const from = formatter.format(fromDate);
  const to = formatter.format(toDate);

  return {
    fromDate: from,
    toDate: to,
    from: `${from}T00:00:00.000-03:00`,
    to: `${to}T23:59:59.999-03:00`,
  };
};

const fetchPaidOrders = async (
  accessToken: string,
  sellerId: number,
  from: string,
  to: string,
) => {
  const orders: Order[] = [];
  const limit = 50;
  let offset = 0;
  let total = 0;

  do {
    const url = new URL("https://api.mercadolibre.com/orders/search");

    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", from);
    url.searchParams.set("order.date_created.to", to);
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel consultar pedidos do Mercado Livre.");
    }

    const payload = (await response.json()) as OrdersResponse;

    orders.push(...payload.results);
    total = payload.paging.total;
    offset += payload.paging.limit;
  } while (offset < total && offset < 1000);

  return orders;
};

const resolveOrderSku = (item: OrderItem["item"]) =>
  item?.seller_sku ??
  item?.seller_custom_field ??
  item?.id ??
  "SKU sem cadastro";

const aggregateSalesBySku = (orders: Order[]) => {
  const sales = new Map<string, SkuSales>();

  orders.forEach((order) => {
    order.order_items?.forEach((orderItem) => {
      const item = orderItem.item;
      const itemId = item?.id;

      if (!itemId) {
        return;
      }

      const variationId =
        item?.variation_id === null || item?.variation_id === undefined
          ? undefined
          : String(item.variation_id);
      const sku = resolveOrderSku(item);
      const key = `${sku}:${itemId}:${variationId ?? "item"}`;
      const existing = sales.get(key);

      sales.set(key, {
        sku,
        itemId,
        variationId,
        title: item?.title ?? itemId,
        unitsSold30d: (existing?.unitsSold30d ?? 0) + (orderItem.quantity ?? 0),
      });
    });
  });

  return [...sales.values()];
};

const getSellerSkuAttribute = (
  attributes: Array<{ id?: string; value_name?: string | null }> | undefined,
) => attributes?.find((attribute) => attribute.id === "SELLER_SKU")?.value_name;

const fetchStockInfo = async (accessToken: string, salesRows: SkuSales[]) => {
  const stock = new Map<string, StockInfo>();
  const itemIds = [...new Set(salesRows.map((row) => row.itemId))];

  for (let index = 0; index < itemIds.length; index += 20) {
    const batch = itemIds.slice(index, index + 20);
    const url = new URL("https://api.mercadolibre.com/items");

    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set(
      "attributes",
      "id,title,thumbnail,available_quantity,seller_custom_field,attributes,variations",
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

      if (!item?.id) {
        return;
      }

      const relatedRows = salesRows.filter((row) => row.itemId === item.id);

      relatedRows.forEach((row) => {
        const key = `${row.sku}:${row.itemId}:${row.variationId ?? "item"}`;
        const variation = row.variationId
          ? item.variations?.find(
              (itemVariation) => String(itemVariation.id) === row.variationId,
            )
          : undefined;
        const variationSku =
          getSellerSkuAttribute(variation?.attributes) ??
          variation?.seller_custom_field;
        const itemSku =
          getSellerSkuAttribute(item.attributes) ?? item.seller_custom_field;
        const matchedBySku = item.variations?.find((itemVariation) => {
          const sku =
            getSellerSkuAttribute(itemVariation.attributes) ??
            itemVariation.seller_custom_field;

          return sku === row.sku;
        });
        const stockQuantity =
          variation?.available_quantity ??
          matchedBySku?.available_quantity ??
          item.available_quantity ??
          0;

        stock.set(key, {
          image: item.thumbnail ?? null,
          stock:
            row.variationId || variationSku || itemSku
              ? stockQuantity
              : item.available_quantity ?? stockQuantity,
        });
      });
    });
  }

  return stock;
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
    const range = getBrazilLast30CompleteDaysRange();
    const orders = await fetchPaidOrders(
      token.access_token,
      user.id,
      range.from,
      range.to,
    );
    const salesRows = aggregateSalesBySku(orders);
    const stockInfo = await fetchStockInfo(token.access_token, salesRows);
    const suggestions = salesRows
      .map((row) => {
        const key = `${row.sku}:${row.itemId}:${row.variationId ?? "item"}`;
        const currentStock = stockInfo.get(key)?.stock ?? 0;
        const targetStock = Math.ceil(row.unitsSold30d * 2.5);

        return {
          sku: row.sku,
          title: row.title,
          image: stockInfo.get(key)?.image ?? null,
          unitsSold30d: row.unitsSold30d,
          currentStock,
          targetStock,
          suggestedPurchase: Math.max(0, targetStock - currentStock),
        };
      })
      .sort((left, right) => right.suggestedPurchase - left.suggestedPurchase);

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      fromDate: range.fromDate,
      toDate: range.toDate,
      suggestions,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar sugestoes de compra.",
    });
  }
}
