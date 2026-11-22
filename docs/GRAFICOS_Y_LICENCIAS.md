# Recursos gráficos y de audio: origen y licencia

Requisito del ERS (US-031): los recursos gráficos deben tener su licencia documentada.
Este archivo lista de dónde sale cada recurso que ve u oye el jugador.

| Recurso | Origen | Licencia |
| --- | --- | --- |
| Arena: piso, muros, reactor, terminales, trampas, sectores de riesgo, obstáculos, celdas, personajes, guardianes, bloque de hielo del jugador congelado, efectos y viñeta | Se dibujan con código en un `<canvas>` (`frontend/src/game/scenarioRender.js`, `frontend/src/components/game/ArenaCanvas.jsx`, `frontend/src/game/effects.js`). No hay imágenes ni sprites de terceros | Autoría del equipo (licencia del proyecto) |
| Miniaturas de escenario | Mismo código de dibujo, sobre un `<canvas>` pequeño | Autoría del equipo |
| Interfaz (HUD, marcador, leyenda, anuncios) | HTML y CSS propios (`frontend/src/index.css` y componentes React) | Autoría del equipo |
| Tipografía | Fuentes del sistema (`system-ui`); no se descarga ni se incluye ninguna fuente | No aplica |
| Sonidos de los eventos especiales | Se sintetizan en el navegador con la Web Audio API (`frontend/src/game/eventSound.js`); no hay archivos de audio | Autoría del equipo |
| Música de cada escenario | El formato la admite (`music.src`), pero hoy es `null`: no se incluye ninguna pista | No aplica |
| Avatares por defecto (`backend/public/avatars/1.png` a `5.png`) | **Pendiente de documentar** | **Pendiente: completar origen, autor y licencia** |
| Librerías (React, Vite, Socket.IO, etc.) | Dependencias de npm; cada una trae su propia licencia en su paquete | Ver `package.json` y la licencia de cada paquete |

## Pendiente del equipo

- Los cinco avatares por defecto no tienen en el repositorio ninguna nota de origen ni de
  licencia. Antes de la entrega hay que completar la fila de la tabla (autor o sitio de
  donde salieron, enlace y licencia) o reemplazarlos por imágenes propias.
- Si más adelante se agregan imágenes, fuentes o música de terceros, deben anotarse aquí con
  su enlace y su licencia (por ejemplo CC0 o CC-BY, con la atribución que pida).
