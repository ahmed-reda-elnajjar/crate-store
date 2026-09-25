# CRATE store

The Crate storefront built from the Claude Design handoff (`../project/Crate Store v2.dc.html`, see `../chats/chat1.md`).
Next.js 16 (App Router) + React 19 + TypeScript, styled with the Modernist design system (`app/modernist.css`, copied verbatim) plus `app/crate.css`.

```bash
 D:\claudeAI\cart\crate-store> cd store
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm test           # fit engine unit tests (Node's built-in runner, no extra packages)
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
| 3a / 3b Size guide + fit room | `components/FitRoom.tsx`; fit engine in `lib/fit.ts` (tests in `lib/fit.test.ts`), 3D avatar and garments in `lib/avatar3d.ts`, the lobby stage (three.js) in `components/Lobby3D.tsx`, body profile fields in `components/BodyProfile.tsx` |
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

## Photo try-on (fit room → 03 Real try-on)

Customers can see a photorealistic image of themselves (from a full-body photo) or of the CRATE model wearing 1–3 store pieces (one each of bottoms, tops and outerwear, applied in that order). They can save looks and compare up to three side by side. The 02 tab still decides the size; this tab shows the look and the colours.

1. Copy `.env.example` to `.env.local` and set one provider:
   - `TRYON_PROVIDER=fashn` with `FASHN_API_KEY` ([FASHN try-on v1.6](https://docs.fashn.ai/api-reference/tryon-v1-6)), or
   - `TRYON_PROVIDER=replicate` with `REPLICATE_API_TOKEN` (IDM-VTON), or
   - `TRYON_PROVIDER=mock` to test the UI without a key (the photo comes back unchanged).
2. Restart `npm run dev`. On Vercel, add the same variables under Project → Settings → Environment Variables.

How it works:
- `app/api/tryon/route.ts` receives the photo and garment images (downscaled to ≤1024px in the browser) and calls the provider in `lib/tryon/provider.ts`. Keys stay on the server.
- Only signed-in customers can use it, after ticking a consent box. Each visitor gets `TRYON_DAILY_LIMIT` looks per day. The counter is in memory, so move it to a database for production.
- The store keeps nothing on the server. The customer's photo, generated images and saved looks stay in their browser (IndexedDB), and "Delete my photos and looks" removes them. The provider's own retention policy still applies to images sent to it.
- A repeat of the same photo and pieces comes from the browser cache and doesn't use the daily limit.
- Pieces need a product photo: a built-in one (`public/products`) or one an admin uploads in Admin → Products.

## Your own 3D avatar and garments (fit room 02)

The fit room draws a built-in avatar and garments from the measurements. To use your own models instead:

1. **Avatar**: one `.glb` (glTF binary, textures embedded), in metres, Y up, facing +Z (towards the camera), standing straight with arms slightly away from the body. An idle animation in the file plays on loop.
2. **Garments**: one `.glb` per product, modelled or simulated **on that avatar, in the same pose**, exported without the avatar. Model each garment in one size (M by default, or set "Modelled in size" under Measurements); other sizes are scaled from it using the size chart. Untextured materials are repainted when a customer picks another colourway, so keep the fabric colour a plain material if you want recolouring.
3. **Upload** in `/admin` (Products → "Fit-room avatar (3D)", and each product's Measurements → "3D file"). Uploads live in that browser, like product photos. To ship files with the site for everyone, put them in `public/models/`, set `AVATAR_FILE` in `lib/models.ts` and `model: "/models/<file>.glb"` on the product in `lib/data.ts`.

The avatar file is used when every piece being worn has its own file; otherwise the look falls back to the built-in avatar and says why. The avatar is scaled to the customer's height and, across the body, to their chest, waist and hips against a 178 cm / chest 98 reference.
