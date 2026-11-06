# Casa Clo — site

Site institucional da Casa Clo, doçaria artesanal em Lisboa e Margem Sul.

Site estático puro (HTML + CSS + JS), sem dependências nem build step.

**Produção:** `https://casaclodoces.com` (Netlify; o URL `casaclo.netlify.app`
serve o mesmo deploy).

---

## Estrutura do projecto

```
casaclo/
├── index.html        ← homepage (vitrina, formulário de encomenda)
├── loja.html         ← coleção completa (18 peças em 7 sub-colecções)
├── eventos.html      ← mesas doces e eventos
├── pecas.html        ← peças especiais / personalização
├── clo.html          ← a história da Clo
├── termos.html       ← termos e condições (minuta — campos [a preencher])
├── privacidade.html  ← política de privacidade RGPD (minuta)
├── info-alimentar.html ← alergénios e conservação (minuta)
├── style.css         ← estilos (inclui @font-face auto-hospedadas)
├── script.js         ← menu mobile + envio do formulário (mailto) + ano
├── fonts/            ← 13 ficheiros .woff2 (Cormorant, Fraunces, Inter Tight, Italiana)
├── images/           ← 41 imagens dos doces
├── gestao/           ← plataforma de gestão (Node+PostgreSQL, Decima Cloud) — ver gestao/README.md
├── favicon.ico
├── robots.txt
├── netlify.toml      ← cache (imagens/fontes longas; HTML/CSS curto) + segurança
└── README.md         ← este ficheiro
```

---

## Como ver o site localmente

Duplo clique no `index.html` chega; com servidor local é idêntico à produção
(as fontes são auto-hospedadas, já não dependem do Google CDN):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

---

## Publicar

O site está no Netlify, ligado a este repositório. Para actualizar produção:
`git push` (deploy automático) — ou arrastar a pasta para
[app.netlify.com/drop](https://app.netlify.com/drop) num deploy manual.

---

## Estado dos contactos e canais

- **Email:** `encomendas@casaclodoces.com` (caixa na Hostinger; requer os
  registos MX/SPF/DKIM activos na DNS — ver abaixo)
- **WhatsApp:** +351 966 845 351 (real, usado em todo o site)
- **Instagram:** `instagram.com/casaclo` — confirmar se é o handle certo
- **Formulário da homepage:** abre o cliente de email do visitante (mailto).
  Alternativa futura: Netlify Forms ou Formspree para receber pedidos directamente.

## Domínio

- `casaclodoces.com` — registado 02/05/2026, **expira 02/05/2027** (Name.com,
  conta própria; transferido da Netlify a 04/11/2026). **Ligar auto-renew.**
- `casaclo.pt` — nunca foi registado; não usar em lado nenhum.
- DNS gerida no Netlify (nsone). Se um dia a zona migrar (p.ex. para a
  Hostinger), copiar TODOS os registos, incluindo: `A @ e www →
  63.176.8.218 + 35.157.26.135` (o site continua alojado no Netlify) e os
  MX/SPF/DKIM do email.

---

## TODOs pendentes (conteúdo, não código)

- [ ] Confirmar handle do Instagram
- [ ] `clo.html` — confirmar nome da escola/curso da Clo (TODO no próprio ficheiro)
- [ ] Páginas legais: preencher `[Nome legal]`, `[NIF]`, `[morada]` e rever
      com profissional antes de considerá-las finais
- [ ] Criar conta da Casa Clo no livroreclamacoes.pt (link já no footer)
- [ ] Imagens em WebP/AVIF numa 2.ª iteração de performance

*Última actualização: 2026-11-04 (revisão completa: fontes auto-hospedadas,
navegação consistente, email novo, og:image absolutas, lazy-loading, README).*
