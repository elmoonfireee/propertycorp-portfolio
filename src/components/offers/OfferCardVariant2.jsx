import React from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { formatLocation, formatPrice, getPrimaryOfferImage } from "./OfferCard.jsx";
import { formatOfferArea, formatOfferFloor, formatOfferRoomCount } from "./offerCardContent.js";

export function OfferCardVariant2({ offer, href = buildOfferPath(offer), priority = false }) {
  const image = getPrimaryOfferImage(offer);
  const location = formatLocation(offer.location) || "Wrocław i okolice";
  const facts = [formatOfferRoomCount(offer.rooms), formatOfferFloor(offer.floor)].filter(Boolean);

  return (
    <article className="offers-listing-card-v2">
      <a href={href} aria-label={`Zobacz ofertę: ${offer.title}`}>
        <div className="offers-listing-card-v2__visual">
          {image ? (
            <img src={image.url} alt={offer.title} loading={priority ? "eager" : "lazy"} sizes="(max-width: 700px) calc(100vw - 36px), (max-width: 1050px) calc((100vw - 76px) / 2), (max-width: 1480px) calc((100vw - 12vw - 56px) / 3), 450px" />
          ) : (
            <div className="offers-listing-card-v2__fallback" aria-hidden="true">PropertyCorp</div>
          )}
          <span className="offers-listing-card-v2__ribbon">
            <i>Powierzchnia</i>
            <strong>{formatOfferArea(offer.area)}</strong>
          </span>
        </div>
        <div className="offers-listing-card-v2__body">
          <p className="offers-listing-card-v2__location"><MapPin aria-hidden="true" />{location}</p>
          <h2>{offer.title}</h2>
          <strong className="offers-listing-card-v2__price">{formatPrice(offer)}</strong>
          <div className="offers-listing-card-v2__footer">
            <span>{facts.length ? facts.join(" · ") : "Szczegóły na zapytanie"}</span>
            <span className="offers-listing-card-v2__cta">Zobacz <ArrowUpRight aria-hidden="true" /></span>
          </div>
        </div>
      </a>
    </article>
  );
}
