import hero from "../assets/photos/hero.jpg";
import photo0 from "../assets/photos/photo-0.jpg";
import photo1 from "../assets/photos/photo-1.jpg";
import photo2 from "../assets/photos/photo-2.jpg";
import photo3 from "../assets/photos/photo-3.jpg";
import photo4 from "../assets/photos/photo-4.jpg";
import photo5 from "../assets/photos/photo-5.jpg";
import photo6 from "../assets/photos/photo-6.jpg";
import photo7 from "../assets/photos/photo-7.jpg";
import photo8 from "../assets/photos/photo-8.jpg";

// Confirmed: January 29, 2027, arrival 14:30 and ceremony 15:00, Costa Rica time.
/** Edit the wedding content here. Import replacement photos from src/assets/photos. */
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
  dressCodeNote: "Reservemos el blanco y los tonos marfil para la novia.",

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

  images: {
    hero: hero,
    date: photo0,
    dressCode: photo1,
    venue: photo2,
    gifts: photo3,
    rsvp: photo4,
  },

  gallery: [
    {
      src: photo0,
      alt: "Pareja de recién casados caminando",
      caption: "El comienzo",
    },
    {
      src: photo5,
      alt: "Pareja compartiendo un momento al aire libre",
      caption: "Juntos es mejor",
    },
    {
      src: photo6,
      alt: "Celebración romántica",
      caption: "Sí a la aventura",
    },
    {
      src: photo7,
      alt: "Pareja celebrando su compromiso",
      caption: "Nuestro lugar feliz",
    },
    {
      src: photo8,
      alt: "Detalle de manos de una pareja",
      caption: "De tu mano",
    },
    {
      src: photo1,
      alt: "Una pareja durante una celebración elegante",
      caption: "Para siempre",
    },
  ],
  timeline: [
    { time: "14:30", title: "Bienvenida", detail: "Lleguemos con tiempo para compartir." },
    { time: "15:00", title: "Ceremonia", detail: "El comienzo de nuestro para siempre." },
  ],
} as const;
