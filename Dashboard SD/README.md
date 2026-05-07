# Dashboard SD - Mercado Livre

Site operacional para acompanhar dados da operacao de Mercado Livre. A base
usa Vite, React e TypeScript, pronta para deploy pela Vercel conectado ao
GitHub.

## Scripts

- `npm run dev`: inicia o servidor local.
- `npm run build`: valida TypeScript e gera a versao de producao.
- `npm run lint`: roda ESLint.
- `npm run preview`: abre a build de producao localmente.

## Deploy na Vercel

Ao importar o repositorio `sd-agente-ml/automacoes-sd-ml`, selecione
`Dashboard SD` como root directory.

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Estrutura

- `src/App.tsx`: layout e componentes do dashboard.
- `src/main.tsx`: entrada React.
- `src/styles.css`: estilos da interface.
