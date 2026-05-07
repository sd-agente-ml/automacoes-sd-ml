import { useEffect, useState } from "react";

type ExchangeState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function AuthCallback() {
  const code = new URLSearchParams(window.location.search).get("code");
  const [state, setState] = useState<ExchangeState>({
    status: code ? "loading" : "error",
    message: code
      ? "Conectando com o Mercado Livre..."
      : "Codigo de autorizacao nao encontrado.",
  });

  useEffect(() => {
    if (!code) {
      return;
    }

    fetch("/api/meli/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(payload.message ?? "Falha ao conectar.");
        }

        setState({
          status: "success",
          message:
            payload.message ??
            "Conta conectada. As credenciais foram validadas com sucesso.",
        });
      })
      .catch((error: Error) => {
        setState({ status: "error", message: error.message });
      });
  }, [code]);

  return (
    <main className="callback-page">
      <section className={`callback-card ${state.status}`}>
        <p className="eyebrow">Mercado Livre</p>
        <h1>{state.status === "success" ? "Conta conectada" : "Autorizacao"}</h1>
        <p>{state.message}</p>
        <a className="primary-link" href="/">
          Voltar ao dashboard
        </a>
      </section>
    </main>
  );
}

export default AuthCallback;
