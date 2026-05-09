import { useEffect, useMemo, useState } from "react";

type OrderStatus = "ok" | "warn" | "error";

type OperationRow = {
  channel: string;
  status: OrderStatus;
  label: string;
  orders: number;
  revenue: number;
  sla: string;
  owner: string;
};

type Alert = {
  title: string;
  detail: string;
  level: "Atencao" | "Critico";
};

type FunnelStage = {
  label: string;
  value: number;
  target: number;
};

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

const operationRows: OperationRow[] = [
  {
    channel: "Full",
    status: "ok",
    label: "No prazo",
    orders: 284,
    revenue: 87240,
    sla: "98,4%",
    owner: "Logistica",
  },
  {
    channel: "Flex",
    status: "warn",
    label: "Fila alta",
    orders: 126,
    revenue: 38910,
    sla: "91,2%",
    owner: "Expedicao",
  },
  {
    channel: "Coleta",
    status: "ok",
    label: "Estavel",
    orders: 74,
    revenue: 22180,
    sla: "96,8%",
    owner: "Operacao",
  },
  {
    channel: "Pendencias",
    status: "error",
    label: "Revisar",
    orders: 18,
    revenue: 6420,
    sla: "76,5%",
    owner: "Atendimento",
  },
];

const alerts: Alert[] = [
  {
    title: "Pedidos Flex perto do limite de corte",
    detail: "126 pedidos aguardam separacao antes da proxima janela.",
    level: "Atencao",
  },
  {
    title: "18 pedidos com pendencia operacional",
    detail: "Priorizar NF, etiqueta ou resposta ao comprador.",
    level: "Critico",
  },
  {
    title: "Reputacao em observacao",
    detail: "Atrasos de envio podem afetar a barra de qualidade.",
    level: "Atencao",
  },
];

const funnel: FunnelStage[] = [
  { label: "Visitas", value: 18420, target: 20000 },
  { label: "Carrinhos", value: 1290, target: 1500 },
  { label: "Pedidos pagos", value: 502, target: 560 },
  { label: "Enviados", value: 466, target: 520 },
];

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

  const metrics = useMemo(() => {
    const totalOrders = operationRows.reduce((sum, item) => sum + item.orders, 0);
    const fallbackRevenue = operationRows.reduce((sum, item) => sum + item.revenue, 0);
    const sentOrders = funnel.find((item) => item.label === "Enviados")?.value ?? 0;
    const paidOrders =
      funnel.find((item) => item.label === "Pedidos pagos")?.value ?? 1;
    const shippingRate = Math.round((sentOrders / paidOrders) * 100);

    return {
      totalOrders: dailySummary?.connected ? dailySummary.orders : totalOrders,
      revenue: dailySummary?.connected ? dailySummary.revenue : fallbackRevenue,
      shippingRate,
      alerts: alerts.length,
    };
  }, [dailySummary]);

  const formattedRevenue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: dailySummary?.currencyId ?? "BRL",
    maximumFractionDigits: 0,
  }).format(metrics.revenue);

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
          <a className="nav-item" href="#pedidos">
            Pedidos
          </a>
          <a className="nav-item" href="#funil">
            Funil
          </a>
          <a className="nav-item" href="#alertas">
            Alertas
          </a>
        </nav>
      </aside>

      <main className="page" id="visao-geral">
        <header className="topbar">
          <div>
            <p className="eyebrow">Mercado Livre</p>
            <h1>Painel diario da operacao</h1>
            <p className="subtitle">
              Pedidos, receita, SLA de envio e pontos de atencao em uma visao
              unica.
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
            <strong>{isLoadingSummary ? "..." : metrics.totalOrders}</strong>
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

        <section className="content-grid">
          <article className="panel" id="pedidos">
            <div className="panel-heading">
              <h2>Operacao por canal</h2>
              <span>Atualizado as {lastUpdated}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Status</th>
                    <th>Pedidos</th>
                    <th>Receita</th>
                    <th>SLA</th>
                    <th>Responsavel</th>
                  </tr>
                </thead>
                <tbody>
                  {operationRows.map((item) => (
                    <tr key={item.channel}>
                      <td>{item.channel}</td>
                      <td>
                        <span className={`status ${item.status}`}>
                          {item.label}
                        </span>
                      </td>
                      <td>{item.orders}</td>
                      <td>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(item.revenue)}
                      </td>
                      <td>{item.sla}</td>
                      <td>{item.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="panel" id="funil">
            <div className="panel-heading">
              <h2>Funil comercial</h2>
            </div>
            <div className="funnel-list">
              {funnel.map((stage) => (
                <article className="funnel-item" key={stage.label}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>
                      {stage.value.toLocaleString("pt-BR")} de{" "}
                      {stage.target.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div
                    className="progress"
                    aria-label={`${stage.label}: ${stage.value} de ${stage.target}`}
                  >
                    <span
                      style={{
                        width: `${Math.min(
                          Math.round((stage.value / stage.target) * 100),
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="wide-panel panel" id="alertas">
          <div className="panel-heading">
            <h2>Alertas operacionais</h2>
            <span>Prioridade do dia</span>
          </div>
          <div className="alert-list">
            {alerts.map((alert) => (
              <article className="alert-item" key={alert.title}>
                <span className="alert-level">{alert.level}</span>
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </article>
            ))}
          </div>
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
