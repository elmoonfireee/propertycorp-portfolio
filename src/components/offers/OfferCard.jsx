import React from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { formatLocation, formatPrice } from "../../domain/offers/offerPresentation.js";
export { formatLocation, formatPrice };

export function getPrimaryOfferImage(offer) {
  return offer.images[0] || null;
}

export function OfferCard({ offer, index }) {
  const image = getPrimaryOfferImage(offer);
  return (
    <article className={`home-offer-card home-offer-card--${index + 1}`}>
      <a className="home-offer-card__image" href={buildOfferPath(offer)} aria-label={`Zobacz ofertę: ${offer.title}`}>
        {image ? <img src={image.url} alt={offer.title} loading="lazy" /> : <div className="home-offer-card__no-image" aria-hidden="true">PropertyCorp</div>}
        <span className="home-offer-card__index">0{index + 1}</span>
        <span className="home-offer-card__arrow"><ArrowUpRight aria-hidden="true" /></span>
      </a>
      <div className="home-offer-card__body">
        <p><MapPin aria-hidden="true" />{formatLocation(offer.location) || "Wrocław i okolice"}</p>
        <h3><a href={buildOfferPath(offer)}>{offer.title}</a></h3>
        <div><strong>{formatPrice(offer)}</strong><span>{offer.area ? `${offer.area} m²` : ""}{offer.rooms ? ` · ${offer.rooms} pok.` : ""}</span></div>
      </div>
    </article>
  );
}
