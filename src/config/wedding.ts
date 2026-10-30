import { images, imageAlt, gallery } from './photos';

// Confirmed: January 29, 2027, arrival 14:30 and ceremony 15:00, Costa Rica time.
/** Edit the wedding content here. Section assignments and gallery captions are in ./photos.ts. */
export const wedding = {
  partnerOne: "Akion",
  partnerTwo: "Mariamalia",

  weddingDate: "2027-01-29T14:30:00-06:00",
  timeZone: "America/Costa_Rica",
  invitationMessage:
    "Después de tantas aventuras, elegimos la más bonita de todas: compartir la vida. Queremos que seas parte de este comienzo.",

  venueName: "Sala de Eventos Laureal",
  venueAddress: "Sala de Eventos Laureal",
  city: "Heredia, Costa Rica",
  transportNote: "Recomendamos llegar 30 minutos antes. Habrá estacionamiento disponible.",
  wazeUrl:
    "https://ul.waze.com/ul?place=ChIJ-YaEuY76oI8RxaHlyJacu7c&ll=10.01333470%2C-84.13765630&navigate=yes&utm_campaign=live_map&utm_source=mariamalia-akion&utm_medium=lm_share_location",
  googleMapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Sala%20de%20Eventos%20Laureal",
  venueMapEmbedUrl:
    "https://embed.waze.com/iframe?zoom=16&lat=10.013335&lon=-84.137656&ct=livemap",

  dressCodeTitle: "Formal tropical",
  dressCodeDescription:
    "Elegante, fresco y listo para bailar. Trajes livianos y vestidos largos o midi son bienvenidos.",
  dressCodeNote: "Reservemos estos tonos para los novios. Por favor, evita el blanco, ivory, crema muy clara, beige muy claro y champagne muy pálido.",
  guestColors: [
    { name: "Olive", hex: "#68702D" },
    { name: "Sage", hex: "#9A9A7A" },
    { name: "Navy", hex: "#1F2E46" },
    { name: "Cocoa", hex: "#5A4032" },
    { name: "Espresso", hex: "#3A2518" },
    { name: "Taupe", hex: "#A28B7C" },
    { name: "Mushroom", hex: "#7D6A5A" },
    { name: "Charcoal", hex: "#2B2B2B" },
    { name: "Gold", hex: "#B4935D" },
  ],
  reservedColors: [
    { name: "Blanco", hex: "#FFFFFF" },
    { name: "Ivory", hex: "#F8F4E6" },
    { name: "Crema muy clara", hex: "#F2EBDD" },
    { name: "Beige muy claro", hex: "#EADDC8" },
    { name: "Champagne muy pálido", hex: "#E8DCC6" },
  ],

  giftMessage:
    "Si además deseas obsequiarnos algo, puedes ayudarnos a construir nuestra próxima aventura.",
  giftSummary: "La información se compartirá próximamente",
  giftDetails: "", // Example: "SINPE: 8888-8888 · Cuenta IBAN: CR00 0000..."

  rsvpDeadline: "2027-01-01T23:59:59-06:00",

  // Add a licensed MP3 to public/audio/ and use its /audio/ URL here.
  music: {
    src: "/audio/song.mp3",
    volume: 0.50,
    ambientFallback: true,
  },

  images,
  imageAlt,
  gallery,
  timeline: [
    { time: "14:30", title: "Bienvenida", detail: "Lleguemos con tiempo para compartir." },
    { time: "15:00", title: "Ceremonia", detail: "El comienzo de nuestro para siempre." },
  ],
} as const;
