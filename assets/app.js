/* v1su4rt — desenha o shader em tela cheia, liga os sensores e cuida do painel. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const panel = $('panel');
  const toggle = $('interaction-toggle');
  const status = $('interaction-status');
  const collapseBtn = $('panel-collapse');
  const audioRange = $('audio-sens');
  const orientRange = $('orient-sens');
  const cloudRange = $('cloud-intens');
  const mixCorRange = $('mix-cor');
  const mixFormRange = $('mix-form');
  const audioOut = $('audio-sens-value');
  const orientOut = $('orient-sens-value');
  const cloudOut = $('cloud-intens-value');
  const mixCorOut = $('mix-cor-value');
  const mixFormOut = $('mix-form-value');
  const fsBtn = $('fullscreen-toggle');
  const meterFill = $('meter-fill');

  const sensors = new window.V1Interaction();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* medidor + vigia de sinal: um microfone aberto que não capta nada é o caso
     mais frequente de "não está a funcionar", e sem aviso fica silencioso */
  const SILENCE = { levelMax: 0.02, afterSec: 5, recover: 0.05 };
  let silentFor = 0;
  let warnedSilence = false;

  /* ---------- painel ---------- */

  function setStatus(msg, kind) {
    status.textContent = msg || '';
    status.dataset.kind = kind || 'ok';
  }

  function paintButton() {
    const on = sensors.active;
    toggle.textContent = on ? 'Desativar interações' : 'Ativar interações';
    toggle.setAttribute('aria-pressed', String(on));
    // o medidor só existe com o microfone aberto, e o vigia recomeça do zero
    panel.classList.toggle('has-audio', sensors.audioOn);
    silentFor = 0;
    warnedSilence = false;
    if (!sensors.audioOn) meterFill.style.transform = 'scaleX(0)';
  }

  function describe(res, gyro) {
    const a = res.audio;
    const g = gyro || res.orientation;
    if (a === 'insecure') return ['Microfone e giroscópio exigem HTTPS. Abra o endereço que começa com https://.', 'warn'];
    if (a === 'ok' && g === 'ok') return ['Ativo. Fale, toque música ou incline o aparelho.', 'ok'];
    if (a === 'ok') {
      if (g === 'denied') return ['Microfone ativo. Movimento negado: recarregue a página e conceda a permissão ao ativar.', 'warn'];
      return ['Microfone ativo. Sem giroscópio neste aparelho: mova o mouse ou arraste na tela.', 'ok'];
    }
    if (a === 'denied') return ['Microfone bloqueado. Libere nas permissões do site e ative novamente.', 'warn'];
    if (a === 'unsupported') return ['Este navegador não dá acesso ao microfone.' + (g === 'ok' ? ' O giroscópio segue ativo.' : ''), 'warn'];
    return ['Não foi possível abrir o microfone. Confira se outro app não está usando e ative de novo.', 'warn'];
  }

  let lastRes = null;
  let lastGyro = null; // estado tardio do giroscópio: sem isto a mensagem regredia para "ok"

  /* volta à mensagem de estado normal; usada pelo vigia quando o som regressa */
  function normalStatus() {
    if (!lastRes) return;
    const [m, k] = describe(lastRes, lastGyro || undefined);
    setStatus(m, k);
  }

  toggle.addEventListener('click', async () => {
    if (sensors.active) {
      sensors.stop();
      paintButton();
      setStatus('');
      return;
    }
    toggle.disabled = true;
    toggle.textContent = 'Ativando…';
    let res;
    try {
      res = await sensors.start((state) => {
        // resposta tardia do giroscópio (chega até 1,5 s depois)
        lastGyro = state;
        if (lastRes) { const [m, k] = describe(lastRes, state); setStatus(m, k); }
        paintButton();
      });
    } catch (err) {
      console.error(err);
      res = { audio: 'error', orientation: 'error' };
    }
    lastRes = res;
    lastGyro = null;
    toggle.disabled = false;
    paintButton();
    const [msg, kind] = describe(res);
    setStatus(msg, kind);
  });

  /* A6 — os sliders guardam-se no próprio aparelho. Não há servidor nem conta, por
     isso localStorage é o único sítio onde "a flor de quem a ajustou" pode voltar a
     ser a mesma quando se reabre o app. Só vão os números dos controles, nunca nada
     do microfone nem da pose, e tudo o que vem de lá é tratado como suspeito: JSON
     avariado, valor fora do min/max do input ou NaN volta ao valor escrito na página.
     A chave é versionada (`.v1`) porque uma preferência com números que já não fazem
     sentido é pior do que nenhuma. */
  const PREF_KEY = 'v1su4rt.painel.v1';
  const ranges = [audioRange, orientRange, cloudRange, mixCorRange, mixFormRange];
  let prefs = {};
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY));
    if (raw && typeof raw === 'object') prefs = raw;
  } catch (e) {
    prefs = {};
  }
  function savePrefs() {
    const out = {};
    for (const r of ranges) out[r.id] = parseFloat(r.value);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(out));
    } catch (e) {
      // modo privado com quota a zero: o painel continua a funcionar, só não lembra
    }
  }

  function bindRange(input, out, apply) {
    const saved = Number(prefs[input.id]);
    if (isFinite(saved) && saved >= +input.min && saved <= +input.max) input.value = String(saved);
    const sync = () => {
      const v = parseFloat(input.value);
      out.textContent = v.toFixed(2);
      apply(v);
    };
    input.addEventListener('input', () => {
      sync();
      savePrefs();
    });
    sync();
  }
  bindRange(audioRange, audioOut, (v) => { sensors.audioSens = v; });
  bindRange(orientRange, orientOut, (v) => { sensors.orientSens = v; });
  bindRange(cloudRange, cloudOut, (v) => {
    if (window.v1su4rtShaders) window.v1su4rtShaders.setCloudIntensity(v);
  });
  const setMix = (cor, form) => {
    if (window.v1su4rtShaders) window.v1su4rtShaders.setMix(cor, form);
  };
  bindRange(mixCorRange, mixCorOut, (v) => setMix(v, undefined));
  bindRange(mixFormRange, mixFormOut, (v) => setMix(undefined, v));

  collapseBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Mostrar controles' : 'Recolher controles');
  });

  // Celular em retrato: o painel é um cartão que tapa meia tela, por isso abre
  // recolhido. O medidor vive fora do corpo do painel e continua visível.
  if (window.innerWidth < 640 && window.innerHeight > window.innerWidth) {
    panel.classList.add('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-label', 'Mostrar controles');
  }

  /* ---------- tela cheia ---------- */

  const docEl = document.documentElement;
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function paintFs() {
    const on = !!fsElement();
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? 'Sair da tela cheia' : 'Tela cheia');
  }

  fsBtn.addEventListener('click', async () => {
    try {
      if (fsElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else {
        // o pedido vai para a página toda, não para o canvas: se fosse só o canvas,
        // o painel ficava de fora e não havia forma de sair nem de mexer na
        // sensibilidade sem sair da tela cheia
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
        await req.call(docEl, { navigationUI: 'hide' });
      }
    } catch (err) {
      console.warn('[v1su4rt] tela cheia recusada:', err);
      // no iOS só <video> implementa requestFullscreen; o atalho é instalar como app
      setStatus('Este navegador não abre páginas em tela cheia. No iPhone: Compartilhar → Adicionar à Tela de Início, e o visual abre sem a barra do Safari.', 'warn');
      return;
    }
    paintFs();
  });
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((n) => document.addEventListener(n, paintFs));
  paintFs();

  /* ---------- ponteiro (mouse, toque): substitui o giroscópio quando não existe ---------- */

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };

  function movePointer(e) {
    pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', movePointer);
  const release = (e) => { if (e.pointerType !== 'mouse') { pointerTarget.x = 0; pointerTarget.y = 0; } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* ---------- toque = batida ----------

     O flash sempre veio só do grave captado pelo microfone, por isso com a
     permissão negada ou num aparelho sem microfone a flor ficava reduzida a um
     tilt de mouse: nada do que ela faz ao ritmo se via. Agora bate-se na tela como
     num tambor. O golpe entra pelo mesmo canal e com o mesmo decaimento do detetor
     de batida, por isso um toque e um bombo são indiferentes no visual. Não passa
     pelo `level`: o vigia de sinal mede o microfone, e um dedo a bater não pode
     fingir que há som — ia calar o aviso de "não capta nada" para sempre. */
  const TAP_DECAY = 4.5; // o beatDecay de interaction.js, para darem o mesmo flash
  let tapPulse = 0;
  // S1 — o dedo também dá INSTANTE, não só intensidade: o flag vive um frame e é
  // consumido em readFrame, para o toque carimbar u_hitT no mesmo frame do clique
  // em vez de o carimbar com o relógio atrasado do decaimento
  let tapIsHit = false;
  canvas.addEventListener('pointerdown', () => { tapPulse = 1; tapIsHit = true; });

  /* ---------- medidor e vigia de sinal ---------- */

  // 20 Hz chega para se ver o ataque das batidas e evita reescrever o estilo da
  // barra em cada frame
  let meterAt = 0;
  function paintMeter(level) {
    const now = performance.now();
    if (now - meterAt < 50) return;
    meterAt = now;
    meterFill.style.transform = `scaleX(${Math.min(1, level).toFixed(3)})`;
  }

  function watchSignal(level, dt) {
    if (!sensors.audioOn) return;
    silentFor = level < SILENCE.levelMax ? silentFor + dt : 0;
    if (silentFor > SILENCE.afterSec && !warnedSilence) {
      warnedSilence = true;
      setStatus('Microfone ativo, mas não capta nada. Libere a permissão, suba o volume da música e aumente a Sensibilidade do áudio.', 'warn');
    } else if (warnedSilence && level > SILENCE.recover) {
      warnedSilence = false;
      normalStatus();
    }
  }

  /* ---------- renderizador (delegado a shaders.js) ---------- */

  function readFrame(dt) {
    sensors.update(dt);
    const s = sensors.read();

    let tiltX = s.tiltX;
    let tiltY = s.tiltY;
    if (!sensors.orientOn) {
      const k = 1 - Math.exp(-dt * 6);
      pointer.x += (pointerTarget.x - pointer.x) * k;
      pointer.y += (pointerTarget.y - pointer.y) * k;
      tiltX = pointer.x * sensors.orientSens;
      tiltY = pointer.y * sensors.orientSens;
    }

    watchSignal(s.level, dt);
    paintMeter(s.level);
    tapPulse *= Math.exp(-dt * TAP_DECAY);
    const tapHit = tapIsHit;
    tapIsHit = false;

    return {
      audio: s.level,
      bass: s.bass,
      mid: s.mid,
      treble: s.treble,
      // o toque e o bombo partilham o canal: o máx. é o que faz os dois soarem
      // iguais, quer o microfone esteja aberto quer não
      pulse: Math.max(s.pulse, tapPulse),
      pulse2: s.pulse2,
      // S1 — os dois instantes. O toque entra no do grave porque é esse o canal que
      // dispara a onda: bater na tela tem de pôr a onda a nascer ali, e não esperar
      // pelo próximo zero de uma senoide que corre à margem do que se ouve
      hit: s.hit || tapHit,
      hit2: s.hit2,
      timbre: s.timbre,
      tilt: [tiltX, tiltY]
    };
  }

  function applyMotionPreference() {
    const reduce = reduceMotion.matches;
    window.v1su4rtShaders.setTimeScale(reduce ? 0.35 : 1);
    // abrandar o movimento não abrandava o flash: o fundo inteiro dava 0,030 de
    // luz em cada batida, a 2 Hz, o que é um estroboscópio a tela cheia. 0,4 mantém
    // a batida legível como um pulso e tira-lhe o caráter de lampadação.
    window.v1su4rtShaders.setFlashScale(reduce ? 0.4 : 1);
  }

  if (!window.v1su4rtShaders) {
    console.error('[v1su4rt] shaders indisponíveis: shaders.glsl.js / shaders.js');
    document.documentElement.classList.add('no-webgl');
    setStatus('[v1su4rt] Erro: shaders indisponíveis.', 'warn');
    return;
  }

  if (window.v1su4rtShaders.init('stage', readFrame)) {
    applyMotionPreference();
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', applyMotionPreference);
  } else {
    console.error('[v1su4rt] WebGL indisponível');
    document.documentElement.classList.add('no-webgl');
    setStatus('Este navegador não tem WebGL disponível, por isso o visual não pode ser desenhado.', 'warn');
  }

  /* ---------- instalação e offline ---------- */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service worker não registrado:', err));
    });
  }
})();
