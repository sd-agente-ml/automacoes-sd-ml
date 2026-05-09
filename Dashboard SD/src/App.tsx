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

const formatUpdateTime = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function App() {
  const [lastUpdated, setLastUpdated] = useState(formatUpdateTime);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
          <a className="nav-item active" href="#visao-geral">
            Visao geral
          </a>
        </nav>
      </aside>

      <main className="page" id="visao-geral">
        <header className="topbar">
          <div>
            <p className="eyebrow">Mercado Livre</p>
            <h1>Painel diario da operacao</h1>
            <p className="subtitle">
              Pedidos, faturamento e principais SKUs vendidos no dia anterior.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => setLastUpdated(formatUpdateTime())}
          >
            Atualizar
          </button>
        </header>
        <p className="last-updated">Atualizado as {lastUpdated}</p>

        <section className="connection-panel panel">
          <div>
            <p className="eyebrow">Integracao</p>
            <h2>Conta Mercado Livre</h2>
            <p>
              Conecte a conta para trocar os indicadores mockados por dados reais
              da operacao.
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
                  {isLoadingSummary ? "..." : formatCurrency(summary?.revenue ?? 0)}
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
      </main>
    </>
  );
}

export default App;
