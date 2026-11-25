/*
 * Efectos visuales básicos de la arena (US-037): ráfagas de partículas y textos que flotan
 * (+puntos, "¡Frenado!"). Es una capa independiente del servidor: <ArenaCanvas> la alimenta al
 * notar que un puntaje subió o que alguien quedó ralentizado. Trabaja en unidades de arena y en
 * segundos; `update(dt)` no depende del reloj real, así que se puede probar sin navegador.
 */

const TAU = Math.PI * 2;

export class EffectsLayer {
  /**
   * @param {object} [options]
   * @param {() => number} [options.random]  generador aleatorio (inyectable para pruebas)
   * @param {number} [options.maxParticles]  tope de partículas vivas (cuida el rendimiento)
   * @param {number} [options.maxFloats]     tope de textos vivos
   */
  constructor({ random = Math.random, maxParticles = 160, maxFloats = 14 } = {}) {
    this.random = random;
    this.maxParticles = maxParticles;
    this.maxFloats = maxFloats;
    this.particles = [];
    this.floats = [];
  }

  // Ráfaga de partículas que salen en todas direcciones desde (x, y).
  burst(x, y, color, count = 12) {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i += 1) {
      const angle = this.random() * TAU;
      const speed = 40 + this.random() * 90;
      const life = 0.4 + this.random() * 0.35;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + this.random() * 2.5,
        color,
        life,
        age: 0,
      });
    }
  }

  // Texto que sube y se desvanece (por ejemplo "+2").
  float(x, y, text, color, life = 0.9) {
    if (this.floats.length >= this.maxFloats) this.floats.shift();
    this.floats.push({ x, y, text, color, life, age: 0 });
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      // frenado suave
      particle.vx *= 1 - Math.min(1, 3 * dt);
      particle.vy *= 1 - Math.min(1, 3 * dt);
    }
    for (const text of this.floats) {
      text.age += dt;
      text.y -= 34 * dt;
    }

    this.particles = this.particles.filter((particle) => particle.age < particle.life);
    this.floats = this.floats.filter((text) => text.age < text.life);
  }

  get size() {
    return this.particles.length + this.floats.length;
  }

  draw(ctx) {
    for (const particle of this.particles) {
      const alpha = 1 - particle.age / particle.life;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.5 + 0.5 * alpha), 0, TAU);
      ctx.fill();
    }

    if (this.floats.length > 0) {
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(8, 12, 18, 0.85)';
      ctx.lineJoin = 'round';
    }
    for (const text of this.floats) {
      const progress = text.age / text.life;
      ctx.globalAlpha = Math.max(0, progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3);
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }

    ctx.globalAlpha = 1;
  }
}

/**
 * Compara el estado nuevo con el anterior y lanza los efectos que correspondan.
 * `previous` es un Map(id -> { score, slow, frozen }) que esta función mantiene al día.
 * - Puntaje que sube: ráfaga y "+N" en el color de quien gana más (sector de riesgo o evento).
 * - Quien pasa a estar ralentizado: ráfaga de polvo y, si es el jugador local, "¡Frenado!".
 * - Quien lo congela un guardián: ráfaga de hielo ("¡Congelado!" al jugador local); al
 *   descongelarse, ráfaga y "¡Libre!" (solo local).
 * - Quien pierde puntos: "−N" en rojo sobre su avatar.
 */
export const FREEZE_COLOR = '#9be7ff';
const LOSS_COLOR = '#ff5d73';

export function trackEffects(effects, previous, state, { currentUserId, palette, accent }) {
  for (const player of state.players) {
    const before = previous.get(player.id);

    if (before) {
      const gained = player.score - before.score;
      if (gained > 0) {
        const color = player.risk > 1 ? palette.riskZone : accent || palette.cell;
        effects.burst(player.x, player.y, color, 8 + Math.min(10, gained * 2));
        effects.float(player.x, player.y - 28, `+${gained}`, color);
      }

      // Puntos perdidos (p. ej. por el congelamiento de un guardián): "−2" en rojo.
      if (gained < 0) {
        effects.float(player.x, player.y - 28, `−${-gained}`, LOSS_COLOR, 1.1);
      }

      if (before.slow <= 0 && player.slow > 0) {
        effects.burst(player.x, player.y, palette.trap, 10);
        if (player.id === currentUserId) {
          effects.float(player.x, player.y - 36, '¡Frenado!', palette.trap, 1.1);
        }
      }
    }

    const frozen = player.frozen || 0;
    if (before) {
      const beforeFrozen = before.frozen || 0;
      if (beforeFrozen <= 0 && frozen > 0) {
        effects.burst(player.x, player.y, FREEZE_COLOR, 16);
        if (player.id === currentUserId) {
          effects.float(player.x, player.y - 44, '¡Congelado!', FREEZE_COLOR, 1.2);
        }
      } else if (beforeFrozen > 0 && frozen <= 0) {
        effects.burst(player.x, player.y, '#ffffff', 10);
        if (player.id === currentUserId) {
          effects.float(player.x, player.y - 36, '¡Libre!', '#ffffff', 1);
        }
      }
    }

    previous.set(player.id, { score: player.score, slow: player.slow || 0, frozen });
  }
}
