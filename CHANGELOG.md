# Histórico

Formato seguido: uma entrada por mudança de visual ou de estrutura, com o `CACHE_NAME`
correspondente do `service-worker.js` — é ele que diz ao browser para deitar fora a
versão guardada.

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
