# Battle Arena Challenge

Juego multijugador web (TEC, CE-1105). Los jugadores se registran, inician sesión,
entran a una arena y mueven su avatar con un control físico ESP32.

Esta rama contiene **solo la base común**: estructura del monorepo, infraestructura,
middlewares compartidos, base de datos, Docker y CI. Los módulos de autenticación,
usuarios, partida, tiempo real y hardware se implementan encima de esta base.

## Requisitos

- Docker y Docker Compose
- (Opcional, para desarrollo sin Docker) Node.js 20

## Levantar todo

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

El backend aplica las migraciones y ejecuta el seed automáticamente al arrancar.

| Servicio | URL |
| --- | --- |
| Aplicación web | http://localhost:5173 |
| API | http://localhost:3000/api |
| Health check | http://localhost:3000/api/health |
| Mailpit (correos) | http://localhost:8025 |

Para detener todo: `docker compose down`. Para borrar también los datos:
`docker compose down -v`.

### Usuarios de prueba

| Usuario | Correo | Contraseña | Avatar |
| --- | --- | --- | --- |
| `jugador1` | `jugador1@test.com` | `Test1234` | `/static/avatars/1.png` |
| `jugador2` | `jugador2@test.com` | `Test1234` | `/static/avatars/2.png` |

Ambos están verificados y tienen estadísticas y dos partidas de ejemplo.

## Estructura

```
backend/
  prisma/          schema.prisma, migraciones y seed
  public/avatars/  5 avatares por defecto
  src/
    app.js         app de Express (sin listen)
    server.js      arranque del servidor
    container.js   composición e inyección de dependencias
    config.js      variables de entorno validadas con zod
    shared/        AppError, asyncHandler y middlewares compartidos
    infrastructure/prisma, correo, archivos y tokens
    modules/       auth, users, game, realtime, hardware
  tests/           Jest + Supertest
frontend/          React + Vite (registro US-01 incluido)
firmware/          README del control ESP32
```

### Arquitectura por capas

El flujo es **rutas → controlador → servicio → repositorio**:

- Los controladores no usan Prisma; solo orquestan servicios.
- Los servicios reciben sus dependencias por constructor.
- Los repositorios son las únicas clases que importan `infrastructure/prisma.js`.
- `container.js` instancia y conecta todo.

Para agregar un módulo: crea repositorio, servicio, controlador y rutas, instancia todo
en `container.js` y monta el router en `app.js`.

## Formato único de error

Todas las respuestas de error tienen esta forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revise los campos marcados",
    "fields": { "email": "Correo inválido" }
  }
}
```

`fields` es `null` cuando el error no está asociado a campos. Para lanzar un error desde
cualquier capa:

```js
const { AppError } = require('./shared/AppError');

throw new AppError(409, 'USERNAME_TAKEN', 'El nombre de usuario ya está en uso');
```

Los errores no controlados se registran en consola y responden `500 INTERNAL_ERROR` con
un mensaje genérico. Usa `asyncHandler` en controladores `async` para que los errores
lleguen al `errorHandler`.

## API

### `POST /api/auth/register` (US-01)

Crea una cuenta y envía el correo de verificación. El usuario queda con
`emailVerified: false` hasta que use el enlace del correo.

Body:

```json
{
  "username": "jugador1",
  "email": "jugador1@test.com",
  "password": "Test1234",
  "confirmPassword": "Test1234"
}
```

Reglas:

- `username`: obligatorio, 3–30 caracteres, solo letras, números y guion bajo.
  La comprobación de duplicados no distingue mayúsculas de minúsculas.
- `email`: obligatorio, formato válido, se normaliza a minúsculas.
- `password`: 8–72 caracteres, al menos una letra y al menos un número.
- `confirmPassword`: obligatorio e igual a `password`.

Respuesta `201`:

```json
{
  "message": "Cuenta creada. Revise su correo para verificar la cuenta antes de jugar.",
  "user": {
    "id": "uuid",
    "username": "jugador1",
    "email": "jugador1@test.com",
    "emailVerified": false,
    "avatarUrl": "/static/avatars/1.png",
    "createdAt": "2026-10-19T13:00:00.000Z"
  },
  "emailSent": true
}
```

Si el envío del correo falla, la cuenta se crea igualmente y se responde `201` con
`"emailSent": false`.

Errores:

| Status | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Campo faltante, formato inválido, contraseñas distintas o reglas de contraseña incumplidas. `fields` indica los campos. |
| 409 | `USERNAME_TAKEN` | El nombre de usuario ya existe (sin distinguir mayúsculas). `fields.username`. |
| 409 | `EMAIL_TAKEN` | El correo ya está registrado. `fields.email`. |

### `POST /api/auth/login` (US-03)

Inicia sesión con el nombre de usuario o con el correo. La comparación no distingue
mayúsculas de minúsculas.

Body:

```json
{ "identifier": "jugador1", "password": "Test1234" }
```

Respuesta `200`:

```json
{
  "accessToken": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "username": "jugador1",
    "email": "jugador1@test.com",
    "emailVerified": true,
    "avatarId": "uuid",
    "avatarUrl": "/static/avatars/1.png",
    "createdAt": "2026-10-19T13:00:00.000Z"
  }
}
```

Si el correo no está verificado, agrega:

```json
{
  "notice": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Tu correo está pendiente de verificación. Podrás jugar cuando lo verifiques."
  }
}
```

Errores:

| Status | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Falta el usuario/correo o la contraseña. `fields.identifier` / `fields.password`. |
| 401 | `INVALID_CREDENTIALS` | Usuario inexistente o contraseña incorrecta. Mismo mensaje en ambos casos para no revelar qué cuentas existen. |

### `GET /api/auth/me` (US-03)

Requiere `Authorization: Bearer <token>`. Devuelve el usuario actual leído de la base de
datos, incluido `emailVerified`, que nunca se guarda en el JWT.

```json
{ "user": { "id": "uuid", "username": "jugador1", "emailVerified": true } }
```

| Status | Código | Cuándo |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Sin token, token inválido o usuario borrado. |
| 401 | `TOKEN_EXPIRED_SESSION` | El JWT venció. El frontend cierra la sesión y vuelve a `/login`. |

### `POST /api/auth/logout` (US-03)

Requiere `Authorization: Bearer <token>` y responde `204`. El JWT no tiene estado en el
servidor, así que no hay nada que invalidar: existe como punto único para el frontend y
para una futura lista de revocación o auditoría.

### Usuarios sin verificar

Un usuario no verificado **sí puede iniciar sesión** y recibe su token, para que pueda
ver su perfil, cambiar su avatar y reenviar la verificación. El bloqueo es solo del área
de juego:

- Backend: `requireVerifiedEmail` en las rutas de partida y
  `assertSocketUserVerified` en los sockets.
- Frontend: las rutas de juego viven dentro de `<VerifiedRoute>`, que redirige a
  `/profile` con el aviso.

## Middlewares compartidos

### `requireAuth`

Lee `Authorization: Bearer <token>`, verifica el JWT (firmado con
`infrastructure/jwt.js`) y deja `req.user = { id, username }`.

| Caso | Status | Código | Mensaje |
| --- | --- | --- | --- |
| Token ausente o inválido | 401 | `UNAUTHORIZED` | "Debes iniciar sesión" |
| Token vencido | 401 | `TOKEN_EXPIRED_SESSION` | "Tu sesión expiró. Inicia sesión de nuevo" |

```js
const { requireAuth } = require('../shared/middleware/requireAuth');

router.get('/profile', requireAuth, controller.getProfile);
```

### `requireVerifiedEmail`

Se usa **después** de `requireAuth`. Consulta la base de datos (no confía en el JWT) y
responde `403 EMAIL_NOT_VERIFIED` si el correo no está verificado.

```js
const { requireAuth } = require('../shared/middleware/requireAuth');
const { requireVerifiedEmail } = require('../shared/middleware/requireVerifiedEmail');

router.post('/matches', requireAuth, requireVerifiedEmail, controller.startMatch);
```

### `validate(schema, source)`

Valida con zod y responde `400 VALIDATION_ERROR` con los campos inválidos. Si la
validación pasa, reemplaza `req[source]` con los datos parseados.

```js
const { validate } = require('../shared/middleware/validate');
const { matchSchema } = require('./match.schemas');

router.post('/', validate(matchSchema), controller.create);
```

### `verifySocketToken(token)`

Devuelve `{ id, username }` o lanza un error. Pensado para el módulo de tiempo real. El
cliente debe enviar el mismo JWT que usa HTTP:

```js
const socket = io('http://localhost:3000', {
  auth: { token: sessionStorage.getItem('token') },
});
```

En el servidor:

```js
const { verifySocketToken } = require('./shared/middleware/requireAuth');
const {
  assertSocketUserVerified,
} = require('./shared/middleware/requireVerifiedEmail');

io.use(async (socket, next) => {
  try {
    const user = verifySocketToken(socket.handshake.auth.token);
    socket.user = await assertSocketUserVerified(user);
    return next();
  } catch (err) {
    return next(new Error(err.code || 'UNAUTHORIZED'));
  }
});
```

## Autenticación en el frontend (US-03)

El token se guarda en `sessionStorage` (clave `token`), por lo que la sesión sobrevive a
recargas y a la navegación entre pantallas, pero no se comparte entre pestañas.

`src/auth/AuthContext.jsx` expone `user`, `token`, `status`
(`loading | authenticated | anonymous`) y las funciones `login`, `logout` y
`refreshUser`:

```jsx
import { useAuth } from '../auth/AuthContext';

const { user, status, refreshUser } = useAuth();

await refreshUser(); // vuelve a pedir GET /api/auth/me
```

`<ProtectedRoute>` muestra "Cargando sesión…" mientras `status === 'loading'` y redirige a
`/login` con `state.from` si no hay sesión. `<VerifiedRoute>` va dentro de
`<ProtectedRoute>` y redirige a `/profile` con un `notice` si `!user.emailVerified`.
Cualquier módulo nuevo que agregue rutas de juego debe anidarlas dentro de
`<VerifiedRoute>`.

Ante un `401 UNAUTHORIZED` o `TOKEN_EXPIRED_SESSION`, el interceptor de
`api/client.js` borra el token y emite `auth:expired`; el `AuthContext` limpia la sesión
y navega a `/login` con el mensaje. Para mostrar `EMAIL_NOT_VERIFIED` en cualquier
pantalla, usa `getErrorCode` de `utils/apiErrors.js`.

## Avatares (US-06)

Cada jugador tiene siempre un avatar: al registrarse recibe el primer avatar `DEFAULT` y
`User.avatarId` es obligatorio en la base de datos (la migración `avatar_required`
rellena los usuarios antiguos). El seed crea 5 avatares en `/static/avatars/1.png` …
`5.png`.

### Reglas de negocio

- Un avatar `UPLOADED` pertenece a un solo usuario (`ownerId`) y solo ese usuario puede
  usarlo. Si otro jugador intenta seleccionarlo, la respuesta es el mismo `404` que para
  un avatar inexistente.
- Cada usuario tiene como máximo **un** avatar subido. Al subir otro se crea el nuevo, se
  asigna al usuario y se borran el registro y el archivo del anterior.
- Si el usuario vuelve a un avatar `DEFAULT`, su avatar subido se conserva para poder
  elegirlo de nuevo.
- Formatos: PNG, JPEG y WEBP; máximo 2 MB. La imagen se normaliza a 256×256 WEBP
  (`sharp`: recorte central, sin EXIF y validada como imagen decodificable).

### Endpoints

| Método | Ruta | Auth | Respuesta |
| --- | --- | --- | --- |
| GET | `/api/avatars/defaults` | — | 200 `{ avatars: [{ id, url }] }` |
| GET | `/api/users/me/avatars` | Bearer | 200 `{ currentAvatarId, defaults, uploaded }` |
| PUT | `/api/users/me/avatar` | Bearer | 200 `{ user }` |
| POST | `/api/users/me/avatar/upload` | Bearer | 201 `{ user }` |
| GET | `/api/users/:id/public` | Bearer | 200 `{ id, username, avatarUrl }` |

Ninguna requiere correo verificado. `PUT /api/users/me/avatar` recibe
`{ "avatarId": "uuid" }` y responde con el usuario actualizado (`toPublicUser`).
`POST /api/users/me/avatar/upload` recibe `multipart/form-data` con el campo `avatar`.

Errores:

| Status | Código | Cuándo |
| --- | --- | --- |
| 404 | `AVATAR_NOT_FOUND` | El avatar no existe o pertenece a otro usuario. |
| 404 | `USER_NOT_FOUND` | El jugador de `/api/users/:id/public` no existe. |
| 400 | `VALIDATION_ERROR` | `avatarId` faltante o que no es un UUID (`fields.avatarId`). |
| 400 | `FILE_TOO_LARGE` | La imagen supera 2 MB. |
| 400 | `INVALID_FILE_TYPE` | El mimetype no es PNG, JPEG ni WEBP. |
| 400 | `INVALID_IMAGE` | Los magic numbers no coinciden o sharp no puede decodificarla. |
| 400 | `FILE_REQUIRED` | La petición no incluye el campo `avatar`. |
| 401 | `UNAUTHORIZED` | Falta el token o no es válido. |

### `FileStorage`

`uploadAvatarMiddleware` usa `memoryStorage` (nada se escribe en disco hasta validar y
normalizar) con límite de 2 MB y un solo archivo en el campo `avatar`. El servicio llama:

```js
const saved = await fileStorage.saveAvatar(req.file.buffer);
// { url: '/uploads/avatars/<uuid>.webp', path }

await fileStorage.deleteAvatarFile(url); // solo acepta /uploads/avatars/…
```

Los archivos se sirven desde `/uploads` con `Cache-Control: public, max-age=31536000,
immutable`; es seguro porque cada archivo tiene un nombre UUID nuevo.

`sharp` trae binarios precompilados para `linux-musl-x64`, así que el `Dockerfile` sigue
sobre `node:20-alpine`. Si alguna arquitectura no encuentra binario, cambia la imagen base
a `node:20-slim`.

### Usar el avatar en la partida y en todas las pantallas

- `components/AvatarImage.jsx` es el componente reutilizable: recibe `src`, `username`,
  `size` (40 por defecto) y `className`, y cae a un círculo con la inicial si la imagen
  falla.
- `components/PlayerBadge.jsx` combina `AvatarImage` con el username. Ya aparece en
  `Layout` y en `GameWindowLayout`.
- `components/GameWindowLayout.jsx` se usa para ventanas completas (arena, victoria):
  barra superior compacta con `PlayerBadge` y `<Outlet/>` ocupando el resto.
- **La arena, la sala de espera, la pantalla de victoria y cualquier otra pantalla deben
  usar `AvatarImage` o `PlayerBadge`** (CA-06.5). Para ventanas del juego, envuélvelas en
  `<GameWindowLayout>`.
- `src/game/playerView.js` expone `toPlayerView({ id, username, avatarUrl })` para
  normalizar el jugador que dibuja la arena.
- El backend expone `avatarService.getPublicPlayer(userId)`; el módulo de partida debe
  incluirlo (o el resultado de `GET /api/users/:id/public`) en el estado que envía por
  sockets para que cada cliente reciba el `avatarUrl` de todos los jugadores.

### Sesión y ventanas nuevas

La sesión vive en `sessionStorage`. Una ventana abierta desde la app con
`window.open(url)` hereda una copia de `sessionStorage`, pero **no** si se abre con
`noopener` ni si el usuario la abre a mano en otra pestaña. Para la arena y la pantalla de
victoria usen:

```js
window.open('/arena', 'arena'); // sin noopener
```

Si más adelante hace falta compartir la sesión entre pestañas, cambia el almacenamiento a
`localStorage` en `AuthContext.jsx`; es un solo punto.

## Base de datos

- PostgreSQL 16 + Prisma.
- `npx prisma migrate deploy` aplica las migraciones.
- `npx prisma db seed` ejecuta `prisma/seed.js` (idempotente, usa `upsert`).

Desde `backend/`:

```bash
npm run prisma:migrate   # crear una migración en desarrollo
npm run seed             # volver a ejecutar el seed
```

## Pruebas y lint

```bash
cd backend
npm test
npm run lint
```

Las pruebas usan Jest + Supertest contra `app.js`. Las de autenticación y avatares
necesitan PostgreSQL con las migraciones aplicadas y usan una carpeta temporal para
`UPLOADS_DIR`; el job de CI levanta PostgreSQL y aplica las migraciones.

## Desarrollo sin Docker

```bash
# Backend
cd backend
cp .env.example .env
# Ajusta DATABASE_URL al host donde corra PostgreSQL y UPLOADS_DIR a una ruta local
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

Vite hace proxy de `/api`, `/static` y `/uploads` a `http://localhost:3000`.

## Ramas y commits

Estrategia de ramas:

```
main ← develop ← feature/US-XX-nombre
```

Todo cambio entra por Pull Request hacia `develop` con CI en verde. `develop` se
integra a `main` para entregas.

Convención de commits:

```
feat(auth): agregar verificación de correo
fix(users): corregir carga de avatar
docs(readme): documentar middlewares
test(game): cubrir creación de partida
chore(ci): cachear dependencias
```

## Notas de la base

- `GET /api/health` verifica la conexión con `SELECT 1` y responde `503` si la base falla.
- `POST /api/auth/register` (US-01), `POST /api/auth/login`, `GET /api/auth/me` y
  `POST /api/auth/logout` (US-03), y los endpoints de avatares (US-06) están
  implementados. El resto de `/api/users/*` responde `501 NOT_IMPLEMENTED` hasta que cada
  equipo implemente su módulo.
- Los avatares por defecto se sirven en `/static/avatars/1.png` … `5.png`.
- Los avatares subidos se guardan en `UPLOADS_DIR` y se sirven en `/uploads`.
- `.env` está ignorado por git; solo se versiona `.env.example`.
