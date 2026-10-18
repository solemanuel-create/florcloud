# Histórico

Formato seguido: uma entrada por mudança de visual ou de estrutura, com o `CACHE_NAME`
correspondente do `service-worker.js` — é ele que diz ao browser para deitar fora a
versão guardada.

## 2026-10-18 — o visual passou a bater no instante do som, não no ponto da senoide (`v1su4rt-v19`)

Lote S (sincronia microfone↔shaders). Antes de mexer, mediu-se o atraso real do caminho todo;
depois trocou-se a fase do movimento, e por último passou-se o detetor de golpe para o domínio do
tempo.

- **S0 — o atraso não era onde se pensava.** Um clique sintético injetado no mesmo `AnalyserNode`
  (3 repetições, números idênticos): o espetro fica visível ao JavaScript aos **10 ms**, o
  waveform aos **2 ms** (`baseLatency` 0,01 s, 48 kHz). Mudar `smoothingTimeConstant` de 0,15 para
  0 não altera o tempo nem um milissegundo e baixa o pico ~6% (87→82) — a ideia de alisar menos
  para responder mais cedo foi medida e abandonada antes de escrever código.
  `OfflineAudioContext` + `AnalyserNode` devolve **zeros** no Chrome: a resposta em frequência não
  pode ser medida fora de linha.
- **S0 — o defeito era de fase, não de latência.** Todo o movimento que o som conduzia era
  `sin(u_time * f + semente)`: o áudio punha a **amplitude**, nunca o **instante**. Uma batida que
  caísse num zero da senoide não produzia nada, e a mesma batida meia volta depois produzia o
  dobro. 10 ms de latência não explicam isso; a fase solta sim.
- **S1 — `u_hitT` / `u_hit2T`: o carimbo do golpe.** O `shaders.js` guarda a hora do frame em que
  o detetor disparou e o shader trabalha com `u_time - u_hitT` em vez de `u_time` na onda da
  batida, no cintilar e no tremor do chapéu. O carimbo é posto **depois** de o relógio avançar, por
  isso no frame do golpe a diferença é exatamente 0. Verificado na página: entre o `pointerdown` e
  o carimbo mediram-se **0,0069 s**. O toque no ecrã carimba o mesmo instante que o bombo.
- **S2 — o ataque passou a ser lido nas amostras, não no espetro.** Um par lowpass/highpass de um
  polo a 250 Hz sobre o waveform dá o pico grave e o pico agudo numa única passagem, partilhada com
  o RMS que já lá ia. O golpe tem de fazer **um topo novo**: comparação com uma referência que decai
  (τ ~77 ms) e exige ser ultrapassada por 1,35, mais um **piso de ruído** que cai na hora e sobe a
  0,35/s. O grave manda no flash quando domina; o agudo só é elegível quando domina por margem
  (1,4), que é o que separa um prato de um passo no ar.
- **S2 — o primeiro detetor errado, medido.** A primeira versão reutilizou o par média/desvio dos
  detetores de espetro e falhou: uma nota de 80 Hz corrida está sempre acima da sua própria média e
  re-disparava a cada refractária. E sem o piso de ruído, ruído branco a −26 dBFS dava **18 disparos
  em 3 s**; com ele, **0**.
- **S2 — bateria sintética sem microfone, 12/12.** Silêncio, tom corrido, bumbo a 120 bpm, prato a
  120 bpm, alternados, ruído branco a −26 e −20 dB, chiado+batidas, crescendo, passo, golpe único e
  música. A fase dos 6 golpes bate todos dentro de **0,017 s** — um frame a 60 Hz, que é o teto do
  que um `requestAnimationFrame` pode dar.
- **O que a bateria não esconde:** os dois golpes mais quietos do crescendo (topo 0,12 e 0,25 da
  escala) não disparam pelo caminho rápido, porque os pisos absolutos `hitFloorLo/Hi` estão acima
  deles de propósito. Ficam entregues ao detetor de espetro, que na bateria foi calado a zeros
  para isolar o caminho novo.
- **Orçamento de luz intacto.** A/B emparelhado no mesmo browser, mesma resolução (330×431),
  mesmos controlos (nuvem 1,1, cor 1, forma 1), microfone fechado, 504 amostras do frame inteiro em
  21 s: **15,04** com o S1 contra **15,06** no build anterior, **0 píxeis queimados** nos dois. O
  ganho é fase, não luz.
- **Ainda não verificado:** microfone a sério num celular e no tablet, nem em produção na Vercel —
  o browser embutido onde isto foi medido não tem fonte de som, por isso o caminho rápido só foi
  visto a funcionar com sinais injetados.

## 2026-10-18 — a flor tem duas misturas: paleta fria e cabeça de sementes (`v1su4rt-v18`)

Lote 3. O painel ganhou dois sliders — **Mistura de cor** e **Mistura de forma** — e passou a
lembrar-se de si. Nada aqui mexe na escuta: com os dois em 0 a flor é exatamente a que foi
medida no lote anterior, píxel por píxel.

- **B3 — a mistura de cor roda o matiz, não troca três números.** Uma rotação de Rodrigues em
  torno do eixo do cinza (1,1,1) leva vermelho-vivo a ciano, laranja a violeta e o verde do
  caule a magenta-frio na mesma rotação, até π, que é onde o vermelho cruza para o ciano. O
  **sinal** foi a escolha cara do lote: os dois sentidos chegam ao mesmo ciano, mas um passa
  pelo verde e o outro pelo violeta. Com `+`, a meio do curso a flor inteira era uma bola verde
  lima (capturado em screenshot). Com `−` o arco é vermelho → magenta → azul → ciano e o meio do
  curso é a paleta mais bonita dos dois lados. Afeta só a nuvem de pontos: o fundo fica onde
  está, porque a paleta fria é a flor a mudar de pele, não a sala a mudar de luz.
- **B3 — e a rotação mentia na luz.** Rodar em torno do cinza deixa inalterada a **soma** dos
  três canais, que é o que o orçamento mede; o que o frame devolve não é a soma, é a soma depois
  de cada canal ser cortado a 1,0. Um vermelho já cortado passa a distribuir a mesma luz por três
  canais e o frame ganha ~10% sem que ninguém tenha pedido. Por isso a rotação é seguida de uma
  renormalização ponto a ponto (soma antes / soma depois, com as duas mínimas a 1,0). Fechou em
  **+2%** medido, que é o corte que acontece na soma de todos os pontos e a conta individual não
  pode ver.
- **B4 — a forma B é uma cabeça de sementes, não uma flor nova.** Os 43.598 pontos da cabeça
  (pétalas, miolo e filetes) são reindexados numa espiral de Vogel — `r = R·√((s+½)/N)`,
  `θ = s·137,507°` — sobre uma calota. O índice é dado pela ordem do `a_rad` de cada ponto, por
  isso a correspondência frequência→raio **continua válida no disco**: a borda de fora continua a
  ser dos agudos e o disco respira como a corola respirava. O `a_rad` não morpha.
- **B4 — o morph tem porta.** `onHead = step(0.6, a_band)`: cálice, caule e folhas ficam onde
  estão, e o disco pousa em cima de uma planta em vez de flutuar no escuro. O mesmo `form` governa
  a posição (`a_posB`), a normal e a compensação de luz.
- **B4 — a normal do disco é calculada, não enviada.** A calota tem normal analítica
  (`HEAD_K = 2·dome/r²`, escrita em `const float` dentro do shader), o que evita o 8.º atributo de
  vértice — o teto do WebGL 1 é 8 e a nuvem usa 7. Os números da calota vivem em `SEED_HEAD`, no
  topo de `shaders.glsl.js`, porque `shaders.js` os usa para gerar `a_posB` e o shader para gerar a
  normal; `scripts/check.mjs` confere o par e falha se `HEAD_K` divergir de `2·dome/r²`.
- **B4 — o disco custava quase o dobro da luz.** Mesmos pontos, sólido fechado de frente para a
  câmara em vez de taça aberta: 10,9 → 20,7 no frame inteiro e 0,16% de pixels a branco de todo.
  A resposta não é linear por causa dos cortes — o primeiro fator, 0,48, devia dar 9,9 pela regra
  de três e deu 15,7. A 0,30 fecha em **7,56 → 7,35 (−2,8%)** a nuvem 0,65 e 10,33 → 10,13
  (−1,9%) a nuvem 1,00, zero pixels queimados nas duas leituras. Fica uma nesga abaixo da
  paridade de propósito: margem de luz gasta-se com o microfone, não com a mistura.
- **A6 — o painel lembra-se.** Os cinco sliders são gravados em `localStorage` sob
  `v1su4rt.painel.v1` e restaurados ao abrir, com o valor validado contra o `min`/`max` do
  próprio input antes de ser aceite (um slider que mudou de curso não arrasta o resto consigo).
  Prova de ponta a ponta feita: mudar valores, recarregar, os valores voltam.
- **Duas armadilhas de medida que trocaram números por engano.** (1) O recorte central deixou de
  servir: com a forma a morphar, o recorte cobre outro objeto, e as leituras antigas de cor
  (+10%) eram de um recorte que já não era o mesmo sítio. Passou a medir-se o frame inteiro, com
  média dos três canais e percentagem de pixels queimados. (2) Emular um fator de cor a baixar o
  `u_cloud` **não é a mesma conta**: `u_cloud` entra no alpha, que é cortado a 1,0 antes de
  multiplicar, e a emulação dava +17% onde o fator compilado mede −3%. Todos os números acima são
  do shader compilado, medidos depois do reload.
- **Ainda não verificado:** celular, tablet e a Vercel — e o disco com microfone a sério. As
  leituras deste lote foram todas com os canais de áudio em repouso; a espiral apanhar os agudos
  na borda é a promessa, e é no som que ela se julga.

## 2026-10-17 — a flor viva: sprite elíptico, luz que anda, giro com inércia (`v1su4rt-v17`)

Lote 2. A flor deixa de ser um objeto que respira e passa a ser um objeto que se move por
dentro: a luz contorna, as pétalas se achatam de acordo com o ângulo em que são vistas, o
giro tem massa e o contratempo empurra o tamanho. Nada aqui toca a escuta nem aos controlos.

- **B1 — o sprite deixa de ser um disco.** Cada ponto é achatado na direção do eixo maior da
  sua pétala, que vem da normal transformada à tela (`v_rot`, `v_e`), então uma face virada
  de topo ocupa uma faixa e não um círculo. O efeito colateral era o problema: **um sprite
  não é uma área, é um punhado de amostras.** Num ponto de 2×2 as quatro amostras caem todas
  no meio-raio, então achatar dá dois extremos e nada entre eles — eixo alinhado com as
  amostras, a soma vale a do disco e o reforço de alpha é luz pura somada; eixo a 45°, as
  quatro caem fora e o ponto apaga. Por isso o alongamento tem **porta de pixels**: `v_e` só
  passa de 1 quando o eixo menor continua com 2 px (`e² ≤ box1/2`). Abaixo disso o ponto é
  um pixel e um pixel não pode valer menos que meio aceso — no máximo deixa de brilhar mais.
- **B2 — `u_light`, o direcional que anda.** A luz do fragmento era uma constante escrita no
  GLSL. Agora é um uniforme alimentado por `lightDir()` em `shaders.js`: azimute 0,9095 e
  elevação 0,9798 — os mesmos números do `normalize(vec3(0.45, 0.85, 0.35))` de antes, então
  o frame de repouso é idêntico — com órbita de ±15° a 0,05 Hz (~2 min por volta) e um puxão
  de inclinação proporcional ao tom (`tiltPull 0.18`). Custar um uniforme é o preço de a
  flor ter um sol em vez de uma luminária fixa.
- **C1/C2 — dois movimentos novos.** O baixo agora curva os filetes com um `bend` quadrático
  em `r` (`u_bass * 0.13 * r * r`), que dobra a ponta e não a base; os médios mandam um
  `roll` viajante ao longo da normal (`sin(az*3 + r*5 - t*1.1)`), que faz a corola ondular
  em vez de apenas escalar.
- **C4/C5 — tamanho com empurrão e giro com massa.** O `kick` do pulso entra no
  `gl_PointSize` e, porque tamanho é área, sai compensado no alpha pelo par `foot0/foot1` —
  a conta é feita com a área que se pinta, não com a área ideal do desenho. O giro ganhou uma
  mola (`spinVel` persegue o alvo com `1 - exp(-dt*2,2)`) e uma precessão de ±1–2° que
  acelera com os médios: a flor agora continua a andar depois do som já ter parado.
- **O que se mediu, e o que se teve de medir de novo.** A pergunta do lote era se a elipse
  soma luz ao frame — com microfone no teto o teto é ~1,8× o brilho do silêncio. Método:
  recorte central de 160×160 por `readPixels` dentro de um callback de `requestAnimationFrame`
  registado **depois** do da aplicação, 5 Hz, 62 s, com os sete canais de áudio forçados a 0
  e `u_light` fixado na constante antiga. Resultados a `cloud = 2,00`, 489×431, mediana:
  **82,25** no build de referência v16, **82,4** neste lote com a elipse desligada, **80,3**
  com a porta. A elipse custa **2,5% de luz e nunca soma**, que é o contrato cumprido. A
  `cloud = 1,00` o build com porta mede **40,15** (mín 36,48 / p10 37,07 / p90 41,24 / máx
  41,69); a comparação com o v16 nessa configuração **não vale**, pelo motivo abaixo.
- **Três armadilhas de medida que invalidaram números anteriores.** (1) `tuneQuality()` baixa
  `quality` quando a média cai abaixo de 40 fps, e isso muda ao mesmo tempo a resolução
  interna e `Math.round(points.count * quality)` pontos; (2) os dois builds precisam de ser
  servidos pela mesma origem, senão um tem microfone e o outro não; (3) o slider
  `#cloud-intens` estava em 2 e **mexeu-se durante a corrida**. Os "+68%", "+67%" e "+56%"
  que chegaram a estar escritos nos comentários do shader nasceram aí e foram todos
  apagados. Lição que fica: nenhum número deste projeto vale sem a resolução, o número de
  pontos e a posição dos sliders ao lado dele.
- **Ainda não verificado:** celular, tablet e a Vercel. As medidas acima são de um desktop a
  489×431; a porta de 2 px é desenhada exatamente para o aparelho pequeno, e é nele que o
  lote tem de ser julgado.

## 2026-10-17 — o andaime: conferência estática, menos layout por frame, nuvem com semente (`v1su4rt-v16`)

Nada aqui muda a flor. É o lote que decide se o resto do projeto é fácil de mexer, e o
que se mediu em vez de se intuir.

- **`scripts/check.mjs`** — conferência estática sem dependências: cruza o texto GLSL dos
  quatro shaders com as listas de `buildProgram()`, reclama nos quatro sentidos (nome na
  lista que o shader não tem, nome que o shader lê e a lista não envia, `varying` com
  precisões diferentes entre estágios, uniforme listado que o renderizador nunca escreve),
  passa os cinco `.js` por um parser e confere a ordem dos scripts e o `APP_FILES`.
  Justificativa: `getUniformLocation` devolve `null` para um nome errado e
  `gl.uniform1f(null, v)` não faz **nada** em silêncio — o visual fica morto e a consola
  limpa. Provado ao contrário: um `u_timbreX` injetado produziu exatamente 3 erros
  apontados e nada mais. O `checkProgram()` do arranque faz a mesma varredura em runtime,
  com `ACTIVE_UNIFORMS`.
- **Geometria lida por evento, não por frame.** `resize()` saía do loop a cada frame e
  lia `canvas.clientWidth` — um layout forçado por frame, com a barra do medidor a
  escrever estilo 20 vezes por segundo em cima. Agora há `ResizeObserver` (com
  `resize`/`orientationchange`/`visualViewport` por cima) e `relayout()` tem uma guarda:
  não toca em `canvas.width` se o tamanho e a escala são os mesmos, porque mudar a
  resolução interna é a única coisa que muda o buffer sem mudar a janela — e é
  `tuneQuality()` que a chama. Medido por interceptação dos leitores de geometria:
  **nenhuma** leitura dentro do loop de desenho.
- **Matrizes em `Float32Array` uma vez só.** `proj`, `view`, `model`, `rot`, um rascunho e
  a matriz de normais saem do frame: eram ~660 alocações por segundo deitadas fora logo a
  seguir. `multiplyMatrices` não aceita saída sobreposta às entradas, por isso a
  composição passou a ser `mulLeft(model, rot)` — e é isso que mantém `model = T·Rx·Rz·Ry·S`
  legível.
- **A nuvem é sorteada com semente** (`mulberry32`, `CLOUD_SEED`). Com `Math.random()` cada
  recarga dava outra distribuição de pontos: a silhueta mudava, e comparar duas capturas
  para julgar um ajuste de luz era impossível. Agora o frame de ontem é o frame de hoje.
  Provado em Node: duas construções seguidas de `buildCloud()` dão 46.892 pontos e o mesmo
  checksum sobre posição, normal e semente (`952763752`).
- **Sem MSAA** (`antialias: false`). Não há arestas geométricas para suavizar: o fundo é um
  único quad com as arestas fora da tela e a orla de cada ponto já é antiderrame analítico
  no fragmento. O custo era um backbuffer multiamostrado e um resolve por frame — banda,
  que é o que falta no celular. Medido a 489×431: **6,90 ms** por frame com MSAA e **6,90 ms**
  sem ele, porque a tela estava no teto do vsync e sobrava GPU; ou seja, localmente não se
  vê ganho nenhum, e o que se poupou é o aparelho que não está aqui. Captura antes/depois
  sem diferença visível.
- **`buildTime()`** na API pública: os milissegundos de CPU gastos a sortear os 46.892
  pontos, que é o tempo de tela vazia antes da primeira flor. Medido **68–102 ms** num
  desktop. A otimização que lhe tinha sido feita (rascunhos partilhados no construtor, em
  vez de um array novo por ponto) deu **neutra** em A/B no Node: v15 mediana 321 ms, v16
  368 ms, com sobreposição das distribuições. O motivo é o que se mediu à parte:
  `new Float32Array(Array)` custa 0,25 ms e cada `push` 0,73 ms por 141 mil elementos,
  enquanto a matemática são ~1,4 M chamadas transcendentais. **Portanto não se justifica
  um worker** com esta evidência — e é por isso que o `buildTime()` existe: é este número
  no celular real que diria o contrário.
- **Comentários que mentiam foram desfeitos.** O bloco que explicava o multiplicador de luz
  dizia que `hatFlick` preservava a média — e o termo `0.95 * smoothstep(0.42, 0.88, r)`
  que o acompanha **não** preserva, é de propósito, e é o mais caro do orçamento. Agora está
  dito o que cada um é, incluindo o que se corta primeiro se a flor começar a estourar.
  Higiene de idioma: `telemóvel`→`celular`, `utilizador`→`usuário`, `ecrã`→`tela`,
  `pinar`→`encostar no teto`, `45º`→`45°`, e o texto do `FRAGMENT_BG` que tinha perdido os
  acentos.

Ficou de fora, por medida e não por preguiça:

- **Cortar o desenho com a aba escondida** (`document.hidden`). Não se acrescenta: o
  navegador já não chama `requestAnimationFrame` de um documento invisível, e o `dt` do
  frame já vai limitado a `[0,001, 0,1]` s, por isso voltar de 60 segundos escondido não
  dá picada nenhuma na física nem no `fpsAvg`. Tentou-se medir e não se pôde: abrir aba
  sem gesto do usuário é bloqueado pelo navegador, e a primeira medição que parecia dizer
  algo estava **inválida** (a aba nunca ficou oculta).
- **E4/E5/E11 no celular** continuam por medir neste hardware; `antialias`, worker e
  precisão só se decidem com o número do aparelho na mão.

- `README.md`: o mapa do projeto ganhou `scripts/check.mjs`, a forma de o correr e uma
  linha de "primeiro frame demora" com `buildTime()`. `TESTES.md`: conferência estática e
  limpeza de cache no roteiro de depois de cada mudança.
- `CACHE_NAME`: `v1su4rt-v15` → `v1su4rt-v16`.

## 2026-10-17 — sete canais de escuta, contratempo, timbre, toque (`v1su4rt-v15`)

Saem sete valores por frame do microfone e do giroscópio: nível, grave, médio, agudo,
batida, **contratempo** e **timbre**.

- **Toque = batida.** A pressão no canvas injeta o flash pelo mesmo canal e com o mesmo
  decaimento do detetor de batida, por isso um dedo e um bombo são indiferentes no
  visual. Era o buraco maior: com a permissão negada, ou num portátil sem microfone,
  nada do que a flor faz ao ritmo se via. Não passa pelo `level`, para o dedo não calar
  o vigia de sinal.
- **Segundo detetor de ataque, nos agudos** (`pulse2`). Palmas, estalidos, prato fechado
  e voz consoante nunca deram flash porque só o grave era olhado. O contratempo entra
  apenas na *forma* do cintilar — um segundo harmónico por cima do primeiro — e nunca no
  flash do fundo nem na fragmentação.
- **Timbre** (centro de massa do espectro, em escala log): a única leitura que diz *que*
  som é, não *quanto* som há. Desloca a fronteira grave/agudo dentro da corola. É o
  alimentador da futura mistura de cor.
- **Re-centragem da pose do giroscópio**: a inclinação em que o aparelho fica passa a ser
  o novo neutro (tau ~10 s, banda morta de 8°). Antes, a base era captada uma única vez
  ao ativar e quem segurasse o celular a 45° via a flor pendurada para sempre. O
  equilíbrio é pender exatamente `orientDeadband` graus, que se lê como intenção.
- **`prefers-reduced-motion` agora também corta a luz.** Abrandava o movimento a 35% mas
  o flash continuava a 1,0 em tela cheia — um estroboscópio a 2 Hz. `setFlashScale(0,4)`
  mantém a batida legível como pulso.

Medido, não intuído:

- Sintético em Node (15 verificações): sala vazia **0** flashes e **0** contratempos;
  bombo a 120 BPM **15** batidas em 8 s com **0** contratempos; prato a 240 BPM **31**
  contratempos com **0** flashes de grave; timbre 0,06 a 90 Hz contra 0,92 a 6 kHz, e
  seguro no silêncio; re-centragem 0,75 → 0,200 (exatamente `8/40`) em 150 s.
- Pixels no navegador (489×431, `readPixels` em rAF): toque com `flashScale` 1 dá
  **+0,076** de luminância média sobre 0,037; com 0,4 dá **+0,032** (razão medida 0,415);
  com 0 dá **+0,0001** — o corte é mesmo multiplicativo. Timbre 0,05→0,95 move o frame
  **+5,9%**, pelo que o uniforme chega de facto ao shader.
- Monte-Carlo dos termos novos sobre 47.012 pontos: com o contratempo no teto o
  multiplicador de luz vai a **0,998×** do valor sem contratempo (+2,1% no topo de todas
  as bandas); `spark` nunca desce de 0,10 e `hatFlick` nunca desce de 0,20, portanto o
  cintilar mais fundo não apaga pontos nem gasta o orçamento de luz.
- Os 17 uniformes de `VERTEX_POINTS` enumerados no browser: todos ativos, nenhum otimizado
  (nome otimizado = `getUniformLocation` devolve `null` e o `uniform1f` não faz nada em
  silêncio).

- `CACHE_NAME`: `v1su4rt-v14` → `v1su4rt-v15`.

## 2026-10-17 — retrato sem corte, som reativo medido, tela cheia (`v1su4rt-v14`)

Cadeia de áudio reescrita à volta de números medidos, não de intuição:

- Bandas auto-normalizadas: piso de ruído adaptativo (cai de imediato, sobe devagar),
  envelope de pico por banda e um **curso mínimo** (`minSpan`) que evita a divisão por
  zero no silêncio. A estatística de cada banda passou de média de todos os bins ao
  pico dos 3 maiores (`topBins`), porque a média dilui um prato de bateria em 512 bins.
- `clamp()` duro substituído por joelho suave (`softKnee`, C¹): nada encosta no teto,
  por isso o slider de sensibilidade voltou a ter ponta baixa e ponta alta úteis.
- Batida: limiar relativo ao desvio recente + refratário de 120 ms + porta de nível
  absoluto (um flash tem de ser ALTO, não apenas um sobressalto da média).
- Medido em 60 s de sinal sintético: sala vazia passou de 97 para **0** flashes;
  graves deixaram de estar colados no teto (antes 99,9% dos frames ≥ 0,99 com
  desvio-padrão 0,008, agora sd 0,265); batidas detetadas passaram de 4 para 119.
- Todo o ajuste de áudio vive agora num único bloco `TUNE` no topo de
  `assets/interaction.js`.

Shaders:

- `u_treble` chegou ao fundo (frequência das ondas e grão) e às orlas da corola, com
  `hatFlick` — cintilação cujo valor médio é 1,0, portanto não gasta o orçamento de luz.
- A névoa de profundidade passou a ser normalizada por `u_eye.z`, senão recuar a
  câmara em retrato apagava a flor inteira.

Retrato:

- O corte vinha do FOV vertical fixo: num 390×844 a meia-largura visível valia 0,670
  e a corola aberta reacha 0,96 — 43% das pontas fora da tela. A câmara agora recua
  só quando é preciso (`FRAME` no topo de `assets/shaders.js`); a 16:9 horizontal e no
  quadrado o enquadramento é exatamente o de antes.
- Em retrato a flor sobe 10% da altura do telas para não ficar centrada debaixo do painel.
- As ondas do fundo são circulares em pixels (`u_aspect`); em uv elas liam-se como
  elipses deitadas no celular.

Interface:

- Botão de **tela cheia** no cabeçalho do painel. Pede a tela cheia à página toda,
  não só ao canvas, para o painel continuar utilizável lá dentro. Onde a API não existe
  (iOS) a mensagem aponta para "Adicionar à Tela de Início".
- **Medidor do microfone**: barra fora do corpo do painel, por isso continua visível com
  tudo recolhido. Só aparece com o microfone ativo.
- **Vigia de sinal**: 5 s de microfone ativo sem captar nada mostra o aviso; quando o
  som volta, a mensagem normal regressa com o estado real do giroscópio.
- Em celular vertical o painel abre recolhido; em janelas baixas o corpo do painel
  leva scroll em vez de empurrar os botões para fora da tela.
- Idioma unificado em **pt-BR**, que é o `lang` da página: as strings visíveis diziam
  "Ecrã inteiro", "mova o rato", "Sensibilidade áudio", e os docs diziam "ecrã",
  "telemóvel", "ficheiro". Passou a "Tela cheia", "mova o mouse", "Sensibilidade do
  áudio", "tela", "celular", "arquivo" — inclusive nos comentários dos quatro arquivos
  de código.
- `CACHE_NAME`: `v1su4rt-v13` → `v1su4rt-v14`.

## 2026-10-17 — flor inteira em nuvem de pontos (`v1su4rt-v13`)

- A flor deixou de ser malha de vértices: é agora uma nuvem de ~47 mil pontos, cada um
  com normal, cor, semente e fase próprias. Não existe `VERTEX_MESH` nem `FRAGMENT_MESH`.
- Contraste e transparência por ponto: sombra a `0,02` contra luz a `2,30`, luz que
  atravessa a pétala fina por detrás e orla acesa quando o ponto é visto de topo.
- Fragmentação em fumo: acima de grave `0,28` a borda descola pontos que sobem e se
  desfazem; a massa de luz sobe ~3,4× e a silhueta alarga ~43% sem queimar o frame.
- Pétalas largas e sobrepostas em cinco voltas, ponta arredondada — a corola lê como
  flor e não como estrela de pontas.
- Fundo escurecido para o aditivo ler; cadeia de áudio corrigida (ganho por banda,
  limites fixos no analisador, tudo limitado a 0..1).
- Organização: o texto GLSL passou para `assets/shaders.glsl.js`; acrescentados
  `vercel.json`, `.vercelignore` e este histórico.

## 2026-10-17 — controlo de intensidade (`v1su4rt-v10`)

- Slider **Intensidade da nuvem de pontos**, levado ao shader pelo uniforme `u_cloud`.

## 2026-10-17 — limpeza do repositório

- Removidos o `Cel-000/` aninhado, `assets/icons/` duplicado e o `.slnx` vazio.
- Corrigidos o clip do fundo em `gl_Position`, a fuga de buffers por frame e o `clear`
  que apagava o desenho; `targetScale()` reposta antes de `resize()`.

## 2026-09-30 — dalia 3D em malha

- Primeira flor em malha de vértices com iluminação, reativa ao microfone.
