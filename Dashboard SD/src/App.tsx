import { useEffect, useState } from "react";

type ConnectionStatus = {
  connected: boolean;
  nickname?: string;
  siteId?: string;
  id?: number;
  message?: string;
};

type DailySummary = {
  connected: boolean;
  date: string;
  orders: number;
  revenue: number;
  currencyId: string;
  topSkus?: Array<{
    sku: string;
    image: string | null;
    units: number;
  }>;
  shippingBreakdown?: Record<
    "flex" | "full" | "mercadoEnvios",
    {
      orders: number;
      revenue: number;
    }
  >;
  message?: string;
};

type ActiveView = "overview" | "purchases" | "integration";

type PurchaseSuggestion = {
  sku: string;
  title: string;
  image: string | null;
  unitsSold30d: number;
  currentStock: number;
  targetStock: number;
  suggestedPurchase: number;
};

type PurchaseSuggestionsResponse = {
  connected: boolean;
  fromDate: string;
  toDate: string;
  suggestions: PurchaseSuggestion[];
  message?: string;
};

const formatUpdateTime = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [lastUpdated, setLastUpdated] = useState(formatUpdateTime);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [purchaseData, setPurchaseData] =
    useState<PurchaseSuggestionsResponse | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const formattedRevenue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: dailySummary?.currencyId ?? "BRL",
    maximumFractionDigits: 0,
  }).format(dailySummary?.revenue ?? 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: dailySummary?.currencyId ?? "BRL",
      maximumFractionDigits: 0,
    }).format(value);

  const shippingCards = [
    {
      title: "Flex ontem",
      key: "flex" as const,
    },
    {
      title: "Full ontem",
      key: "full" as const,
    },
    {
      title: "Mercado Envios ontem",
      key: "mercadoEnvios" as const,
    },
  ];

  useEffect(() => {
    fetch("/api/meli/daily-summary")
      .then(async (response) => {
        const payload = (await response.json()) as DailySummary;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Resumo Mercado Livre indisponivel.");
        }

        setDailySummary(payload);
      })
      .catch((error: Error) => {
        setSummaryError(error.message);
      })
      .finally(() => {
        setIsLoadingSummary(false);
      });
  }, []);

  const loadPurchaseSuggestions = () => {
    if (purchaseData || isLoadingPurchases) {
      return;
    }

    setIsLoadingPurchases(true);
    fetch("/api/meli/purchase-suggestions")
      .then(async (response) => {
        const payload = (await response.json()) as PurchaseSuggestionsResponse;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Sugestoes de compra indisponiveis.");
        }

        setPurchaseData(payload);
      })
      .catch((error: Error) => {
        setPurchaseError(error.message);
      })
      .finally(() => {
        setIsLoadingPurchases(false);
      });
  };

  const startMercadoLivreAuth = async () => {
    const response = await fetch("/api/meli/auth-url");
    const payload = (await response.json()) as { authUrl: string };
    window.location.href = payload.authUrl;
  };

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const response = await fetch("/api/meli/me");
      const payload = (await response.json()) as ConnectionStatus;
      setConnection(payload);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brand-mark">ML</span>
          <div>
            <strong>Operacao Mercado Livre</strong>
            <small>Dashboard SD</small>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("overview")}
          >
            Visao geral
          </button>
          <button
            className={`nav-item ${activeView === "purchases" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveView("purchases");
              loadPurchaseSuggestions();
            }}
          >
            Compras
          </button>
          <button
            className={`nav-item ${activeView === "integration" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("integration")}
          >
            Integracao ML
          </button>
        </nav>
      </aside>

      <main className="page">
        <header className="topbar">
          <div>
            <p className="eyebrow">Mercado Livre</p>
            <h1>
              {activeView === "overview"
                ? "Painel diario da operacao"
                : activeView === "purchases"
                  ? "Sugestao de compras"
                : "Integracao Mercado Livre"}
            </h1>
            <p className="subtitle">
              {activeView === "overview"
                ? "Pedidos, faturamento e principais SKUs vendidos no dia anterior."
                : activeView === "purchases"
                  ? "Reposicao sugerida para cada SKU com base nos ultimos 30 dias completos."
                : "Conexao da conta usada para carregar os dados reais do dashboard."}
            </p>
          </div>
          {activeView === "overview" ? (
            <button
              className="primary-action"
              type="button"
              onClick={() => setLastUpdated(formatUpdateTime())}
            >
              Atualizar
            </button>
          ) : null}
        </header>

        {activeView === "overview" ? (
          <>
            <p className="last-updated">Atualizado as {lastUpdated}</p>
            <section className="metrics-grid" aria-label="Indicadores principais">
              <article className="metric-card">
                <span>Pedidos ontem</span>
                <strong>{isLoadingSummary ? "..." : dailySummary?.orders ?? 0}</strong>
                <small>
                  {dailySummary?.connected
                    ? `Pedidos pagos em ${dailySummary.date}`
                    : summaryError ?? "Pagos e em processamento"}
                </small>
              </article>
              <article className="metric-card">
                <span>Faturamento ontem</span>
                <strong>{isLoadingSummary ? "..." : formattedRevenue}</strong>
                <small>
                  {dailySummary?.connected
                    ? `${dailySummary.orders} pedidos pagos em ${dailySummary.date}`
                    : summaryError ?? "Receita bruta estimada"}
                </small>
              </article>
              {shippingCards.map((card) => {
                const summary = dailySummary?.shippingBreakdown?.[card.key];

                return (
                  <article className="metric-card" key={card.key}>
                    <span>{card.title}</span>
                    <strong>
                      {isLoadingSummary
                        ? "..."
                        : formatCurrency(summary?.revenue ?? 0)}
                    </strong>
                    <small>{summary?.orders ?? 0} pedidos pagos</small>
                  </article>
                );
              })}
            </section>

            <section className="wide-panel panel" id="top-skus">
              <div className="panel-heading">
                <h2>Top 10 SKUs ontem</h2>
                <span>Unidades vendidas no dia anterior</span>
              </div>
              <div className="sku-grid">
                {(dailySummary?.topSkus ?? []).length > 0 ? (
                  dailySummary?.topSkus?.map((item) => (
                    <article className="sku-item" key={item.sku}>
                      <div className="sku-image">
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" />
                        ) : (
                          <span>Sem imagem</span>
                        )}
                      </div>
                      <strong>{item.sku}</strong>
                      <span>{item.units} un vendidas</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">
                    {isLoadingSummary
                      ? "Carregando SKUs..."
                      : "Nenhum SKU vendido ontem ou conta ainda nao conectada."}
                  </p>
                )}
              </div>
            </section>
          </>
        ) : activeView === "purchases" ? (
          <section className="wide-panel panel">
            <div className="panel-heading">
              <h2>Compras sugeridas</h2>
              <span>
                {purchaseData
                  ? `${purchaseData.fromDate} a ${purchaseData.toDate}`
                  : "Base: ultimos 30 dias completos"}
              </span>
            </div>
            <div className="purchase-table-wrap">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Imagem</th>
                    <th>SKU</th>
                    <th>Vendas 30d</th>
                    <th>Estoque ML</th>
                    <th>Estoque alvo</th>
                    <th>Sugestao compra</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseData?.suggestions.map((item) => (
                    <tr key={`${item.sku}-${item.title}`}>
                      <td>
                        <div className="purchase-image">
                          {item.image ? (
                            <img src={item.image} alt="" loading="lazy" />
                          ) : (
                            <span>Sem imagem</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{item.sku}</strong>
                        <span>{item.title}</span>
                      </td>
                      <td>{item.unitsSold30d}</td>
                      <td>{item.currentStock}</td>
                      <td>{item.targetStock}</td>
                      <td>
                        <strong>{item.suggestedPurchase}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isLoadingPurchases || !purchaseData?.suggestions.length ? (
                <p className="empty-state purchase-empty">
                  {isLoadingPurchases
                    ? "Calculando sugestoes..."
                    : purchaseError ??
                      "Nenhuma venda encontrada nos ultimos 30 dias completos."}
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="connection-panel panel">
            <div>
              <p className="eyebrow">Integracao</p>
              <h2>Conta Mercado Livre</h2>
              <p>
                Conecte a conta para trocar os indicadores mockados por dados
                reais da operacao.
              </p>
            </div>
            <div className="connection-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={checkConnection}
                disabled={isChecking}
              >
                {isChecking ? "Verificando" : "Verificar conexao"}
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={startMercadoLivreAuth}
              >
                Conectar Mercado Livre
              </button>
            </div>
            {connection ? (
              <div className={connection.connected ? "notice ok" : "notice warn"}>
                {connection.connected
                  ? `Conectado: ${connection.nickname} (${connection.siteId})`
                  : connection.message}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </>
  );
}

export default App;
