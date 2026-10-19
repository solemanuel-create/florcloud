/* v1su4rt — sensores: microfone (AudioContext + AnalyserNode) e giroscópio
   (deviceorientation, e deviceorientationabsolute para a torção de G4). Nada é
   gravado nem enviado: os valores só alimentam o shader.
   Saem sete canais por frame: nível, grave, médio, agudo, batida (ataque dos
   graves), contratempo (ataque dos agudos) e timbre (que som é, não quanto som há). */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Toda a afinação do ouvido vive neste bloco: é o único sítio a mexer para mudar
     como a flor escuta. As bandas dizem o que cada uniforme recebe, o ataque e o
     release dizem quão depressa se move, a batida diz quando entra o flash (grave) e
     o contratempo diz quando entra o cintilar (agudos), o timbre diz que cor o
     som tem, a re-centragem diz quanto tempo uma pose do aparelho deixa de ser
     novidade, e a torção diz o que um aparelho deitado na mesa pode fazer. Tudo em
     0..1 salvo indicação em contrário. */
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

    /* Suavização dos quatro valores: ataque rápido, release lento (taxa em 1/s).
       Medido com a régua (`v1su4rtProbe.run()`, 145 Hz): com 28 o degrau sonoro só
       cruzava os 50% aos 28 ms e os 90% aos 69 ms, enquanto o INSTANTE do mesmo golpe
       chegava aos 7,5 ms — a onda já tinha saído e a cor ainda estava a caminho.
       Com 90 os 50% passam a aos 7,3 ms e os 90% aos 21 ms, que é uma frame em vez de
       quatro. Ficou também claro onde está o teto daqui para a frente: uma frame a
       145 Hz vale 6,9 ms, mas num celular a 30 Hz vale 33 ms, por isso o que sobra de
       atraso deixou de ser deste número e passou a ser a cadência do ecrã.
       O release sobe de 7 para 9 só para que o novo ataque não deixe a flor a
       estroboscopicar entre golpes: é o degrau de subida que tem de ser honesto, a
       descida continua lenta para a luz ler como floração e não como lâmpada.
       Tremura medida no degrau segurado, com 90: 0 nas três bandas e 0,065 a 0,078 de
       pico-a-pico no nível — um tom sintético segurado é a entrada mais mansa que há,
       por isso isto é o limite de baixo, não uma garantia para música. */
    attack: 90,
    release: 9,

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
    /* M1 — a refractária do instante dos médios. É o mesmo tempo do contratempo
       porque é o mesmo género de evento (um ataque no topo do espectro, não um
       bombo). Não tem `pulse3` ao lado de propósito: este canal não soma luz ao
       frame, só carimba um relógio. */
    beat3Refractory: 0.10,
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
    /* M1 — o segundo corte. Com um só, tudo o que não é grave caía no mesmo balde, e
       os médios — a banda onde mora a melodia e a voz — ficaram sem instante: o
       `shimmer`, o `sway` e o `roll` do shader corriam ao relógio e o som só lhes
       pegava na amplitude. Um lowpass de um polo a 1200 Hz, na MESMA passagem, dá o
       balde do meio por diferença entre os dois (`lpMid - lp`) e não tira nem põe nos
       dois que já estavam medidos: o grave continua a ser `lp` e o agudo `v - lp`. */
    hitSplit2Hz: 1200,
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
    /* Piso do balde do meio, medido na armação sintética (3 s de ruído branco, o
       topo do pico depois de o piso de ruído ter assentado): -32 dBFS dá 0,011,
       -26 dBFS dá 0,020 e -20 dBFS dá 0,043. Um ataque a sério no balde — uma sílaba
       a 700 Hz, uma caixa a 400 Hz — dá 0,24 a 0,26, quase seis vezes acima do chiado
       mais alto testado. O balde do meio é o mais baixo dos três para o mesmo ruído
       porque é o mais estreito (250-1200 Hz contra "tudo o que está acima"). */
    hitFloorMid: 0.09,
    // o cintilar é para o que é BRILHANTE. Um passo no ar é banda larga por natureza
    // (o ataque de um bombo também), por isso cada golpe escolhe um canal, e não os
    // dois: o grave manda no flash quando o lado de baixo domina (>= basta, é um
    // empata-desempate), o agudo só é elegível quando domina por margem — o highpass é
    // ruidoso por construção e um prato tem de se distinguir de um passo. Sem isto, um
    // kick dava flash e tremelicava ao mesmo tempo, e um prato dava flash.
    hitBalance: 1.4,
    /* M1 — o empata-desempate do médio contra o grave, e por que é 1,0 e não 1,4.
       O corte é de um polo (6 dB por oitava), por isso os baldes solapam-se: medido
       na armação sintética, um ataque a 400 Hz deixa 96% do seu pico no balde do
       grave (topo lo 0,243 contra mid 0,254) e nunca chegaria ao 1,4 do contratempo.
       Um valor mais alto que 1,0 só servia para varrer a banda inteira de 250-500 Hz
       para fora do canal. O que importa — e é o que o 1,0 ainda garante — é que um
       bombo não tem balde do meio: a 55 Hz os dois lowpass passam o mesmo sinal e a
       diferença entre eles é quase zero (medido: lo 0,488 contra mid 0,155). */
    hitBalanceMid: 1.0,

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
    // G1 — a pose quieta não pode demorar dez segundos a tornar-se o neutro. Um EMA
    // do desvio em relação a uma referência lenta (orientPoseHz, τ de meio segundo)
    // diz se a mão parou; orientStillDeg é a banda em que ela se considera parada;
    // orientAdopt é quanto tempo parado antes de a base começar a correr atrás, a τ
    // de 1/orientAdoptHz segundos. Os quatro juntos são o que separa "mudou a pose de
    // uso" de "fez um gesto": um flick de 0,5 s nunca acumula orientAdopt.
    orientPoseHz: 2,
    orientStillDeg: 2.5,
    orientAdopt: 1.2,
    orientAdoptHz: 3,

    // giroscópio: 40° de inclinação percorrem o curso linear — do x nos dois sentidos
    // e do y para baixo. O que houver acima disso soma muito pouco, porque o teto do
    // canal é o ombro do funil, não este número. tiltMaxDeg é o único corte que resta.
    tiltRange: 40,
    // G2 — o eixo y não tem o mesmo curso dos dois lados da pose de uso: para cima
    // há ~15° antes de o aparelho tombar para trás, para baixo há 80° até à mesa.
    // Com um só número para os dois (40), o lado de cima nunca passava dos 6,4° de
    // flor e o de baixo já tinha chegado ao teto. É por isto que G1 e G2 são o mesmo
    // problema: o neutro tem de ser a pose de uso, e a pose de uso não é o centro de
    // um curso simétrico.
    tiltRangeUp: 15,
    // G3 — desde que o teto do canal é um só e assintótico, este já não é um teto
    // de resposta: é só a proteção contra um ângulo absurdo (um sensor avariado, ou
    // um beta que salta para 180° quando o aparelho passa acima do teto). 70° fica
    // muito acima de qualquer pose de uso e não corta nada do que se vê.
    tiltMaxDeg: 70,
    // G4 — a torção usa o mesmo ease do tilt: é o mesmo género de canal (um gesto
    // segurado, não um ataque) e um número a menos para justificar.
    tiltEase: 9,
    // G5a — quantos segundos sem UM SOZINHO evento `deviceorientation` antes de dar
    // o sensor por perdido. É generoso de propósito: um Android que agrupa leituras
    // ou adormece o giroscópio com o aparelho parado pode calar-se um bocado, e um
    // vigia impaciente estaria sempre a desligar e a religar o movimento. Perder é
    // recuperável (o listener fica inscrito e o primeiro evento que chegue re-arma),
    // por isso o único risco de esperar demasiado é a flor ficar pendurada na última
    // pose um pouco mais.
    orientStall: 6,

    /* G4 — a mesa. Um aparelho deitado não inclina: beta e gamma são ambos ~0 e o
       único ângulo que roda com o pulso é alpha, que aqui não era lido em parte
       nenhuma. Passa a haver um terceiro canal de gesto — a torção no plano do
       ecrã, o gesto mais óbvio que existe com a máquina deitada — e é o mais frágil
       dos três, porque alpha vem da bússola.
           yawEnterDeg / yawExitDeg são a histerese da mesa: a torção só é aceite com
       o ecrã apontado para cima e desliga-se ao passar do ângulo de saída, porque
       perto do vertical alpha entra na singularidade da sequência z-x'-y'' e salta
       180° com uma mudança pequena de pose. O interruptor de volta é pôr
       yawEnterDeg a -1: nenhum ângulo passa, e o canal fica mudo como estava. Não
       serve 0, que é a primeira coisa que se tenta — deitado na mesa o ângulo polar
       é 0 e 0 <= 0 entra na mesma.
           yawRange é o curso em graus de torção, e é o mesmo tiltRange de propósito:
       assim a banda morta partilhada (orientDeadband, 8°) fica a mesma fração dos
       dois cursos, que é a regra que o G2 deixou.
           yawJumpDeg é a guarda da bússola. Um só evento a mudar mais do que isto não
       é a mão — é o magnetómetro a recalibrar-se ou a passar por um íman — e move o
       anexo junto consigo, para a flor não se mexer. Estime, não medida: um giro de
       pulso rápido anda pelos 700-900°/s, que a 60 Hz são 12-15° por evento; uma
       recalibração salta dezenas a centenas de graus de uma vez. 60° fica dos dois
       lados com folga. */
    yawEnterDeg: 25,
    yawExitDeg: 45,
    yawRange: 40,
    yawJumpDeg: 60,

    // ombro suave: linear até aqui, exponencial depois. É a forma do read() do
    // áudio e, desde G3, também a do canal do tilt — lá em shaders.js, com o mesmo
    // valor, porque os dois são o mesmo problema: um slider cujo topo encosta num
    // clamp deixa de ser um slider.
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
      this._onOrientAbs = this._onOrientAbs.bind(this);

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
      // G5a — orientOn diz que a subscrição está tomada; orientLive diz que o sensor
      // está de facto a mandar dados. São duas coisas diferentes, e o renderizador
      // precisa da segunda: é ela que decide se o inclinar vem do aparelho ou do
      // rato/toque. Separá-las é o que permite perder o sensor sem desligar a sessão
      // — se orientOn caísse, `active` caía com ele e o botão passava a oferecer
      // "Ativar interações", que é um segundo start() por cima desta subscrição.
      this.orientLive = false;
      this._orientSilent = 0;
      this._onGyro = null;
      // G1 — a memória da pose quieta (referência lenta, desvio, tempo parado)
      this._pose = null;
      // G4 — a memória da torção. `yawCur` é o alpha da bússola desenrolado à volta
      // de `yawBase`, nunca a soma dos seus passos: é o que faz o ruído de alguns
      // graus do magnetómetro ficar onde está em vez de se acumular e levar a flor a
      // deriva. `yawBase` é o neutro que persegue essa distância, com a mesma máquina
      // de dois regimes do tilt.
      this.yawCur = 0;
      this.yawBase = 0;
      this.yawTgt = 0;
      this.yaw = 0;
      this._yawPrev = null;
      // de que evento vem o alpha: 'abs' (deviceorientationabsolute) ou 'rel'. Os
      // dois disparam no Android sobre o mesmo sensor e somar-lhes os dois era pôr a
      // flor a rodar ao dobro.
      this._yawSrc = null;
      this._yawFlat = false;
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
      this.hitMid = 0;
      this.hitLoNoise = 0;
      this.hitHiNoise = 0;
      this.hitMidNoise = 0;
      this.beat3Hold = 0;
      this.hitFlag = false;
      this.hit2Flag = false;
      this.hit3Flag = false;
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
      this._onGyro = onGyro || null;
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
        this.orientLive = true;
        this._orientSilent = 0;
        window.addEventListener('deviceorientation', this._onOrient);
        // G4 — no Android é o evento absoluto que dá um alpha estável (relativo ao
        // norte magnético); o comum dá um alpha relativo a uma direção arbitrária,
        // que serve para um volante mas não para o que o `_yawSrc` escolhe. iOS não
        // dispara este segundo e continua a alimentar a torção pelo `alpha` do evento
        // comum, que é o ramo `rel` de _onYaw.
        window.addEventListener('deviceorientationabsolute', this._onOrientAbs);
        // computadores disparam o evento sem valores: se nada útil chegar, avisa
        // NESTE INSTANTE — mas o listener fica onde está, porque a janela de
        // permissão do Android pode aparecer tarde e ser respondida depois deste
        // prazo. Desinscrever aqui era o buraco: o utilizador dava "Permitir" ao
        // segundo 3 e o giroscópio ficava surdo até desligar e ligar as interações.
        this._gyroTimer = setTimeout(() => {
          if (!this.orientSeen) this._loseOrient();
          else if (onGyro) onGyro('ok');
        }, 1500);
      }
      return out;
    }

    /* G5a — dar o sensor por perdido, sem perder a sessão. O ponteiro passa a
       conduzir a inclinação (orientLive é o que o app.js consulta), a base é
       apagada para que a pose em que o sensor voltou valha como neutra em vez de
       dar um salto, e a mensagem acompanha. Os dados que entretanto cheguem
       re-armam tudo sozinhos em _onOrient(). */
    _loseOrient() {
      if (!this.orientLive) return;
      this.orientLive = false;
      this.base = null;
      this.tgt.x = 0;
      this.tgt.y = 0;
      // G4 — com o anexo colado ao ângulo onde o sensor ficou calado, o canal morre
      // centrado: um sensor que volta a falar re-sincroniza no neutro em vez de
      // herdar o ângulo da sala de onde se caiu.
      this.yawBase = this.yawCur;
      this.yawTgt = 0;
      this._yawPrev = null;
      this._yawFlat = false;
      // e larga também a reivindicação da fonte: se o `deviceorientationabsolute` do
      // Android cair e só voltar o evento comum, o ramo `rel` tem de poder assumir a
      // torção no re-arme — com o latch antigo ficava calado para sempre
      this._yawSrc = null;
      if (this._onGyro) this._onGyro('unavailable');
    }

    stop() {
      clearTimeout(this._gyroTimer);
      window.removeEventListener('deviceorientation', this._onOrient);
      window.removeEventListener('deviceorientationabsolute', this._onOrientAbs);
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
      if (window.screen.orientation && Number.isFinite(window.screen.orientation.angle)) a = window.screen.orientation.angle;
      else if (Number.isFinite(window.orientation)) a = window.orientation;
      return ((a % 360) + 360) % 360;
    }

    /* G4 — o teste é ao número, não ao nulo. Um beta ou um alpha `NaN` passa por
       existente e envenena tudo: o `Math.max` do detetor de pose quieta devolve NaN,
       NaN < orientStillDeg é falso, o contador de quietude nunca chega ao limiar e a
       re-centragem morre — não só no canal que entrou, mas nos dois que partilham o
       detetor. Os navegadores mandam alpha nulo quando não há bússola e mandam-no NaN
       quando a pose não é resolvível, por isso é aqui que isso se fecha. */
    _onOrient(e) {
      if (!Number.isFinite(e.gamma) || !Number.isFinite(e.beta)) return;
      this.orientSeen = true;
      this._orientSilent = 0;
      // G5a — o sensor volta sozinho: foi dado por perdido pelo vigia de 1,5 s (a
      // janela de permissão ainda aberta) ou pelo de silêncio, e o primeiro ângulo
      // útil que chegue re-arma sem pedir nada ao utilizador. Fica fora se nunca
      // houve subscrição (permissão negada ou navegador sem DeviceOrientation).
      if (this.orientOn && !this.orientLive) {
        this.orientLive = true;
        if (this._onGyro) this._onGyro('ok');
      }
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
        // G1 — com a base nova o contador de pose quieta recomeça do zero: sem isto,
        // a mão que ainda se move no instante do re-arma seria adotada como neutra
        this._pose = null;
      }
      // o ângulo atual guarda-se e lê-se em update(dt): a re-centragem precisa de dt,
      // e o evento chega a 60 Hz enquanto o renderizador corre a 30 num celular fraco
      this.cur.x = ax;
      this.cur.y = ay;
      if (this._yawSrc !== 'abs') this._onYaw(e);
    }

    /* G4 — o handler do deviceorientationabsolute. Só alimenta a torção: o tilt já
       veio no evento comum, com os mesmos beta/gamma, e relê-lo não mudava nada mas
       contava duas vezes o mesmo alpha. Não é preciso re-sincronizar nada na troca de
       referencial: o anexo de _onYaw absorve o salto, e o que havia de torção fica.
           O `isFinite` não é limpeza, é a reivindicação: quem não traz ângulo não se
       pode apropriar da fonte. Medido no browser — um único evento absoluto do portátil,
       com alpha nulo, bastou para pôr `_yawSrc` em 'abs' e calar o ramo `rel` para
       sempre: 30° de torção valiam 0° de flor, e só voltaram a valer quando o anexo foi
       largado à mão. O `_onOrient` do evento comum decide por esta variável. */
    _onOrientAbs(e) {
      if (!Number.isFinite(e.alpha)) return;
      this._yawSrc = 'abs';
      this._onYaw(e);
    }

    /* G4 — a torção. O alpha é uma bússola, e uma bússola não é um contador: recalibra
       de uma vez quando o ferro do bolso ou o cabo do carregador lhe mexem no
       referencial. O desenho óbvio — somar as diferenças evento a evento — faz dele um
       odómetro, e o que sobra de um odómetro é a memória de por onde a mão passou.
       Medido em _yaw.mjs (teste 10b): rodar 300° na mesa e desfazê-los todos. O anexo
       acompanha o regresso e fica no resíduo de sempre (13,2°); o acumulador passa a
       ida, a espera e metade do regresso colado no teto aos 40,1°, porque os 300° que
       ele somou não se desfazem com o pulso — têm de ser percorridos outra vez, e a
       flor fica sem resposta enquanto a mão já está a fazer o gesto contrário. O ruído,
       ao contrário do que eu supunha, NÃO separa os dois desenhos: com ±2° ao acaso em
       cada leitura, os dois dão o mesmo pico (1,72°), porque as diferenças se
       telescópiam em (último − primeiro) e o acaso não acumula. É o histórico que
       sobra, não o ruído que se integra — e é por isso que aqui não se soma nada.
           Guarda-se um ANEXO (yawBase) e o alpha mais próximo dele (yawCur), escolhido
       ao todo por 360°. O canal é a distância entre os dois: um salto de recalibração
       move o anexo junto, e um 359°→0° é só o `Math.round` a trocar de volta. O
       preço, e é preço: o ângulo desenrolado vive em ±180° do anexo, por isso rodar
       mais de meia volta em cima da mesa faz o sinal trocar de lado — medido a 440°/s,
       100° e 175° de torção contínua não trocam, 240° troca. Não se vê o coice porque
       a saída já satura aos 70° muito antes; e o anexo migra com a re-centragem, por
       isso pousar o tablet outra vez repõe o centro.
           O gate da mesa é o que falta ao alpha para ser usável: com o aparelho quase
       na vertical, a sequência z-x'-y'' do deviceorientation entra em singularidade e
       um centímetro de pulso vale 180° de ângulo.
           Fora da mesa o valor fica congelado onde estava, não volta a zero: levantar
       o tablet depois de o ter rodado não faz a flor dar um coice, e pousá-lo outra
       vez continua a aceitar torção de onde parou. */
    _onYaw(e) {
      if (!Number.isFinite(e.alpha) || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
      const r = Math.PI / 180;
      /* O ângulo polar do ecrã face ao teto. Na sequência z-x'-y'' a componente
         vertical da normal do aparelho é cos(beta)·cos(gamma), e é um invariante da
         pose — não precisa do rebatimento pelo ângulo da tela que o tilt precisa,
         porque não é um eixo da tela, é a inclinação da mesa. */
      const pol = Math.acos(clamp(Math.cos(e.beta * r) * Math.cos(e.gamma * r), -1, 1)) / r;
      const wasFlat = this._yawFlat;
      this._yawFlat = pol <= (this._yawFlat ? TUNE.yawExitDeg : TUNE.yawEnterDeg);
      const a = e.alpha;
      const prev = this._yawPrev;
      this._yawPrev = a;
      // a primeira leitura não é um movimento: é onde a torção de agora passa a contar.
      // O mesmo se aplica ao instante em que a porta da mesa se reabre: o alpha que se
      // viu com o aparelho quase na vertical veio da singularidade da sequência, e
      // desenrolá-lo contra um anexo antigo faria a flor saltar meia volta no momento
      // em que se pousa o tablet — re-sincroniza-se o anexo e o canal fica no centro.
      if (prev === null || (this._yawFlat && !wasFlat)) {
        this.yawCur = a;
        this.yawBase = a;
        return;
      }
      if (!this._yawFlat) return;
      const d = ((a - prev + 540) % 360) - 180;
      // um salto maior que a porta não é a mão a torcer: é o referencial que mudou de
      // lugar, e leva o anexo com ele para o canal ficar onde estava
      if (d > TUNE.yawJumpDeg || d < -TUNE.yawJumpDeg) {
        this.yawBase += d;
        this.yawCur += d;
        return;
      }
      this.yawCur = a + 360 * Math.round((this.yawBase - a) / 360);
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
      let pkLo = 0, pkMid = 0, pkHi = 0;
      this.hitFlag = false;
      this.hit2Flag = false;
      this.hit3Flag = false;
      if (this.audioOn && this.analyser) {
        const an = this.analyser;
        an.getByteFrequencyData(this.freq);
        an.getByteTimeDomainData(this.wave);
        /* S2 — uma passagem só serve as duas coisas: a energia do RMS e o pico dos dois
           lados do corte de um polo. O filtro é o mais barato que há e separa bumbo de
           prato à primeira ordem de grandeza, que é tudo o que se lhe pede. */
        const aSplit = 1 - Math.exp(-2 * Math.PI * TUNE.hitSplitHz / this.ctx.sampleRate);
        const aMid = 1 - Math.exp(-2 * Math.PI * TUNE.hitSplit2Hz / this.ctx.sampleRate);
        let s = 0, lp = 0, lpMid = 0;
        for (let i = 0; i < this.wave.length; i++) {
          const v = (this.wave[i] - 128) / 128;
          s += v * v;
          lp += aSplit * (v - lp);
          lpMid += aMid * (v - lpMid);
          const lo = lp < 0 ? -lp : lp;
          // o balde do meio é a diferença entre os dois lowpass: os três somam o
          // sinal de entrada, por isso nenhum deles é uma cópia do vizinho
          const md = lpMid - lp;
          const am = md < 0 ? -md : md;
          const hi = v - lp;
          const ah = hi < 0 ? -hi : hi;
          if (lo > pkLo) pkLo = lo;
          if (am > pkMid) pkMid = am;
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
      const refMid = this.hitMid * hold;
      const refHi = this.hitHi * hold;
      this.hitLo = Math.max(pkLo, refLo);
      this.hitMid = Math.max(pkMid, refMid);
      this.hitHi = Math.max(pkHi, refHi);
      const crawl = TUNE.hitNoiseCrawl * dt;
      this.hitLoNoise = Math.min(pkLo, this.hitLoNoise + crawl);
      this.hitMidNoise = Math.min(pkMid, this.hitMidNoise + crawl);
      this.hitHiNoise = Math.min(pkHi, this.hitHiNoise + crawl);
      const gateLo = Math.max(TUNE.hitFloorLo, this.hitLoNoise * TUNE.hitNoiseOver);
      const gateMid = Math.max(TUNE.hitFloorMid, this.hitMidNoise * TUNE.hitNoiseOver);
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

      /* M1 — o INSTANTE dos médios. Não é flash nem cintilar: não soma uma calorie ao
         frame, só carimba `u_hit3T` no shader, que é o que passa o `shimmer`, o `sway`
         e o `roll` de correrem ao relógio a começarem no ataque que se ouve. É o
         remendo do S1 aplicado à banda que ele deixou de fora.
             Não exige dominar os AGUDOS, ao contrário do contratempo: um ataque largo
         (voz consoante, palma, caixa) é médio e agudo ao mesmo tempo, e os dois canais
         dizem coisas diferentes — um é a flor que se mexe, o outro é a luz que
         tremelica. O que exige é não perder do GRAVE (hitBalanceMid, e não o 1,4 do
         contratempo: ver o comentário desse número) — sem ele, um bombo passava a pôr
         a corola a balançar. */
      this.beat3Hold = Math.max(0, this.beat3Hold - dt);
      if (this.beat3Hold <= 0 && loudEnough && pkMid > gateMid && pkMid > pkLo * TUNE.hitBalanceMid && pkMid > refMid * TUNE.hitOver) {
        this.beat3Hold = TUNE.beat3Refractory;
        this.hit3Flag = true;
      }

      /* G5a — vigia de silêncio: um sensor que cala deixa a flor pendurada na última
         pose com a mensagem a dizer "Ativo". É o caso do iOS que corta o
         deviceorientation ao fim de um tempo e do Android que adormece o
         giroscópio com o aparelho parado. dt é o tempo de animação, não o tempo
         real: se a aba estiver escondida não há frames e nada se acumula, por isso
         a volta de um telemóvel bloqueado não acorda este vigia. */
      if (this.orientLive) {
        this._orientSilent += dt;
        if (this._orientSilent > TUNE.orientStall) this._loseOrient();
      }

      this._recenter(dt);
      const k = 1 - Math.exp(-dt * TUNE.tiltEase);
      this.tilt.x += (this.tgt.x - this.tilt.x) * k;
      this.tilt.y += (this.tgt.y - this.tilt.y) * k;
      // G4 — a torção suaviza-se com o mesmo τ: é o mesmo género de canal
      this.yaw += (this.yawTgt - this.yaw) * k;
    }

    /* Re-centragem: a pose em que o aparelho está passa a ser o neutro, por isso
       segurar o telemóvel inclinado deixa de deixar a flor pendurada para sempre. A
       banda morta é o que separa isso de apontar: sem ela, o gesto que se mantém dez
       segundos apaga-se a si próprio a meio. O equilíbrio é um desvio de exatamente
       orientDeadband — e sendo uma fração do curso, são oito graus de aparelho para
       baixo e três para cima, sempre os 5,2° de flor à sensibilidade de fábrica: o
       suficiente para se ler como intenção e não como defeito. */
    _recenter(dt) {
      if (!this.base) {
        this.tgt.x = 0;
        this.tgt.y = 0;
        this.yawTgt = 0;
        return;
      }
      const dx = this.cur.x - this.base.x;
      const dy = this.cur.y - this.base.y;
      /* G1 — a re-centragem tinha um só tempo, τ de dez segundos, e isso é uma
         eternidade quando o neutro foi apanhado numa pose que já não é a de uso:
         medido em _g12.mjs, ativado deitado na mesa e depois pegado a 75° deixava a
         flor colada no teto (17,19°) durante 23,8 s. Passa a haver dois regimes e o
         que os escolhe é a pose estar quieta — um EMA do desvio em relação a uma
         referência lenta vê se a mão parou, e ao fim de orientAdopt segundos parada a
         base corre atrás com τ de 333 ms. A falha é para o lado seguro: se a mão
         tremular mais de orientStillDeg nunca se adota, e fica-se pelo regime lento
         de sempre. */
      const kp = 1 - Math.exp(-dt * TUNE.orientPoseHz);
      if (!this._pose) this._pose = { x: this.cur.x, y: this.cur.y, yaw: this.yawCur, dev: 0, still: 0 };
      // G4 — a torção conta para a quietude da mesma forma que os dois eixos do tilt:
      // é um gesto segurado, e uma mão parada com a bússola a andar é a última coisa
      // que se quer adotar como neutro
      const dev = Math.max(Math.abs(this.cur.x - this._pose.x), Math.abs(this.cur.y - this._pose.y), Math.abs(this.yawCur - this._pose.yaw));
      this._pose.dev += (dev - this._pose.dev) * kp;
      this._pose.x += (this.cur.x - this._pose.x) * kp;
      this._pose.y += (this.cur.y - this._pose.y) * kp;
      this._pose.yaw += (this.yawCur - this._pose.yaw) * kp;
      this._pose.still = this._pose.dev < TUNE.orientStillDeg ? this._pose.still + dt : 0;
      const quieta = this._pose.still > TUNE.orientAdopt;
      if (this.orientOn && TUNE.orientRecenter > 0) {
        const k = 1 - Math.exp(-dt * (quieta ? TUNE.orientAdoptHz : TUNE.orientRecenter));
        if (Math.abs(dx) > TUNE.orientDeadband) {
          this.base.x += (dx - Math.sign(dx) * TUNE.orientDeadband) * k;
        }
        /* G2 — com o curso do y assimétrico, a banda morta também tem de ser: é a
           mesma fração de curso dos dois lados (8/40 = 0,2), medida no curso de cada
           um. Ficam 3° para cima e 8° para baixo, e os dois deixam a flor a pender os
           mesmos 5,2° de sempre — uma banda fixa em graus de aparelho penduraria 9,2°
           de flor no lado de cima. */
        const dbY = (TUNE.orientDeadband * (dy > 0 ? TUNE.tiltRangeUp : TUNE.tiltRange)) / TUNE.tiltRange;
        if (Math.abs(dy) > dbY) this.base.y += (dy - Math.sign(dy) * dbY) * k;
        /* G4 — o mesmo k, o mesmo deadband e a mesma adoção da pose quieta servem a
           torção, com o neutro a persegui-la em vez de a base do tilt. É isto que
           defende o canal da bússola: sem re-centragem, dar uma volta na sala com o
           telemóvel na mão deixava a flor virada para o ângulo por onde se passou,
           para sempre. Só corre dentro da banda da mesa: fora dela o alvo fica onde
           estava, que é o "levantar o tablet não desfaz a torção" de _onYaw. */
        if (this._yawFlat) {
          const dyaw = this.yawCur - this.yawBase;
          if (Math.abs(dyaw) > TUNE.orientDeadband) {
            this.yawBase += (dyaw - Math.sign(dyaw) * TUNE.orientDeadband) * k;
          }
        }
      }
      /* G3 — o desvio já não é cortado aqui. Este clamp aos ±1 era o TETO VERDADEIRO
         de todo o canal: acima de tiltRange graus de aparelho nada se mexia em parte
         nenhuma, por mais que os consumidores tivessem os seus cortes ou que a
         sensibilidade subisse — o slider mexia só no ângulo a que se chegava ao fim,
         nunca no fim. O teto passa a haver um só, no funil (tiltKnee em shaders.js),
         e é assintótico: o curso continua a ter declive em todo o lado e os três
         consumidores deixam de congelar a três ângulos diferentes. Limitar o ângulo
         bruto é o que basta para um sensor avariado não deitar tudo abaixo. */
      this.tgt.x = clamp(dx, -TUNE.tiltMaxDeg, TUNE.tiltMaxDeg) / TUNE.tiltRange;
      // G2 — só o y tem dois cursos: para cima é o que o pulso deixa (tiltRangeUp)
      this.tgt.y = clamp(dy, -TUNE.tiltMaxDeg, TUNE.tiltMaxDeg) / (dy > 0 ? TUNE.tiltRangeUp : TUNE.tiltRange);
      /* G4 — o alvo da torção é o desvio em relação ao seu neutro, sobre o mesmo curso
         de 40° do x do tilt, e com o mesmo guarda-de-sensor-avariado (tiltMaxDeg,
         partilhado de propósito: um canal de gesto em que alguém pôs o aparelho a
         rodar como uma hélice não pode pedir mais limites do que os 70° que se pedem
         a uma inclinação). O teto verdadeiro continua a ser o ombro do funil, em
         shaders.js, e é o MESMO funil — a torção é um canal de gesto como o tilt, e um
         topo colado aqui também lhe matava o curso.
             Só se atualiza dentro da banda da mesa: fora dela fica no último valor,
         que é o "levantar o tablet não desfaz a torção" de _onYaw. */
      if (this._yawFlat) {
        this.yawTgt = clamp(this.yawCur - this.yawBase, -TUNE.tiltMaxDeg, TUNE.tiltMaxDeg) / TUNE.yawRange;
      }
    }

    /* Valores prontos para o shader, já com a sensibilidade aplicada.
       Os canais de áudio vão todos a 0..1: os coeficientes dos shaders foram
       desenhados para esse intervalo. O topo é feito com ombro suave em vez de
       clamp, para que o curso inteiro do slider sirva para alguma coisa e a música
       alta continue a ter dinâmica em vez de encostar no teto.
           O tilt é o único que sai daqui sem limite: tem dois caminhos até ao
       shader — o giroscópio passa por read(), o rato e o toque (app.js) não passam
       — e um teto posto aqui só valeria para um dos dois. O teto partilhado vive no
       funil onde os dois se encontram (tiltKnee, em shaders.js). Desde G4 a torção
       sai com a mesma regra, mas ela só tem um caminho: nunca chega pelo ponteiro. */
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
        // M1 — o instante dos médios, no mesmo espírito: uma marca de tempo, não uma
        // intensidade. É o que o shader usa para reiniciar a fase do balanço
        hit3: this.hit3Flag,
        // 0,5 sem microfone: o timbre é a única leitura que existe mesmo quando o
        // áudio está desligado, e tem de dizer "neutro" e não "grave" ou "agudo"
        timbre: clamp(this.timbre, 0, 1),
        tiltX: this.tilt.x * this.orientSens,
        tiltY: this.tilt.y * this.orientSens,
        /* G4 — a torção sai da mesma forma e sem limite, pelo mesmo motivo do tilt:
           encontra-o no funil de shaders.js, que é onde os canais de gesto partilham
           o teto. Vale 0 enquanto o aparelho não estiver na mesa (e 0 sempre, sem
           giroscópio: o ponteiro não tem alpha, e um rato no ar não roda nada). */
        yaw: this.yaw * this.orientSens,
      };
    }
  }

  window.V1Interaction = V1Interaction;
})();
