/**
 * EDIT THIS FILE to personalize the invitation.
 * All dates use Costa Rica time (UTC-06:00) by default.
 * Local photos can be written as "assets/images/my-photo.jpg".
 */
window.WEDDING_CONFIG = {
  partnerOne: "Mariamalia",
  partnerTwo: "Akion",

  // Replace this placeholder date with the real ceremony date and time.
  weddingDate: "2027-12-12T16:00:00-06:00",
  timeZone: "America/Costa_Rica",
  invitationMessage:
    "Después de tantas aventuras, elegimos la más bonita de todas: compartir la vida. Queremos que seas parte de este comienzo.",

  venueName: "Lugar de la celebración",
  venueAddress: "Agrega aquí la dirección exacta",
  city: "San José, Costa Rica",
  transportNote: "Recomendamos llegar 30 minutos antes. Habrá estacionamiento disponible.",
  wazeUrl:
    "https://www.waze.com/ul?q=San%20Jos%C3%A9%2C%20Costa%20Rica&navigate=yes&utm_source=mariamalia-akion",

  dressCodeTitle: "Formal tropical",
  dressCodeDescription:
    "Elegante, fresco y listo para bailar. Trajes livianos y vestidos largos o midi son bienvenidos.",
  dressCodeNote: "Reservemos el blanco y los tonos marfil para la novia.",

  giftMessage:
    "Si además deseas obsequiarnos algo, puedes ayudarnos a construir nuestra próxima aventura.",
  giftSummary: "La información se compartirá próximamente",
  giftDetails: "", // Example: "SINPE: 8888-8888 · Cuenta IBAN: CR00 0000..."

  rsvpDeadline: "2027-11-01T23:59:59-06:00",
  rsvpEndpoint: "", // Example: "https://formspree.io/f/xxxxxxxx"
  rsvpEmail: "", // Optional fallback if Formspree is not configured.

  // Add a licensed MP3 to assets/audio/ and use its path here.
  music: {
    src: "assets/audio/song.mp3",
    volume: 0.50,
    ambientFallback: true,
  },

  images: {
    hero: "assets/images/hero.jpg",
    date: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1000&q=85",
    dressCode: "https://images.unsplash.com/photo-1544078751-58fee2d8a03b?auto=format&fit=crop&w=1000&q=85",
    venue: "https://images.unsplash.com/photo-1507501336603-6e31db2be093?auto=format&fit=crop&w=1000&q=85",
    gifts: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1000&q=85",
    rsvp: "https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1000&q=85",
  },

  gallery: [
    {
      src: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=900&q=85",
      alt: "Pareja de recién casados caminando",
      caption: "El comienzo",
    },
    {
      src: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=85",
      alt: "Pareja compartiendo un momento al aire libre",
      caption: "Juntos es mejor",
    },
    {
      src: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=900&q=85",
      alt: "Celebración romántica",
      caption: "Sí a la aventura",
    },
    {
      src: "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?auto=format&fit=crop&w=900&q=85",
      alt: "Pareja celebrando su compromiso",
      caption: "Nuestro lugar feliz",
    },
    {
      src: "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=900&q=85",
      alt: "Detalle de manos de una pareja",
      caption: "De tu mano",
    },
    {
      src: "https://images.unsplash.com/photo-1544078751-58fee2d8a03b?auto=format&fit=crop&w=900&q=85",
      alt: "Una pareja durante una celebración elegante",
      caption: "Para siempre",
    },
  ],
};
