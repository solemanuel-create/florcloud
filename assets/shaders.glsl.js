/* v1su4rt — o texto dos shaders GLSL, separado do renderizador.
   É aqui que se mexe no visual: o fundo (VERTEX_BG / FRAGMENT_BG) e a nuvem de
   pontos (VERTEX_POINTS / FRAGMENT_POINTS). Este arquivo carrega antes de
   shaders.js, que lê window.v1su4rtGlsl.
   Precisão: uniform e varying partilhados entre os dois estágios têm de declarar a
   MESMA precisão — o estágio de vértice garante highp, o de fragmento não, por isso
   v_a e v_col são mediump dos dois lados. E mediump num celular é um passo de
   2^-10: uma fase grande (t / LIFE) tem de vir pronta de fora, nunca calculada aqui,
   senão a nuvem de pontos granula em passos visíveis. */
(function () {
  'use strict';

  const VERTEX_BG = `
precision mediump float;

attribute vec2 a_pos;

varying vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

  const FRAGMENT_BG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pulse;
uniform vec2 u_tilt;
uniform float u_aspect;

varying vec2 v_uv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float t = u_time * 0.3;

  // a inclinação empurra o centro das formas
  vec2 center = vec2(0.5) + u_tilt * 0.12;
  // as ondas têm de ser circulares em pixels e não em uv: o uv achata o x numa
  // tela estreita, e em retrato as ondas liam-se como elipses deitadas. Multiplicar
  // o x pelo aspect devolve a isotropia e deixa o espaçamento vertical como foi
  // desenhado — é ele que manda no número de anéis.
  float r = length((v_uv - center) * vec2(u_aspect, 1.0));

  // O fundo tem de ficar abaixo de L 0,02 quase em toda a tela: a nuvem de pontos
  // é desenhada em blending aditivo e não há forma de ler fumaça luminosa sobre um
  // palco já aceso. Os valores antigos davam L 0,06 nos cantos.
  vec3 col = mix(
    vec3(0.010, 0.008, 0.022),
    vec3(0.014, 0.010, 0.028),
    smoothstep(0.0, 1.0, r)
  );

  // respiração lenta do fundo + flash nas batidas
  col += vec3(0.008, 0.004, 0.014) * (0.3 + 0.2 * sin(t * 0.5));
  col += vec3(0.030, 0.012, 0.036) * u_pulse;

  // ondas: os graves mandam na amplitude, os agudos na frequência e o volume no
  // brilho. O agudo entra só na frequência e num fio de amplitude porque o fundo
  // tem de continuar escuro: é sobre ele que a nuvem aditiva tem de ler.
  float wave = sin(r * (5.0 + u_bass * 6.0 + u_treble * 9.0) - t) * (0.06 + u_bass * 0.14 + u_treble * 0.03);
  col += vec3(0.10, 0.05, 0.15) * wave * (0.4 + u_audio) * 0.35;

  // os médios deslocam a cor
  col.r += u_mid * 0.018;
  col.b -= u_mid * 0.012;

  // grão muito baixo, e os agudos levantam-no: é o cintilar do prato a aparecer
  // no escuro, sem somar luz suficiente para lavar a flor
  col += (hash21(v_uv + t * 0.1) - 0.5) * (0.006 + u_treble * 0.005);

  gl_FragColor = vec4(col, 1.0);
}
`;

  /* A flor inteira é a nuvem de pontos: cada ponto pertence a uma superfície da
     corola e tem um ciclo de vida, por isso pode descolar e desfazer-se em fumo.

     Contraste e transparência saem da normal da superfície, calculada no vértice:
     a cara iluminada da pétala acende, a cara em sombra fica quase preta, e a luz
     que atravessa a pétala fina faz-la brilhar por detrás. Sobre blending aditivo,
     as camadas somam-se, por isso as pétalas viradas a quem vê ficam translúcidas
     e as vistas de raspão acumulam até ao brilho de orla da fumaça.

     Todo o cálculo vai no vértice e chega ao fragmento como cor e alpha: os termos
     variam ponto a ponto, não pixel a pixel. Este programa não tem uniforms no
     fragmento, pelo que só os varying têm de declarar a MESMA precisão nos dois
     estágios — é isso que permite highp no vértice e mediump no fragmento. */
  const VERTEX_POINTS = `
precision highp float;

attribute vec3 a_pos;
attribute vec3 a_norm;
attribute vec3 a_col;
attribute vec3 a_seed;
attribute float a_rad;
attribute float a_band;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform mat3 u_normalMat;
uniform vec3 u_eye;
uniform vec3 u_light;
uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pulse;
uniform float u_pulse2;
uniform float u_timbre;
uniform float u_phase;
uniform float u_cloud;
uniform float u_size;
uniform float u_maxPx;

varying mediump vec3 v_col;
varying mediump float v_a;
/* B1 — o sprite deixa de ser um disco. v_rot é a direção do eixo MAIOR da elipse,
   medida em unidades do gl_PointCoord, e v_e é o quanto ela está esticada nesse eixo.
   O fragmento mede a distância com os dois, dentro da caixa de sempre: semieixos
   (0,5, 0,5/e²), área a do disco a dividir por e². A compensação que devolve ao ponto
   a luz que a área perdeu está no vértice (o par foot0/foot1), não aqui: não é um favor
   ao orçamento — é a razão de existir do parâmetro, porque um sprite alongado que
   somasse luz seria a flor a estourar. */
varying mediump vec2 v_rot;
varying mediump float v_e;

void main() {
  vec3 p = a_pos;
  float r = clamp(a_rad, 0.0, 1.0);
  float az = atan(p.z, p.x + 0.0001);
  vec2 dir = normalize(vec2(p.x, p.z) + vec2(0.0001));
  float floral = clamp(a_band, 0.0, 1.0);

  // O timbre desloca a fronteira entre graves e agudos dentro da corola: um som
  // escuro põe os graves a mandar mais para dentro, um som claro devolve-lhes a
  // borda. É uma re-leitura das mesmas duas bandas, não uma terceira fonte de luz,
  // por isso não soma um watt ao frame — o orçamento fica exatamente o medido.
  float xover = clamp(r + (u_timbre - 0.5) * 0.30, 0.0, 1.0);

  // o som mexe na flor toda: abre por raio, ondula a borda nas batidas
  float open = u_bass * 0.30 + u_audio * 0.10;
  float ripple = sin(r * 9.0 - u_time * 5.5) * u_pulse * 0.075;
  float breath = mix(u_treble, u_bass, xover) * 0.10;
  float shimmer = sin(p.y * 18.0 + u_time * 3.0 + r * 12.0) * u_mid * 0.012;
  float sway = sin(az * 6.0 + u_time * 2.2) * u_mid * 0.035;
  /* C1 — dobra das lâminas em tempo real. O open * 0.42 * r de cima é linear no
     raio: a pétala sobe inteira, como uma tábua articulada na base. Este termo é
     quadrático, por isso levanta só as pontas — é o que uma corola faz quando abre a
     sério, e é ele que muda a silhueta de taça aberta a copo fechado ao longo de uma
     música. Vai todo nos graves porque são eles que abrem a flor. */
  float bend = u_bass * 0.13 * r * r;
  /* C2 — onda que corre À VOLTA da corola, ao longo da normal da superfície. O sway
     também corre em azimute, mas mexe só na altura; este mexe na espessura da lâmina,
     por isso lê-se como um calafrio que a atravessa e não como a flor a abanar.
     Vem ponderado por floral: caule e folhas ficam quietos. */
  float roll = sin(az * 3.0 + r * 5.0 - u_time * 1.1) * u_mid * 0.022 * floral;
  p.xz += dir * (open + breath) * r * 0.55;
  p.y += ripple + open * 0.42 * r + bend + shimmer + sway * (0.25 + r);
  p += a_norm * roll;

  // fragmentação em fumo: só os graves fortes descolam pontos, e sempre da borda
  // para dentro, porque é a borda que pertence aos graves
  float frag = pow(clamp((u_bass - 0.28) / 0.72, 0.0, 1.0), 1.2) * (0.25 + 0.75 * r) * floral;

  // idade em ciclo: cada ponto tem uma fase diferente, por isso a densidade média
  // da nuvem se mantém constante enquanto cada ponto nasce, cresce e morre
  float age = fract(u_phase + a_seed.x);
  float ex = 1.0 + (0.7 + 3.3 * frag) * age;

  // o puff sai pela normal, puxado para fora do eixo da flor
  vec3 puff = normalize(a_norm * 0.7 + vec3(dir.x, 0.30, dir.y) * 0.7);
  p += puff * (0.035 + 0.60 * frag) * age * (0.30 + 0.70 * floral);

  // tremor turbulento, com duas escalas por eixo
  vec3 sd = a_seed * 11.0;
  p += vec3(
    sin(u_time * 0.70 + sd.y) + 0.5 * sin(u_time * 1.9 + sd.z),
    sin(u_time * 0.53 + sd.z) + 0.5 * sin(u_time * 1.7 + sd.x),
    cos(u_time * 0.61 + sd.x) + 0.5 * cos(u_time * 2.3 + sd.y)
  ) * (0.012 + 0.05 * frag) * age;

  vec4 world = u_model * vec4(p, 1.0);

  // o fumo sobe em espaço do mundo: a rotação da flor não o pode levar consigo
  world.y += age * (0.03 + 0.45 * frag);
  world.x += sin(u_time * 0.31 + sd.x) * 0.07 * frag * age;
  world.z += cos(u_time * 0.27 + sd.z) * 0.07 * frag * age;

  vec4 clip = u_proj * u_view * world;
  gl_Position = clip;
  float depth = max(clip.w, 0.05);

  // os pontos da borda são maiores que os do miolo: a corola cobre mais frame sem
  // empilhar mais luz no centro, que é onde tudo se acumula
  /* C4 — chuto de tamanho na batida. Um ponto que cresce é a flor a inchar, e é a
     leitura mais antiga de um VJ: no ataque as pétalas ganham volume. O chuto entra
     na caixa dos dois eixos, por isso a luz por ponto teria de cair com o quadrado
     do ganho — é a compensação de área mais abaixo que o faz, e ela é obrigatória:
     sem ela o mesmo watt lido em mais pixels é tinta, não luz.
       box0: a caixa de repouso, exatamente como era antes deste lote. box1: a caixa
     com o chuto, que é a que se rasteriza e, portanto, a que B1 tem de resolver
     dentro. Vem para antes da luz porque o achatamento de B1 é limitado pelo número
     de pixels que box1 realmente tem. */
  float kick = 1.0 + u_pulse * 0.20;
  float px = (0.0285 + 0.010 * frag * age + 0.006 * a_seed.z) * (0.82 + 0.40 * r) * u_size / depth;
  float box0 = clamp(px * (0.75 + 0.25 * u_cloud), 1.0, u_maxPx);
  float box1 = min(box0 * kick, u_maxPx);
  gl_PointSize = max(box1, 1.0);

  vec3 N = normalize(u_normalMat * a_norm);
  vec3 V = normalize(u_eye - world.xyz);
  /* B2 — a luz vinha num vetor fixo aqui dentro. Agora vem em u_light, já
     normalizada: o renderizador faz-lhe uma órbita lenta de ±15° em torno do eixo Y e
     puxa-lhe a elevação pela inclinação do aparelho. As nervuras passam a acender de
     um lado e do outro, que é como uma flor se lê quando se roda à volta dela. */
  vec3 L = u_light;
  float diff = max(dot(N, L), 0.0);
  float face = abs(dot(N, V));
  float trans = pow(max(dot(-N, L), 0.0), 3.0);
  float fres = pow(1.0 - face, 3.0);

  /* B1 — a elipse. Uma lâmina inclinada projeta-se em elipse achatada na direção do
     seu achatamento, que é a projeção da normal; o eixo MAIOR é o perpendicular a ela.
     O y do gl_PointCoord cresce para baixo e o do espaço de visão para cima, por isso
     o -Nv.y: sem esse sinal a elipse ficaria espelhada a 2·ângulo do sítio certo. */
  vec3 Nv = normalize((u_view * vec4(N, 0.0)).xyz);
  vec2 pn = normalize(vec2(Nv.x, -Nv.y) + vec2(0.0001, 0.0));
  v_rot = vec2(-pn.y, pn.x);
  /* 1/face era o achatamento geométrico exato, e é ele que persegue o sprite. A
     compensação de área só faz o que diz enquanto a elipse tiver pixels suficientes
     para ser amostrada: num sprite de 2×2 as quatro amostras caem todas a meia
     distância da caixa, pelo que o achatamento dá dois resultados extremos e nenhum
     meio — eixo maior alinhado com as amostras, a soma amostrada fica igual à do
     disco e o alpha multiplicado por e² é luz a mais; eixo maior a 45°, as quatro
     amostras caem fora da elipse e o ponto apaga-se. É a fase de raspão que tem mais
     pontos quase de frente para o nada e mais pontos pequenos, por isso o erro
     empurra justamente o mínimo do frame para cima. As duas primeiras versões deste
     lote — a caixa a crescer por e, depois a caixa fixa com alpha ×e² — apareceram
     mais claras do que esta em todas as medidas que se fez delas, e é por isso que
     nenhuma ficou.
     O chão é o número de pixels, não a área ideal: só se achata o eixo menor que
     ainda tenha dois pixels depois de achatado, e² ≤ box1/2. Com isso os pontos de
     um e dois pixels ficam disco (nada de amostra a dividir por dois), os de quatro
     ganham até 1,41 e só os grandes, as orlas e os filetes, chegam ao teto de 1,6.
     Medido no centro do frame ao longo de uma volta, com o microfone calado: 82,3 de
     mediana no build de referência, 82,4 neste lote com a elipse desligada, 80,3 com
     a porta — a elipse custa 2,5% de luz e nunca soma. */
  v_e = clamp(min(1.0 + (1.0 / max(face, 0.40) - 1.0) * 0.5, sqrt(max(box1 * 0.5, 1.0))), 1.0, 1.6);
  // Cada ponto cintila: os agudos dão a frequência e o centro da corola a intensidade.
  // O contratempo não alarga a oscilação — isso empurrava o fator para negativo e
  // apagava pontos — mete-lhe um segundo harmónico por cima: o waveform fica mais
  // denso e mais irregular num prato fechado, e a MÉDIA sobre os seeds continua
  // 0,55 exata porque os dois senos se anulam. Nem mais luz, nem pontos apagados.
  float sf = u_time * (2.5 + u_treble * 9.0) + a_seed.y * 40.0;
  float flick = (sin(sf) + u_pulse2 * 0.55 * sin(sf * 2.7 + a_seed.x * 17.0)) / 1.55;
  float spark = 0.55 + 0.45 * flick;
  float band = mix(u_treble, u_bass, xover);

  // CONTRASTE: 0,02 na sombra contra 2,30 na luz — um range de ~115:1 dentro de
  // cada ponto. Numa nuvem de pontos é isso que desenha a nervura e as orlas: as
  // faces viradas à luz ficam claras e as de lado quase só veem o fundo escuro.
  // ORÇAMENTO DE LUZ: com o microfone no teto (bandas todas a 1,0 e sensibilidade
  // 1,5) a flor só pode ir a ~1,8× o brilho do silêncio. Passado isso o acumulado
  // aditivo queima o frame inteiro e a corola deixa de se ver como flor.
  vec3 col = a_col * (0.02 + diff * 2.30);
  // TRANSPARÊNCIA: a luz que atravessa a pétala fina acende-a por detrás, e é este
  // termo que faz as orlas lerem como película atravessada e não como mancha opaca
  col += a_col * trans * (0.65 + band * 0.75);
  // realce de orla: quente e fraco, porque magenta somado em três camadas de
  // pontos lê-se como tinta azulada e lava o vermelho do referente. Fraco de
  // propósito no miolo e forte na borda: é a orla de cada lâmina, vista de topo,
  // que tem de acender para a pétala ler como película atravessada pela luz.
  col += mix(vec3(1.00, 0.58, 0.12), vec3(0.86, 0.24, 0.10), r) * fres * (0.11 + 0.26 * r + u_mid * 0.35);
  col += vec3(0.22, 0.10, 0.04) * u_treble * (1.0 - r) * floral;
  col += vec3(0.10, 0.17, 0.04) * u_mid * (1.0 - r * 0.4) * 0.55;
  col += vec3(0.50, 0.26, 0.10) * u_pulse * (0.30 + 0.50 * r);
  // o fumo já desfeito aclara e perde saturação, como a fumaça apanhada pela luz
  col = mix(col, vec3(0.86, 0.52, 0.30), frag * age * 0.40);
  /* O multiplicador final é a luz por ponto, e cada termo é dito pelo que é:
     - 0,62 é o repouso; u_audio*0,25 e band*0,15 são o volume e a banda.
     - spark cintila no miolo (peso 1-r): a média sobre os seeds é 0,55 exata, por
       isso redistribui luz, não soma.
     - hatFlick faz o mesmo nas orlas: a média sobre os seeds é 1,0, porque o seno de
       uma fase bem espalhada se anula. As pontas tremem com o prato e o frame não
       ganha um watt. A amplitude vai no máximo a 0,80 (0,45 dos agudos + 0,35 do
       contratempo), por isso o fator fica entre 0,20 e 1,80 e nunca a negativo.
     - O 0,95 * smoothstep(0.42, 0.88, r) que o acompanha NÃO é médio-preservante, e
       é de propósito: na nuvem a borda da corola é uma só camada de pontos e precisa
       de mais luz por ponto (~+0,57 de mediana na borda) para ler ao mesmo nível do
       miolo, onde as cinco voltas se empilham. É o termo mais caro do orçamento de
       luz e o primeiro a baixar se a flor começar a estourar em branco. */
  float hatFlick = 1.0 + (u_treble * 0.45 + u_pulse2 * 0.35) * sin(u_time * (3.0 + u_treble * 7.0) + a_seed.z * 24.0);
  col *= 0.62 + u_audio * 0.25 + band * 0.15 + (0.16 + 0.15 * u_treble) * spark * (1.0 - r) + 0.95 * smoothstep(0.42, 0.88, r) * hatFlick;

  // névoa de profundidade: sem depth buffer é assim que o lado de trás fica atrás.
  // É forte de propósito: os pontos de trás são os que se empilham sobre os de
  // frente, e sem os abaixar o centro da corola estoura em branco.
  // O depth vem de clip.w, por isso escala com a distância da câmara: em retrato a
  // câmara recua (ver resize() em shaders.js) e, sem normalizar, a flor inteira
  // entraria na janela da névoa e apagaria. 3,5 é a distância de referência do desenho.
  float fog = 1.0 - smoothstep(3.2, 4.6, depth * (3.5 / u_eye.z)) * 0.82;

  /* Compensação de área — a conta que o chuto (C4) e a elipse (B1) obrigam a fazer,
     e feita com a área que se PINTA, não com a área ideal do desenho. Um sprite não
     vale menos que um pixel: um ponto de um pixel não pode ficar com metade dele
     apagado, pode no máximo deixar de brilhar mais; e uma amostra de um perfil
     achatado não vale menos que o valor do perfil no centro. As duas primeiras
     versões deste lote caíram exatamente aí (ver a nota de B1, no achatamento):
     o mínimo do frame subiu em vez de descer.
       foot0: disco, na caixa de repouso. foot1: elipse, na caixa do chuto.
       0,7854 é π/4, a razão entre a área da elipse e a da caixa quadrada. */
  float foot0 = max(0.7854 * box0 * box0, 1.0);
  float foot1 = max(0.7854 * box1 * box1 / (v_e * v_e), 1.0);

  // envelope com pico em age 0,238 e energia conservada ao dividir por ex^2; o
  // termo de incidência faz a pétala virada a quem vê ser mais opaca que a borda,
  // que se acumula com as vizinhas até ao brilho de orla
  float e = pow(max(age, 0.002) / 0.238, 0.5) * pow(max(1.0 - age, 0.002) / 0.762, 1.6);
  float alpha = e / (ex * ex) * (foot0 / foot1);
  float thin = mix(0.55, 1.0, face * face);
  // afino do centro: só na corola, porque é ali que as cinco voltas, o miolo e os
  // filetes se sobrepõem na projeção; caule e folhas (floral 0) ficam intactos.
  // Vai até r 0,42 porque é toda a zona de bases — com a corola larga, sem isto o
  // centro queima e a flor deixa de ter miolo dourado para passar a borrão branco.
  float coreThin = 1.0 - floral * 0.90 * (1.0 - smoothstep(0.05, 0.42, r));

  v_a = clamp(alpha * thin * coreThin * (0.72 + band * 0.20) * u_cloud * fog, 0.0, 1.0);
  v_col = col * fog;
}
`;

  const FRAGMENT_POINTS = `
precision mediump float;

varying mediump vec3 v_col;
varying mediump float v_a;
varying mediump vec2 v_rot;
varying mediump float v_e;

void main() {
  /* B1 — a distância ao centro passa a distância à orla de uma elipse. Roda-se o
     quadro do ponto para o eixo maior (v_rot) e multiplica-se por (1, e²), que é
     exatamente medir uma elipse de semieixos (0,5, 0,5/e²) dentro da caixa de sempre.
     A área pintada é a do disco dividida por e², e é por isso que o vértice sobe o
     alpha na mesma razão: mesma luz por ponto, distribuída por um traço em vez de um
     grão. A conta dessa subida é feita com chão de um pixel — ver a nota do C4. */
  vec2 q = gl_PointCoord - vec2(0.5);
  vec2 q2 = vec2(q.x * v_rot.x + q.y * v_rot.y, -q.x * v_rot.y + q.y * v_rot.x);
  float d = length(q2 * vec2(1.0, v_e * v_e));
  // sprite de núcleo quase chato e orla suave: a quatro pixels um disco plano e um
  // gaussiano são indiferenciáveis, mas o núcleo chato leva o dobro e meio da luz
  // por ponto, que é o que faz a corola inteira ver-se e não só o miolo
  float f = 1.0 - smoothstep(0.30, 0.50, d);
  float a = f * v_a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(v_col * f, a);
}
`;

  window.v1su4rtGlsl = {
    VERTEX_BG: VERTEX_BG,
    FRAGMENT_BG: FRAGMENT_BG,
    VERTEX_POINTS: VERTEX_POINTS,
    FRAGMENT_POINTS: FRAGMENT_POINTS,
  };
})();
