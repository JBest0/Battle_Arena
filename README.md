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

## Middlewares compartidos

### `requireAuth`

Lee `Authorization: Bearer <token>`, verifica el JWT y deja
`req.user = { id, username }`. Si falta o es inválido responde
`401 UNAUTHORIZED` / "Debe iniciar sesión".

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

Devuelve `{ id, username }` o lanza un error. Pensado para el módulo de tiempo real:

```js
const { verifySocketToken } = require('./shared/middleware/requireAuth');

io.use((socket, next) => {
  try {
    socket.user = verifySocketToken(socket.handshake.auth.token);
    return next();
  } catch (err) {
    return next(new Error(err.message));
  }
});
```

### `uploadAvatar`

Middleware de multer configurado para avatares (PNG/JPEG/WebP, máximo 2 MB, nombre
UUID en `UPLOADS_DIR`). Los errores se convierten en `400 INVALID_FILE`.

```js
const { uploadAvatar } = require('../infrastructure/FileStorage');

router.post('/avatar', requireAuth, uploadAvatar, controller.updateAvatar);
// En el controlador: fileStorage.saveAvatar(req.file) => '/uploads/<uuid>.png'
```

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

Las pruebas usan Jest + Supertest contra `app.js` y no requieren una base de datos real
(la consulta del health check está mockeada). El job de CI sí levanta PostgreSQL y
aplica las migraciones.

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
- `POST /api/auth/register` está implementado (US-01). El resto de `/api/auth/*`,
  `/api/users/*` y `/api/avatars/defaults` responde `501 NOT_IMPLEMENTED` hasta que
  cada equipo implemente su módulo.
- Los avatares por defecto se sirven en `/static/avatars/1.png` … `5.png`.
- Los avatares subidos se guardan en `UPLOADS_DIR` y se sirven en `/uploads`.
- `.env` está ignorado por git; solo se versiona `.env.example`.
