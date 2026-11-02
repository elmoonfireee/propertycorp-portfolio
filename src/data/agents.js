const AGENTS = Object.freeze({
  "Osoba Demo A": {
    name: "Osoba Demo A",
    phoneFallback: "000000000",
    emailFallback: "demo@example.test",
    license: null,
    role: "Opiekunka oferty",
    image: "/media/demo/scene.svg",
    imagePosition: "50% 28%",
    imageScale: 1.4,
  },
  "Osoba Demo B": {
    name: "Osoba Demo B",
    phoneFallback: "000000000",
    emailFallback: "demo@example.test",
    license: null,
    role: "Opiekun oferty",
    image: "/media/demo/scene.svg",
    imagePosition: "50% 28%",
    imageScale: 1.4,
  },
});

const PROPERTY_CORP_CONTACT = Object.freeze({
  name: "PropertyCorp",
  phoneFallback: null,
  emailFallback: "demo@example.test",
  license: null,
  role: "Zespół PropertyCorp",
  image: null,
  imagePath: null,
});

export function getOfferAgent(agent = {}) {
  const profile = AGENTS[agent.name] || PROPERTY_CORP_CONTACT;
  return {
    ...profile,
    name: agent.name || profile.name,
    phone: agent.phone || profile.phoneFallback,
    email: agent.email || profile.emailFallback,
    license: agent.licenseNumber || profile.license,
  };
}

export { AGENTS };
