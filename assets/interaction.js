/* v1su4rt — sensores: microfone (AudioContext + AnalyserNode) e giroscópio
   (deviceorientation). Nada é gravado nem enviado: os valores só alimentam o shader.
   Saem sete canais por frame: nível, grave, médio, agudo, batida (ataque dos graves),
   contratempo (ataque dos agudos) e timbre (que som é, não quanto som há). */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Toda a afinação do ouvido vive neste bloco: é o único sítio a mexer para mudar
     como a flor escuta. As bandas dizem o que cada uniforme recebe, o ataque e o
     release dizem quão depressa se move, a batida diz quando entra o flash (grave) e
     o contratempo diz quando entra o cintilar (agudos), o timbre diz que cor o
     som tem, e a re-centragem diz quanto tempo uma pose do aparelho deixa de ser
     novidade. Tudo em 0..1 salvo indicação em contrário. */
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

    // segundo canal de batida, nos AGUDOS. O grave isolado nunca dava flash em
    // palmas, estalidos, prato fechado nem voz consoante forte — tudo o que é
    // ataque sem bombo. É um canal separado com limiar e refractária próprios, e o
    // valor que produz (pulse2) só entra na amplitude do cintilar, nunca no flash do
    // fundo nem na fragmentação: o orçamento de luz do frame fica o que foi medido.
    // O portão de volume é o mesmo do grave (loudEnough): sem ele o chiado de uma
    // sala vazia, que o curso normalizado aproveita todo, punha a flor a tremer para
    // o nada — é exatamente o erro que o beatMinLevel corrigiu nos graves.
    beat2AvgRise: 3.0,
    beat2DevRise: 2.0,
    beat2Ratio: 1.8,
    beat2Floor: 0.05,
    beat2Refractory: 0.10,
    beat2Decay: 5.5,

    /* S2 — o caminho rápido, no domínio do tempo. Medido com um clique sintético
       injetado no mesmo AnalyserNode (3 repetições, números idênticos): o espetro só
       fica visível ao JavaScript aos 10 ms, o waveform aos 2 ms. Estes números detetam
       o ataque nas amostras de sempre, com um par lowpass/highpass de um polo, e é
       daqui que sai o INSTANTE do golpe — as bandas de continuam a mandar nas
       amplitudes. As refractárias são partilhadas com os detetores de espetro de
       propósito: um golpe não pode disparar duas vezes, porque a segunda dispararia a
       onda outra vez a meio do curso. */
    hitSplitHz: 250, // abaixo daqui é grave, acima é agudo
    /* O golpe tem de fazer UM TOPO NOVO. A primeira versão usava o mesmo par
       média/desvio dos detetores de espetro e falhou no teste sintético: uma nota
       corrida está sempre acima da sua própria média (que sobe a 3/s), e re-disparava
       a cada refractária. Um pico que desce e exige ser ultrapassado por 1,35 não tem
       esse problema — e continua a apanhar 32-avos, porque entre dois golpes a
       referência já caiu a pique. */
    hitHoldFall: 13,   // 1/s: tau ~77 ms da referência que desce
    hitOver: 1.35,     // o novo topo tem de exceder a referência por isto
    /* Piso de ruído do caminho rápido, no mesmo espírito do piso das bandas: cai de
       imediato e sobe devagar. É um MÍNIMO recente, não uma média — e é isso que o
       torna compatível com música: entre dois golpes o pico volta a cair a zero e o
       piso vai atrás, enquanto num chiado constante (ventoinha, sala ruim, ganho alto)
       o mínimo sobe até ao nível do chiado e tapa os falsos disparos. Medido: sem ele,
       ruído branco a −26 dBFS dava 18 disparos em 3 s. */
    hitNoiseCrawl: 0.35, // 1/s: quanto o piso sobe por segundo quando nada o puxa para baixo
    hitNoiseOver: 2.2,   // o golpe tem de valer isto acima do piso
    // pisos ABSOLUTOS, em fração do fundo da escala do waveform (0..1). Medidos no
    // mesmo teste: o chiado de sala sintético dá pico 0,061 no agudo e 0,028 no grave,
    // por isso os pisos ficam acima deles — aqui não há normalização por curso da
    // banda que os defenda, é o nível cru do microfone.
    hitFloorLo: 0.12,
    hitFloorHi: 0.10,
    // o cintilar é para o que é BRILHANTE. Um passo no ar é banda larga por natureza
    // (o ataque de um bombo também), por isso cada golpe escolhe um canal, e não os
    // dois: o grave manda no flash quando o lado de baixo domina (>= basta, é um
    // empata-desempate), o agudo só é elegível quando domina por margem — o highpass é
    // ruidoso por construção e um prato tem de se distinguir de um passo. Sem isto, um
    // kick dava flash e tremelicava ao mesmo tempo, e um prato dava flash.
    hitBalance: 1.4,

    // timbre: centro de massa do espectro em escala log, normalizado entre os dois
    // limites abaixo. É a única leitura que distingue uma flauta de uma guitarra ao
    // mesmo volume, e é ela que vai mandar na mistura de cor quando ela existir.
    // Os bins abaixo de timbreFloorBin (~22 dB acima do piso do analyzer) não
    // entram na soma: sem este corte o ruído de fundo, que é sempre o que lá está,
    // puxava o centroid para o meio e o canal não diria nada.
    timbreLoHz: 60,
    timbreHiHz: 9000,
    timbreFloorBin: 8,
    timbreEase: 2.5, // tau ~400 ms: uma cor não pode piscar a cada frame

    // re-centragem do giroscópio (em 1/s): a pose em que o aparelho está passa
    // lentamente a ser o novo neutro. Com 0 a base fica presa à pose do instante em
    // que a permissão foi concedida, e quem segurar o celular a 45° vê a flor
    // pendurada num lado para sempre. orientDeadband (graus) é o que um gesto tem de
    // ultrapassar para contar: é o que separa manter o aparelho inclinado de apontar.
    orientRecenter: 0.1,
    orientDeadband: 8,

    // giroscópio: ±40° de inclinação percorrem o curso todo
    tiltRange: 40,
    tiltEase: 9,

    // ombro suave do read(): linear até aqui, exponencial depois
    knee: 0.75,
  };

  /* Ombro suave: até `knee` é ganho puro; depois aproxima-se de 1 sem encostar no
     teto. Com clamp simples, a sensibilidade de fábrica 1,5 saturava tudo o que
     passasse de 0,667 — em música alta as bandas ficavam coladas no topo, a flor
     parava de responder, e a metade de cima do slider não fazia absolutamente nada. */
  function softKnee(x, knee) {
    if (x <= knee) return x;
    const top = 1 - knee;
    return 1 - top * Math.exp(-(x - knee) / top);
  }

  class V1Interaction {
    constructor() {
      this.audioSens = 1.5;
      this.orientSens = 1.5;
      this.top = new Array(TUNE.topBins).fill(0);
      this.tgt = { x: 0, y: 0 };
      this.tilt = { x: 0, y: 0 };
      // toda a memória do ouvido vem de _clearSession(), chamada aqui e em stop():
      // declará-la nos dois sítios é como um campo novo ficar com lixo de uma sala
      // anterior quando o usuário desliga e volta a ligar o microfone
      this._clearSession();
      this._onOrient = this._onOrient.bind(this);

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
      this.logTab = null;
      this.audioOn = false;
      this.orientOn = false;
      this.orientSeen = false;
      this.base = null;
      this.baseAng = null;
      this.cur = { x: 0, y: 0 };
      this.tgt.x = 0;
      this.tgt.y = 0;
      // arranque limpo: o piso entra pelo topo e o pico pelo fundo, para que a
      // primeira leitura seja o curso real do sinal e não um valor de outra sala
      this.bassAvg = 0;
      this.bassDev = 0;
      this.beatHold = 0;
      this.trebAvg = 0;
      this.trebDev = 0;
      this.beat2Hold = 0;
      this.pulse = 0;
      this.pulse2 = 0;
      // S2 — picos do caminho rápido e as marcas de que o golpe saiu daqui neste
      // frame (é o que prende a fase da onda ao instante certo, no shader)
      this.hitLo = 0;
      this.hitHi = 0;
      this.hitLoNoise = 0;
      this.hitHiNoise = 0;
      this.hitFlag = false;
      this.hit2Flag = false;
      // 0,5 é o meio do curso: sem microfone o timbre não desloca nada e a flor
      // comporta-se exatamente como se este canal não existisse
      this.timbre = 0.5;
      this.timbreTgt = 0.5;
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
        this._buildSpectrumMaps();
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
      // o aparelho mudar de orientação é um acontecimento, não uma pose: aí a base
      // salta para o centro novo na hora, porque os eixos deixaram de ser os mesmos
      if (this.base === null || this.baseAng !== ang) {
        this.base = { x: ax, y: ay };
        this.baseAng = ang;
      }
      // o ângulo atual guarda-se e lê-se em update(dt): a re-centragem precisa de dt,
      // e o evento chega a 60 Hz enquanto o renderizador corre a 30 num celular fraco
      this.cur.x = ax;
      this.cur.y = ay;
    }

    /* Tabelas do espectro, uma vez por microfone aberto. O centroid precisa do log
       de cada bin, e fazê-lo dentro do laço custaria ~370 logs por frame para nada:
       a frequência dos bins só depende do sampleRate. Os limites da normalização
       saem dos bins efetivamente somados, para que o curso inteiro do timbre seja
       realmente percorrido seja qual for a taxa de amostragem do aparelho. */
    _buildSpectrumMaps() {
      const hz = this.ctx.sampleRate / this.analyser.fftSize;
      const n = this.freq.length;
      const tab = new Float64Array(n);
      for (let i = 0; i < n; i++) tab[i] = Math.log((i + 0.5) * hz);
      this.logTab = tab;
      this.cLo = clamp(Math.floor(TUNE.timbreLoHz / hz), 1, n - 1);
      this.cHi = Math.max(this.cLo + 1, Math.min(Math.ceil(TUNE.timbreHiHz / hz), n - 1));
      this.cLoLog = tab[this.cLo];
      this.cHiLog = tab[this.cHi];
    }

    /* Centro de massa do espectro, em escala log. É a única leitura que não diz
       quanto som há, mas que som é: o mesmo golpe de prato e de bombo têm volumes
       iguais e centroids a anos-luz um do outro. Devolve -1 quando nada tem
       energia suficiente para entrar na soma, e quem chama mantém o último valor —
       um salto para o meio em cada pausa da música ia ler-se como uma mudança de cor. */
    _centroid() {
      const f = this.freq;
      const tab = this.logTab;
      let w = 0;
      let s = 0;
      for (let i = this.cLo; i <= this.cHi; i++) {
        const v = f[i];
        if (v < TUNE.timbreFloorBin) continue;
        s += tab[i] * v;
        w += v;
      }
      if (w <= 0) return -1;
      return clamp((s / w - this.cLoLog) / (this.cHiLog - this.cLoLog), 0, 1);
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
      let pkLo = 0, pkHi = 0;
      this.hitFlag = false;
      this.hit2Flag = false;
      if (this.audioOn && this.analyser) {
        const an = this.analyser;
        an.getByteFrequencyData(this.freq);
        an.getByteTimeDomainData(this.wave);
        /* S2 — uma passagem só serve as duas coisas: a energia do RMS e o pico dos dois
           lados do corte de um polo. O filtro é o mais barato que há e separa bumbo de
           prato à primeira ordem de grandeza, que é tudo o que se lhe pede. */
        const aSplit = 1 - Math.exp(-2 * Math.PI * TUNE.hitSplitHz / this.ctx.sampleRate);
        let s = 0, lp = 0;
        for (let i = 0; i < this.wave.length; i++) {
          const v = (this.wave[i] - 128) / 128;
          s += v * v;
          lp += aSplit * (v - lp);
          const lo = lp < 0 ? -lp : lp;
          const hi = v - lp;
          const ah = hi < 0 ? -hi : hi;
          if (lo > pkLo) pkLo = lo;
          if (ah > pkHi) pkHi = ah;
        }
        L = clamp(Math.sqrt(s / this.wave.length) * TUNE.levelGain, 0, 1);
        const hz = this.ctx.sampleRate / an.fftSize;
        B = this._bandLevel('bass', this._peakBand(TUNE.bands.bass[0], TUNE.bands.bass[1], hz), dt);
        M = this._bandLevel('mid', this._peakBand(TUNE.bands.mid[0], TUNE.bands.mid[1], hz), dt);
        T = this._bandLevel('treble', this._peakBand(TUNE.bands.treble[0], TUNE.bands.treble[1], hz), dt);
        const rawTimbre = this._centroid();
        if (rawTimbre >= 0) this.timbreTgt = rawTimbre;
      }
      // S2 — a referência que desce. Fica FORA do branch do áudio de propósito: assim
      // cai também nas pausas e com o microfone desligado, em vez de congelar no
      // último golpe ouvido
      const hold = Math.exp(-dt * TUNE.hitHoldFall);
      const refLo = this.hitLo * hold;
      const refHi = this.hitHi * hold;
      this.hitLo = Math.max(pkLo, refLo);
      this.hitHi = Math.max(pkHi, refHi);
      const crawl = TUNE.hitNoiseCrawl * dt;
      this.hitLoNoise = Math.min(pkLo, this.hitLoNoise + crawl);
      this.hitHiNoise = Math.min(pkHi, this.hitHiNoise + crawl);
      const gateLo = Math.max(TUNE.hitFloorLo, this.hitLoNoise * TUNE.hitNoiseOver);
      const gateHi = Math.max(TUNE.hitFloorHi, this.hitHiNoise * TUNE.hitNoiseOver);
      // release a 7 (tau ~140 ms): a 4 a nuvem de pontos não cintila com os agudos
      const ease = (cur, target) => cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? TUNE.attack : TUNE.release)));
      this.sm.level = ease(this.sm.level, L);
      this.sm.bass = ease(this.sm.bass, B);
      this.sm.mid = ease(this.sm.mid, M);
      this.sm.treble = ease(this.sm.treble, T);
      // O timbre é o único canal sem ataque/release assimétricos: é uma posição no
      // espectro, não uma intensidade. Ease a 2,5 (tau ~400 ms) e, nas pausas da
      // música, fica onde estava em vez de fugir para o meio.
      this.timbre += (this.timbreTgt - this.timbre) * (1 - Math.exp(-dt * TUNE.timbreEase));

      // batida: um grave que salta acima do desvio recente, com refractária para
      // não perder as batidas rápidas nem retrigar num grave que só toca corrido
      this.bassAvg += (B - this.bassAvg) * (1 - Math.exp(-dt * TUNE.beatAvgRise));
      this.bassDev += (Math.abs(B - this.bassAvg) - this.bassDev) * (1 - Math.exp(-dt * TUNE.beatDevRise));
      this.beatHold = Math.max(0, this.beatHold - dt);
      // o gate usa o máximo entre o RMS cru e o suavizado: o suavizado (tau 36 ms)
      // chegava atrasado exatamente no instante em que o caminho rápido serve
      const loudEnough = Math.max(L, this.sm.level) * this.audioSens > TUNE.beatMinLevel;
      /* S2 — primeiro o caminho rápido (2 ms de waveform contra 10 ms de espetro).
         Se ele disparar, fecha a refractária e o detetor de espetro abaixo vê o portão
         fechado e não dispara outra vez sobre o mesmo golpe. São dois detetores a
         decidir o MESMO instante, não dois flashes. */
      if (this.beatHold <= 0 && loudEnough && pkLo > gateLo && pkLo >= pkHi && pkLo > refLo * TUNE.hitOver) {
        this.pulse = 1;
        this.beatHold = TUNE.beatRefractory;
        this.hitFlag = true;
      }
      if (this.beatHold <= 0 && loudEnough && B - this.bassAvg > Math.max(TUNE.beatFloor, this.bassDev * TUNE.beatRatio)) {
        this.pulse = 1;
        this.beatHold = TUNE.beatRefractory;
        this.hitFlag = true;
      }
      this.pulse *= Math.exp(-dt * TUNE.beatDecay);

      // contratempo: o mesmo detetor sobre os AGUDOS. É o que faz uma palma, um
      // estalido ou o prato fechado darem o cintilar que o bombo dá ao flash. O
      // portão de volume é partilhado de propósito: o que autoriza um golpe é a sala
      // estar a dar som, não o microfone estar a ouvir o próprio chiado.
      this.trebAvg += (T - this.trebAvg) * (1 - Math.exp(-dt * TUNE.beat2AvgRise));
      this.trebDev += (Math.abs(T - this.trebAvg) - this.trebDev) * (1 - Math.exp(-dt * TUNE.beat2DevRise));
      this.beat2Hold = Math.max(0, this.beat2Hold - dt);
      const trebleJump = T - this.trebAvg;
      if (this.beat2Hold <= 0 && loudEnough && pkHi > gateHi && pkHi > pkLo * TUNE.hitBalance && pkHi > refHi * TUNE.hitOver) {
        this.pulse2 = 1;
        this.beat2Hold = TUNE.beat2Refractory;
        this.hit2Flag = true;
      }
      if (this.beat2Hold <= 0 && loudEnough && trebleJump > Math.max(TUNE.beat2Floor, this.trebDev * TUNE.beat2Ratio)) {
        this.pulse2 = 1;
        this.beat2Hold = TUNE.beat2Refractory;
        this.hit2Flag = true;
      }
      this.pulse2 *= Math.exp(-dt * TUNE.beat2Decay);

      this._recenter(dt);
      const k = 1 - Math.exp(-dt * TUNE.tiltEase);
      this.tilt.x += (this.tgt.x - this.tilt.x) * k;
      this.tilt.y += (this.tgt.y - this.tilt.y) * k;
    }

    /* Re-centragem lenta: a pose em que o aparelho está passa a ser o neutro, por
       isso segurar o telemóvel inclinado deixa de deixar a flor pendurada para
       sempre. A banda morta é o que separa isso de apontar: sem ela, o gesto que se
       mantém dez segundos apaga-se a si próprio a meio. O equilíbrio é um desvio de
       exatamente orientDeadband — uma pose largada fica sempre a pender oito graus,
       que é o suficiente para se ler como intenção e não como defeito. */
    _recenter(dt) {
      if (!this.base) {
        this.tgt.x = 0;
        this.tgt.y = 0;
        return;
      }
      const dx = this.cur.x - this.base.x;
      const dy = this.cur.y - this.base.y;
      if (this.orientOn && TUNE.orientRecenter > 0) {
        const k = 1 - Math.exp(-dt * TUNE.orientRecenter);
        const db = TUNE.orientDeadband;
        if (Math.abs(dx) > db) this.base.x += (dx - Math.sign(dx) * db) * k;
        if (Math.abs(dy) > db) this.base.y += (dy - Math.sign(dy) * db) * k;
      }
      this.tgt.x = clamp(dx / TUNE.tiltRange, -1, 1);
      this.tgt.y = clamp(dy / TUNE.tiltRange, -1, 1);
    }

    /* Valores prontos para o shader, já com a sensibilidade aplicada.
       Tudo limitado a 0..1: os coeficientes dos shaders foram desenhados para
       esse intervalo. O topo é feito com ombro suave em vez de clamp, para que o
       curso inteiro do slider sirva para alguma coisa e a música alta continue a
       ter dinâmica em vez de encostar no teto. */
    read() {
      const g = this.audioSens;
      const c = (v) => softKnee(v * g, TUNE.knee);
      return {
        level: c(this.sm.level),
        bass: c(this.sm.bass),
        mid: c(this.sm.mid),
        treble: c(this.sm.treble),
        pulse: c(this.pulse),
        // o contratempo não passa pela sensibilidade: é um cintilar, e o que o
        // autoriza é a sala estar a dar som (loudEnough), não o slider estar no topo
        pulse2: clamp(this.pulse2, 0, 1),
        // S1 — "bateu neste frame". Não é uma intensidade, é uma marca de tempo: é o
        // que faz o shader reiniciar o relógio da onda no instante do golpe em vez de
        // a apanhar numa fase arbitrária da senoide do relógio corrido.
        hit: this.hitFlag,
        hit2: this.hit2Flag,
        // 0,5 sem microfone: o timbre é a única leitura que existe mesmo quando o
        // áudio está desligado, e tem de dizer "neutro" e não "grave" ou "agudo"
        timbre: clamp(this.timbre, 0, 1),
        tiltX: clamp(this.tilt.x * this.orientSens, -2, 2),
        tiltY: clamp(this.tilt.y * this.orientSens, -2, 2),
      };
    }
  }

  window.V1Interaction = V1Interaction;
})();
