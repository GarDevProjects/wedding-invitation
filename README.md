# Mariamalia & Akion — Invitación de boda

Una invitación digital editorial, elegante y completamente responsive. Está hecha con HTML, CSS y JavaScript puro para que pueda publicarse gratis en GitHub Pages sin instalar dependencias ni ejecutar un proceso de compilación.

## Lo que ya incluye

- Portada fotográfica horizontal con música activada por el invitado.
- Fecha y hora calculadas desde una sola configuración, con cuenta regresiva en tiempo real.
- Secciones 60/40 y 40/60 para fecha, dress code, ubicación, regalos y RSVP.
- Enlace directo a Waze y archivo de calendario `.ics` descargable.
- Formulario de confirmación con asistencia, número de invitados, restricciones alimentarias y mensaje.
- Carrusel infinito de fotos verticales, pausa al interactuar y galería ampliada.
- Animaciones de entrada, parallax suave, textura editorial y alternativa sin movimiento.
- Diseño adaptado a móvil, navegación por teclado, mensajes accesibles y modo de impresión.
- Fotografías provisionales de Unsplash que puedes sustituir por las propias.

## Personalización rápida

Toda la información editable está en [`assets/js/config.js`](assets/js/config.js). Cambia, como mínimo:

```js
partnerOne: "Mariamalia",
partnerTwo: "Akion",
weddingDate: "2027-12-12T16:00:00-06:00",
venueName: "Nombre del lugar",
venueAddress: "Dirección exacta",
city: "Ciudad, Costa Rica",
wazeUrl: "https://www.waze.com/ul?...",
rsvpDeadline: "2027-11-01T23:59:59-06:00",
```

La zona horaria ya está configurada como `America/Costa_Rica`. El formato de fecha incluye el desfase `-06:00`, así que la cuenta regresiva será correcta incluso para invitados que abran la invitación desde otro país.

### Información pendiente antes de publicar

- Fecha y hora definitivas de la ceremonia.
- Nombre del lugar, dirección exacta y enlace de Waze.
- Hora recomendada de llegada, estacionamiento y/o transporte.
- Código de vestimenta definitivo y colores reservados.
- Fecha límite de confirmación y máximo de acompañantes por invitación.
- Política sobre niños, si aplica.
- Datos de alergias, menú o restricciones alimentarias que desean recopilar.
- Información de regalos, SINPE o transferencia.
- Fotografías finales y canción con licencia de uso.
- Correo que recibirá los RSVP y un número de contacto para dudas.

## Sustituir las fotografías

1. Copia las fotos finales a `assets/images/`.
2. Usa nombres sencillos, por ejemplo `portada.jpg`, `fecha.jpg` y `momento-01.jpg`.
3. En `assets/js/config.js`, reemplaza las direcciones de Unsplash por rutas locales:

```js
images: {
  hero: "assets/images/portada.jpg",
  date: "assets/images/fecha.jpg",
  dressCode: "assets/images/dress-code.jpg",
  venue: "assets/images/lugar.jpg",
  gifts: "assets/images/regalos.jpg",
  rsvp: "assets/images/confirmacion.jpg",
},
```

4. Actualiza también `gallery`. Cada elemento usa `src`, `alt` (descripción accesible) y `caption`.
5. Para que la página cargue rápido, exporta las fotos a WebP o JPEG de aproximadamente 1600–2200 px para portada y 900–1200 px para verticales. Evita subir originales de cámara de muchos megabytes.
6. Actualiza `og:image` en `index.html` con una URL pública de la portada; esa será la miniatura al compartir la invitación por WhatsApp u otras redes.

Las imágenes provisionales usan Unsplash. Su licencia permite descargarlas y utilizarlas gratuitamente, aunque se recomienda atribución; revisa además los derechos de imagen cuando aparezcan personas reconocibles ([licencia oficial de Unsplash](https://unsplash.com/license)). Sustituirlas por sus propias fotos antes de enviar la invitación evita que otras personas aparezcan como si fueran la pareja.

## Agregar la canción

Los navegadores bloquean el audio automático. Por eso la música empieza únicamente cuando el invitado presiona el botón central; mientras no agregues una canción, ese botón reproduce un fondo ambiental generado por el navegador.

1. Usa una canción propia o un archivo para el que tengas permiso.
2. Copia el MP3 a `assets/audio/nuestra-cancion.mp3`.
3. Edita la sección `music` en `assets/js/config.js`:

```js
music: {
  src: "assets/audio/nuestra-cancion.mp3",
  volume: 0.35,
  ambientFallback: true,
},
```

Puedes ajustar `volume` entre `0` y `1`.

## Activar el formulario RSVP gratis

El diseño funciona sin servidor, pero recibir respuestas requiere un destino. La integración preparada usa Formspree: su plan Free parte de 50 envíos mensuales y conserva 30 días de historial, según sus [límites oficiales](https://help.formspree.io/articles/account-management/account-limits).

1. Crea y verifica una cuenta en [Formspree](https://formspree.io/).
2. En el panel, pulsa `+` y luego **New Form**.
3. Abre la sección **Integration** y copia el endpoint, con formato `https://formspree.io/f/xxxxxxxx`. Estos pasos coinciden con la [guía oficial de formularios HTML](https://help.formspree.io/articles/building-your-form/building-an-html-form).
4. Pega la URL en `assets/js/config.js`:

```js
rsvpEndpoint: "https://formspree.io/f/xxxxxxxx",
```

5. Publica el sitio y haz una prueba real. El formulario ya envía con JavaScript y solicita una respuesta JSON, por lo que no saca al invitado de la página.
6. En Formspree, activa notificaciones y, si está disponible en tu configuración, restringe el formulario al dominio publicado para reducir spam.

Si prefieres confirmaciones por correo, deja `rsvpEndpoint` vacío y escribe un correo en `rsvpEmail`. En ese modo, el sitio abre la aplicación de correo del invitado; es menos consistente que Formspree.

## Configurar Waze

1. Abre [Waze Live Map](https://www.waze.com/live-map).
2. Busca el lugar exacto.
3. Pulsa el icono de compartir y copia el enlace de indicaciones.
4. Pégalo en `wazeUrl` dentro de `assets/js/config.js`.

Waze recomienda enlaces HTTPS con base `https://www.waze.com/ul`; en móvil abren la app si está instalada y en computadora abren la web. También puedes usar latitud/longitud y `navigate=yes`, como explica la [documentación oficial de Waze Deep Links](https://developers.google.com/waze/deeplinks?hl=es-419).

## Probar localmente

Para una revisión visual rápida puedes abrir `index.html` con doble clic. Para probar el sitio como se servirá en Internet, abre esta carpeta en VS Code y usa una extensión de servidor local como **Live Server**, o ejecuta uno de estos comandos si tienes Python instalado:

```powershell
py -m http.server 8000
# En instalaciones donde el comando anterior no existe:
python -m http.server 8000
```

Luego abre `http://localhost:8000`. Detén el servidor con `Ctrl+C`.

Prueba al menos:

- Portada, botón de música y navegación en móvil y escritorio.
- Cuenta regresiva y descarga del calendario.
- Enlace de Waze en un teléfono.
- Envío RSVP y recepción del correo.
- Textos largos, tildes y nombres de invitados.
- Navegación con teclado y la opción del sistema “reducir movimiento”.

## Publicar gratis en GitHub Pages

1. Confirma que los archivos estén en la rama `main` y súbelos:

```powershell
git add .
git commit -m "Build wedding invitation"
git push origin main
```

2. En GitHub abre el repositorio **wedding-invitation**.
3. Entra en **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**.
5. Selecciona `main`, carpeta `/(root)`, y pulsa **Save**.
6. Espera a que finalice el despliegue. La dirección normalmente será:

```text
https://gardevprojects.github.io/wedding-invitation/
```

GitHub confirma que un sitio estático puede publicarse directamente desde una rama y desde la carpeta raíz ([documentación oficial de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)).

Para un dominio propio, configúralo primero en **Settings → Pages → Custom domain** y después crea los registros DNS indicados por GitHub. Consulta la [guía oficial de dominios personalizados](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## Privacidad importante

GitHub Pages es público en Internet, incluso cuando ciertos planes permiten que el repositorio fuente sea privado. Todo lo escrito en `config.js` —incluidos SINPE, cuentas, direcciones y el endpoint del formulario— puede ser visto por cualquier visitante.

- No incluyas claves, contraseñas, PIN, documentos de identidad ni credenciales bancarias.
- Publica únicamente los datos de transferencia que entregarías normalmente a tus invitados.
- Si la ubicación o los datos bancarios deben ser privados, comparte esos detalles después del RSVP por un canal privado. Una pantalla de “contraseña” hecha solo con JavaScript no ofrece protección real.
- Revisa las respuestas recopiladas y la política de retención del proveedor del formulario.

## Decisiones de diseño investigadas

El patrón de una sola página mantiene la invitación fácil de consultar desde el teléfono. Las plataformas y plantillas actuales suelen agrupar portada, fecha/cuenta regresiva, ubicación, galería, regalos y RSVP; las guías de Squarespace también priorizan que los invitados puedan encontrar rápidamente la dirección y la información esencial en móvil ([guía de sitios de boda](https://support.squarespace.com/hc/en-us/articles/214138818-Building-a-wedding-site), [ejemplo Webflow con RSVP y countdown](https://webflow.com/templates/html/bridaltnc-wedding-website-template)).

La dirección visual se inspira en invitaciones impresas de lujo: tipografía editorial de gran escala, serif con contraste, caligrafía usada solo como acento, paleta de papel/olivo/rosa viejo, marcos finos y fotografías con tratamiento consistente. La animación apoya la narrativa —entrada, ritmo de scroll y galería— pero no oculta información. El sitio respeta `prefers-reduced-motion`, una preferencia diseñada para reducir animaciones que pueden provocar distracción o malestar ([explicación de web.dev](https://web.dev/articles/prefers-reduced-motion)).

## Estructura

```text
wedding-invitation/
├── index.html
├── .nojekyll
├── assets/
│   ├── favicon.svg
│   ├── audio/
│   ├── images/
│   ├── css/styles.css
│   └── js/
│       ├── config.js   # contenido editable
│       └── main.js     # interacciones
└── README.md
```

No hay dependencias, claves de API ni pasos de compilación.
