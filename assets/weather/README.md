# Outdoor scene images

The dashboard currently draws **procedural SVG scenes** (trees, sky, snow, rain, fog,
moon/sun). They are the placeholders. Replace them with premium images at any time:

1. Add images here, e.g. `winter-night.webp`, `cold-cloudy-night.webp`, `summer-day.webp`.
2. Register them in `SCENE_ASSETS` in `js/ui/weather-scenes.js`:

```js
export const SCENE_ASSETS = Object.freeze({
  'winter-night': 'assets/weather/winter-night.webp',
  'cold-cloudy-night': 'assets/weather/cold-cloudy-night.webp',
  'summer-day': 'assets/weather/summer-day.webp',
});
```

Lookup order for a scene `{base}-{weather}-{time}`:

1. `{base}-{weather}-{time}`  e.g. `cold-rain-night`
2. `{base}-{time}`            e.g. `cold-night`
3. `{base}`                   e.g. `cold`
4. procedural SVG (always available)

| base     | rule                     |
|----------|--------------------------|
| `winter` | < 0 °C, or weather = snow |
| `cold`   | 0 – 8 °C                 |
| `cool`   | 8 – 15 °C                |
| `mild`   | 15 – 25 °C               |
| `summer` | > 25 °C                  |

weather: `clear`, `partly-cloudy`, `cloudy`, `fog`, `rain`, `snow` · time: `day`, `night`

Image guidelines: 2400×450 px or wider, WebP, < 250 kB, dark exposure (the diagram is
drawn on top), important content in the lower third, no text, no logos. Rain and snow
animation is drawn on top of images automatically.

Files are listed explicitly (no probing) so a Raspberry Pi never requests missing files.
