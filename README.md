# OtakuVerse

Hub pessoal desenvolvido para reunir **animes**, **mangás** e um **arcade de jogos e experimentos web** em uma única interface PWA rápida e responsiva.

🌐 **Acesse online:** [otakuversehub.netlify.app](https://otakuversehub.netlify.app)

---

## O que tem no projeto

- **Animes:** catálogo, busca, filtro por gênero/áudio (LEG/DUB), notas e metadados (AniList), títulos em pt-BR (ani.zip), botão de pular abertura/encerramento (AniSkip) e players alternativos em caso de falha.
- **Mangás:** listagem de populares e busca (MangaDex), troca de idiomas, recomendações, leitor com gestos e **downloads offline** salvos direto no navegador.
- **Arcade & Laboratório:** coleção de jogos e utilitários estáticos integrados (`Roguelike RPG`, `Spyfall`, `Sueca`, `GhostChat`, `Pure P2P Share`, `NEXUS` e `Acervo Print & Play`) abertos em nova aba.
- **Sem login e *local-first*:** favoritos, preferências de áudio e histórico de continuidade (*Continuar assistindo / lendo*) ficam salvos localmente no dispositivo (`localStorage` + Cache API).

---

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Estilização & UI:** Tailwind CSS v4 + `lucide-react`
- **Streaming:** `hls.js` + proxies server-side em Next API Routes
- **Hospedagem:** Netlify (`@netlify/plugin-nextjs`)

---

## Executando localmente

```bash
npm install
npm run dev
```

Veja [.env.example](.env.example) caso queira configurar variáveis de ambiente opcionais (como `TOMATO_TOKEN`). Para relatos de segurança, consulte [SECURITY.md](SECURITY.md).
