# Laboratorio · MasterLab IA

App web para que los alumnos de MasterLab IA propongan el tema de la próxima
clase en vivo y voten por la idea que más les guste. La propuesta con más votos
será la que se construya en el laboratorio.

- 1 propuesta por persona (por IP).
- 1 voto por persona (por IP).
- Panel admin protegido con contraseña para reiniciar la ronda.
- Diseño alineado con la identidad visual de MasterLab IA.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com/)
- [Upstash Redis](https://upstash.com/) (vía la integración del Vercel
  Marketplace) para persistencia. En desarrollo local, sin variables de Redis,
  la app usa un store en memoria — útil para probar, pero los datos se pierden
  al reiniciar.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # opcional: rellena KV_* si quieres persistencia local
npm run dev
```

La app queda en `http://localhost:3000`. El panel admin en `/admin`.

## Despliegue en Vercel

1. Importa el repo en Vercel.
2. En el dashboard del proyecto, **Storage → Marketplace → Upstash Redis →
   Connect** (Vercel sustituyó el antiguo Vercel KV por una integración de
   Upstash en el marketplace). Vercel inyectará las variables
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (y los alias
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) en producción y
   preview automáticamente. La app acepta cualquiera de los dos pares.
3. (Opcional) Variable `ADMIN_PASSWORD` para sobreescribir la contraseña por
   defecto. Si no la defines, se usa `RuvaBase123!`.
4. Deploy.

## Detalles de la lógica

- La identidad de cada alumno se deriva de su IP (`x-forwarded-for`) con un
  hash SHA‑256 + salt. No guardamos la IP en claro.
- Las APIs son:
  - `GET /api/proposals` — lista propuestas y marca si tú ya votaste/propusiste.
  - `POST /api/proposals` — crea propuesta (rechaza si ya tienes una).
  - `POST /api/proposals/[id]/vote` — emite voto (rechaza si ya votaste).
  - `POST /api/admin/reset` — borra todo, requiere `password`.

## Limitaciones

- La detección por IP no es infalible: alumnos compartiendo NAT/VPN pueden ser
  considerados la misma persona; alumnos cambiando de red pueden votar de nuevo.
  Para una clase es un trade‑off razonable: simple, sin login, y suficiente para
  evitar abuso casual.
