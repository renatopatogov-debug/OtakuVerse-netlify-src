# Política de Segurança (`SECURITY.md`)

## Versões Suportadas

| Versão / Branch | Status |
| --- | --- |
| `main` (`0.2.x`) | Suportada (recebe atualizações e correções) |
| Demais branches / versões antigas | Sem suporte |

---

## Como Reportar uma Vulnerabilidade

Por favor, **não** abra uma issue pública para relatar falhas de segurança.

1. Utilize o canal privado de avisos de segurança do GitHub (*Private vulnerability reporting*):
   - https://github.com/renatopatogov-debug/OtakuVerse-netlify-src/security/advisories/new
2. Inclua no relato:
   - Descrição clara do problema e impacto esperado;
   - Rota, arquivo ou componente afetado;
   - Passo a passo ou prova de conceito para reprodução.

---

## Escopo e Controles Implementados

- **Proxies de mídia e imagens (`/api/hls`, `/api/img`, `/api/manga/page/*`, `/api/manga/cover/*`):**
  - Validação estrita de protocolo (`http:` / `https:`) e *allowlist* de domínios autorizados (`hostAllowed` / `isAllowed`) para mitigar SSRF;
  - Validação de segmentos de rota contra *path traversal* e caracteres de controle (`isSafePathSegment`);
  - Verificação de `Content-Type` em imagens bloqueando HTML, SVG, XML e texto (`isSafeImageContentType`) e limite de 25 MB com streaming direto (`MAX_IMAGE_BYTES`).
- **Dados do usuário e persistência:**
  - Não há contas de usuário, senhas ou banco de dados no servidor; favoritos, histórico e downloads offline ficam armazenados apenas localmente no navegador (`localStorage` e Cache API).
- **Variáveis de ambiente:**
  - `TOMATO_TOKEN` pode ser sobrescrita via variáveis de ambiente no Netlify (ou `.env.local` em desenvolvimento, ignorado pelo `.gitignore`) caso o token padrão de `src/lib/tomato.ts` precise ser rotacionado.

---

## Fora de Escopo

- Disponibilidade, *rate limits*, bloqueios de DNS/CDN ou conteúdo retornado por APIs públicas de terceiros (MangaDex, Otakulogia, AniList, Kitsu, ani.zip, AniSkip, animesfhd, KakaManga e Tomato).
- Problemas que exijam acesso físico ao dispositivo do usuário ou manipulação direta do próprio `localStorage` / DevTools.
