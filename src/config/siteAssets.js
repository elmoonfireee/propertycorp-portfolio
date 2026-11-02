const pendingAsset = (path, purpose) => ({
  path,
  purpose,
  delivered: false,
});

const deliveredAsset = (path, purpose, options = {}) => ({
  path,
  purpose,
  delivered: true,
  ...options,
});

/**
 * Single source of truth for non-offer website media.
 *
 * `delivered` intentionally remains false until the approved file is placed at
 * the declared public path. Components must not render an image while it is
 * false. Offer photography is deliberately not represented here; it comes
 * from the IMO offer API as `/media/offers/...`.
 */
export const siteAssets = {
  brand: {
    logoDark: pendingAsset("/media/demo/scene.svg", "PropertyCorp light logo for dark floating header"),
    favicon: pendingAsset("/media/demo/scene.svg", "Browser favicon"),
    appleTouchIcon: pendingAsset("/media/demo/scene.svg", "Apple touch icon"),
  },
  hero: {
    slides: [
      deliveredAsset("/media/demo/scene.svg", "Homepage hero sequence — exterior", { motion: "pan", position: "50% 50%", mobilePosition: "52% 50%" }),
      deliveredAsset("/media/demo/scene-2.svg", "Homepage hero sequence — interior", { motion: "pan", position: "50% 52%", mobilePosition: "58% 52%" }),
    ],
  },
  team: deliveredAsset("/media/demo/scene.svg", "PropertyCorp team photograph"),
  seo: {
    openGraph: pendingAsset("/media/demo/scene.svg", "Open Graph sharing image"),
  },
};

const allSiteAssets = [
  siteAssets.brand.logoDark,
  siteAssets.brand.favicon,
  siteAssets.brand.appleTouchIcon,
  ...siteAssets.hero.slides,
  siteAssets.team,
  siteAssets.seo.openGraph,
];

const reportedPaths = new Set();

export function warnAboutMissingSiteAsset(asset, { force = false } = {}) {
  if (!import.meta.env.DEV || !asset || (!force && asset.delivered) || reportedPaths.has(asset.path)) return;
  reportedPaths.add(asset.path);
  console.warn(`[site-assets] Asset unavailable: ${asset.path} (${asset.purpose}). Rendering its controlled fallback.`);
}

export function reportMissingSiteAssets() {
  allSiteAssets.forEach(warnAboutMissingSiteAsset);
}
