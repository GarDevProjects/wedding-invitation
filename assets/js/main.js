(function () {
  "use strict";

  const config = window.WEDDING_CONFIG;
  if (!config) {
    console.error("Wedding configuration is missing.");
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const locale = "es-CR";
  const weddingDate = new Date(config.weddingDate);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const formatPart = (options) =>
    capitalize(
      new Intl.DateTimeFormat(locale, { timeZone: config.timeZone, ...options }).format(weddingDate),
    );

  const display = {
    ...config,
    dayName: formatPart({ weekday: "long" }),
    dayNumber: new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      timeZone: config.timeZone,
    }).format(weddingDate),
    monthName: formatPart({ month: "long" }),
    year: new Intl.DateTimeFormat(locale, {
      year: "numeric",
      timeZone: config.timeZone,
    }).format(weddingDate),
    shortDate: new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: config.timeZone,
    })
      .format(weddingDate)
      .replaceAll("/", " · "),
    fullDate: capitalize(
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: config.timeZone,
      }).format(weddingDate),
    ),
    time: new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: config.timeZone,
    }).format(weddingDate),
    rsvpDeadline: capitalize(
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: config.timeZone,
      }).format(new Date(config.rsvpDeadline)),
    ),
  };

  function hydrateContent() {
    $$('[data-text]').forEach((element) => {
      const key = element.dataset.text;
      if (display[key] !== undefined) element.textContent = display[key];
    });

    $$('[data-image]').forEach((image) => {
      const source = config.images?.[image.dataset.image];
      if (source) image.src = source;
    });

    $$('[data-link="waze"]').forEach((link) => {
      link.href = config.wazeUrl;
    });

    document.title = `${config.partnerOne} & ${config.partnerTwo} — Nuestra boda`;

    const copyButton = $(".copy-gift");
    if (config.giftDetails?.trim()) copyButton.hidden = false;
  }

  function hideLoader() {
    const loader = $(".page-loader");
    if (!loader) return;
    loader.classList.add("is-hidden");
    window.setTimeout(() => loader.remove(), 900);
  }

  function initMenu() {
    const toggle = $(".menu-toggle");
    const menu = $(".nav-links");
    if (!toggle || !menu) return;

    const closeMenu = () => {
      toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      document.body.classList.remove("menu-open");
    };

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("is-open", !open);
      document.body.classList.toggle("menu-open", !open);
    });

    $$("a", menu).forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  function initRevealAnimations() {
    const elements = $$(".reveal");
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -7%" },
    );

    elements.forEach((element) => observer.observe(element));
  }

  function initHeroParallax() {
    const image = $(".hero__image");
    if (!image || reducedMotion.matches) return;

    let ticking = false;
    const update = () => {
      const distance = Math.min(window.scrollY, window.innerHeight);
      image.style.transform = `translate3d(0, ${distance * 0.13}px, 0)`;
      ticking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true },
    );
  }

  function initCountdown() {
    const output = {
      days: $('[data-count="days"]'),
      hours: $('[data-count="hours"]'),
      minutes: $('[data-count="minutes"]'),
      seconds: $('[data-count="seconds"]'),
    };

    const render = () => {
      const difference = weddingDate.getTime() - Date.now();
      if (difference <= 0) {
        const countdown = $(".countdown");
        if (countdown) countdown.innerHTML = "<p>Hoy celebramos nuestro para siempre ✦</p>";
        window.clearInterval(timer);
        return;
      }

      const totalSeconds = Math.floor(difference / 1000);
      const values = {
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      };

      Object.entries(values).forEach(([key, value]) => {
        if (output[key]) output[key].textContent = String(value).padStart(key === "days" ? 3 : 2, "0");
      });
    };

    const timer = window.setInterval(render, 1000);
    render();
  }

  function createCalendarFile() {
    const toIcsDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(weddingDate.getTime() + 6 * 60 * 60 * 1000);
    const escapeIcs = (value) => String(value).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mariamalia & Akion//Wedding Invitation//ES",
      "BEGIN:VEVENT",
      `UID:wedding-${weddingDate.getTime()}@mariamalia-akion`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(weddingDate)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escapeIcs(`Boda de ${config.partnerOne} & ${config.partnerTwo}`)}`,
      `LOCATION:${escapeIcs(`${config.venueName}, ${config.venueAddress}`)}`,
      `DESCRIPTION:${escapeIcs(config.invitationMessage)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "boda-mariamalia-akion.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function initCalendarButtons() {
    $$(".calendar-button").forEach((button) => button.addEventListener("click", createCalendarFile));
  }

  let ambientAudio = null;

  async function startAmbientAudio(volume) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio is not supported");

    const context = new AudioContext();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.025, volume * 0.15), context.currentTime + 2);
    filter.type = "lowpass";
    filter.frequency.value = 950;
    filter.Q.value = 0.6;
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain).connect(filter.frequency);
    filter.connect(master).connect(context.destination);
    lfo.start();

    const frequencies = [130.81, 164.81, 196, 246.94];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 3 - 4;
      gain.gain.value = index === 0 ? 0.35 : 0.15;
      oscillator.connect(gain).connect(filter);
      oscillator.start();
      return oscillator;
    });

    ambientAudio = { context, master, oscillators, lfo };
  }

  async function stopAmbientAudio() {
    if (!ambientAudio) return;
    const { context, master } = ambientAudio;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    window.setTimeout(() => context.close(), 700);
    ambientAudio = null;
  }

  function initMusic() {
    const button = $(".music-button");
    const audio = $(".wedding-audio");
    const label = $(".music-button__label");
    if (!button || !audio) return;

    if (config.music?.src) {
      audio.src = config.music.src;
      audio.volume = Math.min(1, Math.max(0, config.music.volume ?? 0.35));
    }

    button.addEventListener("click", async () => {
      const isPlaying = button.classList.contains("is-playing");
      button.disabled = true;

      try {
        if (isPlaying) {
          if (config.music?.src) audio.pause();
          else await stopAmbientAudio();
          button.classList.remove("is-playing");
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", "Reproducir música");
          if (label) label.textContent = "Nuestra canción";
        } else {
          if (config.music?.src) await audio.play();
          else if (config.music?.ambientFallback) await startAmbientAudio(config.music.volume ?? 0.35);
          else throw new Error("Music source is not configured");
          button.classList.add("is-playing");
          button.setAttribute("aria-pressed", "true");
          button.setAttribute("aria-label", "Pausar música");
          if (label) label.textContent = "Música activada";
        }
      } catch (error) {
        console.error(error);
        if (label) label.textContent = "Agrega tu canción";
      } finally {
        button.disabled = false;
      }
    });
  }

  function initGiftCopy() {
    const button = $(".copy-gift");
    if (!button || !config.giftDetails?.trim()) return;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(config.giftDetails);
        const original = button.textContent;
        button.textContent = "Copiado";
        window.setTimeout(() => (button.textContent = original), 1800);
      } catch {
        button.textContent = "No se pudo copiar";
      }
    });
  }

  function initRsvp() {
    const form = $(".rsvp-form");
    if (!form) return;
    const status = $(".form-status", form);
    const submit = $(".submit-button", form);
    const nameInput = $("#full-name", form);

    nameInput.addEventListener("input", () => nameInput.closest(".field").classList.remove("is-invalid"));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "form-status";
      status.textContent = "";

      if (!nameInput.value.trim()) {
        nameInput.closest(".field").classList.add("is-invalid");
        nameInput.focus();
        return;
      }

      const data = new FormData(form);
      const endpointConfigured = /^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(config.rsvpEndpoint || "");
      const emailConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.rsvpEmail || "");

      if (!endpointConfigured && emailConfigured) {
        const lines = [...data.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
        window.location.href = `mailto:${config.rsvpEmail}?subject=${encodeURIComponent("Confirmación de asistencia")}&body=${encodeURIComponent(lines)}`;
        status.textContent = "Abrimos tu correo para enviar la confirmación.";
        return;
      }

      if (!endpointConfigured) {
        status.classList.add("is-error");
        status.textContent = "La confirmación está lista; falta conectar Formspree en config.js.";
        return;
      }

      submit.disabled = true;
      submit.classList.add("is-loading");
      status.textContent = "Enviando tu respuesta…";

      try {
        const response = await fetch(config.rsvpEndpoint, {
          method: "POST",
          body: data,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("RSVP request failed");
        form.reset();
        status.classList.add("is-success");
        status.textContent = "¡Gracias! Recibimos tu confirmación. Nos vemos pronto ✦";
      } catch {
        status.classList.add("is-error");
        status.textContent = "No pudimos enviar tu respuesta. Intenta de nuevo en un momento.";
      } finally {
        submit.disabled = false;
        submit.classList.remove("is-loading");
      }
    });
  }

  function initGallery() {
    const track = $("[data-gallery-track]");
    const viewport = $(".moments__viewport");
    const lightbox = $(".lightbox");
    if (!track || !viewport || !lightbox || !config.gallery?.length) return;

    const repeated = [...config.gallery, ...config.gallery];
    track.innerHTML = repeated
      .map(
        (photo, index) => {
          const duplicate = index >= config.gallery.length;
          return `
          <figure class="moment-card" tabindex="${duplicate ? -1 : 0}" role="button" data-index="${index % config.gallery.length}" aria-label="Ampliar: ${photo.caption}"${duplicate ? ' aria-hidden="true"' : ""}>
            <img src="${photo.src}" alt="${photo.alt}" loading="lazy" draggable="false">
            <figcaption>${photo.caption}</figcaption>
          </figure>`;
        },
      )
      .join("");

    const setShift = () => {
      const cards = $$(".moment-card", track);
      const duplicateStart = cards[config.gallery.length];
      if (cards[0] && duplicateStart) {
        track.style.setProperty("--gallery-shift", `${duplicateStart.offsetLeft - cards[0].offsetLeft}px`);
      }
    };
    window.addEventListener("resize", setShift);
    window.requestAnimationFrame(setShift);

    const lightboxImage = $("img", lightbox);
    const lightboxCaption = $("p", lightbox);
    let activeIndex = 0;

    const renderLightbox = () => {
      const photo = config.gallery[activeIndex];
      lightboxImage.src = photo.src;
      lightboxImage.alt = photo.alt;
      lightboxCaption.textContent = photo.caption;
    };

    const openLightbox = (index) => {
      activeIndex = index;
      renderLightbox();
      lightbox.showModal();
      document.body.classList.add("lightbox-open");
    };

    $$(".moment-card", track).forEach((card) => {
      card.addEventListener("click", () => openLightbox(Number(card.dataset.index)));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(Number(card.dataset.index));
        }
      });
    });

    $(".lightbox__close", lightbox).addEventListener("click", () => lightbox.close());
    $(".lightbox__prev, .lightbox__nav--prev", lightbox).addEventListener("click", () => {
      activeIndex = (activeIndex - 1 + config.gallery.length) % config.gallery.length;
      renderLightbox();
    });
    $(".lightbox__nav--next", lightbox).addEventListener("click", () => {
      activeIndex = (activeIndex + 1) % config.gallery.length;
      renderLightbox();
    });
    lightbox.addEventListener("close", () => document.body.classList.remove("lightbox-open"));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") $(".lightbox__nav--prev", lightbox).click();
      if (event.key === "ArrowRight") $(".lightbox__nav--next", lightbox).click();
    });

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    viewport.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startScroll = viewport.scrollLeft;
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (dragging) viewport.scrollLeft = startScroll - (event.clientX - startX);
    });
    const stopDragging = () => {
      dragging = false;
    };
    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);
  }

  hydrateContent();
  initMenu();
  initRevealAnimations();
  initHeroParallax();
  initCountdown();
  initCalendarButtons();
  initMusic();
  initGiftCopy();
  initRsvp();
  initGallery();

  hideLoader();
})();
