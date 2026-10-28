# Existing image provenance

The local hero is the photo supplied in the original repository. These other images preserve the original Unsplash placeholders; replace them with licensed wedding photos before distribution. They are now downloaded at build source, not requested by guests.

- `photo-0.jpg`: https://images.unsplash.com/photo-1511285560929-80b456fea0bc
- `photo-1.jpg`: https://images.unsplash.com/photo-1544078751-58fee2d8a03b
- `photo-2.jpg`: https://images.unsplash.com/photo-1507501336603-6e31db2be093
- `photo-3.jpg`: https://images.unsplash.com/photo-1520854221256-17451cc331bf
- `photo-4.jpg`: https://images.unsplash.com/photo-1529636798458-92182e662485
- `photo-5.jpg`: https://images.unsplash.com/photo-1522673607200-164d1b6ce486
- `photo-6.jpg`: https://images.unsplash.com/photo-1519225421980-715cb0215aed
- `photo-7.jpg`: https://images.unsplash.com/photo-1606216794074-735e91aa2c92
- `photo-8.jpg`: https://images.unsplash.com/photo-1523438885200-e635ba2c371e

Replace imports in `src/config/wedding.ts` when adding new photos. Astro generates responsive AVIF/WebP and JPEG fallbacks.
