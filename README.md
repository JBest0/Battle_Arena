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
| `jugador3` | `jugador3@test.com` | `Test1234` | `/static/avatars/3.png` |

Los tres están verificados. `jugador1` y `jugador2` tienen 4 partidas de ejemplo
(2 victorias de `jugador1`, 1 de `jugador2` y 1 empate) registradas con el mismo
servicio que usará el módulo de partida; `jugador3` no tiene partidas y sirve para
ver el perfil vacío.

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

### `POST /api/auth/forgot-password` (US-05)

Solicita un enlace de recuperación. Responde **siempre** el mismo mensaje genérico, exista
o no el correo, para no revelar qué cuentas están registradas.

Body:

```json
{ "email": "jugador1@test.com" }
```

Respuesta `200`:

```json
{
  "message": "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Vence en 30 minutos."
}
```

- El token es aleatorio, se guarda **hasheado** (`PasswordResetToken.tokenHash`) y vence a
  los 30 minutos (`RESET_TOKEN_TTL_MINUTES`).
- Pedir un enlace nuevo invalida los anteriores del mismo usuario.
- Hay un cooldown de 60 segundos entre solicitudes.

### `POST /api/auth/reset-password` (US-05)

Body:

```json
{
  "token": "…64 caracteres hexadecimales…",
  "password": "Nueva1234",
  "confirmPassword": "Nueva1234"
}
```

Respuesta `200`:

```json
{ "message": "Contraseña actualizada. Ya puedes iniciar sesión." }
```

Al completarse:

- el token queda con `usedAt` (un solo uso);
- se invalidan los demás enlaces pendientes del usuario;
- `User.passwordChangedAt` se actualiza, así que **todos los JWT emitidos antes se
  rechazan** con `401 SESSION_REVOKED` (HTTP y sockets);
- `emailVerified` pasa a `true` (si el usuario tenía el correo pendiente, el enlace enviado
  a ese correo demuestra que le pertenece);
- se envía un correo de aviso del cambio.

Errores:

| Status | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Token faltante, correo mal formado, contraseñas distintas o reglas incumplidas. `fields` indica el campo. |
| 400 | `PASSWORD_REUSED` | La contraseña nueva es igual a la actual. `fields.password`. |
| 400 | `TOKEN_INVALID` | El token no tiene el formato esperado o no existe. |
| 400 | `TOKEN_USED` | El enlace ya fue utilizado. |
| 410 | `TOKEN_EXPIRED` | El enlace venció (CA-05.4). |
| 429 | `TOO_MANY_REQUESTS` | Se pidió otro enlace dentro del cooldown de 60 s. |
| 502 | `EMAIL_SEND_FAILED` | El servidor SMTP no aceptó el correo. La solicitud se puede reintentar. |

### Cambio de contraseña y sesiones

`requireAuth` y `verifySocketToken` comparan el `iat` del JWT con
`User.passwordChangedAt` (a resolución de segundos). Si el token se emitió antes del último
cambio de contraseña, responden `401 SESSION_REVOKED`; el interceptor del frontend trata
ese código como sesión cerrada y lleva a `/login` con el mensaje.

El enlace del correo apunta a `${FRONTEND_URL}/reset-password?token=…`. En desarrollo,
Mailpit muestra los correos en http://localhost:8025.

### Job de limpieza de tokens

`src/infrastructure/TokenCleanupJob.js` elimina los tokens de verificación y de
recuperación vencidos o usados hace más de 7 días (`RETENTION_DAYS`), en ambas tablas.

- `server.js` lo arranca al iniciar el servidor y lo detiene en el apagado ordenado
  (cada hora, con `setInterval(...).unref()`).
- Ejecución manual: `npm run tokens:cleanup`.

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
| JWT emitido antes del último cambio de contraseña | 401 | `SESSION_REVOKED` | "Tu contraseña cambió. Inicia sesión de nuevo" |

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

Devuelve `{ id, username }` o lanza un error. Pensado para el módulo de tiempo real
 (`modules/realtime`, ver [Partida y arena](#partida-y-arena)). El cliente debe enviar el mismo 
 JWT que usa HTTP; el frontend ya lo hace en `src/api/socket.js`:

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

Ante un `401 UNAUTHORIZED`, `TOKEN_EXPIRED_SESSION` o `SESSION_REVOKED`, el interceptor
de `api/client.js` borra el token y emite `auth:expired`; el `AuthContext` limpia la
sesión y navega a `/login` con el mensaje. Para mostrar `EMAIL_NOT_VERIFIED` en cualquier
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

## Perfil del jugador, estadísticas y ranking (US-04)

> El enunciado numera estos criterios como `CA-05.x`. En este repositorio se tratan como
> **CA-04.1** (encabezado del perfil) y **CA-04.2** (estadísticas, logros, ranking e
> historial).

Todo lo que muestra el perfil se lee de PostgreSQL, nunca de memoria ni del navegador
(CA-04.2: los datos sobreviven a nuevas sesiones).

### Endpoints

Todos requieren `Authorization: Bearer <token>` y **ninguno exige correo verificado**.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/api/users/me/profile` | 200 perfil propio completo |
| GET | `/api/users/:id/profile` | 200 perfil; vista pública si `:id` no es el jugador autenticado |
| PATCH | `/api/users/me` | 200 perfil propio actualizado |
| GET | `/api/users/:id/matches?page=1&pageSize=10` | 200 `{ items, total, page, pageSize }` |
| GET | `/api/ranking?limit=10` | 200 `{ items, totalPlayers }` |

Forma del perfil:

```json
{
  "user": {
    "id": "uuid",
    "username": "jugador1",
    "displayName": "Campeón",
    "bio": "Jugador de prueba",
    "avatarUrl": "/static/avatars/1.png",
    "memberSince": "2026-10-12T…",
    "lastLoginAt": "2026-10-19T…",
    "email": "jugador1@test.com",
    "emailVerified": true
  },
  "isOwnProfile": true,
  "stats": {
    "gamesPlayed": 4, "gamesWon": 2, "gamesLost": 1, "gamesDrawn": 1,
    "winRate": 50, "totalPoints": 145, "averagePoints": 36.3,
    "bestScore": 50, "rankingPoints": 7
  },
  "ranking": { "position": 1, "totalPlayers": 2 },
  "achievements": [
    { "code": "FIRST_MATCH", "name": "Primera partida", "description": "…",
      "icon": "…", "unlocked": true, "unlockedAt": "…" }
  ],
  "recentMatches": { "items": ["…las 5 más recientes…"], "total": 4 }
}
```

- `email` y `emailVerified` **solo** aparecen si `isOwnProfile` es `true`.
- `winRate` y `averagePoints` se redondean a un decimal; con 0 partidas valen 0 (nunca
  `NaN` ni `null`).
- `gamesLost` y `gamesDrawn` salen de `MatchParticipant.result`.
- Si un usuario no tuviera `PlayerStats`, el servicio lo crea en cero y lo registra.

`PATCH /api/users/me` recibe `displayName` (0–40) y/o `bio` (0–200). Los textos vacíos se
guardan como `null`; enviar ambos campos ausentes responde `400 VALIDATION_ERROR`
("No hay cambios que guardar").

Cada elemento del historial trae `matchId`, `startedAt`, `endedAt`, `durationSeconds`,
`endMode`, `result` (`WIN`/`LOSS`/`DRAW`), `finalScore`, `position` y
`opponents: [{ id, username, avatarUrl, finalScore }]`, ordenado de la partida más
reciente a la más antigua.

Errores:

| Status | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` que no es UUID, paginación fuera de rango (1–50), límite de ranking fuera de rango o body inválido. |
| 401 | `UNAUTHORIZED` | Sin token o token inválido. |
| 401 | `SESSION_REVOKED` | El JWT es anterior al último cambio de contraseña. |
| 404 | `USER_NOT_FOUND` | El jugador no existe. |
| 404 | `MATCH_NOT_FOUND` | El módulo de partida intentó registrar una partida inexistente. |
| 409 | `MATCH_NOT_FINISHED` | La partida no tiene `endedAt`. |

### Ranking

Orden: `rankingPoints` **desc**, luego `gamesWon` **desc**, luego `username` **asc**.
Puntos por partida: **victoria +3, empate +1, derrota 0**. Si el puntaje máximo lo comparte
más de un jugador, todos los que están en el primer lugar cuentan como empate (`DRAW`) y
comparten la posición 1.

`getRankingPosition` y `getTopRanking` usan una sola consulta con
`ROW_NUMBER() OVER (ORDER BY …)`, para no cargar todos los usuarios en memoria. El
desempate de la ventana es exactamente el mismo que el del `ORDER BY` del top.

### Logros (patrón Strategy)

Cada logro es una regla independiente en
`modules/stats/achievements/rules.js`:

```js
{ code: 'FIRST_WIN', isUnlocked: (stats) => stats.gamesWon >= 1 }
```

`AchievementEvaluator` recibe la lista por constructor y `evaluate(stats)` devuelve los
códigos desbloqueados. **Para agregar un logro**: crea la fila en el catálogo
(`Achievement`, con `code` único; el seed ya trae `FIRST_MATCH`, `FIRST_WIN`,
`TEN_MATCHES`, `HIGH_SCORE` y `THREE_WINS`) y agrega una regla a `rules.js`. No hay que
tocar el servicio (abierto/cerrado).

`unlockAchievements` usa `createMany({ skipDuplicates: true })`, así que registrar dos
veces la misma partida no duplica logros.

### Para el módulo de partida (US-16)

Al terminar una partida, el módulo de partida debe guardar **antes** de llamar al
servicio:

1. Una `Match` con `endedAt` (obligatorio), `startedAt` y `endMode` (`TIME` o `POINTS`);
   `winnerId` es opcional.
2. Un `MatchParticipant` por jugador con su `finalScore`.

Después llama:

```js
const { statsService } = require('../container');

const result = await statsService.recordMatchResult(matchId);
// { alreadyRecorded: false, results: [...], unlocked: { [userId]: [codes] } }
```

- Es **idempotente** gracias a `Match.statsRecordedAt`: una segunda llamada no vuelve a
  sumar estadísticas y devuelve `{ alreadyRecorded: true }`.
- El servicio calcula `result` y `position` de cada participante, actualiza `PlayerStats`
  (+3/+1/0, `totalPoints`, `bestScore`) y desbloquea logros.
- Lánzalo dentro del mismo flujo en que cierras la partida; si falla, la partida sigue
  terminada y puedes reintentar sin duplicar datos.
- Lanza `404 MATCH_NOT_FOUND` o `409 MATCH_NOT_FINISHED` si la partida no existe o no ha
  terminado.

### Reutilizar componentes en el juego

`components/profile/RankingTable.jsx` recibe los datos por props
(`items`, `highlightUserId`, `separatedUserId`), no llama a la API y se puede reutilizar
tal cual para el **podio** y el **ranking del Sprint 3**. `AvatarImage` y `PlayerBadge`
siguen siendo la forma estándar de mostrar jugadores.


## Partida y arena

Flujo completo: el jugador **crea** una partida (o se **une** a una abierta), espera en la
**sala de espera**, el anfitrión la **inicia** y todos juegan **a la vez** en la arena. Al
terminar se guardan los puntajes y se actualizan estadísticas, ranking y logros.

```
WAITING ──(anfitrión inicia)──▶ IN_PROGRESS ──(fin de tiempo o puntos)──▶ FINISHED
 sin startedAt                  con startedAt                             con endedAt
```

### Configuración del juego

Se elige al crear la partida. Los límites viven en `backend/src/modules/game/game.config.js`
(fuente única) y el frontend los lee de `GET /api/game/options`.

| Campo | Rango | Por defecto | Aplica a |
| --- | --- | --- | --- |
| `endMode` | `TIME` o `POINTS` | `TIME` | siempre |
| `durationSeconds` | 30–600 | 180 | solo `TIME` (en `POINTS` queda `null`) |
| `targetPoints` | 5–200 | 50 | solo `POINTS` (en `TIME` queda `null`) |
| `maxPlayers` | 2–4 | 2 | siempre |

Para iniciar hacen falta al menos 2 jugadores (`minPlayersToStart`).

### Endpoints (`/api/game`)

Todos exigen sesión y correo verificado (`requireAuth` + `requireVerifiedEmail`, CA-02.5).

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/options` | `200 { endModes, limits, defaults, arena, minPlayersToStart }` |
| GET | `/matches` | `200 { matches }`: partidas en espera de los últimos 30 minutos (máx. 20) |
| POST | `/matches` | `201 { match }`; `400 VALIDATION_ERROR` con `fields` por campo |
| GET | `/matches/:id` | `200 { match }`; `404 MATCH_NOT_FOUND` |
| POST | `/matches/:id/join` | `200 { match }`; idempotente. `409 MATCH_FULL` o `MATCH_ALREADY_STARTED` |
| POST | `/matches/:id/start` | `200 { match }`. `403 NOT_MATCH_CREATOR`, `409 NOT_ENOUGH_PLAYERS` o `MATCH_ALREADY_STARTED` |

`match` = `{ id, status, config, createdById, createdAt, startedAt, endedAt, players }`,
con `players: [{ id, username, avatarUrl, score }]`. Una partida en espera **no** aparece en
el historial (que solo cuenta las que tienen `endedAt`).

`join` y `start` bloquean la fila de la partida (`SELECT … FOR UPDATE`) dentro de una
transacción, así que dos jugadores que se unen a la vez no superan el cupo. Al iniciar,
`GameService` emite `matchStarted` en `gameEvents` (después del commit); el módulo de
tiempo real escucha ese evento para arrancar la partida.

### Tiempo real (`modules/realtime`)

Socket.IO comparte el servidor HTTP y el puerto de la API. La conexión se autentica con
`verifySocketToken` + `assertSocketUserVerified`.

| Dirección | Evento | Contenido |
| --- | --- | --- |
| cliente → servidor | `match:join` `{ matchId }` | ack `{ ok, status, state? }` o `{ ok: false, code, message }` (`NOT_A_PLAYER`, `MATCH_NOT_ACTIVE`, `MATCH_NOT_FOUND`…) |
| cliente → servidor | `player:input` `{ dx, dy }` | dirección deseada (-1..1 por eje); se normaliza en el servidor |
| servidor → cliente | `arena:state` | estado de la arena, 30 veces por segundo |
| servidor → cliente | `match:finished` | estado final, ya guardado el resultado |

El servidor es **autoritativo**: `arenaEngine.js` mueve a todos los jugadores a la vez,
reparte los ítems y cuenta los puntos; `matchRoomManager.js` lo avanza con un temporizador y
difunde el estado; `realtime.socket.js` conecta los sockets.

- Cuenta regresiva de 5 s antes de empezar, para que todos conecten.
- Cada ítem es del jugador más cercano que lo toque (+1 punto). Siempre hay 4 en la arena.
- `TIME` termina al agotarse el tiempo; `POINTS`, cuando alguien llega al objetivo. Ganan
  todos los que tengan el puntaje más alto: un empate deja `winnerId` en `null`.
- Si nadie está conectado durante 30 s, o la partida pasa de 15 minutos, se cierra con los
  puntajes que tenga.
- Los valores (velocidad 220, ítems, cuenta regresiva, tick de 30 Hz, tiempos de seguridad
  y la arena de 800×500) están en `GAMEPLAY` y `ARENA` de `game.config.js`.

**Control del jugador.** Hoy es el teclado (W A S D o flechas), que envía `player:input`.
El módulo de hardware debe traducir el control ESP32 a la misma dirección `dx`/`dy` y
entregarla a `manager.setInput(matchId, userId, dx, dy)` (o enviar `player:input`); el
motor no necesita cambios.

### Frontend

| Ruta | Pantalla |
| --- | --- |
| `/lobby` | Sala de juego: partidas abiertas (se refresca cada 3 s) y formulario para crear |
| `/arena?match=<id>` | Sala de espera, arena en curso o aviso de partida terminada, según el estado |

Ambas siguen dentro de `<VerifiedRoute>` (CA-03.4).

- `components/game/`: `GameConfigForm`, `OpenMatchesList`, `WaitingRoom`, `ArenaCanvas`
  (canvas 2D con los avatares y la inicial como respaldo) y `ArenaHud` (modo, reloj u
  objetivo, marcador con `AvatarImage` y resultado).
- `hooks/`: `useMatch` (consulta la partida mientras espera, sin retroceder de estado),
  `useArenaSocket` (devuelve `{ stateRef, hud, connection, sendInput }`) y
  `useKeyboardInput`.
- `game/arenaState.js` documenta el contrato del estado de la arena. El canvas lee
  `stateRef` en cada frame, así que los 30 mensajes por segundo no re-renderizan React; el
  `hud` (marcador y reloj) se actualiza unas 5 veces por segundo.
- Vite (`vite.config.js`) y nginx (`nginx.conf`) reenvían `/socket.io` como WebSocket.

### Límites conocidos

- Las partidas en curso viven en la memoria del backend: con varias instancias o tras un
  reinicio, una partida `IN_PROGRESS` pierde su motor (los jugadores ven
  `MATCH_NOT_ACTIVE`).
- No hay "salir de la sala de espera" ni expulsar jugadores.
- El control físico ESP32 (módulo de hardware) está pendiente.

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

Las pruebas usan Jest + Supertest contra `app.js`. Las de autenticación, avatares y las
de la API de partidas (`game.matches.test.js`, `game.start.api.test.js`) necesitan
PostgreSQL con las migraciones aplicadas y usan una carpeta temporal para `UPLOADS_DIR`;
el job de CI levanta PostgreSQL y aplica las migraciones.

Las del juego que **no** necesitan base de datos: `arenaEngine`, `matchRoomManager`,
`realtime.socket` (socket.io real con `socket.io-client`), `game.config`, `game.start` y
`game.finish`. Usan `tests/helpers/inMemoryGame.js`, un repositorio en memoria con la
misma interfaz que `GameRepository`.

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

Vite hace proxy de `/api`, `/static`, `/uploads` y `/socket.io` (WebSocket) 
a `http://localhost:3000`.

## Ramas y commits

Estrategia de ramas:

```
main <= develop <= feature/US-XX-nombre
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
- `POST /api/auth/register` (US-01), `POST /api/auth/login`, `GET /api/auth/me`,
  `POST /api/auth/logout` (US-03), `POST /api/auth/forgot-password` y
  `POST /api/auth/reset-password` (US-05), los endpoints de avatares (US-06), y los de
  perfil, historial y ranking (US-04) están implementados. El resto de `/api/users/*`
  responde `501 NOT_IMPLEMENTED` hasta que cada equipo implemente su módulo.
- Los endpoints de partida (`/api/game/*`: opciones, crear, listar, unirse, iniciar y
  consultar) y el tiempo real por Socket.IO están implementados; ver
  [Partida y arena](#partida-y-arena). Para estrenar la migración de partidas:
  `npx prisma migrate deploy`.
- Los avatares por defecto se sirven en `/static/avatars/1.png` … `5.png`.
- Los avatares subidos se guardan en `UPLOADS_DIR` y se sirven en `/uploads`.
- `.env` está ignorado por git; solo se versiona `.env.example`.
