import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getAllOffers } from "../../services/offers/index.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { siteEditionConfig } from "../../config/siteEdition.js";

const generalTopics = [
  ["general", "Ogólne zapytanie"],
  ["sale", "Chcę sprzedać nieruchomość"],
  ["rent", "Chcę wynająć nieruchomość"],
];

function offerLabel(offer) {
  const location = offer.location.locality || offer.location.municipality || "Wrocław i okolice";
  return `${offer.title} — ${location}`;
}

export function ContactForm({ selectedOfferId, onSubmit }) {
  const topicPickerEnabled = false;
  const [offers, setOffers] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errors, setErrors] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(selectedOfferId ? `offer:${selectedOfferId}` : "general");

  useEffect(() => {
    if (!topicPickerEnabled) return undefined;
    let mounted = true;
    getAllOffers({ sort: "newest" }).then((data) => {
      if (mounted) setOffers(data);
    }).catch(() => {
      if (mounted) setStatus("source-error");
    });
    return () => { mounted = false; };
  }, [topicPickerEnabled]);

  useEffect(() => {
    if (selectedOfferId) setSelectedTopic(`offer:${selectedOfferId}`);
  }, [selectedOfferId]);

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nextErrors = {};
    if (!data.get("name")?.trim()) nextErrors.name = "Podaj imię i nazwisko.";
    if (!data.get("phone")?.trim()) nextErrors.phone = "Podaj numer telefonu.";
    if (!/^\S+@\S+\.\S+$/.test(data.get("email") || "")) nextErrors.email = "Podaj poprawny adres e-mail.";
    if (!data.get("consent")) nextErrors.consent = "Zgoda na kontakt jest wymagana.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStatus("error");
      return;
    }

    if (!siteEditionConfig.formDeliveryEnabled) {
      setStatus("demo");
      return;
    }

    if (!onSubmit) {
      setStatus("delivery-not-configured");
      return;
    }

    setStatus("loading");
    try {
      await onSubmit({ ...Object.fromEntries(data), selectedTopic });
      setStatus("success");
      form.reset();
    } catch {
      setStatus("delivery-error");
    }
  };

  return (
    <form className="contact-form" onSubmit={submit} noValidate>
      {!siteEditionConfig.formDeliveryEnabled && <p className="contact-form__demo-notice">Wersja demonstracyjna — formularz nie wysyła zapytań.</p>}
      {siteEditionConfig.formDeliveryEnabled && !onSubmit && <p className="contact-form__demo-notice">Wysyłka formularza jest niedostępna. Skontaktuj się telefonicznie lub e-mailem.</p>}
      <label className="contact-form__field"><span>Imię i nazwisko</span><input name="name" autoComplete="name" aria-invalid={Boolean(errors.name)} />{errors.name && <small>{errors.name}</small>}</label>
      <div className="contact-form__pair">
        <label className="contact-form__field"><span>Telefon</span><input name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />{errors.phone && <small>{errors.phone}</small>}</label>
        <label className="contact-form__field"><span>E-mail</span><input name="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} />{errors.email && <small>{errors.email}</small>}</label>
      </div>
      {topicPickerEnabled && <label className="contact-form__field"><span>Temat lub nieruchomość</span>
        <select name="topic" value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>
          {generalTopics.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          {offers.map((offer) => <option value={`offer:${offer.id}`} key={offer.id}>{offerLabel(offer)}</option>)}
        </select>
      </label>}
      {topicPickerEnabled && selectedTopic.startsWith("offer:") && offers.some((offer) => `offer:${offer.id}` === selectedTopic) && <a className="contact-form__offer-link" href={buildOfferPath(offers.find((offer) => `offer:${offer.id}` === selectedTopic))}>Zobacz wybraną ofertę</a>}
      <label className="contact-form__field"><span>Wiadomość <i>(opcjonalnie)</i></span><textarea name="message" rows="4" /></label>
      <label className="contact-form__consent"><input name="consent" type="checkbox" aria-invalid={Boolean(errors.consent)} /><span>Wyrażam zgodę na kontakt w sprawie mojego zapytania.</span></label>
      {errors.consent && <small className="contact-form__error">{errors.consent}</small>}
      <button type="submit" disabled={status === "loading"}>{status === "loading" ? "Przygotowujemy wiadomość…" : <>Wyślij zapytanie <ArrowRight aria-hidden="true" /></>}</button>
      <div className="contact-form__status" role="status" aria-live="polite">
        {status === "delivery-not-configured" && "Wysyłka formularza jest jeszcze przygotowywana. Skontaktuj się telefonicznie lub e-mailem."}
        {status === "demo" && "To jest wersja demonstracyjna. Zapytanie nie zostało wysłane."}
        {status === "delivery-error" && "Nie udało się przekazać wiadomości. Spróbuj ponownie lub skontaktuj się telefonicznie."}
        {status === "source-error" && "Lista ofert jest chwilowo niedostępna; nadal możesz wysłać ogólne zapytanie."}
        {status === "success" && "Wiadomość została przekazana."}
      </div>
    </form>
  );
}
