# Campus Master Lab IA — Juego multijugador 🧪✦

Mundo social 2D del estilo Club Penguin / Habbo para la comunidad de
Master Lab IA: salas, chat de proximidad, voz, monedas Spark y mini-juegos.

> **Estado: Prototipo Fase 1** — Plaza Central jugable en single-player:
> movimiento por click/tap y teclado (WASD/flechas), monedas Spark
> coleccionables con contador, pseudo-profundidad y área caminable con
> colisiones por polígono.

## Jugar localmente

```bash
cd game
python3 -m http.server 8099
# abre http://localhost:8099
```

No requiere build ni dependencias: Phaser 3 va incluido (`phaser.min.js`).

## Estructura

- `index.html` — juego completo (overlay de bienvenida, HUD, escena Phaser)
- `assets/plaza.jpg` — mapa de la Plaza Central (generado con IA, estilo cel-shaded)
- `assets/player.png` — avatar científico con bata Master Lab (fondo transparente)
- `assets/coin.png` — moneda Spark ✦
- `phaser.min.js` — motor Phaser 3.85

## Roadmap

1. ✅ **Fase 1** — sala jugable single-player (este prototipo)
2. ⬜ **Fase 2** — multijugador en tiempo real (Colyseus), chat de texto por proximidad
3. ⬜ **Fase 3** — selector de avatar (piel/cabello/bata/accesorios) + persistencia
4. ⬜ **Fase 4** — voz por proximidad (LiveKit, audio espacial)
5. ⬜ **Fase 5** — más salas (Café IA, Sala de Juegos, Auditorio) + mini-juegos
6. ⬜ **Fase 6** — tienda de cosméticos, tabla de líderes, eventos en vivo

## Assets

Todo el arte se genera con IA vía Higgsfield (GPT Image 2) siguiendo la
guía de estilo: render 3D estilizado tipo Oddsparks/Supercell (materiales clay, iluminación de estudio), paleta Master Lab IA
(azul `#1E1EFF`, tinta `#0A0A23`, neblina `#F4F4FF`), ambientación de
laboratorio de inteligencia artificial, bata como prenda insignia.

> Este directorio vive temporalmente en el repo `clase-laboratorio`
> (rama de trabajo separada). Se migrará al repo dedicado
> `masterlab-game` cuando esté creado.

## Servidor multijugador (Fase 2)

```bash
cd game/server
npm install
npm start          # ws://localhost:2567
```

Con el servidor corriendo, abre el juego en varias pestañas/dispositivos:
los jugadores se ven en tiempo real, las monedas son del servidor
(recolección validada, anti-trampas) y el chat es de proximidad
(solo te leen a menos de ~360px). Sin servidor, el juego cae a modo
offline single-player automáticamente.
