import { useEffect } from "react";
import { PROPERTYCORP_URL, formatArea, getOfferSeoDescription, getPublicLocation } from "../../domain/offers/offerPresentation.js";
import { getTypeLabel } from "../../domain/offers/offerListing.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { siteEditionConfig } from "../../config/siteEdition.js";

function setMeta(selector, attributes, created) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    document.head.appendChild(node);
    created.push(node);
    return { node, restore: null };
  }
  const previous = node.getAttribute("content");
  node.setAttribute("content", attributes.content);
  return { node, restore: () => previous == null ? node.removeAttribute("content") : node.setAttribute("content", previous) };
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : undefined;
}

function buildStructuredData(offer, canonical, description) {
  const type = offer.type === "apartment" ? "Apartment" : offer.type === "house" ? "House" : "Place";
  const property = {
    "@type": type,
    "@id": `${canonical}#property`,
    name: offer.title,
    description,
    url: canonical,
    image: offer.images.map((image) => `${PROPERTYCORP_URL}${image.url}`),
    address: {
      "@type": "PostalAddress",
      addressLocality: offer.location.locality || undefined,
      addressRegion: offer.location.region || undefined,
      addressCountry: offer.location.country || "PL",
    },
    floorSize: offer.area == null ? undefined : { "@type": "QuantitativeValue", value: offer.area, unitCode: "MTK" },
    numberOfRooms: offer.rooms ?? undefined,
    floorLevel: offer.floor ?? undefined,
    yearBuilt: offer.yearBuilt ?? undefined,
  };
  const offerSchema = offer.price.amount == null ? undefined : {
    "@type": "Offer",
    url: canonical,
    price: offer.price.amount,
    priceCurrency: offer.price.currency || "PLN",
    seller: { "@type": "Organization", name: "PropertyCorp" },
    itemOffered: { "@id": `${canonical}#property` },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateListing",
        "@id": canonical,
        url: canonical,
        name: offer.title,
        description,
        datePosted: dateOnly(offer.dates.createdAt),
        dateModified: dateOnly(offer.dates.updatedAt),
        primaryImageOfPage: offer.images[0] ? `${PROPERTYCORP_URL}${offer.images[0].url}` : undefined,
        mainEntity: { "@id": `${canonical}#property` },
        offers: offerSchema,
      },
      property,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Oferty", item: `${PROPERTYCORP_URL}/oferty` },
          { "@type": "ListItem", position: 2, name: getTypeLabel(offer.type), item: canonical },
          { "@type": "ListItem", position: 3, name: getPublicLocation(offer.location) || offer.title, item: canonical },
        ],
      },
    ],
  };
}

export function useOfferDetailSeo(offer) {
  useEffect(() => {
    if (!offer) return undefined;
    const canonical = `${PROPERTYCORP_URL}${buildOfferPath(offer)}`;
    const type = getTypeLabel(offer.type);
    const location = getPublicLocation(offer.location);
    const titleParts = [`${type} ${offer.transaction === "rent" ? "na wynajem" : "na sprzedaż"}`, location, formatArea(offer.area)].filter(Boolean);
    const title = `${titleParts.join(", ")} | PropertyCorp`.slice(0, 70);
    const description = getOfferSeoDescription(offer).slice(0, 155);
    const created = [];
    const updates = [];
    const originalTitle = document.title;
    document.title = title;

    updates.push(setMeta('meta[name="description"]', { name: "description", content: description }, created));
    updates.push(setMeta('meta[property="og:title"]', { property: "og:title", content: title }, created));
    updates.push(setMeta('meta[property="og:description"]', { property: "og:description", content: description }, created));
    updates.push(setMeta('meta[property="og:url"]', { property: "og:url", content: canonical }, created));
    if (offer.images[0]) updates.push(setMeta('meta[property="og:image"]', { property: "og:image", content: `${PROPERTYCORP_URL}${offer.images[0].url}` }, created));

    let canonicalNode = null;
    let canonicalCreated = false;
    let originalCanonical = null;
    let script = null;
    if (!siteEditionConfig.noIndex) {
      canonicalNode = document.head.querySelector('link[rel="canonical"]');
      canonicalCreated = !canonicalNode;
      if (!canonicalNode) {
        canonicalNode = document.createElement("link");
        canonicalNode.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalNode);
      }
      originalCanonical = canonicalNode.getAttribute("href");
      canonicalNode.setAttribute("href", canonical);

      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.propertycorpDetail = "true";
      script.textContent = JSON.stringify(buildStructuredData(offer, canonical, description));
      document.head.appendChild(script);
    }

    return () => {
      document.title = originalTitle;
      updates.forEach(({ restore }) => restore?.());
      created.forEach((node) => node.remove());
      if (canonicalNode) {
        if (canonicalCreated) canonicalNode.remove();
        else if (originalCanonical == null) canonicalNode.removeAttribute("href");
        else canonicalNode.setAttribute("href", originalCanonical);
      }
      script?.remove();
    };
  }, [offer]);
}
