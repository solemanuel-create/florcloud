# Histórico

Formato seguido: uma entrada por mudança de visual ou de estrutura, com o `CACHE_NAME`
correspondente do `service-worker.js` — é ele que diz ao browser para deitar fora a
versão guardada.

## 2026-10-19 — um toque é uma batida, nunca uma inclinação (`v1su4rt-v24`)

Lote G5b, o terceiro do diagnóstico do giroscópio e o último que não precisa de hardware novo.
Uma linha removida em [`assets/app.js`](assets/app.js) e um observador acrescentado em
`assets/shaders.js`; nada em `interaction.js`, nenhum shader, nenhum uniforme, nenhuma cor.

**O conflito.** O `pointerdown` chamava `movePointer`, por isso o simples **pousar** o dedo num
sítio punha o alvo do tilt naquele sítio. Num telemóvel sem giroscópio — exatamente onde o ponteiro
manda — o gesto mais comum do ecrã, o toque, fazia as duas coisas que significam o oposto: batida
**e** inclinação. Medido na build anterior, um toque no canto de cima à direita levava o canal
(canal depois do joelho, o número que o shader vê, teto 1,000) a **0,979 em x e 0,743 em y**; com o
dedo pousado um segundo sem se mover, ia ao **teto nos dois eixos**. No rato tinha o mesmo defeito:
um clique num canto, sem o cursor se ter mexido, dava **0,732 / 0,685**. E a flor dava um coice a
cada batida dada com o dedo, porque o `pointerup` volta a zero e o `pointer` suaviza a τ de 1/6 s.

**A decisão dele**, dada quando o lote foi proposto: *só batida, nunca inclinação*. Fica implementada
ao segundo verbo — o tilt passa a vir **só do `pointermove`**.

| cena (PointerEvent verdadeiro, `tilt()` lido do shader) | `v23` | `v24` |
|---|---|---|
| toque no canto, 120 ms de dedo | 0,979 / 0,743 | **0,000 / 0,000** |
| dedo pousado 1 s no canto, sem se mover | 1,000 / 1,000 (teto) | **0,000 / 0,000** |
| clique de rato no canto, cursor parado | 0,732 / 0,685 | **0,000 / 0,001** |
| arrastar do centro até ao canto (3 repetições) | 1,000 / 1,000 | 1,000 / 1,000 |
| hover de rato até ao canto | 0,999 / 0,999 | 0,999 / 0,999 |
| carimbo da batida no toque (`sinceHits().beat`) | 0 | 0 |

- **O que não se perdeu está na tabela**: o arrasto dá exatamente o mesmo teto nas três repetições,
  o hover do rato idem, e o toque continua a carimbar o instante da batida — que é a outra metade da
  frase dele. No rato o clique deixa de mover a flor, mas o `pointermove` do hover já punha o tilt
  onde o cursor estava **antes** do clique, por isso nada muda para quem usa o rato.
- O caminho do ponteiro só corre quando `!sensors.orientLive` (G5a), por isto ser um substituto do
  giroscópio e não um segundo canal.
- **`tilt()` novo em `v1su4rtShaders`** — devolve `state.tiltX/tiltY` já passados pelo `tiltKnee`. É
  o único número que prova o que um gesto faz no canal, e o patch foi aplicado **também à build de
  referência** para que os dois lados da tabela sejam lidos do mesmo sítio; no `v23` é um observador
  puro, sem tocar em estado nem em ordem de nada.
- **O que se ganha a perder, e é o preço**: num telemóvel sem sensor, tocar num canto já não inclina
  a flor — é preciso arrastar. É a decisão, não um efeito colateral.

**Medição** — as duas builds servidas lado a lado (a de referência com `git archive HEAD | tar -x`,
a de trabalho no tree), os mesmos quatro gestores sintéticos disparados no `<canvas>` com
`pointerType` de verdade, e a amostragem a ler o funil em vez de reimplementar a suavização. As
regressões do áudio e do tilt correm todas verdes sobre a mexida: `scripts/check.mjs` com
`fundo(8, 1)` e `nuvem(23, 7)` inalterados e `CACHE_NAME: v1su4rt-v24`, `_g5.mjs` **19/19**,
`_m1.mjs` **11/11**, `_s2.mjs` **12/12**, `_knee.mjs` e `_g12.mjs` sem uma linha de diferença —
`interaction.js` não foi tocado neste lote. Consola sem uma linha nas duas builds.

**O que não foi verificado:** os `PointerEvent` são disparados por código, e um browser real **filtra
movimento** antes de emitir `pointermove` num toque. Se esse filtro existir, um arrasto começa a
inclinar uns píxeis depois do dedo se mover — que é a direção certa (um dedo que ainda não se moveu
não deve inclinar), mas é uma hipótese, não uma medida. Fica por sentir num celular: se o toque
continua a dar o flash com a mesma força, e se um arrasto curto (daqueles de 20 px) já inclina o
suficiente para se notar.

## 2026-10-19 — a pose de uso passa a ser o neutro, e o curso de cima encurta (`v1su4rt-v23`)

Lote G1 + G2, o segundo do diagnóstico do giroscópio. Uma mexida só em `assets/interaction.js`:
nenhum shader, nenhum uniforme, nenhuma cor tocada. O `scripts/check.mjs`, o `_knee.mjs` (o funil de
G3) e as regressões do áudio correm verdes sobre ela, e o `_g12.mjs` corre **duas builds** pelas
mesmas poses sintéticas — a comparação é literal, não uma reimplementação.

**O problema é um, com dois nomes.** A base do tilt é a pose do instante em que a permissão é
concedida, e esse instante raramente é a pose de uso: ativado com o aparelho deitado na mesa e
depois pegado a 75° deixava a flor colada no teto — **17,19° durante 23,8 s** — porque só havia um
tempo de re-centragem, τ de 10 s (`orientRecenter: 0,1`). E o curso à volta dessa base era simétrico
(±40°) quando o corpo não é: para cima o pulso deixa ~10-15° antes de o aparelho tombar para trás,
para baixo há 80° até à mesa.

**G1 — dois regimes, escolhidos por a pose estar quieta.** Um EMA rápido da pose (`orientPoseHz: 2`,
τ de 0,5 s) mede o desvio em relação a essa referência lenta; se ele couber em `orientStillDeg: 2,5`
durante `orientAdopt: 1,2` s, a base passa a perseguir com τ de 333 ms (`orientAdoptHz: 3`) em vez de
10 s. O que se adota é a pose, não o instante — um gesto a sério nunca está quieto 1,2 s, por isso
continua no regime lento.
- **A falha é para o lado seguro**: sem pose ainda (primeiro evento), com o sensor por re-arma, ou
  com a mão a tremer mais de 2,5°, fica-se exatamente pelo comportamento de `v22`. Os números abaixo
  são o melhor caso; o pior caso é o de sempre.
- O contador recomeça do zero sempre que a base é capturada de novo (`_onOrient`, no re-arme de G5a,
  e em `_clearSession`). Sem isto, a mão que ainda se movia no instante em que o sensor voltava era
  adotada como neutra — um salto em vez de um repouso.
- `orientRecenter: 0` continua a ser o interruptor de sempre, e com ele a adoção também não
  acontece: os dois regimes partilham o mesmo `if`.

**G2 — `tiltRangeUp: 15` só no semiplano de cima do `y`.** O `x` fica simétrico e o lado de baixo do
`y` fica nos 40° de sempre; o caminho do rato/toque não foi tocado.
- **A banda morta teve de ir atrás do curso**, e é a parte mais fácil de perder ao ler o diff: era
  8° nos dois lados, passou a ser **proporcional** — `orientDeadband × curso / tiltRange`, ou seja
  3° para cima e 8° para baixo. É a mesma fração de curso (0,2), e é isso que faz os dois lados
  pendurarem os mesmos **5,16° de flor** de sempre. Uma banda fixa em 8° no lado de cima penduraria
  9,2° — a pose adotada ficaria visivelmente torta, que é exatamente o defeito que G1 veio resolver.

**Medição** (`_g12.mjs`, v22 real contra v23 real, 60 Hz, poses sintéticas com jitter de semente
fixa; "assenta" = entrar e ficar dentro de 0,5° do valor final):

| cena | antes | depois |
|---|---|---|
| deitado na mesa (0°), pego a 75° | assenta aos **23,82 s** | **6,57 s** |
| na mão (75°), levantado para a cara (60°) | **17,1 s** | **4,4 s** |
| na mão (75°), tombado para trás (85°) | **8,48 s** | **4,4 s** |
| mesa→mão com ±0,6° de tremura em cada evento | **23,75 s** | **7,83 s** |
| pico da flor nas três mudanças de pose | sem mudança | sem mudança (17,19° / −9,41° / 6,36°) |

E o curso, em graus de flor à sensibilidade de fábrica (1,5), lido 0,1 s depois do movimento parar —
o lado de baixo e o `x` são **idênticos ao milésimo** nos dois builds:

| dy do aparelho | −40° | −20° | −10° | +5° | +10° | +15° | +30° |
|---|---|---|---|---|---|---|---|
| `v22` | −16,91 | −12,47 | −6,36 | 3,21 | 6,36 | 9,41 | 16,05 |
| `v23` | −16,91 | −12,47 | −6,36 | **6,56** | **15,35** | **16,91** | 17,19 |

- Ao contrário do que a tabela sugere, **o topo não subiu**: 17,19° é o teto de sempre. O que mudou
  foi a distância até ele — 15° de aparelho em vez de 40°. É o curso a encolher para a dimensão do
  gesto; o teto partilhado de G3 continua a ser o mesmo ombro assintótico.
- **O preço, e é real**: uma pose **segurada** passa a ser o neutro. 30° de inclinação mantidos
  deixavam a flor a 9,93° ao fim de 12 s e agora deixam-na a 5,16° ao fim de 8 s; um 40° percorrido
  em 4 s e largado consome-se em ~8 s. Quem quiser inclinar e **manter** a inclinação tem de o fazer
  a caminho — ou pôr `orientStillDeg: 0`, que declara a pose como nunca quieta e devolve o regime
  único de 10 s sem mais nada (`orientAdopt: 0` faz o contrário: adota logo que a tremura para).
- O **flick de 0,5 s a 40°** — o gesto rápido com que se marca uma inclinação — tem o pico intacto
  nos dois builds (**16,92°**): 0,5 s é menos que os 1,2 s de quietude, por isso a adoção nem liga.
- O repouso é o mesmo nos dois builds: **5,16° de flor** — 8° de banda sobre 40° de curso antes, 3°
  sobre 15° depois, a mesma fração. A deriva lenta de 40° em 4 s é consumida até a flor estar outra
  vez a 5,16° e fica lá.

**No browser real** (a build servida confirmada por `fetch` do `interaction.js`, com
`DeviceOrientationEvent` de verdade): ativado a 0° e segurado a 75°, a base chega aos 71,5° aos
**5,5 s** e assenta em **72,0** — que é 75 − 3, a banda nova — com o canal final em **0,200**, o
mesmo valor de `v22` (8/40 = 3/15). O `y` a ±10° a partir da pose capturada dá **0,667** para cima
e **−0,250** para baixo (2,67×); o `x` dá **0,250**. Consola sem uma linha.

**O que não foi verificado:** nada disto foi sentido num celular, e há duas coisas expostas a isso —
(1) o limiar de quietude: 2,5° é permissivo no papel, mas um pulso apoiado no cotovelo pode tremer
mais e nunca adotar, e um giroscópio ruidoso pode adotar poses que não estavam quietas; (2) os 15°
de curso para cima, estimados da mecânica do braço e não medidos. Falta também à sensação do preço
de cima: segurar 30° e vê-la desvanecer em ~5 s.

## 2026-10-19 — um teto só para a inclinação, e o giroscópio que volta (`v1su4rt-v22`)

Lote G3 + G5a, os dois primeiros do diagnóstico do giroscópio. Nada aqui mexe na cor nem no
mapa frequência↔raio: mexe na **curva** do tilt e na **vida** do sensor.

**G3 — o canal do tilt tinha quatro cortes em série e nenhum deles era combinado.** O
`_recenter` cortava o alvo a ±1 (40° de aparelho), o `read()` cortava a ±2, a flor cortava a
±1,2, a luz de teto cortava a ±1, e o fundo do ecrã não cortava em lado nenhum. À
sensibilidade de fábrica isto dava três ângulos de paragem diferentes — a luz parava aos
**26,4°**, a flor aos **31,7°**, o fundo aos **39,6°** — e depois, acima de 40°, nada se mexia
em parte nenhuma. É o mesmo mal que o `knee` do `read()` resolveu no áudio e que nunca foi
aplicado ao tilt.

- O joelho vive no **funil** (`tiltKnee` em `applyState`, `assets/shaders.js`) e não no
  `read()`, porque o tilt tem dois caminhos: o giroscópio passa por `read()`, o rato e o toque
  (`assets/app.js`) não passam. No funil passam os dois, por isso os dois ficam com o mesmo
  teto. Assinatura: `±`, linear até 0,75 (o mesmo valor do `knee` do áudio), assintótico a ±1.
- **O primeiro A/B desfez o plano.** Com os coeficientes como estavam, o ombro novo baixava os
  tetos — flor **−16,7%**, fundo **−33,3%** — porque o `clamp` de `applyState` era um muro
  *abaixo* do novo teto assintótico. Por isso os coeficientes subiram para que cada consumidor
  conserve o máximo que já tinha: flor 0,25 → **0,30** rad (o corte dela em 1,2 valia
  exatamente 0,30), luz fica em **0,18**, fundo 0,12 → **0,18** uv (a 1,5 dava 1,5×0,12 = 0,18).
  Os três tetos medidos depois: **17,19° / 10,31° / 0,1800 uv** — os mesmos de antes, ao décimo.
- **Com o rato/toque o quadro é outro, e há que dizê-lo**: o ponteiro está limitado a |p| = 1,
  por isso à sensibilidade 1 ele bate exatamente no velho `±1` da luz. Depois do ombro, o topo
  do curso fica **9,36° de luz em vez de 10,31°** (−9%), e a 1,5 **10,18 em vez de 10,31** (−1,3%);
  a flor compensa no mesmo ponto — **15,61° em vez de 14,32°** a sens 1, 8,59 em vez de 7,16 a 0,5.
  Os tetos conservados do parágrafo acima são os do **giroscópio**, que pode ir além do joelho.
  Nenhum deles é um corte novo: é o preço de um só teto para os três, e aparece só no extremo do
  arrasto, nunca a meio do curso.
- **O que se mexe é o meio do curso, sempre para cima.** Entre 1° e 20° de aparelho (a zona
  linear de fábrica) o quociente depois/antes é **constante**: flor 1,200, luz 1,000, fundo
  1,500. É ganho puro, a forma é a mesma. A 10°: flor 6,45° em vez de 5,37°, luz 3,87° (não se
  mexe), fundo 0,0675 em vez de 0,0450.
- **O slider voltou a ser um slider, e isso também mudou tetos.** Abaixo da sensibilidade de
  fábrica o muro dos ±1 — que estava monte acima, *antes* da sensibilidade — cortava o curso
  todo, por isso descer o slider encolhia o máximo em vez de encolher só a pressa de lá chegar:
  à sensibilidade 1 o teto era **14,32° de flor e 0,1200 uv de fundo**, e passou a ser
  **17,11° e 0,1792** — o curso de fábrica, disponível a qualquer sensibilidade. Acima dela é
  ao contrário: o fundo, que era o único que continuava a acelerar quando tudo o resto já tinha
  chegado, passa a parar no seu máximo desenhado — a 2 dava **0,24 uv**, a 3 dava **0,36**, e as
  duas ficam agora em **0,18**. Os dois efeitos são a mesma mexida vista de lados opostos do
  slider, e é por isso que ele volta a significar alguma coisa.
- Acima do fim do curso linear o visual **não congela**: os três chegam a 99% do seu teto no
  mesmo ângulo (**41,4°**) e continuam a responder até ao teto bruto. A zona morta de cada um,
  à sensibilidade de fábrica, passa de **58° a partir dos 33°** (flor), **63° a partir dos 28°**
  (luz) e **50° a partir dos 41°** (fundo) para **23° a partir dos 68°**, **27° a partir dos
  64°** e **27° a partir dos 64°** — três ângulos de paragem diferentes viraram um só, e ficou
  a ser o do sensor, não o do shader.
- `tiltMaxDeg: 70` substitui o ±1 do `_recenter`: deixou de ser um teto de resposta (que o
  funil já dá) e passou a ser só a proteção contra um ângulo absurdo — um `beta` que salta
  quando o aparelho passa acima do teto.
- **Não verificável píxel a píxel neste ambiente**: a diferença do meio do curso é de 1–2° de
  flor, e a rotação mais a órbita da luz (B2, ±15° em ~126 s) movem a mediana do frame mais do
  que isso. A prova é a curva medida no código real (`_knee.mjs`, tabela abaixo), não o
  screenshot.

**G5a — o vigia de 1,5 s desligava o ouvido do aparelho.** Se nada chegava nesse prazo, o
`start()` fazia `removeEventListener('deviceorientation')`. Num Android cuja janela de
permissão aparece e é respondida tarde, o utilizador dava "Permitir" ao segundo 3 e o
giroscópio ficava **mudo até desligar e ligar as interações**. E o vigia nunca mais olhava
para o sensor: um iOS que corta os eventos ao fim de um tempo deixava a flor pendurada na
última pose com a mensagem a dizer "Ativo".

- `orientOn` (a subscrição está tomada) passou a ser **duas coisas** com `orientLive` (o sensor
  está de facto a mandar dados). O listener nunca é desinscrito enquanto a sessão vive; o
  primeiro ângulo útil **re-arma sozinho** e repõe a mensagem. É `orientLive` que o ponteiro
  consulta em `assets/app.js`, por isso o rato continua a substituir o sensor durante o tempo
  em que ele está calado.
- Separar as duas flags é também o que impede um segundo `start()` por cima da primeira
  subscrição: se `orientOn` caísse, `active` caía com ele e o botão passava a dizer "Ativar
  interações", que é exatamente o botão que acrescenta outro listener.
- Vigia de silêncio: **6 s** de animação sem um único evento (`TUNE.orientStall`) dão o sensor
  por perdido **uma** vez — sem spam de mensagens, porque a perda é idempotente —, largam a
  pose (alvo a zero, a flor volta ao centro com o `tiltEase` de sempre) e apagam a base, para
  que a pose em que o sensor voltou valha como neutra em vez de dar um salto. Conta em `dt` de
  animação, não em tempo real: aba escondida não acumula, por isso a volta de um telemóvel
  bloqueado não acorda o vigia.
- **Headless** (`_g5.mjs`, o `V1Interaction` real com um browser fingido): **19/19**, incluindo
  "concessão tardia re-arma sozinha", "o sensor perdido uma vez não é anunciado 60 vezes",
  "o regresso não dá salto" e "re-ativar não duplica o listener".
- **No browser real**, com `DeviceOrientationEvent` disparado de verdade e o microfone negado:
  os relatos saem `unavailable → ok → unavailable → ok`, a base do rearme é a pose de chegada
  (30/80) e o alvo fica 0. O mesmo guião corrido contra a build `v21` fica em `unavailable`
  para sempre — o buraco reproduzido com eventos do DOM, não em simulação.

**Medição** (`_knee.mjs`, 1° a 90°, sens 1/1,5/2/3): funil `tiltKnee(x) === x` para |x| ≤ 0,75
com desvio máximo **0,00e+0** (lido do ficheiro, não copiado); `scripts/check.mjs` verde com
`fundo(8 uniformes, 1 atributos)` e `nuvem(23, 7)` inalterados; regressões do áudio **11/11**
(`_m1.mjs`) e **12/12** (`_s2.mjs`) — o `read()` foi tocado no comentário e na forma do tilt, e
os detetores não mudaram de comportamento; na página, com o ponteiro nos quatro cantos,
**zero píxeis queimados** e a mediana do frame dentro do costume.

**O que não foi verificado:** nada disto foi sentido num celular. Fica por medir (1) se o Chrome
de Android continua mesmo a emitir `deviceorientation` com o aparelho parado — o limiar de 6 s
é generoso de propósito e a perda é recuperável, mas é uma hipótese, não uma medida; (2) se a
janela de permissão do Android/iOS pode realmente chegar depois de 1,5 s, que é a razão de ser
do rearme; (3) se o fundo com o novo `u_tilt * 0,18` não corta nas bordas em retrato, que é o
que `TESTES.md` §2 pergunta.

## 2026-10-19 — o instante dos médios e a cor por banda como destino (`v1su4rt-v21`)

Lote M1 + M2, o que sobrava do diagnóstico de sincronia depois de O5/O1 terem deixado o
envelope a uma frame do som. Um lote só, um A/B de luz só.

**M1 — o caminho rápido passou a ter três baldes.** Com um só corte a 250 Hz, tudo o que não
era grave caía no mesmo balde, e os médios — a banda onde mora a voz e a melodia — ficaram sem
instante: o `shimmer`, o `sway` e o `roll` do shader corriam à senoide de `u_time` e o som só
lhes pegava na amplitude, exatamente o defeito que o S1 tinha tirado do grave e do prato.

- Um segundo lowpass de um polo a **1200 Hz**, na mesma passagem, dá o balde do meio **por
  diferença** entre os dois (`lpMid - lp`), sem tocar nos dois que já estavam medidos: o grave
  continua a ser `lp`, o agudo `v - lp`. `pkMid` entra com `hitFloorMid: 0.09` (medido: o topo
  do balde com ruído branco é 0,011 a −32 dBFS, 0,020 a −26 e 0,043 a −20; um ataque a sério dá
  0,24–0,26) e `hitBalanceMid: 1.0`.
- **Por que 1.0 e não o 1,4 do contratempo**: o filtro é de um polo, cai 6 dB por oitava, por
  isso os baldes solapam-se — um ataque a 400 Hz deixa **96%** do seu pico no balde do grave
  (topo lo 0,243 contra mid 0,254) e nunca chegaria lá. O que o 1,0 ainda garante é o que
  importa: um bombo não tem balde do meio (a 55 Hz, lo 0,488 contra mid 0,155).
- Sai `hit3`, entra `u_hit3T` (23º uniforme do `nuvem`), carimbado no mesmo `frame()` dos
  outros dois. **Não há `pulse3`**: este canal não soma uma calorie ao frame, só põe um
  relógio. Por isso o A/B de luz não o vê.
- **Headless** (`_m1.mjs`, 11 casos): 11/11, com a fase dos seis ataques médios a **0,017 s** —
  uma frame a 60 Hz. A armação do S2 continua **12/12**, ou seja, os dois detetores que já
  existiam não mudaram de comportamento.
- **No browser**, com a régua: `v1su4rtProbe.run({ hz: 700 })` dá `hit3Ms` **7,5** e
  `midStampMs` **14,2** — uma frame a 145 fps entre o disparo e o carimbo, e `jit` do médio 0;
  com `{ hz: 60 }` os dois campos saem `null` (`hitMs` 6,9), que é a separação dos baldes
  verificada sem sair do navegador. Baseline das bandas inalterado, fps 144–145, `renderer()` =
  `webgl`, consola limpa.
- **A régua estava a mentir, e foi preciso concertá-la primeiro**: sintetizava o degrau
  repetindo o mesmo valor por toda a janela do `AnalyserNode`. Para o grave isso é invisível,
  mas os dois lowpass convergem dentro do frame e o balde do médio — que é a diferença entre
  eles — só via o transitório de convergência, pelo que `hit3Ms` saía `null` com o detetor
  sadio. Agora cada amostra é um ponto diferente da senoide, e é isso que faz `hz` escolher que
  detetor se está a testar.

**M2 — a cor de cada banda deixou de ser tinta e passou a ser destino.** Grave → magenta na
borda de fora, agudo → ciano no miolo, médio → **nenhuma cor**, que é o que "neutro" queria
dizer na linguagem escolhida para este lote: ele é a banda da luz no rebordo e do movimento com
instante próprio, não da matiz.

- Os dois termos que existiam (`vec3(0.22,0.10,0.04)` de agudos e `vec3(0.10,0.17,0.04)` de
  médios) somavam-se **antes** da rotação de Rodrigues, portanto rodavam com a paleta. Medido
  com o `mixCor` a atravessar o slider, o vetor de cor normalizado (R,G,B)/soma mudava **0,64 a
  0,72** por banda: a meio do curso o magenta e o ciano caíam os dois na mesma família
  azul-verde, e a cor da banda parava de significar o que diz. Como destino, depois da rotação,
  a mesma travessia custa **0,14** no grave e **0,17** no agudo — e o silêncio continua os
  mesmos **0,68** de sempre, porque a rotação da paleta não foi tocada.
- **O fecho de soma é obrigatório**: misturar para um destino claro soma luz. Sem repetir o par
  `sAntes`/`sDepois` do B3 depois do `mix`, o frame do agudo a 1,0 valia **+81%** de média e
  tinha **2,33%** de píxeis queimados. Com ele, o A/B emparceirado deu (média dos três canais no
  frame inteiro, microfone substituído por bandas fixas): silêncio **48,35 → 48,34** (idêntico,
  como tem de ser — sem bandas não há pesos), grave **50,01 → 50,10** (+0,2%), agudo
  **75,07 → 73,40** (−2,2%), médio **68,81 → 61,13** (−11,2%, por sair a tinta verde sem
  destino nenhum), teto **78,62 → 64,32** (−18,2%). Píxeis queimados: **0,104%** no pior pin,
  0,001% no teto.
- Ao contrário do lote anterior, este A/B fez-se com o microfone fechado: pela primeira vez as
  bandas foram fixadas por um driver falso em vez de dependerem do som, e a medição saiu
  determinística — o par de controlo `antes → depois → antes` mexeu **0,01** em toda a matriz,
  órbita lenta do direcional incluída. Ficámos 18% abaixo do teto antigo no pin mais carregado,
  e é a direção certa: margem de luz gasta-se com o microfone, não com a mistura.

**Documentação**: o `README` passa a dizer **três** detetores, descreve os dois cortes e o empate
a 1,0, e a secção de testes tem agora um item por banda — o `hit3Ms`/`midStampMs` da régua, a
legibilidade dos dois anéis de cor, e o "a cor da banda não roda com o slider", que é o defeito
que a M2 fechou. `CACHE_NAME` sobe a `v1su4rt-v21`.

**O que não foi verificado**: nada disto foi ouvido num celular. A separação dos baldes em música
real, a leitura do magenta e do ciano num ecrã pequeno e o custo de mais um uniforme por frame
continuam a pedir o aparelho.

## 2026-10-19 — uma régua para o atraso, e as bandas a chegar uma frame mais cedo (`v1su4rt-v20`)

Lote O5 + O1, escolhido depois de um diagnóstico pedido porque a sincronia ainda não estava boa
com o microfone aberto. Nada aqui mexe na cor nem na forma: mexe no *tempo* que a intensidade leva
a chegar.

- **O5 — `v1su4rtProbe.run()`**: injeta um degrau conhecido no mesmo `AnalyserNode` (senoide a
  60 Hz, amplitude 0,22, espetro plano para que as três bandas degrauem no mesmo instante) e
  devolve, por canal, os ms desde o instante em que o degrau **foi emitido** até cruzar 50% e 90%
  do valor em que assenta, mais o ms a que o `hit` sai e a que o carimbo do shader o apanha, e o
  pico-a-pico do degrau segurado (a tremura). A régua controla as suas condições: fixa a
  sensibilidade em 1 durante a medição — com o slider no 3 todos os canais encostam no teto e
  mede-se o joelho suave em vez do envelope — e devolve as memórias das bandas ao estado de
  arranque no fim.
- **O baseline, com `attack: 28`**: 50% aos **28 ms**, 90% aos **69 ms** nas bandas, contra um
  instante de golpe a chegar aos **7,5 ms**. Quatro frames de atraso entre o flash e a cor.
- **O1 — `attack: 28 → 90`, `release: 7 → 9`**: 50% passa a **7,3 ms** e 90% a **21 ms** — uma
  frame em vez de quatro. O release sobe só para o ataque novo não deixar a flor a
  estroboscopicar entre golpes.
- **Tremura medida com 90**: **0** de pico-a-pico nas três bandas e **0,065–0,078** no nível, em
  duas passagens. É o limite de *baixo*: um tom sintético segurado é a entrada mais mansa que
  existe, portanto não é garantia para música real.
- **O que a régua descobriu e não se previa**: o `level` (RMS) é consistentemente o dobro do tempo
  das bandas (50% aos 14 ms, 90% aos 28) porque a própria janela do analyser ainda tem silêncio
  dentro quando o degrau começa — não é o ease. E, com o atraso das bandas reduzido a uma frame,
  **o teto passou a ser a cadência do ecrã**: 6,9 ms a 145 Hz, 33 ms num celular a 30 Hz. É por
  isto que a próxima aquisição não é mais envelope, é o instante por banda (O2).
- **Luz**: com o microfone fechado os quatro canais eased vão a 0, logo os dois builds desenham o
  mesmo frame — um A/B nessa condição não mede nada e foi por isso que não se fez. O ataque muda
  apenas o tempo de subida; o valor assente é o mesmo, e o release mais curto só tira energia
  integrada num som pulsado. Medido à parte: mediana do frame inteiro **16,20**, **0 píxeis
  queimados**. Os 15,04/15,01 do lote anterior não são comparáveis com este número: a órbita
  lenta da luz (±15° em ~2 min) e o slider mexido entre medições movem a mediana tanto como o
  código, e é isso que obriga a registar os controlos ao lado do número.
- **Ainda não verificado**: microfone a sério no celular/tablet. A régua prova o caminho interno
  com sinais injetados; não prova o som da sala.

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
