/* v1su4rt — sensores: microfone (AudioContext + AnalyserNode) e giroscópio
   (deviceorientation). Nada é gravado nem enviado: os valores só alimentam o shader. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Toda a afinação do ouvido vive neste bloco: é o único sítio a mexer para mudar
     como a flor escuta. As bandas dizem o que cada uniforme recebe, o ataque e o
     release dizem quão depressa se move, e a batida diz quando entra o flash.
     Tudo em 0..1 salvo indicação em contrário. */
  const TUNE = {
    // analisador: 1024 dá 512 bins; a 48 kHz cada bin vale ~47 Hz
    fftSize: 1024,
    analyserSmoothing: 0.15, // 0,4 atrasava o analyzer ~80 ms e borrava os agudos
    minDecibels: -100,
    maxDecibels: -30,

    // bandas: [Hz de inicio, Hz de fim, curso mínimo]
    // O valor é (nível - piso de ruído) dividido pelo curso da banda, mas o
    // denominador nunca desce abaixo do curso mínimo: é isso que impede o chiado de
    // uma sala silenciosa de ser amplificado até ao topo só porque é tudo o que lá
    // está. Curso mínimo em unidades do analyzer (~0,014 por dB, escala -100..-30):
    // 0,12 ≈ 8 dB de curso, que é o que uma banda tem de música a sério.
    bands: {
      bass: [20, 250, 0.12],
      mid: [250, 2000, 0.1],
      treble: [2000, 9000, 0.1],
    },
    // quantos bins mais fortes definem a banda. Uma média de toda a banda mata o
    // que é estreito: um prato ocupa ~3 dos 151 bins dos agudos a 48 kHz.
    topBins: 3,

    // envelopes por banda, em 1/s. O piso de ruído cai na hora e sobe com tau ~17 s;
    // o pico sobe na hora e cai com tau ~12 s. Juntos definem o curso da banda.
    floorRise: 0.06,
    peakFall: 0.08,

    // volume RMS do domínio do tempo
    levelGain: 5,

    // suavização dos quatro valores: ataque rápido, release lento (taxa em 1/s)
    attack: 28,
    release: 7,

    // batida: limiar relativo ao desvio recente, com piso absoluto e refractária.
    // O limiar fixo nunca disparava em música calma e disparava a tudo num
    // concerto; o portão antigo (flash acima de 0,35) prendia a espera à duração do
    // flash em vez de a prender ao tempo.
    beatAvgRise: 3.0,
    beatDevRise: 2.0,
    beatRatio: 1.9,
    beatFloor: 0.045,
    beatRefractory: 0.12,
    beatDecay: 4.5,
    // um flash tem de ser ALTO, não apenas um sobressalto: sem esta exigência o
    // chiado de uma sala vazia, que o curso normalizado aproveita todo, fazia a
    // flor piscar para o nada. Escala pelo nível vezes a sensibilidade, por isso
    // uma entrada fraca volta a ficar elegível a subir o slider.
    beatMinLevel: 0.12,

    // giroscópio: ±40° de inclinação percorrem o curso todo
    tiltRange: 40,
    tiltEase: 9,

    // ombro suave do read(): linear até aqui, exponencial depois
    knee: 0.75,
  };

  /* Ombro suave: até `knee` é ganho puro; depois aproxima-se de 1 sem a pinar.
     Com clamp simples, a sensibilidade de fábrica 1,5 pinava tudo o que passasse
     de 0,667 — em música alta as bandas ficavam coladas no topo, a flor parava de
     responder, e a metade de cima do slider não fazia absolutamente nada. */
  function softKnee(x, knee) {
    if (x <= knee) return x;
    const top = 1 - knee;
    return 1 - top * Math.exp(-(x - knee) / top);
  }

  class V1Interaction {
    constructor() {
      this.audioSens = 1.5;
      this.orientSens = 1.5;
      this.sm = { level: 0, bass: 0, mid: 0, treble: 0 };
      this.bassAvg = 0;
      this.bassDev = 0;
      this.beatHold = 0;
      this.floor = { bass: 1, mid: 1, treble: 1 };
      this.peak = { bass: 0, mid: 0, treble: 0 };
      this.top = new Array(TUNE.topBins).fill(0);
      this.pulse = 0;
      this.tgt = { x: 0, y: 0 };
      this.tilt = { x: 0, y: 0 };
      this._onOrient = this._onOrient.bind(this);
      this._clearSession();

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      });
    }

    get active() { return this.audioOn || this.orientOn; }

    _clearSession() {
      this.ctx = null;
      this.stream = null;
      this.analyser = null;
      this.freq = null;
      this.wave = null;
      this.audioOn = false;
      this.orientOn = false;
      this.orientSeen = false;
      this.base = null;
      this.baseAng = null;
      this.tgt.x = 0;
      this.tgt.y = 0;
      // arranque limpo: o piso entra pelo topo e o pico pelo fundo, para que a
      // primeira leitura seja o curso real do sinal e não um valor de outra sala
      this.bassAvg = 0;
      this.bassDev = 0;
      this.beatHold = 0;
      this.pulse = 0;
      this.floor = { bass: 1, mid: 1, treble: 1 };
      this.peak = { bass: 0, mid: 0, treble: 0 };
      this.sm = { level: 0, bass: 0, mid: 0, treble: 0 };
    }

    /* Deve ser chamado dentro de um clique/toque: as duas permissões
       são pedidas de imediato, sem esperar uma pela outra (exigência do iOS). */
    async start(onGyro) {
      const out = { audio: 'unsupported', orientation: 'unsupported' };
      if (!window.isSecureContext) {
        out.audio = out.orientation = 'insecure';
        return out;
      }
      const gyroP = this._requestOrientation();
      const audioP = this._startAudio();
      const [g, a] = await Promise.all([gyroP, audioP]);
      out.orientation = g;
      out.audio = a;
      this.audioOn = a === 'ok';
      this.orientOn = g === 'ok';

      if (this.orientOn) {
        window.addEventListener('deviceorientation', this._onOrient);
        // computadores disparam o evento sem valores: se nada útil chegar, avisa
        this._gyroTimer = setTimeout(() => {
          if (!this.orientSeen) {
            this.orientOn = false;
            window.removeEventListener('deviceorientation', this._onOrient);
            if (onGyro) onGyro('unavailable');
          } else if (onGyro) {
            onGyro('ok');
          }
        }, 1500);
      }
      return out;
    }

    stop() {
      clearTimeout(this._gyroTimer);
      window.removeEventListener('deviceorientation', this._onOrient);
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) { try { this.ctx.close(); } catch (e) { /* ignora */ } }
      this._clearSession();
    }

    async _requestOrientation() {
      if (!('DeviceOrientationEvent' in window)) return 'unsupported';
      const D = window.DeviceOrientationEvent;
      if (typeof D.requestPermission === 'function') {
        try {
          const r = await D.requestPermission();
          return r === 'granted' ? 'ok' : 'denied';
        } catch (e) {
          return 'denied';
        }
      }
      return 'ok';
    }

    async _startAudio() {
      const md = navigator.mediaDevices;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!md || !md.getUserMedia || !AC) return 'unsupported';
      let ctx;
      try { ctx = new AC(); } catch (e) { return 'unsupported'; }
      try {
        if (ctx.resume) ctx.resume().catch(() => {});
        const stream = await md.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (ctx.state === 'suspended') await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = TUNE.fftSize;
        an.smoothingTimeConstant = TUNE.analyserSmoothing;
        // fixados: os valores por omissão variam entre navegadores e alteram a escala
        an.minDecibels = TUNE.minDecibels;
        an.maxDecibels = TUNE.maxDecibels;
        src.connect(an); // sem ligar na saída: não há retorno de áudio
        this.ctx = ctx;
        this.stream = stream;
        this.analyser = an;
        this.freq = new Uint8Array(an.frequencyBinCount);
        this.wave = new Uint8Array(an.fftSize);
        return 'ok';
      } catch (e) {
        try { ctx.close(); } catch (_) { /* ignora */ }
        return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error';
      }
    }

    _angle() {
      let a = 0;
      if (window.screen.orientation && typeof window.screen.orientation.angle === 'number') a = window.screen.orientation.angle;
      else if (typeof window.orientation === 'number') a = window.orientation;
      return ((a % 360) + 360) % 360;
    }

    _onOrient(e) {
      if (e.gamma == null || e.beta == null) return;
      this.orientSeen = true;
      const ang = this._angle();
      let ax = e.gamma;
      let ay = e.beta;
      if (ang === 90) { ax = e.beta; ay = -e.gamma; }
      else if (ang === 270) { ax = -e.beta; ay = e.gamma; }
      else if (ang === 180) { ax = -e.gamma; ay = -e.beta; }
      // a posição em que o aparelho está ao ativar vira o centro
      if (this.base === null || this.baseAng !== ang) {
        this.base = { x: ax, y: ay };
        this.baseAng = ang;
      }
      this.tgt.x = clamp((ax - this.base.x) / TUNE.tiltRange, -1, 1);
      this.tgt.y = clamp((ay - this.base.y) / TUNE.tiltRange, -1, 1);
    }

    /* Pico da banda: a média dos `topBins` bins mais fortes, não de toda a banda.
     * Como o espectro da música cai ~9 dB por oitava, a média de uma banda larga
     * é dominada pelos bins de baixo nível no fim da banda — e apagava justamente
     * o que é estreito e transiente: o bombo em 1-2 bins dos graves, o prato em 3
     * dos 151 bins dos agudos. */
    _peakBand(lo, hi, hz) {
      const a = Math.max(1, Math.floor(lo / hz));
      const b = Math.min(this.freq.length - 1, Math.ceil(hi / hz));
      if (b < a) return 0;
      const k = Math.min(TUNE.topBins, b - a + 1);
      const top = this.top;
      for (let i = 0; i < k; i++) top[i] = 0;
      for (let i = a; i <= b; i++) {
        const v = this.freq[i];
        if (v <= top[k - 1]) continue;
        let j = k - 1;
        while (j > 0 && top[j - 1] < v) { top[j] = top[j - 1]; j--; }
        top[j] = v;
      }
      let s = 0;
      for (let i = 0; i < k; i++) s += top[i];
      return s / (k * 255);
    }

    /* Piso de ruído: o mínimo da banda. Cai na hora e sobe com tau de ~17 s, por
       isso em silêncio vai ter ao ruído da sala e fica lá sem acompanhar a música.
       É isto que impede a flor de ficar meia-aberta num sítio barulhento. */
    _floor(key, v, dt) {
      const f = this.floor[key];
      this.floor[key] = v < f ? v : f + (v - f) * (1 - Math.exp(-dt * TUNE.floorRise));
      return this.floor[key];
    }

    /* Pico da banda: o inverso do piso. Sobe na hora e cai com tau de ~12 s, por
       isso o curso da banda é o que a música realmente está a dar agora, e não o
       que um microfone qualquer dava quando os números foram escritos. */
    _peak(key, v, dt) {
      const p = this.peak[key];
      this.peak[key] = v > p ? v : Math.max(v, p * Math.exp(-dt * TUNE.peakFall));
      return this.peak[key];
    }

    _bandLevel(key, raw, dt) {
      const floor = this._floor(key, raw, dt);
      const peak = this._peak(key, raw, dt);
      // pico sobe na hora e piso desce na hora, portanto peak >= raw >= floor.
      // O max() com o curso mínimo é o que faz o silêncio dar silêncio em vez de
      // encher o curso todo; sem ele, cada banda se auto-amplifica ao seu ruído.
      const denom = Math.max(peak - floor, TUNE.bands[key][2]);
      return clamp((raw - floor) / denom, 0, 1);
    }

    update(dt) {
      let L = 0, B = 0, M = 0, T = 0;
      if (this.audioOn && this.analyser) {
        const an = this.analyser;
        an.getByteFrequencyData(this.freq);
        an.getByteTimeDomainData(this.wave);
        let s = 0;
        for (let i = 0; i < this.wave.length; i++) {
          const v = (this.wave[i] - 128) / 128;
          s += v * v;
        }
        L = clamp(Math.sqrt(s / this.wave.length) * TUNE.levelGain, 0, 1);
        const hz = this.ctx.sampleRate / an.fftSize;
        B = this._bandLevel('bass', this._peakBand(TUNE.bands.bass[0], TUNE.bands.bass[1], hz), dt);
        M = this._bandLevel('mid', this._peakBand(TUNE.bands.mid[0], TUNE.bands.mid[1], hz), dt);
        T = this._bandLevel('treble', this._peakBand(TUNE.bands.treble[0], TUNE.bands.treble[1], hz), dt);
      }
      // release a 7 (tau ~140 ms): a 4 a nuvem de pontos não cintila com os agudos
      const ease = (cur, target) => cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? TUNE.attack : TUNE.release)));
      this.sm.level = ease(this.sm.level, L);
      this.sm.bass = ease(this.sm.bass, B);
      this.sm.mid = ease(this.sm.mid, M);
      this.sm.treble = ease(this.sm.treble, T);

      // batida: um grave que salta acima do desvio recente, com refractária para
      // não perder as batidas rápidas nem retrigar num grave que só toca corrido
      this.bassAvg += (B - this.bassAvg) * (1 - Math.exp(-dt * TUNE.beatAvgRise));
      this.bassDev += (Math.abs(B - this.bassAvg) - this.bassDev) * (1 - Math.exp(-dt * TUNE.beatDevRise));
      this.beatHold = Math.max(0, this.beatHold - dt);
      const loudEnough = this.sm.level * this.audioSens > TUNE.beatMinLevel;
      if (this.beatHold <= 0 && loudEnough && B - this.bassAvg > Math.max(TUNE.beatFloor, this.bassDev * TUNE.beatRatio)) {
        this.pulse = 1;
        this.beatHold = TUNE.beatRefractory;
      }
      this.pulse *= Math.exp(-dt * TUNE.beatDecay);

      const k = 1 - Math.exp(-dt * TUNE.tiltEase);
      this.tilt.x += (this.tgt.x - this.tilt.x) * k;
      this.tilt.y += (this.tgt.y - this.tilt.y) * k;
    }

    /* Valores prontos para o shader, já com a sensibilidade aplicada.
       Tudo limitado a 0..1: os coeficientes dos shaders foram desenhados para
       esse intervalo. O topo é feito com ombro suave em vez de clamp, para que o
       curso inteiro do slider sirva para alguma coisa e a música alta continue a
       ter dinâmica em vez de pinar. */
    read() {
      const g = this.audioSens;
      const c = (v) => softKnee(v * g, TUNE.knee);
      return {
        level: c(this.sm.level),
        bass: c(this.sm.bass),
        mid: c(this.sm.mid),
        treble: c(this.sm.treble),
        pulse: c(this.pulse),
        tiltX: clamp(this.tilt.x * this.orientSens, -2, 2),
        tiltY: clamp(this.tilt.y * this.orientSens, -2, 2),
      };
    }
  }

  window.V1Interaction = V1Interaction;
})();
