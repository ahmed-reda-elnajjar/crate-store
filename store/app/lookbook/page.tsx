"use client";

import { Footer, Header } from "@/components/Header";
import { WearCarousel } from "@/components/WearCarousel";
import { siteFor, useStore } from "@/lib/store";

/** 5a / 5b Wear carousel as a collection page. Admins get the fit bar and garment strip. */
export default function Lookbook() {
  const s = useStore();
  const site = siteFor(s);
  const admin = s.session.role === "admin";
  return (
    <>
      <Header active="lookbook" />
      <main>
        {admin && (
          <p className="muted" style={{ margin: 0, padding: "16px 32px", fontSize: 13, maxWidth: 820 }}>
            Drop a full-body model photo in the centre, then a <b>cut-out PNG with a transparent background</b> for each garment in the strip below. The garment on the model sits from shoulders to waist; use the fit bar to line it up with your photo.
          </p>
        )}
        <WearCarousel wear={site.wear} products={site.products} editable={admin} standalone />
      </main>
      <Footer />
    </>
  );
}
