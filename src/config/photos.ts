import type { ImageMetadata } from 'astro';
import hero from '../assets/photos/hero.jpg';

// Only numbered personal photos are included; legacy photo-*.jpg and hero2.jpg are excluded.
const files = import.meta.glob<{ default: ImageMetadata }>('../assets/photos/[0-9]*.jpg', { eager: true });
const descriptions: Record<number, { alt: string; caption: string }> = {
  1: { alt: 'Akion y Mariamalia abrazados junto a un árbol', caption: 'El comienzo' },
  2: { alt: 'Akion y Mariamalia durante su sesión de pareja', caption: 'Nuestro para siempre' },
  3: { alt: 'Mariamalia se acerca a Akion junto a un tronco en el jardín', caption: 'Un paso hacia ti' },
  4: { alt: 'Akion y Mariamalia sonríen sentados en un tronco', caption: 'Contigo, siempre' },
  5: { alt: 'Akion y Mariamalia se toman de las manos en el jardín', caption: 'De tu mano' },
  6: { alt: 'Akion mira a Mariamalia entre los árboles', caption: 'Solo tú' },
  7: { alt: 'Akion y Mariamalia se abrazan y se besan en el jardín', caption: 'Nuestro lugar' },
  8: { alt: 'Akion lleva a Mariamalia en brazos entre los árboles', caption: 'Juntos es mejor' },
  9: { alt: 'Detalle de las manos entrelazadas de Akion y Mariamalia', caption: 'Así, cerquita' },
  10: { alt: 'Akion y Mariamalia se miran sentados sobre una manta', caption: 'Una mirada' },
  11: { alt: 'Akion y Mariamalia comparten un momento sentados en el césped', caption: 'Nuestro rincón' },
  12: { alt: 'Akion y Mariamalia recostados juntos sobre una manta clara', caption: 'Un ratito más' },
  13: { alt: 'Akion abraza a Mariamalia por la espalda en el jardín', caption: 'Mi abrazo favorito' },
  14: { alt: 'Mariamalia abraza a Akion por los hombros mientras sonríen', caption: 'Tu alegría' },
  15: { alt: 'Mariamalia acaricia el rostro de Akion', caption: 'Con ternura' },
  16: { alt: 'Mariamalia ríe junto a Akion sentados en un tronco', caption: 'Nuestra risa' },
  17: { alt: 'Akion sostiene a Mariamalia en sus brazos junto a los árboles', caption: 'En tus brazos' },
  18: { alt: 'Mariamalia se inclina hacia Akion recostado sobre una manta', caption: 'Un instante contigo' },
  19: { alt: 'Akion hace girar a Mariamalia mientras bailan en el jardín', caption: '¿Bailamos?' },
  20: { alt: 'Akion besa la mano de Mariamalia mientras ella sonríe', caption: 'Con todo mi cariño' },
  21: { alt: 'Akion y Mariamalia caminan juntos por el césped', caption: 'Nuestro camino' },
  22: { alt: 'Akion contempla a Mariamalia desde el césped', caption: 'Mi persona favorita' },
  23: { alt: 'Akion y Mariamalia sonríen juntos sobre una manta', caption: 'La vida contigo' },
  24: { alt: 'Detalle de las manos de Akion y Mariamalia durante un abrazo', caption: 'Tan cerca' },
  25: { alt: 'Akion y Mariamalia sentados frente a frente sobre una manta', caption: 'Tiempo para nosotros' },
  26: { alt: 'Akion y Mariamalia se miran recostados sobre una manta', caption: 'Sin prisa' },
  27: { alt: 'Akion y Mariamalia comparten un beso recostados en el jardín', caption: 'Nuestro pequeño mundo' },
  28: { alt: 'Detalle del anillo de Mariamalia durante un abrazo', caption: 'Una promesa' },
  29: { alt: 'Mariamalia abraza a Akion sentados juntos en el césped', caption: 'Aquí, contigo' },
  30: { alt: 'Akion y Mariamalia se abrazan sentados bajo los árboles', caption: 'Amor del bonito' },
  31: { alt: 'Mariamalia se inclina para besar a Akion sentado en el césped', caption: 'Un beso más' },
  32: { alt: 'Akion y Mariamalia de pie y abrazados en el jardín', caption: 'Tú y yo' },
  33: { alt: 'Mariamalia enmarcada por las manos de Akion formando un corazón', caption: 'Desde mi corazón' },
  34: { alt: 'Akion y Mariamalia tomados de las manos junto a un árbol', caption: 'Elegirnos cada día' },
  35: { alt: 'Mariamalia sonríe mientras acaricia la cabeza de Akion', caption: 'Todo empieza contigo' },
  36: { alt: 'Akion sostiene a Mariamalia en un abrazo entre los árboles', caption: 'Sí a esta aventura' },
  37: { alt: 'Akion y Mariamalia se miran de cerca sobre una manta', caption: 'Nuestro momento' },
  38: { alt: 'Primer plano de las manos de Akion y Mariamalia unidas', caption: 'Siempre de tu mano' },
  39: { alt: 'Akion y Mariamalia caminan de la mano bajo los árboles', caption: 'Lo que viene' },
};

const numbered = Object.entries(files)
  .map(([path, image]) => ({ number: Number(path.match(/\/(\d+)\.jpg$/)![1]), src: image.default }))
  .sort((a, b) => a.number - b.number);
const sectionPhoto = (number: number) => {
  const photo = numbered.find(photo => photo.number === number);
  if (!photo) throw new Error(`Missing section photo: src/assets/photos/${number}.jpg`);
  return photo.src;
};

export const images = { hero, date: sectionPhoto(1), dressCode: sectionPhoto(32), gifts: sectionPhoto(38), rsvp: sectionPhoto(19) };
export const imageAlt = {
  hero: 'Detalle de las manos y el anillo de Mariamalia durante un abrazo con Akion',
  date: descriptions[1].alt,
  dressCode: descriptions[32].alt,
  gifts: descriptions[38].alt,
  rsvp: descriptions[19].alt,
};
export const gallery = numbered.map(photo => ({
  src: photo.src,
  ...(descriptions[photo.number] ?? { alt: `Akion y Mariamalia, momento ${photo.number}`, caption: `Un recuerdo juntos · ${photo.number}` }),
}));
// Photo 2 was intentionally named hero.jpg; keep it in its numeric place in the gallery.
gallery.splice(1, 0, { src: hero, alt: imageAlt.hero, caption: 'Nuestro para siempre' });
