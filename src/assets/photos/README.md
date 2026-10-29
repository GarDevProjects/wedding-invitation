# Personal photo collection

The active invitation uses the 39 personal photos supplied by Akion and Mariamalia. Photo 2 is intentionally named `hero.jpg`; the other files are `1.jpg` and `3.jpg` through `39.jpg`.

Assignments and accessible gallery descriptions are in `src/config/photos.ts`:

| Placement | Photo |
| --- | --- |
| Hero / social preview | `hero.jpg` (photo 2) |
| Save the date | `1.jpg` |
| Dress code | `32.jpg` |
| Gifts | `38.jpg` |
| RSVP | `19.jpg` |
| Carousel | All 39, in numeric order |

The venue retains its interactive map. Old `photo-*.jpg` placeholders and `hero2.jpg` are not imported or displayed; the originals remain on disk.

Numbered `.jpg` files are discovered automatically and sorted numerically. Add corresponding descriptions in `photos.ts` when adding new images. Keep `hero.jpg` as the cover/photo 2.

Astro produces responsive section images and lightweight carousel thumbnails. The lightbox loads a separate 1600px WebP only when opened, preserving each photo's full composition. Original photos are not modified. Carousel duration scales with the collection size to preserve its scrolling speed.