# Fotos de la invitación

## Fotos de cada sección

Las cinco fotos principales están en **`src/assets/photos/secciones/`**. Sus nombres corresponden a su posición en la página:

| Sección | Archivo que debes reemplazar | Copia inicial de |
| --- | --- | --- |
| Inicio, junto al botón de la canción | `secciones/01-inicio.jpg` | `hero.jpg` (foto 2) |
| Derecha de «Reserva la fecha» | `secciones/02-reserva-fecha.jpg` | `1.jpg` |
| Izquierda del dress code | `secciones/03-dress-code.jpg` | `32.jpg` |
| Izquierda de regalos | `secciones/04-regalos.jpg` | `38.jpg` |
| Derecha de «Confirma tu asistencia» | `secciones/05-confirmar-asistencia.jpg` | `19.jpg` |

Para elegir una foto nueva, reemplaza el archivo de esa sección conservando **exactamente el nombre y el formato JPG**. Puedes copiar cualquiera de tus fotos originales a esta carpeta con el nombre indicado. Las copias iniciales conservan el mismo contenido visual que ya tenía la página.

Las asignaciones y descripciones accesibles están en `src/config/photos.ts`. Cuando cambies las fotos, actualiza también el texto correspondiente en `imageAlt` para describir la nueva imagen. La foto de inicio también se usa en la vista previa al compartir el sitio.

Después de reemplazar las fotos, comprueba el encuadre con `npm run dev`, o ejecuta `npm run build && npm run preview`. Para publicarlas, sube los archivos nuevos y despliega nuevamente Cloudflare.

## Fotos del carrusel

Los originales permanecen en `src/assets/photos/`: `1.jpg`, `3.jpg` en adelante y `hero.jpg`, que corresponde a la foto 2. Actualmente hay 41 fotos: `1.jpg`, `3.jpg`–`41.jpg` y `hero.jpg`.

Los JPG con nombre numérico se descubren automáticamente y se ordenan numéricamente; `hero.jpg` se inserta en el segundo lugar. Las fotos de `secciones/` son independientes y no se agregan al carrusel. Cambiar una sección no sustituye su foto original en la galería.

Astro genera versiones adaptadas al tamaño de pantalla y miniaturas ligeras del carrusel. La vista ampliada carga un WebP de hasta 1600 px cuando se abre. Los originales se conservan y la duración del carrusel se adapta a la cantidad de imágenes.
