/**
 * Renders the Iron Man Mark LXXXV Arc Reactor & J.A.R.V.I.S. Vocal Core on HTML5 Canvas.
 */
export class ArcReactorVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => number} getEnergyCallback
   */
  constructor(canvas, getEnergyCallback) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getEnergy = getEnergyCallback;
    this.state = 'IDLE'; // IDLE | THINKING | SPEAKING | LISTENING
    this.theme = 'mark85';
    this.angle1 = 0;
    this.angle2 = 0;
    this.angle3 = 0;
    this.animationFrameId = null;
  }

  setState(newState) {
    this.state = newState;
  }

  setTheme(themeName) {
    this.theme = themeName || 'mark85';
  }

  start() {
    const render = (timestamp) => {
      this._draw(timestamp);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  _getPalette() {
    if (this.state === 'SPEAKING') {
      return {
        primary: '#ffaa00',
        secondary: '#00f0ff',
        glow: 'rgba(255, 170, 0, 0.55)',
        core: '#fff3d1'
      };
    }
    if (this.state === 'LISTENING') {
      return {
        primary: '#00ff9d',
        secondary: '#00f0ff',
        glow: 'rgba(0, 255, 157, 0.55)',
        core: '#d8fff0'
      };
    }

    if (this.theme === 'hulkbuster') {
      return {
        primary: '#ff3b30',
        secondary: '#ffcc00',
        glow: 'rgba(255, 59, 48, 0.5)',
        core: '#ffe5e0'
      };
    }
    if (this.theme === 'stealth') {
      return {
        primary: '#00ff88',
        secondary: '#00b894',
        glow: 'rgba(0, 255, 136, 0.45)',
        core: '#dcfff0'
      };
    }
    if (this.theme === 'warmachine') {
      return {
        primary: '#d0e4ff',
        secondary: '#4da6ff',
        glow: 'rgba(160, 205, 255, 0.48)',
        core: '#ffffff'
      };
    }

    switch (this.state) {
      case 'THINKING':
        return {
          primary: '#00f0ff',
          secondary: '#ffaa00',
          glow: 'rgba(0, 240, 255, 0.65)',
          core: '#e0ffff'
        };
      default:
        return {
          primary: '#00f0ff',
          secondary: '#0088ff',
          glow: 'rgba(0, 240, 255, 0.45)',
          core: '#ccfaff'
        };
    }
  }

  _draw(timestamp) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    const energy = this.getEnergy ? this.getEnergy() : 0;
    const speedMultiplier =
      this.state === 'THINKING' ? 2.6 : this.state === 'SPEAKING' ? 1.8 : 1.0;

    this.angle1 += 0.006 * speedMultiplier;
    this.angle2 -= 0.009 * speedMultiplier;
    this.angle3 += 0.004 * speedMultiplier;

    ctx.clearRect(0, 0, width, height);

    const palette = this._getPalette();

    // 1. Ambient Radial Glow
    const baseRadius = Math.min(cx, cy) * 0.85;
    const glowGrad = ctx.createRadialGradient(
      cx,
      cy,
      baseRadius * 0.05,
      cx,
      cy,
      baseRadius * (0.95 + energy * 0.15)
    );
    glowGrad.addColorStop(0, palette.glow);
    glowGrad.addColorStop(0.55, 'rgba(0, 140, 255, 0.12)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Outer Degree Telemetry Ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle3);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.92, 0, Math.PI * 2);
    ctx.stroke();

    const tickCount = 72;
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2;
      const isMajor = i % 6 === 0;
      const rInner = baseRadius * (isMajor ? 0.86 : 0.89);
      const rOuter = baseRadius * 0.92;
      ctx.strokeStyle = isMajor ? palette.secondary : 'rgba(0, 240, 255, 0.3)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
      ctx.lineTo(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Counter-Rotating Segmented Arc Ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle2);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 3;
    const segments = [
      [0, 0.9],
      [1.2, 2.0],
      [2.4, 3.5],
      [3.9, 4.7],
      [5.1, 5.9]
    ];
    for (const [start, end] of segments) {
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 0.78, start, end);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Mark LXXXV Reactor Coil Nodes (10 Coils around inner ring)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle1);
    const coilCount = 10;
    const coilRadius = baseRadius * 0.64;
    for (let i = 0; i < coilCount; i++) {
      const a = (i / coilCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 2;
      ctx.strokeRect(coilRadius - 5, -7, 10, 14);
      ctx.restore();
    }
    ctx.restore();

    // 5. Dynamic Vocal Frequency Bars (Responds to JARVIS speech & energy)
    ctx.save();
    ctx.translate(cx, cy);
    const barCount = 48;
    const barBaseR = baseRadius * 0.42;
    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const wave =
        Math.sin(timestamp * 0.008 + i * 0.45) * 0.5 +
        Math.cos(timestamp * 0.013 - i * 0.3) * 0.5;
      const activeBoost =
        energy > 0.02
          ? energy * (14 + Math.abs(wave) * 26)
          : this.state === 'THINKING'
          ? 6 + Math.abs(wave) * 10
          : 2 + Math.abs(wave) * 3;

      const r1 = barBaseR;
      const r2 = barBaseR + activeBoost;

      ctx.strokeStyle = i % 2 === 0 ? palette.primary : palette.secondary;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // 6. Inner Arc Reactor Triangle / Core Ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.angle1 * 1.5);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    // Inner triangular geometry
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const r = baseRadius * 0.28;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.stroke();
    ctx.restore();

    // 7. Central Luminous Singularity Core
    const corePulseRadius = baseRadius * (0.14 + energy * 0.07);
    const coreGrad = ctx.createRadialGradient(
      cx,
      cy,
      1,
      cx,
      cy,
      corePulseRadius * 1.6
    );
    coreGrad.addColorStop(0, palette.core);
    coreGrad.addColorStop(0.5, palette.primary);
    coreGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, corePulseRadius * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
