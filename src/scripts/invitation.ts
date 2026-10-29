import { wedding } from '../config/wedding';
import { calendarFile } from '../lib/dates';

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!;
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const opening = $<HTMLDialogElement>('.opening');
const openButton = $<HTMLButtonElement>('[data-open-invitation]');
opening.showModal();
const closeOpening = () => { opening.close(); $('.hero__names').setAttribute('tabindex', '-1'); $('.hero__names').focus(); };
openButton.addEventListener('click', closeOpening);

const menuToggle = $<HTMLButtonElement>('.menu-toggle');
const menu = $('.nav-links');
const closeMenu = () => {
  menuToggle.setAttribute('aria-expanded', 'false'); menu.classList.remove('is-open'); document.body.classList.remove('menu-open');
};
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open); document.body.classList.toggle('menu-open', open);
});
$$('a', menu).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
// Keep keyboard focus within the mobile menu while it is expanded.
menuToggle.closest('nav')?.addEventListener('keydown', event => {
  const keyboard = event as KeyboardEvent;
  if (keyboard.key !== 'Tab' || menuToggle.getAttribute('aria-expanded') !== 'true') return;
  const last = $$<HTMLAnchorElement>('a', menu).at(-1)!;
  if (keyboard.shiftKey && document.activeElement === menuToggle) { keyboard.preventDefault(); last.focus(); }
  if (!keyboard.shiftKey && document.activeElement === last) { keyboard.preventDefault(); menuToggle.focus(); }
});

if (reducedMotion.matches || !('IntersectionObserver' in window)) $$('.reveal').forEach(el => el.classList.add('is-visible'));
else {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { threshold: 0.1 });
  $$('.reveal').forEach(el => { el.classList.add('will-reveal'); observer.observe(el); });
}
let ticking = false;
addEventListener('scroll', () => {
  if (ticking || reducedMotion.matches) return;
  ticking = true;
  requestAnimationFrame(() => {
    $('.hero__image').style.transform = `translate3d(0, ${Math.min(scrollY, innerHeight) * 0.13}px, 0)`;
    ticking = false;
  });
}, { passive: true });

const renderCountdown = () => {
  const seconds = Math.max(0, Math.floor((new Date(wedding.weddingDate).getTime() - Date.now()) / 1000));
  const values = { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
  for (const [key,value] of Object.entries(values)) $(`[data-count="${key}"]`).textContent = String(value).padStart(key === 'days' ? 3 : 2, '0');
};
renderCountdown();
setInterval(() => { if (!document.hidden) renderCountdown(); }, 1000);
$$('.calendar-button').forEach(button => button.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([calendarFile()], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'boda-akion-mariamalia.ics'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));

const gift = $<HTMLButtonElement>('.copy-gift');
gift.hidden = !wedding.giftDetails.trim();
gift.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(wedding.giftDetails); gift.textContent = 'Copiado'; }
  catch { gift.textContent = 'No se pudo copiar'; }
  setTimeout(() => gift.textContent = 'Copiar', 2000);
});

// One audio element lives for the entire invitation, independently of React islands.
const audio = new Audio(); audio.preload = 'none'; audio.loop = true; audio.volume = wedding.music.volume;
if (wedding.music.src) audio.src = wedding.music.src;
const musicButton = $<HTMLButtonElement>('.music-button');
const musicLabel = $('.music-button__label');
new IntersectionObserver(([entry]) => musicButton.classList.toggle('is-floating', !entry.isIntersecting)).observe($('.hero'));
let ambient: AudioContext | undefined;
const syncMusic = (playing: boolean) => {
  musicButton.classList.toggle('is-playing', playing); musicButton.setAttribute('aria-pressed', String(playing));
  musicButton.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música');
  musicLabel.textContent = playing ? 'Música activada' : 'Nuestra canción';
};
audio.addEventListener('pause', () => syncMusic(false));
audio.addEventListener('play', () => syncMusic(true));
musicButton.addEventListener('click', async () => {
  musicButton.disabled = true;
  try {
    if (!audio.paused || ambient) {
      audio.pause(); await ambient?.close(); ambient = undefined; syncMusic(false);
    } else if (wedding.music.src) await audio.play();
    else if (wedding.music.ambientFallback) {
      ambient = new AudioContext(); const gain = ambient.createGain(); gain.gain.value = 0.025;
      gain.connect(ambient.destination);
      [130.81, 164.81, 196, 246.94].forEach(frequency => { const oscillator = ambient!.createOscillator(); oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(); });
      await ambient.resume(); syncMusic(true);
    }
  } catch { musicLabel.textContent = 'Música no disponible'; }
  finally { musicButton.disabled = false; }
});

const track = $('[data-gallery-track]');
const viewport = $('.moments__viewport');
const lightbox = $<HTMLDialogElement>('.lightbox');
const cards = $$('.moment-card', track);
let activeIndex = 0;
let returnFocus: HTMLElement | undefined;
const shift = () => track.style.setProperty('--gallery-shift', `${cards[wedding.gallery.length].offsetLeft - cards[0].offsetLeft}px`);
new ResizeObserver(shift).observe(track);
requestAnimationFrame(shift);
const renderPhoto = () => {
  const cardImage = $<HTMLImageElement>('img', cards[activeIndex]);
  const image = $<HTMLImageElement>('img', lightbox);
  image.src = cards[activeIndex].dataset.fullSrc || cardImage.currentSrc || cardImage.src; image.alt = cardImage.alt;
  $('p', lightbox).textContent = `${wedding.gallery[activeIndex].caption} · ${activeIndex + 1} / ${wedding.gallery.length}`;
};
const showPhoto = (card: HTMLElement) => {
  activeIndex = Number(card.dataset.index); returnFocus = card; renderPhoto(); lightbox.showModal(); document.body.classList.add('lightbox-open');
};
cards.forEach(card => {
  card.addEventListener('click', () => showPhoto(card));
  card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPhoto(card); } });
});
$('.lightbox__close', lightbox).addEventListener('click', () => lightbox.close());
const changePhoto = (direction: number) => { activeIndex = (activeIndex + direction + wedding.gallery.length) % wedding.gallery.length; renderPhoto(); };
$('.lightbox__nav--prev', lightbox).addEventListener('click', () => changePhoto(-1));
$('.lightbox__nav--next', lightbox).addEventListener('click', () => changePhoto(1));
lightbox.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') changePhoto(-1); if (event.key === 'ArrowRight') changePhoto(1); });
lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
lightbox.addEventListener('close', () => { document.body.classList.remove('lightbox-open'); returnFocus?.focus(); });
let drag: { x: number; scroll: number } | undefined;
let dragged = false;
viewport.addEventListener('pointerdown', event => { drag = { x: event.clientX, scroll: viewport.scrollLeft }; dragged = false; });
viewport.addEventListener('pointermove', event => {
  if (!drag || Math.abs(event.clientX - drag.x) < 8) return;
  dragged = true; viewport.setPointerCapture(event.pointerId); viewport.scrollLeft = drag.scroll - (event.clientX - drag.x);
});
viewport.addEventListener('click', event => { if (dragged) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
viewport.addEventListener('pointerup', () => { drag = undefined; });
viewport.addEventListener('pointercancel', () => { drag = undefined; });
viewport.addEventListener('keydown', event => {
  if (event.target !== viewport) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); viewport.scrollBy({ left: event.key === 'ArrowRight' ? 300 : -300, behavior: reducedMotion.matches ? 'instant' : 'smooth' }); }
});
