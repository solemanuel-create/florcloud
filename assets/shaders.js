/* v1su4rt — renderizador WebGL: fundo animado + flor desenhada em nuvem de pontos.
   Fundo: gradiente radial deslocado pela inclinação, ondas com graves, cor com médios.
   Flor: ~47 mil pontos em cinco voltas de pétalas, miolo, filetes, sépalas, caule e
         folhas; cada ponto é iluminado pela sua normal (claro/escuro, luz atravessada,
         orla) e tem uma fase própria — nasce, cresce e desfaz-se. O som abre a flor por
         raio (borda=graves, centro=agudos) e, em graves fortes, descola pontos da borda
         que sobem e se espalham como fumaça colorida. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* G3 — um teto só para a inclinação. O tilt era o único canal do renderizador
     que chegava aos consumidores com um corte próprio: a flor parava em ±1,2, a luz
     de teto em ±1, o fundo do ecrã não parava em lado nenhum — e o canal inteiro
     estava já cortado a ±1 monte acima, em _recenter. À sensibilidade de fábrica
     (1,5) isso dava três ângulos de aparelho diferentes a partir dos quais cada
     parte deixava de se mexer: a luz a 27°, a flor a 32°, o fundo a 40°, e depois
     nada, nunca mais, até ao fim do gesto. É o mesmo mal que o ombro suave resolveu
     no áudio, em interaction.js, e que aqui nunca tinha sido aplicado.
        O joelho vive neste funil e não em read() porque o tilt tem dois caminhos: o
     giroscópio passa por read(), o rato e o toque (app.js) não passam. Aqui passam
     os dois. A curva é a de lá — linear até 0,75, o mesmo valor do knee, e
     assintótica a ±1 depois.
        Como o teto passa a ser um só, cada coeficiente foi posto no valor que dá a
     cada consumidor o máximo que ele já tinha: flor 0,25 → 0,30 (o corte dela em
     1,2 valia exatamente 0,30 rad), luz fica em 0,18 (o corte em 1 já era o teto
     novo), fundo 0,12 → 0,18 (a sensibilidade de fábrica dava 1,5×0,12 = 0,18). O
     que se mexe é o meio do curso, todo ele para cima: a 20° de aparelho a flor
     inclina 12,9° em vez de 10,7° e o fundo desloca 0,135 em vez de 0,09 uv; a luz
     não se mexe nenhum (7,73° nos dois). Medido em _knee.mjs, e foi o A/B que disse
     que sem subir os coeficientes o teto partilhado custava −17% à flor e −33% ao
     fundo. */
  const TILT_KNEE = 0.75;
  function tiltKnee(v) {
    const x = Number(v) || 0;
    const s = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    if (a <= TILT_KNEE) return x;
    const top = 1 - TILT_KNEE;
    return s * (1 - top * Math.exp(-(a - TILT_KNEE) / top));
  }

  /* A nuvem é sorteada uma vez, e com semente: com Math.random() cada recarga
     dava outra distribuição de pontos e outra atribuição de fases, por isso o
     enquadramento e o brilho que se afinam numa tela não eram os que o público vê
     no outro — nem uma fotografia tirada ao vivo servia para comparar. É ruído
     espacial, não segredo: um mulberry32 chega e é reprodutível em qualquer
     navegador. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const CLOUD_SEED = 0x51f07ac;
  let rnd = mulberry32(CLOUD_SEED);

  /* ========== SHADERS ========== */

  // O texto GLSL vive em shaders.glsl.js, carregado antes deste arquivo: assim,
  // para mudar o visual não é preciso atravessar o renderizador.
  const GLSL = window.v1su4rtGlsl;
  if (!GLSL) throw new Error('[v1su4rt] shaders.glsl.js em falta: sem texto GLSL não há renderizador');
  const VERTEX_BG = GLSL.VERTEX_BG;
  const FRAGMENT_BG = GLSL.FRAGMENT_BG;
  const VERTEX_POINTS = GLSL.VERTEX_POINTS;
  const FRAGMENT_POINTS = GLSL.FRAGMENT_POINTS;

  /* ========== GEOMETRIA ========== */

  // Lâmina (pétala ou folha): perfil ao longo do comprimento, curvatura e copo,
  // depois levantada em torno de X e rodada em torno do eixo Y pela azimute.
  // Escreve no `out` que recebe, porque é chamada cinco vezes por ponto para as
  // diferenças finitas da normal. Nota medida: isto não acelerou a construção — os
  // ~73 ms do arranque são a matemática (1,4 M chamadas transcendentais), não o
  // lixo; ver buildTime() e o CHANGELOG do v16. Ficou assim porque o construtor já
  // partilha os rascunhos, não porque valha por si.
  function bladeSampler(o, azimuth) {
    const ct = Math.cos(o.tilt);
    const st = Math.sin(o.tilt);
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    return function (u, v01, out) {
      const v = v01 - 0.5;
      const profile = Math.pow(u, o.round) * (1 - o.tip * Math.pow(u, o.tipPow));
      const x = v * o.width * profile;
      const z = o.radius + u * o.length;
      const y = o.curl * o.length * u * u + o.cup * o.width * 4 * v * v + o.twist * o.length * u * v;
      const yy = y * ct + z * st + o.y;
      const zz = -y * st + z * ct;
      const o3 = out || [0, 0, 0];
      o3[0] = x * ca + zz * sa;
      o3[1] = yy;
      o3[2] = -x * sa + zz * ca + o.zoff;
      return o3;
    };
  }

  function bladeColor(a, b) {
    return function (u, v, out) {
      const k = Math.pow(u, 0.8);
      const midrib = 1 + 0.30 * Math.exp(-(v * v) / 0.010);
      const edge = 1 - 0.22 * Math.pow(Math.abs(v) * 2, 3);
      const f = midrib * edge;
      const o3 = out || [0, 0, 0];
      o3[0] = clamp(a[0] + (b[0] - a[0]) * k, 0, 1.2) * f;
      o3[1] = clamp(a[1] + (b[1] - a[1]) * k, 0, 1.2) * f;
      o3[2] = clamp(a[2] + (b[2] - a[2]) * k, 0, 1.2) * f;
      return o3;
    };
  }

  // voltas de pétalas, de fora (deitada) para dentro (ereta). A paleta segue o
  // referente medido: o centro é ouro escuro (L 0,17, sat 0,90, quase sem azul),
  // a volta mais brilhante fica em ~0,25 do raio da flor (L 0,30) e a partir daí
  // a luz cai até ~0,20 na borda. Dentro de cada pétala a nervura central clara e
  // as orlas escuras é que dão o contraste quando a nuvem é fina.
  // largas e sobrepostas: uma corola de lâminas estreitas lê-se como fogo-de-artifício
  // pontilhado, não como flor. A copa (cup) fecha cada lâmina em calha, e são as
  // calhas encostadas umas às outras que dão o claro-escuro de pétala a pétala.
  const WHORLS = [
    { count: 16, radius: 0.200, length: 0.82, width: 0.400, tilt: 0.34, curl: 0.16, cup: 0.30, twist: 0.050, base: [0.80, 0.12, 0.06], tipCol: [0.46, 0.05, 0.05] },
    { count: 14, radius: 0.170, length: 0.68, width: 0.360, tilt: 0.55, curl: 0.19, cup: 0.34, twist: 0.045, base: [0.90, 0.20, 0.06], tipCol: [0.56, 0.09, 0.05] },
    { count: 11, radius: 0.135, length: 0.52, width: 0.300, tilt: 0.76, curl: 0.22, cup: 0.38, twist: 0.040, base: [0.94, 0.33, 0.06], tipCol: [0.62, 0.14, 0.06] },
    { count: 9, radius: 0.100, length: 0.38, width: 0.250, tilt: 0.98, curl: 0.25, cup: 0.42, twist: 0.035, base: [0.82, 0.35, 0.06], tipCol: [0.72, 0.22, 0.07] },
    { count: 6, radius: 0.060, length: 0.26, width: 0.190, tilt: 1.22, curl: 0.28, cup: 0.46, twist: 0.030, base: [0.60, 0.27, 0.05], tipCol: [0.68, 0.26, 0.05] },
  ];

  // ponta larga (tip pequeno): uma lâmina que afunila muito deixa ver o fundo entre
  // as vizinhas e a flor lê como estrela de pontas, não como corola
  const BLADE_OPTS = { round: 0.35, tip: 0.22, tipPow: 3, y: 0, zoff: 0 };

  // folhas presas ao caule; zoff acompanha a curva do caule à altura de cada uma
  const LEAVES = [
    { az: 0.7, y: -0.55, zoff: 0.03, length: 0.46, width: 0.24, tilt: 0.16, curl: -0.10, cup: 0.12, twist: 0.03 },
    { az: 2.7, y: -0.80, zoff: 0.06, length: 0.40, width: 0.215, tilt: 0.12, curl: -0.12, cup: 0.12, twist: -0.03 },
    { az: 4.5, y: -1.06, zoff: 0.10, length: 0.34, width: 0.185, tilt: 0.08, curl: -0.14, cup: 0.12, twist: 0.03 },
    { az: 5.7, y: -1.34, zoff: 0.17, length: 0.30, width: 0.165, tilt: 0.05, curl: -0.16, cup: 0.12, twist: -0.03 },
  ];

  /* A nuvem é construída sobre as MESMAS superfícies paramétricas da flor: para
     cada superfície faz-se uma grade com tantas células quanta a sua área, e cai
     um ponto num ponto aleatório de cada célula. A densidade fica uniforme sobre
     toda a flor, e qualquer prefixo da lista é uma amostra representativa dela —
     é isso que permite desenhar menos pontos quando faltam fps sem mudar a
     silhueta. */
  const SPACING = 0.0138; // distância média entre pontos, em unidades de mundo

  function newCloud() {
    return { pos: [], norm: [], col: [], seed: [], rad: [], band: [], posB: [] };
  }

  function gridFor(area, aspect) {
    const cells = Math.max(6, Math.round(area / (SPACING * SPACING)));
    const nu = Math.max(2, Math.round(Math.sqrt(cells * aspect)));
    const nv = Math.max(2, Math.round(cells / nu));
    return { nu: nu, nv: nv };
  }

  // normais por diferenças finitas; a normal é sempre virada para fora do eixo,
  // porque uma lâmina fina tem duas faces e a que interessa ao fumo é a de fora
  const _p = [0, 0, 0], _pu = [0, 0, 0], _mu = [0, 0, 0], _pv = [0, 0, 0], _mv = [0, 0, 0];
  const _du = [0, 0, 0], _dv = [0, 0, 0], _n = [0, 0, 0], _c = [0, 0, 0];

  function addCloudSurface(g, nu, nv, sampler, colorFn, radFn, band) {
    const eps = 0.001;
    for (let i = 0; i < nu; i++) {
      const u = (i + rnd()) / nu;
      for (let j = 0; j < nv; j++) {
        const v = (j + rnd()) / nv;
        const p = sampler(u, v, _p);
        const pu = sampler(c01(u + eps), v, _pu);
        const mu = sampler(c01(u - eps), v, _mu);
        const pv = sampler(u, c01(v + eps), _pv);
        const mv = sampler(u, c01(v - eps), _mv);
        const du = _du;
        const dv = _dv;
        du[0] = pu[0] - mu[0]; du[1] = pu[1] - mu[1]; du[2] = pu[2] - mu[2];
        dv[0] = pv[0] - mv[0]; dv[1] = pv[1] - mv[1]; dv[2] = pv[2] - mv[2];
        const n = normalize3(cross3(du, dv, _n), _n);
        if (n[0] * p[0] + n[2] * p[2] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }

        const c = colorFn(u, v, _c);
        g.pos.push(p[0], p[1], p[2]);
        g.norm.push(n[0], n[1], n[2]);
        g.col.push(clamp(c[0], 0, 1.2), clamp(c[1], 0, 1.2), clamp(c[2], 0, 1.2));
        g.seed.push(rnd(), rnd(), rnd());
        g.rad.push(radFn(u, v));
        g.band.push(band);
      }
    }
  }

  function swapArr(a, i, j, stride) {
    for (let k = 0; k < stride; k++) {
      const t = a[i * stride + k];
      a[i * stride + k] = a[j * stride + k];
      a[j * stride + k] = t;
    }
  }

  function shuffleCloud(g) {
    const n = g.rad.length;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      if (j !== i) {
        swapArr(g.pos, i, j, 3);
        swapArr(g.posB, i, j, 3);
        swapArr(g.norm, i, j, 3);
        swapArr(g.col, i, j, 3);
        swapArr(g.seed, i, j, 3);
        swapArr(g.rad, i, j, 1);
        swapArr(g.band, i, j, 1);
      }
    }
    return g;
  }

  /* B4 — a segunda casa de cada ponto: a cabeça de sementes.

     É o espiral de Vogel: o slot s recebe raio HEAD.r·√(s/N) e ângulo s·137,507°. É
     a construção que faz um disco de sementes mostrar espirais nos dois sentidos, e
     por isso foi escolhida em vez de anéis regulares: anéis lêem-se como um radar,
     o espiral lê-se como uma flor.

     O índice não é a ordem de construção, é o RAIO na flor: os pontos são ordenados
     por `rad` antes de receberem o slot. Assim o miolo e os filetes caem no centro do
     disco e a borda das pétalas cai na borda do disco, e o morph lê-se como a corola a
     fechar-se sobre as próprias sementes — não como pontos embaralhados. É também o
     que faz o `a_rad` do shader continuar a dizer alguma coisa: a fronteira
     grave/agudo vai parar ao bordo de fora.

     Quem não mora na cabeça fica em casa: o cálice (band 0,5), o caule e as folhas
     (band 0) têm posB = pos, porque um disco de sementes pousado num cálice verde sobre
     um caule ainda se lê como uma planta, e um disco a flutuar no sítio onde estava uma
     flor já não se lê como nada. O shader repete esta porta (`onHead`) para a normal;
     os dois lados têm de bater certo. */
  function assignSeedHead(g) {
    const H = GLSL.SEED_HEAD;
    const n = g.rad.length;
    for (let k = 0; k < n; k++) {
      g.posB.push(g.pos[k * 3], g.pos[k * 3 + 1], g.pos[k * 3 + 2]);
    }
    const head = [];
    for (let k = 0; k < n; k++) if (g.band[k] > 0.6) head.push(k);
    head.sort(function (a, b) { return g.rad[a] - g.rad[b]; });

    const m = head.length;
    for (let s = 0; s < m; s++) {
      const t = (s + 0.5) / m;
      const rr = H.r * Math.sqrt(t);
      const th = s * H.golden;
      const k = head[s] * 3;
      g.posB[k] = rr * Math.cos(th);
      g.posB[k + 1] = H.y + H.dome * (1 - t);
      g.posB[k + 2] = rr * Math.sin(th);
    }
    return m;
  }

  // filetes: tubo fino que sai do miolo e inclina para fora, com antera na ponta
  function stamenSampler(azimuth, lean, len) {
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    const ex = Math.sin(lean);
    const ey = Math.cos(lean);
    return function (u, v, out) {
      const phi = v * Math.PI * 2;
      const bulb = Math.exp(-Math.pow((u - 0.94) * 7.0, 2));
      const rad = 0.007 + 0.006 * u + 0.016 * bulb;
      const along = u * len;
      const radial = ex * along + ey * Math.cos(phi) * rad;
      const vertical = ey * along - ex * Math.cos(phi) * rad;
      const tangential = Math.sin(phi) * rad;
      out[0] = ca * radial - sa * tangential;
      out[1] = vertical;
      out[2] = sa * radial + ca * tangential;
      return out;
    };
  }

  const BLADE_AREA = 0.69; // integral do perfil de largura d'u de uma lâmina

  function buildCloud() {
    // a semente é relançada aqui, e não no módulo: assim a silhueta é sempre a
    // mesma, chame-se buildCloud() uma vez ou dez
    rnd = mulberry32(CLOUD_SEED);
    const g = newCloud();
    const blade = Object.create(BLADE_OPTS);

    // 5 voltas de pétalas, cada volta meia azimute da anterior
    WHORLS.forEach(function (w, wi) {
      const offset = wi * (Math.PI / w.count);
      for (let i = 0; i < w.count; i++) {
        blade.radius = w.radius;
        blade.length = w.length;
        blade.width = w.width;
        blade.tilt = w.tilt;
        blade.curl = w.curl;
        blade.cup = w.cup;
        blade.twist = w.twist * (i % 2 ? 1 : -1);
        blade.round = BLADE_OPTS.round;
        blade.tip = BLADE_OPTS.tip;
        blade.tipPow = BLADE_OPTS.tipPow;
        blade.y = 0;
        blade.zoff = 0;

        const gr = gridFor(w.length * w.width * BLADE_AREA, w.length / w.width);
        const az = offset + (i / w.count) * Math.PI * 2;
        addCloudSurface(
          g,
          gr.nu,
          gr.nv,
          bladeSampler(blade, az),
          bladeColor(w.base, w.tipCol),
          function (u) { return c01((w.radius + u * w.length) / 1.15); },
          1
        );
      }
    });

    // sépalas: cinco lâminas verdes na base da corola; fragmentam-se a meio
    for (let i = 0; i < 5; i++) {
      blade.radius = 0.05;
      blade.length = 0.30;
      blade.width = 0.11;
      blade.tilt = 0.22;
      blade.curl = 0.05;
      blade.cup = 0.22;
      blade.twist = 0.02;
      blade.round = 0.45;
      blade.tip = 0.55;
      blade.tipPow = 5;
      blade.y = -0.10;
      blade.zoff = 0;
      const gr = gridFor(0.30 * 0.11 * BLADE_AREA, 0.30 / 0.11);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        bladeSampler(blade, (i / 5) * Math.PI * 2 + 0.4),
        bladeColor([0.10, 0.30, 0.07], [0.05, 0.16, 0.05]),
        function () { return 0.02; },
        0.5
      );
    }

    // miolo: domo dourado amostrado por raio ao quadrado, que é como se obtém
    // densidade uniforme numa superfície de revolução
    const mioloR = 0.175;
    const mioloArea = Math.PI * mioloR * mioloR * 1.35;
    const mioloGrid = gridFor(mioloArea, mioloR / (Math.PI * mioloR));
    addCloudSurface(
      g,
      mioloGrid.nu,
      mioloGrid.nv,
      function (u, v, out) {
        const rr = mioloR * Math.sqrt(u);
        const th = Math.asin(Math.min(1, rr / mioloR));
        const phi = v * Math.PI * 2;
        const seed = 0.006 * Math.sin(phi * 9.0) * Math.sin(th * 5.0);
        out[0] = Math.cos(phi) * (rr + seed);
        out[1] = 0.205 * Math.cos(th) - 0.015;
        out[2] = Math.sin(phi) * (rr + seed);
        return out;
      },
      function (u, v, out) {
        // o disco é ouro escuro no meio e acende para o bordo, que é onde está o
        // anel brilhante do referente; nunca leva azul, que é o que lê como tinta.
        // É mesmo escuro porque aqui os pontos se empilham: o acumulado aditivo
        // multiplicaria por três o que aqui se pinta.
        const speck = 0.74 + 0.26 * Math.sin(v * Math.PI * 2 * 11.0) * Math.sin(u * Math.PI * 4.0);
        out[0] = (0.15 + 0.16 * u) * speck;
        out[1] = (0.095 + 0.085 * u) * speck;
        out[2] = 0.018 + 0.014 * u;
        return out;
      },
      function () { return 0.05; },
      1
    );

    // filetes à volta do miolo
    for (let i = 0; i < 20; i++) {
      const az = (i / 20) * Math.PI * 2 + 0.15;
      const lean = 0.34 + 0.12 * Math.sin(i * 2.3);
      const len = 0.30 + 0.07 * Math.cos(i * 1.7);
      // os filetes são detalhe: uma em cada duas células da sua área chega, e o
      // centro da corola fica com menos pontos empilhados para não estourar
      const gr = gridFor(len * 0.085 * 0.45, len / 0.085);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        stamenSampler(az, lean, len),
        function (u, v, out) {
          const head = Math.pow(c01((u - 0.55) / 0.45), 2);
          out[0] = 0.35 + 0.40 * head;
          out[1] = 0.28 - 0.08 * head;
          out[2] = 0.05 - 0.03 * head;
          return out;
        },
        function (u) { return 0.02 + u * 0.10; },
        0.85
      );
    }

    // caule: comprido e curvado para a frente, para se ver inteiro em 3/4
    const grStem = gridFor(1.66 * 0.18, 1.66 / 0.18);
    addCloudSurface(
      g,
      grStem.nu,
      grStem.nv,
      function (u, v, out) {
        const phi = v * Math.PI * 2;
        const y = -1.72 + u * 1.66;
        const rr = 0.036 - 0.016 * u;
        // o pé vem para a câmara: sem isto o caule foge para trás e desaparece
        const zc = 0.30 * (1 - u) * (1 - u);
        const xc = Math.sin(u * 2.2) * 0.045;
        out[0] = Math.cos(phi) * rr + xc;
        out[1] = y;
        out[2] = Math.sin(phi) * rr + zc;
        return out;
      },
      function (u, v, out) {
        const lit = 0.55 + 0.45 * Math.cos(v * Math.PI * 2);
        out[0] = 0.10 * lit;
        out[1] = (0.40 + 0.14 * u) * lit;
        out[2] = 0.09 * lit;
        return out;
      },
      function () { return 0.0; },
      0
    );

    // folhas: quase deitadas (tilt pequeno) e com curl negativo, porque uma folha
    // caía dobra para baixo, ao contrário das pétalas, que se curvam para dentro
    LEAVES.forEach(function (L) {
      blade.radius = 0.04;
      blade.length = L.length;
      blade.width = L.width;
      blade.tilt = L.tilt;
      blade.curl = L.curl;
      blade.cup = L.cup;
      blade.twist = L.twist;
      blade.round = 0.38;
      blade.tip = 0.50;
      blade.tipPow = 4;
      blade.y = L.y;
      blade.zoff = L.zoff;
      const gr = gridFor(L.length * L.width * BLADE_AREA, L.length / L.width);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        bladeSampler(blade, L.az),
        bladeColor([0.10, 0.32, 0.08], [0.04, 0.15, 0.05]),
        function () { return 0.90; },
        0
      );
    });

    // B4: a segunda casa de cada ponto, calculada sobre a nuvem inteira e já ordenada
    // por raio — por isso vem depois de todas as superfícies e antes do baralho
    headPoints = assignSeedHead(g);

    return {
      pos: new Float32Array(shuffleCloud(g).pos),
      posB: new Float32Array(g.posB),
      norm: new Float32Array(g.norm),
      col: new Float32Array(g.col),
      seed: new Float32Array(g.seed),
      rad: new Float32Array(g.rad),
      band: new Float32Array(g.band),
      count: g.rad.length,
    };
  }

  /* ========== ESTADO ========== */

  let gl = null;
  let canvas = null;
  let driver = null;
  let raf = 0;
  let rendererMode = 'webgl';

  let progBg = null;
  let progPoints = null;
  let bgBuffer = null;
  let points = null;

  let time = 0;
  let timeScale = 1;
  let spin = 0;
  let spinVel = 0; // C5: a rotação tem inércia, ver drawFlower()
  let prec = 0; // C5: ângulo de precessão do eixo da flor
  let lastFrameTime = 0;

  // vida média de um ponto, em segundos. O ciclo é feito no CPU e entregue como
  // u_phase já em [0,1): um mediump float com t=600 s teria passo de 0,32 e um
  // terço dos pontos mudaria de idade de um frame para o outro.
  const LIFE = 3.4;
  let phase = 0;

  /* Enquadramento — todos os números da câmara num só sítio.
     O FOV é vertical e fixo, por isso é a LARGURA que corta: quanto mais estreito
     a tela, mais perto fica o corte das pontas das pétalas. Em vez de escalar a
     flor, recua-se a câmara: os pontos têm diâmetro em unidades de mundo, e assim
     a relação ponto/flor continua a ser a que os shaders foram desenhados para ler
     como nuvem de fumo. */
  const FRAME = {
    fovDeg: 45,
    eyeZ: 3.5, // distância de referência: os 3.2..4.6 da névoa nos shaders são medidos aqui
    reach: 0.96, // meio-comprimento da corola aberta (pétala 0,932 × escala 0,82 + abertura dos graves)
    fill: 0.94, // fração da meia-largura visível que a flor pode ocupar
    lift: 0.20, // em retrato, fração da meia-altura visível que a flor sobe para ficar livre do painel
  };

  const eye = [0, 0, FRAME.eyeZ];
  let camLift = 0;

  /* B2 — a luz era um vetor fixo dentro do shader, por isso a flor tinha sempre a
     mesma cara iluminada. Passa a vir em `u_light` e a mover-se aqui. Os dois ângulos
     abaixo são exatamente a direção antiga — (0,45, 0,85, 0,35) normalizada — escrita
     em azimute e elevação, para se poder orbitar sem sair do mesmo cone de luz: no
     frame zero a incidência é a que foi desenhada e medida.
     `orbitAmp` de ±15° dá às nervuras tempo para acenderem de um lado e do outro, e
     `tiltPull` faz a elevação acompanhar o braço de quem segura o aparelho. O período
     (~2 min) é da ordem de grandeza de uma música: quem ouvir três faixas não vê a
     mesma luz duas vezes, e não há um ciclo visível a sobrepor-se ao da rotação. */
  const LIGHT = {
    azim: 0.9095, // atan2(0,45, 0,35)
    elev: 0.9798, // asin(0,85 / 1,02347)
    orbitAmp: 0.2618, // 15° em radianos
    orbitHz: 0.05, // rad/s: período de ~126 s
    tiltPull: 0.18, // rad de elevação por unidade de inclinação
  };
  const light = [0, 0, 0];

  function lightDir(t, tiltY) {
    const az = LIGHT.azim + LIGHT.orbitAmp * Math.sin(t * LIGHT.orbitHz);
    const el = LIGHT.elev + LIGHT.tiltPull * tiltY;
    const c = Math.cos(el);
    light[0] = c * Math.sin(az);
    light[1] = Math.sin(el);
    light[2] = c * Math.cos(az);
    return light;
  }

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  // as cinco matrizes do modelo da flor vivem em buffers fixos: ver MATH abaixo
  const model = new Float32Array(16);
  const rot = new Float32Array(16);
  const mScratch = new Float32Array(16);
  const normalMat = new Float32Array(9);
  let pointMaxPx = 64; // máximo do driver para gl_PointSize
  let pointPx = 1; // pixels por unidade de mundo à profundidade 1

  let quality = 1; // cai quando os fps não chegam
  let fpsAvg = 60;
  let lastTune = 0;
  let buildMs = 0; // milissegundos de tela em branco gastos a construir a nuvem
  let headPoints = 0; // B4: quantos pontos moram na cabeça e foram reindexados no disco

  const state = { audio: 0, bass: 0, mid: 0, treble: 0, pulse: 0, pulse2: 0, timbre: 0.5, tiltX: 0, tiltY: 0, cloud: 1, mixCor: 0, mixForm: 0, hitT: 0, hit2T: 0, hit3T: 0, hitPend: false, hit2Pend: false, hit3Pend: false };

  // escala do flash e do contratempo, separada do timeScale: prefers-reduced-motion
  // pode abrandar o movimento sem deixar um estroboscópio de tela cheia a 1,0
  let flashScale = 1;

  /* ========== GL ========== */

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[v1su4rt] Shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function buildProgram(vsSrc, fsSrc, attribs, uniforms, label) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[v1su4rt] Link error:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }

    const prog = { program: p, attrib: {}, uniform: {} };
    attribs.forEach((n) => { prog.attrib[n] = gl.getAttribLocation(p, n); });
    uniforms.forEach((n) => { prog.uniform[n] = gl.getUniformLocation(p, n); });
    checkProgram(prog, label, attribs, uniforms);
    return prog;
  }

  /* Um nome de uniforme trocado é o bug mais silencioso deste renderizador:
     getUniformLocation devolve null e gl.uniform1f(null, v) não desenha nada, não
     dá erro e não dá aviso. Os dois sentidos do erro são verificados uma vez, no
     arranque: o que a lista de shaders.js declara e o shader não tem, e o que o
     shader lê e a lista esquece. scripts/check.mjs faz o mesmo cruzamento sobre o
     texto GLSL, sem precisar de navegador. */
  function checkProgram(prog, label, attribs, uniforms) {
    const nU = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
    const usedU = [];
    for (let i = 0; i < nU; i++) usedU.push(gl.getActiveUniform(prog.program, i).name.replace(/\[0]$/, ''));
    const nA = gl.getProgramParameter(prog.program, gl.ACTIVE_ATTRIBUTES);
    const usedA = [];
    for (let i = 0; i < nA; i++) usedA.push(gl.getActiveAttrib(prog.program, i).name);

    for (const n of uniforms) {
      if (prog.uniform[n] == null) {
        console.warn(`[v1su4rt] ${label}: a lista pede '${n}' mas o programa não o tem (nome errado, ou o compilador deitou-o fora)`);
      } else if (usedU.indexOf(n) < 0) {
        console.warn(`[v1su4rt] ${label}: '${n}' tem localização mas o shader nunca o lê`);
      }
    }
    for (const n of usedU) {
      if (uniforms.indexOf(n) < 0) console.warn(`[v1su4rt] ${label}: o shader lê '${n}' e a lista de shaders.js não o envia`);
    }
    for (const n of attribs) {
      if (prog.attrib[n] < 0) console.warn(`[v1su4rt] ${label}: a lista envia o atributo '${n}' mas o programa não o tem`);
    }
    for (const n of usedA) {
      if (attribs.indexOf(n) < 0) console.warn(`[v1su4rt] ${label}: o shader lê o atributo '${n}' e a lista de shaders.js não o envia`);
    }
  }

  function staticBuffer(target, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  function initGL() {
    if (!canvas) {
      console.warn('[v1su4rt] canvas #stage não encontrado');
      return false;
    }

    /* `antialias: false` é deliberado. Não há arestas geométricas para suavizar:
       o fundo é um único quad que cobre a tela toda, com as arestas fora dela, e a
       orla de cada ponto já é antiderrame analítico no fragmento (`1 - smoothstep
       (0.30, 0.50, d)`, ver FRAGMENT_POINTS). O que o MSAA custa é um backbuffer
       multiamostrado e um resolve por frame — banda que num celular é a que falta.
       Medido neste desktop a 489×431: 6,90 ms por frame com MSAA e 6,90 ms sem
       ele, porque a tela estava no teto do vsync e sobrava GPU; ou seja, o ganho
       aqui não é mensurável e o que se poupou é o celular. */
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    } catch (e) {
      console.error('[v1su4rt] WebGL indisponível:', e);
      return false;
    }
    if (!gl) return false;

    progBg = buildProgram(VERTEX_BG, FRAGMENT_BG, ['a_pos'], ['u_time', 'u_audio', 'u_bass', 'u_mid', 'u_treble', 'u_pulse', 'u_tilt', 'u_aspect'], 'fundo');
    // sete atributos na nuvem: o piso da WebGL 1 são oito, por isso ainda cabe um
    // antes de qualquer aparelho ficar de fora — é por isso que a normal do disco
    // (B4) sai calculada no shader a partir de a_posB, e não como atributo novo.
    progPoints = buildProgram(
      VERTEX_POINTS,
      FRAGMENT_POINTS,
      ['a_pos', 'a_posB', 'a_norm', 'a_col', 'a_seed', 'a_rad', 'a_band'],
      [
        'u_proj', 'u_view', 'u_model', 'u_normalMat', 'u_eye', 'u_light', 'u_time', 'u_audio', 'u_bass',
        'u_mid', 'u_treble', 'u_pulse', 'u_pulse2', 'u_timbre', 'u_phase', 'u_cloud', 'u_size', 'u_maxPx',
        'u_mixCor', 'u_mixForm', 'u_hitT', 'u_hit2T', 'u_hit3T',
      ],
      'nuvem'
    );
    if (!progBg || !progPoints) return false;

    // a nuvem não escreve profundidade: é aditiva e transparente. O depth buffer
    // já não serve para nada, por isso nem é pedido; a separação frente/trás é
    // feita pela névoa de profundidade calculada no vértice.
    gl.clearColor(0.010, 0.008, 0.022, 1.0);

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    pointMaxPx = Math.min(range ? range[1] : 64, 256);

    // tudo criado uma única vez: nada de buffers novos por frame
    bgBuffer = staticBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    // medido: é o tempo de tela em branco antes da primeira flor, e é o que diria
    // se a construção tinha de passar para um worker
    const t0 = performance.now();
    const c = buildCloud();
    buildMs = performance.now() - t0;
    points = {
      pos: staticBuffer(gl.ARRAY_BUFFER, c.pos),
      posB: staticBuffer(gl.ARRAY_BUFFER, c.posB),
      norm: staticBuffer(gl.ARRAY_BUFFER, c.norm),
      col: staticBuffer(gl.ARRAY_BUFFER, c.col),
      seed: staticBuffer(gl.ARRAY_BUFFER, c.seed),
      rad: staticBuffer(gl.ARRAY_BUFFER, c.rad),
      band: staticBuffer(gl.ARRAY_BUFFER, c.band),
      count: c.count,
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    relayout();
    // o ResizeObserver é quem avisa quando a área do canvas muda; os outros três
    // cobrem o que ele não vê: rotação do aparelho, barra de endereço do celular e
    // mudança de devicePixelRatio ao passar a janela para outro monitor
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(canvas);
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    return true;
  }

  /* Resolução interna: limitada por breakpoint e degradada quando faltam fps. */
  function targetScale() {
    const w = window.innerWidth;
    const cap = w < 640 ? 1.5 : w < 1024 ? 1.75 : 2;
    return Math.min(window.devicePixelRatio || 1, cap) * quality;
  }

  /* Geometria lida por evento, não por frame. O canvas é `position: fixed;
     inset: 0`, por isso só muda com a janela: lê-lo a cada frame era um layout
     forçado por frame, com a barra do medidor a escrever estilo 20 vezes por
     segundo em cima. Quem também muda a resolução interna sem mudar a janela é a
     qualidade, por isso `tuneQuality` volta a chamar esta função. */
  let lastScale = -1;

  function relayout() {
    const scale = targetScale();
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (w === canvas.width && h === canvas.height && scale === lastScale) return;
    lastScale = scale;
    canvas.width = w;
    canvas.height = h;
    const aspect = w / h;
    const tan = Math.tan((FRAME.fovDeg * Math.PI) / 360);
    // meia-largura visível à profundidade eyeZ vale tan*eyeZ*aspect; em retrato
    // (390×844 → aspect 0,46) dá 0,669 com eyeZ 3,5 e a flor de reach 0,96 perdia
    // ~30% das pontas. Recua-se a câmara só quando é preciso: a 16:9 horizontal
    // e no quadrado o enquadramento fica exatamente o de origem.
    eye[2] = Math.max(FRAME.eyeZ, FRAME.reach / (FRAME.fill * tan * aspect));
    // o painel de vidro tapa a banda de baixo em retrato: a flor sobe, centrada
    // na zona livre em vez de centrada na tela
    camLift = aspect < 1 ? tan * eye[2] * FRAME.lift : 0;
    perspective(proj, FRAME.fovDeg, aspect, 0.1, 100);
    lookAt(view, eye, [0, 0, 0], [0, 1, 0]);
    // proj[5] é cot(fov/2): converte unidades de mundo em pixels à profundidade 1.
    // O tamanho dos pontos vai em unidades de mundo, por isso a relação entre o
    // diâmetro do ponto e o intervalo entre pontos não depende da resolução: a
    // flor lê-se igualmente como nuvem de fumo a 1x ou a 2x, só muda a nitidez.
    pointPx = (canvas.height / 2) * proj[5];
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function tuneQuality(dt) {
    fpsAvg += (1 / dt - fpsAvg) * 0.05;
    const now = performance.now();
    if (now - lastTune < 1000) return;
    lastTune = now;
    // a flor são dezenas de milhares de vértices e área pintada: quando faltam
    // fps corta-se primeiro na resolução, depois na quantidade de pontos
    const before = quality;
    if (fpsAvg < 40 && quality > 0.45) quality = Math.max(0.45, quality - 0.1);
    else if (fpsAvg > 55 && quality < 1) quality = Math.min(1, quality + 0.05);
    // a qualidade entra no targetScale(), por isso mexe na resolução interna sem
    // que a janela tenha mudado: é aqui, e não no frame, que se vai buscar o novo
    // tamanho
    if (quality !== before) relayout();
  }

  /* ========== RENDER ========== */

  function drawBackground() {
    const p = progBg;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_audio, state.audio);
    gl.uniform1f(p.uniform.u_bass, state.bass);
    gl.uniform1f(p.uniform.u_mid, state.mid);
    gl.uniform1f(p.uniform.u_treble, state.treble);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    gl.uniform2f(p.uniform.u_tilt, state.tiltX, state.tiltY);
    gl.uniform1f(p.uniform.u_aspect, canvas.width / Math.max(1, canvas.height));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function bindPoints(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, points.pos);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.posB);
    gl.enableVertexAttribArray(p.attrib.a_posB);
    gl.vertexAttribPointer(p.attrib.a_posB, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.norm);
    gl.enableVertexAttribArray(p.attrib.a_norm);
    gl.vertexAttribPointer(p.attrib.a_norm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.col);
    gl.enableVertexAttribArray(p.attrib.a_col);
    gl.vertexAttribPointer(p.attrib.a_col, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.seed);
    gl.enableVertexAttribArray(p.attrib.a_seed);
    gl.vertexAttribPointer(p.attrib.a_seed, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.rad);
    gl.enableVertexAttribArray(p.attrib.a_rad);
    gl.vertexAttribPointer(p.attrib.a_rad, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.band);
    gl.enableVertexAttribArray(p.attrib.a_band);
    gl.vertexAttribPointer(p.attrib.a_band, 1, gl.FLOAT, false, 0, 0);
  }

  // A flor inteira é este draw call: uma nuvem de pontos sobre as superfícies
  // paramétricas, aditiva e sem escrever profundidade.
  function drawFlower(dt) {
    // intensidade a zero: nem se envia o draw call
    if (state.cloud <= 0.001) return;

    /* C5 — a rotação passa a ter inércia. Antes a velocidade era uma função
       instantânea do estado do som, por isso o empurrão de uma batida durava o que
       dura a batida: ~60 ms. Com a mola (tau ~1/2,2 s) o ataque põe a flor a rodar
       mais depressa e ela regressa ao ritmo a meio caminho entre duas batidas, que é
       o que faz um compasso ouvir-se como uma coisa só e não como um tremor. */
    const spinTarget = 0.10 + state.audio * 0.22 + state.pulse * 0.45;
    spinVel += (spinTarget - spinVel) * (1 - Math.exp(-dt * 2.2));
    spin += dt * timeScale * spinVel;

    /* C5 — precessão: o eixo da flor deixa de estar parado. Os médios, que são o
       corpo da música, fazem o eixo descrever um cone de ±2° no teto (0,035 rad). É
       pouco de propósito: a 4° a corola já balança como um boneco e perde a leitura
       de flor; a 2° ganha-se o movimento de uma coisa viva sem descolar a silhueta. */
    prec += dt * (0.35 + state.mid * 1.1);
    const wob = 0.018 + 0.017 * state.mid;

    // G3: já vêm limitados a ±1 pelo joelho do funil (applyState)
    const tx = state.tiltX;
    const ty = state.tiltY;

    // 3/4: a base de ~1.02 rad (~58°) faz a câmara olhar para dentro da corola,
    // por isso o giroscópio e o mouse também inclinam a flor, não só o fundo
    const s = 0.82 * (0.98 + state.audio * 0.04 + state.pulse * 0.02);
    mat4Scale(model, s, s, s);
    mat4RotateY(rot, spin); mulLeft(model, rot);
    mat4RotateZ(rot, tx * 0.30 + wob * Math.cos(prec)); mulLeft(model, rot);
    // os graves fazem a flor inclinar-se para a frente
    mat4RotateX(rot, 1.02 + ty * 0.30 - state.bass * 0.10 + wob * Math.sin(prec)); mulLeft(model, rot);
    mat4Translate(rot, 0, 0.04 + camLift, 0); mulLeft(model, rot);

    const p = progPoints;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniform.u_proj, false, proj);
    gl.uniformMatrix4fv(p.uniform.u_view, false, view);
    gl.uniformMatrix4fv(p.uniform.u_model, false, model);
    gl.uniformMatrix3fv(p.uniform.u_normalMat, false, mat3FromMat4(normalMat, model));
    gl.uniform3f(p.uniform.u_eye, eye[0], eye[1], eye[2]);
    const L = lightDir(time, ty);
    gl.uniform3f(p.uniform.u_light, L[0], L[1], L[2]);
    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_audio, state.audio);
    gl.uniform1f(p.uniform.u_bass, state.bass);
    gl.uniform1f(p.uniform.u_mid, state.mid);
    gl.uniform1f(p.uniform.u_treble, state.treble);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    gl.uniform1f(p.uniform.u_pulse2, state.pulse2);
    gl.uniform1f(p.uniform.u_timbre, state.timbre);
    gl.uniform1f(p.uniform.u_phase, phase);
    gl.uniform1f(p.uniform.u_cloud, state.cloud);
    gl.uniform1f(p.uniform.u_size, pointPx);
    gl.uniform1f(p.uniform.u_maxPx, pointMaxPx);
    // B3/B4: os dois sliders vão crus para o shader — quem arrasta quer ver o ponto
    // onde o dedo está, não um atraso a chegar ao sítio onde o dedo já esteve
    gl.uniform1f(p.uniform.u_mixCor, state.mixCor);
    gl.uniform1f(p.uniform.u_mixForm, state.mixForm);
    // S1 — a hora do último golpe, no MESMO relógio de u_time (timeScale incluído): o
    // shader só usa a diferença, por isso o valor absoluto não interessa
    gl.uniform1f(p.uniform.u_hitT, state.hitT);
    gl.uniform1f(p.uniform.u_hit2T, state.hit2T);
    gl.uniform1f(p.uniform.u_hit3T, state.hit3T);
    bindPoints(p);

    // aditivo: as camadas de pontos somam-se, e é isso que faz as pétalas
    // translúcidas; sem ordem nem depth buffer, porque nada aqui é opaco
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, Math.round(points.count * quality));
    gl.disable(gl.BLEND);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.1);
    lastFrameTime = now;

    if (driver) {
      const s = driver(dt);
      if (s) applyState(s);
    }

    time += dt * timeScale;
    phase = (time / LIFE) % 1;
    /* S1 — a marca do golpe é carimbada DEPOIS de o relógio avançar, porque é com o
       `time` de baixo que o draw de hoje trabalha: assim, no frame em que a batida
       entra, u_time - u_hitT é exatamente 0 e a onda nasce no instante do som, não
       num ponto arbitrário da senoide do relógio corrido. */
    if (state.hitPend) { state.hitT = time; state.hitPend = false; }
    if (state.hit2Pend) { state.hit2T = time; state.hit2Pend = false; }
    if (state.hit3Pend) { state.hit3T = time; state.hit3Pend = false; }
    tuneQuality(dt);

    // só a cor: nada nesta cena escreve profundidade, por isso não há depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawBackground();
    drawFlower(dt);
  }

  /* ========== MATH (column-major) ==========

     Tudo o que corre por frame escreve sobre matrizes pré-alocadas e recebe a
     saída como primeiro argumento. As versões antigas devolviam `new Array(16)` a
     cada chamada — cinco rotações, cinco produtos e a matriz de normais por frame,
     ~660 alocações por segundo a 60 fps, todas deitadas fora no frame seguinte.
     `multiplyMatrices` não aceita que a saída se sobreponha a uma das entradas. */

  function perspective(out, fov, aspect, near, far) {
    const f = 1 / Math.tan((fov * Math.PI) / 360);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  // Convenção OpenGL: o que está à frente da câmara tem z negativo.
  function lookAt(out, e, center, up) {
    const f = normalize3([center[0] - e[0], center[1] - e[1], center[2] - e[2]]);
    const s = normalize3(cross3(f, up));
    const u = cross3(s, f);
    out[0] = s[0]; out[1] = u[0]; out[2] = -f[0]; out[3] = 0;
    out[4] = s[1]; out[5] = u[1]; out[6] = -f[1]; out[7] = 0;
    out[8] = s[2]; out[9] = u[2]; out[10] = -f[2]; out[11] = 0;
    out[12] = -dot3(s, e); out[13] = -dot3(u, e); out[14] = dot3(f, e); out[15] = 1;
    return out;
  }

  function cross3(a, b, out) {
    const o = out || [0, 0, 0];
    o[0] = a[1] * b[2] - a[2] * b[1];
    o[1] = a[2] * b[0] - a[0] * b[2];
    o[2] = a[0] * b[1] - a[1] * b[0];
    return o;
  }

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function normalize3(v, out) {
    const o = out || [0, 0, 0];
    const len = Math.sqrt(dot3(v, v)) || 1;
    o[0] = v[0] / len; o[1] = v[1] / len; o[2] = v[2] / len;
    return o;
  }

  function mat4Translate(out, x, y, z) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }

  function mat4RotateX(out, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = c; out[6] = s; out[7] = 0;
    out[8] = 0; out[9] = -s; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function mat4RotateY(out, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function mat4RotateZ(out, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    out[0] = c; out[1] = s; out[2] = 0; out[3] = 0;
    out[4] = -s; out[5] = c; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function mat4Scale(out, x, y, z) {
    out[0] = x; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = y; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = z; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  // GLSL ES 1.00 não constrói mat3 a partir de mat4: a extração é feita aqui.
  // A escala é uniforme, por isso basta a parte de rotação.
  function mat3FromMat4(out, m) {
    out[0] = m[0]; out[1] = m[1]; out[2] = m[2];
    out[3] = m[4]; out[4] = m[5]; out[5] = m[6];
    out[6] = m[8]; out[7] = m[9]; out[8] = m[10];
    return out;
  }

  function multiplyMatrices(out, a, b) {
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // m = a * m, que é a ordem em que o modelo da flor se compõe (escala, rotações,
  // e por último a translação do enquadramento). O produto passa por um rascunho
  // porque as funções acima não aceitam uma saída sobreposta às entradas.
  function mulLeft(m, a) {
    multiplyMatrices(mScratch, a, m);
    m.set(mScratch);
    return m;
  }

  /* ========== ENTRADA DE DADOS ========== */

  function applyState(obj) {
    // limite superior também aqui: um sensor que entregue mais de 1 não pode
    // estourar a exposição nem abrir a corola para além do desenhado
    const c01 = (v) => clamp(v || 0, 0, 1);
    state.audio = c01(obj.audio);
    state.bass = c01(obj.bass);
    state.mid = c01(obj.mid);
    state.treble = c01(obj.treble);
    state.pulse = c01(obj.pulse) * flashScale;
    state.pulse2 = c01(obj.pulse2) * flashScale;
    // S1 — o instante, não a intensidade: fica uma marca pendente até o relógio do
    // frame avançar, onde é carimbada (ver frame())
    if (obj.hit) state.hitPend = true;
    if (obj.hit2) state.hit2Pend = true;
    if (obj.hit3) state.hit3Pend = true;
    // sem canal de timbre no driver, fica onde estava: 0 daria "tudo graves" e a
    // corola ler-se-ia com a fronteira trocada num navegador sem microfone
    if (obj.timbre != null) state.timbre = clamp(Number(obj.timbre) || 0, 0, 1);
    if (obj.tilt) {
      state.tiltX = tiltKnee(obj.tilt[0]);
      state.tiltY = tiltKnee(obj.tilt[1]);
    }
  }

  /* readFrame(dt) devolve o estado dos sensores de cada frame. */
  window.v1su4rtShaders = {
    init: function (canvasId, readFrame) {
      canvas = document.getElementById(canvasId || 'stage');
      driver = typeof readFrame === 'function' ? readFrame : null;
      if (!initGL()) {
        rendererMode = 'none';
        return false;
      }
      lastFrameTime = performance.now();
      frame(lastFrameTime);
      return true;
    },
    setTimeScale: function (k) { timeScale = clamp(k, 0.05, 4); },
    // escala do flash (batida) e do contratempo (cintilar dos agudos): 1 é o valor
    // do microfone, 0,4 deixa a batida legível sem um estroboscópio a tela cheia
    setFlashScale: function (k) { flashScale = clamp(Number(k) || 0, 0, 1); },
    // ganho da nuvem de pontos: 0 apaga, 1 é o valor desenhado, 2 duplica o brilho
    // e dá um quarto mais de tamanho a cada ponto
    setCloudIntensity: function (v) { state.cloud = clamp(Number(v) || 0, 0, 2); },
    cloudIntensity: function () { return state.cloud; },
    /* B3/B4 — as duas misturas, em [0,1]: 0 é o referente desenhado (paleta quente,
       corola aberta), 1 é a paleta rodada 180° e a cabeça de sementes. Um argumento
       `undefined` deixa esse canal como está, para o painel poder mandar um sem
       mexer no outro. */
    setMix: function (cor, form) {
      if (cor !== undefined && cor !== null) state.mixCor = clamp(Number(cor) || 0, 0, 1);
      if (form !== undefined && form !== null) state.mixForm = clamp(Number(form) || 0, 0, 1);
    },
    mix: function () { return { cor: state.mixCor, form: state.mixForm }; },
    // diagnóstico: o tilt já passado pelo joelho do funil — é o número que o shader
    // vê, e por isso o único que prova o que um toque faz (ou não) no canal
    tilt: function () { return { x: state.tiltX, y: state.tiltY }; },
    // diagnóstico: quantos dos 46.892 pontos foram reindexados no disco de sementes
    seedHeadPoints: function () { return headPoints; },
    // diagnóstico da sincronia: quanto tempo de animação passou desde cada golpe.
    // É o número que prova que a fase está presa — tem de cair a 0 no frame do golpe.
    sinceHits: function () { return { beat: time - state.hitT, off: time - state.hit2T, mid: time - state.hit3T, time: time }; },
    // quanto custou desenhar a flor em CPU, em ms: é o número a olhar antes de se
    // decidir se a construção precisa de um worker
    buildTime: function () { return buildMs; },
    stop: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    renderer: function () { return rendererMode; }
  };
})();
