# 🚀 Deploy del Campus Master Lab IA

El juego es **un solo servicio**: el servidor Node (Colyseus) sirve también
el cliente. Una URL para todo (juego + WebSocket en el mismo origen).

## Opción recomendada: Render.com (~10 minutos)

1. Crea una cuenta en https://render.com (puedes entrar con GitHub).
2. **New → Blueprint** y conecta el repositorio `ruvadg/Clase-laboratorio`
   (autoriza el acceso de Render a GitHub cuando lo pida).
3. Render detecta `render.yaml` automáticamente → **Apply**.
   - Rama a desplegar: la rama del juego (o `main` cuando se fusione).
4. En ~2 minutos tendrás tu URL: `https://masterlab-game.onrender.com`
   ¡Esa es la URL para compartir con los alumnos! 🎉

### Notas del plan gratuito
- El servicio **se duerme tras ~15 min sin uso** y tarda ~40s en despertar
  a la primera visita. Perfecto para "prender solo cuando hay evento".
- ⚠️ Los datos (`server/data/users.json`) viven en disco **efímero**: se
  reinician al re-desplegar o reiniciar. Para conservar cuentas y Master
  Coins entre reinicios sube al plan Starter ($7/mes) y agrega un
  **Disk** montado en `/opt/render/project/src/game/server/data`.

## Alternativa: Railway.app
1. https://railway.app → New Project → Deploy from GitHub repo.
2. Root directory: `game/server` · Start command: `node index.js`.
3. Agrega un **Volume** montado en `game/server/data` (persistencia real).
   Costo típico: ~$5/mes con volumen incluido.

## Primer arranque en producción
1. Abre la URL, crea la cuenta del administrador (p. ej. `Jorge`).
2. En el servidor, edita `server/data/users.json` y agrega
   `"role": "admin"` a esa cuenta (en Render: pestaña Shell del servicio).
3. Reinicia el servicio. ¡El Panel de Host ⚡ ya es tuyo!

## Desarrollo local
```bash
cd game/server && npm install && node index.js
# abre http://localhost:2567
```

## 🎤 Activar la voz por proximidad (LiveKit)

La voz viene integrada pero apagada hasta configurar LiveKit (~5 minutos):

1. Crea una cuenta gratis en https://cloud.livekit.io
2. Crea un proyecto → en **Settings → Keys** copia estos 3 valores:
   - URL del proyecto (`wss://tuproyecto-xxxx.livekit.cloud`)
   - API Key
   - API Secret
3. En Render → tu servicio → **Environment** → agrega:
   - `LIVEKIT_URL` = la URL wss
   - `LIVEKIT_API_KEY` = la key
   - `LIVEKIT_API_SECRET` = el secret
4. Guarda (Render redespliega solo). ¡Listo!

Al entrar al juego aparecerá el botón 🔇 abajo a la derecha:
- Tócalo para encender tu micrófono 🎤 (el navegador pedirá permiso)
- **Escuchas según la distancia**: quien está a tu lado se oye al 100%,
  se desvanece con la lejanía y a media sala ya no se oye
- Cada sala del campus es un canal de voz independiente
- Quien está hablando muestra 🎙 junto a su nombre

Plan gratuito de LiveKit Cloud: hasta 100 participantes simultáneos y
minutos de sobra para eventos semanales de una academia.
