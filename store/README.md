# CRATE store

The Crate storefront built from the Claude Design handoff (`../project/Crate Store v2.dc.html`, see `../chats/chat1.md`).
Next.js 16 (App Router) + React 19 + TypeScript, styled with the Modernist design system (`app/modernist.css`, copied verbatim) plus `app/crate.css`.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

## Demo accounts

Sign in at `/signin` with the demo buttons, or with any email and a password of 6+ characters.

| Account | Role | Can |
| --- | --- | --- |
| `sam@example.com` | Customer | Browse, add to bag, check out, see orders, wishlist, fit profile |
| `admin@crate.store` (any `@crate.store`) | Admin | Everything above, plus `/admin`: edit products, photos, homepage sections and the wear carousel |

Guests can browse. Adding to the bag or checking out sends them to sign in.

## Where each design lives

| Design | Route / component |
| --- | --- |
| 2a Home · Grid (+ 2b countdown) | `/` (`app/page.tsx`, `components/DropBar.tsx`) |
| 2c Category · Grid (+ 2d index as a toggle) | `/shop/[category]` (`new`, `tops`, `bottoms`, `outerwear`, `accessories`) |
| 2e Product · Grid (+ 2f limited-run counter) | `/product/[id]` |
| 2g Cart drawer / bottom sheet | `components/BagDrawer.tsx` |
| 2i Checkout | `/checkout` |
| 2k Account (+ 2l member strip) | `/account` |
| 2m Search | `/search?q=` |
| 3a / 3b Size guide + fit room | `components/FitRoom.tsx`, logic in `lib/fit.ts` |
| 4a Sign in | `/signin` |
| 4b Admin | `/admin` |
| 5a / 5b Wear carousel | `/lookbook` and a home section (`components/WearCarousel.tsx`) |

Desktop layouts follow the 1280px frames fluidly. At 760px and below the 390px mobile layouts take over.

## Mock backend (swap before launch)

Nothing here is a real server yet:

- `lib/store.ts`: all state (session, catalogue, bag, orders, users) lives in `localStorage`. Pages only call the exported actions, so replace those with API calls.
- `lib/images.ts`: photos are stored as blobs in IndexedDB, keyed by slot id. Replace with uploads to object storage.
- Sign-in accepts any password, and the role comes from the email. **A real backend must check passwords and roles on the server.** Hiding `/admin` in the browser is not access control.
- Admin edits to text, prices, stock, sections and carousel settings are saved as a draft, and customers see them only after **Publish**. Photo uploads go live straight away.
- Payments are not taken.
