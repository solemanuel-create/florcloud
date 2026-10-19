# FL0R-CLOUD

Shaders visuais em tela cheia que reagem ao **microfone** e ao **giroscópio**. Site estático, sem dependências, instalável (PWA) e com cache offline.

A tela mostra uma **flor desenhada inteiramente em nuvem de pontos** — cerca de 47 mil pontos, cada um com a sua normal, cor e fase — sobre um fundo animado, e um painel pequeno: botão **Ativar interações**, botão de **tela cheia**, botão para recolher o painel, o **medidor do microfone** e os controles de sensibilidade (áudio e giroscópio) mais o controle **Intensidade da nuvem de pontos**. Em celular vertical o painel abre recolhido, para não tapar a flor. **Bater no ecrã** dá o flash de uma batida de grave, com ou sem microfone.

## Como reage

O espectro é mapeado pelo **raio da flor**: a borda pertence aos graves, o centro aos agudos. Por isso a flor abre de fora para dentro conforme a frequência. Cada ponto tem uma fase própria: nasce, cresce e desfaz-se, de modo que a nuvem mantém a densidade média enquanto cada grão vive a sua vida curta.

| Entrada | Efeito no fundo | Efeito na flor |
| --- | --- | --- |
| Volume | ondas a partir do centro, brilho | abre todas as pétalas e sobe a exposição |
| Graves | amplitude da deformação | endireita a corola, ondula a borda, **levanta só as pontas das pétalas** (curva em `r²`: a base quase não mexe, e é isso que faz a silhueta passar de taça a copo), e acima de 0,28 **descola pontos da borda para dentro, que sobem e se desfazem em fumo colorido** |
| Médios | deslocamento de cor | **calafrio que atravessa a espessura da lâmina** (rolamento ao longo da normal), onda que corre à volta das pétalas, realce na orla, e **acelera a precessão** do corpo |
| Agudos | encurta o comprimento de onda do fundo e levanta o grão | acende o miolo, faz cintilar os pontos da corola e tremelicar as orlas, sem somar luz |
| Batidas (grave) | flash | onda que viaja do centro à borda, empurrão na rotação **e no tamanho do ponto** (compensado na área, para não somar luz) |
| Contratempos (agudos) | — | **segundo harmónico no cintilar**: o waveform fica mais denso e irregular, com a mesma luz média |
| Timbre (que som é) | — | desloca a fronteira grave/agudo na corola: som escuro põe os graves mais para dentro |
| Toque no ecrã | flash | idêntico a uma batida de grave — é o que mantém o ritmo vivo sem microfone |
| Giroscópio | move o centro das formas (a pose do aparelho re-centra-se sozinha em ~10 s) | inclina a flor em 3/4 **e puxa a elevação da luz** (a flor acende do lado para onde se inclina) |
| Mouse / toque | mesmo efeito do giroscópio | mesmo efeito do giroscópio, para telas sem sensor |

Cada banda do espectro **normaliza-se sozinha**: um piso de ruído que cai de imediato e sobe devagar, um envelope de pico que se deixa cair devagar, e a escala entre os dois. Por isso a reação não depende de calibrar ganhos para a música de cada casa, e um quarto silencioso não faz a flor piscar. O curso mínimo por banda é o que impede o silêncio de ser amplificado até ao teto; o `beatMinLevel` é o que exige que uma batida seja alta de verdade, e não apenas um sobressalto da média — e é por isso que o contratempo dos agudos partilha essa mesma porta: o que autoriza um flash é a sala dar som, não o microfone ouvir o próprio chiado.

Há **dois detetores de ataque independentes**, um sobre os graves e outro sobre os agudos, cada um com limiar e refratário próprios. Um bombo dá flash; uma palma ou um prato fechado dão o cintilar mais fundo. As bandas só dizem *quanta* energia há em cada zona; o **timbre** (centro de massa do espectro, em escala log) é o que distingue uma flauta de uma guitarra ao mesmo volume.

**O ataque é lido nas amostras, não no espetro.** Medido com um clique sintético no mesmo `AnalyserNode`: o espetro só fica visível ao JavaScript aos **10 ms**, o waveform aos **2 ms**. Por isso o *instante* do golpe vem do domínio do tempo — um par lowpass/highpass de um polo a 250 Hz dá o pico grave e o pico agudo, e um golpe só conta se fizer **um topo novo**: tem de ultrapassar uma referência que decai (τ ~77 ms) e um piso de ruído que cai na hora e sobe devagar. As bandas de FFT continuam a mandar nas **amplitudes**; o caminho rápido entrega só o relógio. No console, `v1su4rtShaders.sinceHits()` devolve `beat` e `off` — os segundos desde o último grave e o último agudo, que é como se vê a sincronia sem precisar de ouvir.

Isto existe porque o problema nunca foi latência, foi **fase**: tudo o que o som conduzia era `sin(u_time * f + fase)`, em que o áudio punha a amplitude e nunca o instante. Uma batida a cair num zero da senoide não produzia nada; a mesma batida meia volta depois produzia o dobro. Agora o shader trabalha com `u_time - u_hitT`, o tempo decorrido desde o golpe, e o carimbo é posto no frame exato em que ele entra — entre o gesto e o carimbo mediram-se 0,0069 s, e na bateria sintética os golpes são apanhados dentro de um frame (0,017 s a 60 Hz).

**Há uma régua para tudo isto**: `v1su4rtProbe.run()` no console. Injeta um degrau conhecido no próprio analisador (sem pedir microfone), mede os milissegundos desde o instante em que o degrau é emitido até cada canal cruzar 50% e 90% do valor em que assenta, e devolve também o instante a que o golpe é detetado, o a que o shader o carimba, e a tremura do sinal segurado. Com ela foram medidos os **28 ms / 69 ms** do envelope antigo, e é com ela que se mostra que hoje as bandas chegam aos **7,3 ms / 21 ms** — uma frame, não quatro. Reduzido o envelope, o resto do atraso deixou de estar num número deste projeto: passou a ser a cadência do ecrã, 6,9 ms a 145 Hz e 33 ms num celular a 30 Hz.

O contraste da corola vem da luz por ponto: cada ponto é iluminado pela sua própria normal, com uma face clara, uma sombra funda (`0,02` contra `2,30`), a luz que atravessa a pétala fina por detrás e a orla acesa quando o ponto está visto de topo. É isso que faz a nuvem ler como pétalas translúcidas e não como mancha.

Essa luz tem agora uma direção própria — o uniforme `u_light`, calculado em `lightDir()` a partir do bloco `LIGHT` em `assets/shaders.js`. Os seus azimute e elevação de origem reproduzem exatamente a direção que estava escrita no shader, por isso o frame de repouso não mudou; o que se ganhou é a órbita lenta (±15° em ~2 min) e o puxão de elevação que segue a inclinação de quem segura o aparelho.

Cada ponto é **achatado na direção da sua pétala**, para que uma face vista de topo ocupe uma faixa e não um círculo. O detalhe que torna isto seguro é a porta de pixels: o alongamento só acontece enquanto o eixo menor continua acima de ~2 px. Um sprite não é uma área, é um punhado de amostras, e num ponto de 2×2 achatar sem porta ou apaga o ponto ou soma luz — o oposto do que se quer numa flor que já está no teto de brilho. A mesma lógica obriga o empurrão de tamanho das batidas a sair compensado no alpha (`foot0`/`foot1`), para a flor ganhar movimento sem ganhar watts.

O giro da flor tem inércia: `spinVel` persegue o alvo com uma mola, por isso a corola continua a acelerar e a abrandar depois de o som já ter mudado; e o seu eixo precessiona ±1–2°, mais depressa com os médios.

O slider **Intensidade da nuvem de pontos** é um ganho sobre a nuvem toda, levado ao shader pelo uniforme `u_cloud`: `0` apaga a flor (fica só o fundo), `1` é o valor desenhado, `2` duplica o brilho e dá um quarto mais de tamanho a cada ponto. Não altera o fundo. No console: `v1su4rtShaders.setCloudIntensity(0.5)`.

O slider **Mistura de cor** roda o matiz de toda a paleta da flor em torno do cinza, por uma rotação de Rodrigues: `0` é a flor que foi medida, `1` leva o vermelho-vivo ao ciano passando por magenta e azul, e leva o verde do caule a magenta-frio no mesmo gesto. É uma rotação e não uma troca de três números, por isso as relações entre pétala, miolo, cálice e caule continuam lá — só a pele é outra. O fundo não participa: a paleta fria é a flor a mudar de pele, não a sala a mudar de luz. O timbre inclina ligeiramente o ângulo, mas só dentro da mistura, e com `0` a flor é exatamente a paleta do referente.

O slider **Mistura de forma** interpola a cabeça da flor — pétalas, miolo e filetes — até uma **cabeça de sementes**: um disco de Vogel (137,507° por ponto, raio em `√`) onde cada ponto é reindexado pela ordem do seu raio, por isso a correspondência frequência↔raio **continua válida** e a borda de fora continua a ser dos agudos. O disco respira como a corola respirava. Cálice, caule e folhas não se mexem: o disco pousa em cima de uma planta. Entre um e outro há um estado em que a corola ainda se abre e já se vêem as voltas da espiral.

Os dois sliders são independentes e somam-se: cor a 1 com forma a 1 é uma cabeça de sementes ciano. No console: `v1su4rtShaders.setMix(cor, forma)` — passar `undefined` num canal deixa-o como está.

**O painel lembra-se de si:** a posição dos cinco sliders fica guardada no próprio aparelho (`localStorage`, chave `v1su4rt.painel.v1`) e volta ao abrir. Não sai do aparelho — nada é enviado para lado nenhum.

## Celular, tablet e desktop

- **Celular (< 640 px):** painel na largura toda, embaixo, **aberto recolhido** com o medidor do microfone à vista. Resolução interna limitada a 1.5x.
- **Tablet (640–1023 px):** painel em cartão de 380 px no canto. Até 1.75x.
- **Desktop (≥ 1024 px):** painel de 400 px no canto. Até 2x.
- **Celular deitado:** painel estreito, sliders lado a lado.
- **Retrato:** o campo de visão é vertical e fixo, por isso é a largura que corta. A câmara recua automaticamente nas telas estreitas para a corola aberta caber inteira, e a flor sobe 10% da altura para não ficar centrada debaixo do painel. Deitado e quadrado ficam exatamente como foram desenhados.
- **Tela cheia:** o botão pede a tela cheia à página toda, não só ao canvas, para o painel continuar utilizável lá dentro. O Safari do iPhone não implementa `requestFullscreen` em conteúdo comum — nesse caso use **Compartilhar → Adicionar à Tela de Início**, que abre sem a barra do navegador.
- Se o aparelho não sustentar ~40 fps, a resolução interna desce sozinha, até 50% do limite.
- `prefers-reduced-motion` reduz a velocidade da animação a 35% **e a luz das batidas a 40%**: abrandar o movimento sem cortar o flash deixava um estroboscópio em tela cheia a 2 Hz. Ajusta-se em `setFlashScale()`.
- **Sem microfone também há ritmo:** bater no ecrã dá o mesmo flash que um bombo.
- Sem WebGL, fica um fundo estático e o painel avisa que o visual não pode ser desenhado.

## Executar no computador

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. O microfone funciona em `localhost`; o giroscópio só existe em celular/tablet, então precisa de HTTPS no aparelho.

Para conferir os shaders e as suas listas sem abrir o navegador (Node 18+, sem dependências):

```bash
node scripts/check.mjs
```

## Publicar no Vercel

O `vercel.json` já declara o projeto como estático (sem framework, sem build, saída na raiz), então basta:

1. Importar o repositório em [vercel.com/new](https://vercel.com/new).
2. Não tocar em nenhuma opção de build — a detecção já vem certa.
3. Deploy. O HTTPS é automático, e é isso que permite o microfone e o giroscópio no celular.

O `service-worker.js` é servido com `no-store` para o Vercel não o cachear e prender os usuários numa versão velha. Os `.md`, `.slnx`, `scripts/` e `.vs/` ficam fora do deploy pelo `.vercelignore`.

## Publicar no GitHub Pages

1. Envie os arquivos para a raiz do repositório.
2. **Settings → Pages → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Abra o endereço `https://` gerado no celular.

## Mapa do projeto

| Onde mudar o quê | Arquivo |
| --- | --- |
| Cor, luz, contraste, transparência, tamanho dos pontos, fumo, fundo | [`assets/shaders.glsl.js`](assets/shaders.glsl.js) — texto GLSL puro |
| Forma da flor: voltas, pétalas, folhas, densidade da nuvem | [`assets/shaders.js`](assets/shaders.js) — `WHORLS`, `LEAVES`, `buildCloud()` |
| Enquadramento: FOV, distância da câmara, recuo e subida em retrato | [`assets/shaders.js`](assets/shaders.js) — bloco `FRAME` |
| Luz do direcional: direção de origem, órbita, puxão da inclinação | [`assets/shaders.js`](assets/shaders.js) — bloco `LIGHT` e `lightDir()` |
| Inércia do giro e precessão do eixo | [`assets/shaders.js`](assets/shaders.js) — `drawFlower()` |
| Cabeça de sementes: raio, altura, curvatura da calota, ângulo áureo | [`assets/shaders.glsl.js`](assets/shaders.glsl.js) — `SEED_HEAD` (CPU) e `HEAD_K` (GPU), conferidos por `scripts/check.mjs` |
| Mistura de cor e de forma: os dois sliders | uniformes `u_mixCor` / `u_mixForm`, `setMix()` em [`assets/shaders.js`](assets/shaders.js) |
| O instante do golpe: carimbo e onda | `state.hitT` / `hit2T` e `sinceHits()` em [`assets/shaders.js`](assets/shaders.js), uniformes `u_hitT` / `u_hit2T`, e o bloco `hit*` em [`assets/interaction.js`](assets/interaction.js) |
| Bandas de frequência, portas, suavização, batida, contratempo, timbre, giroscópio | [`assets/interaction.js`](assets/interaction.js) — bloco `TUNE` |
| Painel, sliders, tela cheia, medidor, avisos do microfone | [`assets/app.js`](assets/app.js) |
| Layout responsivo do painel | [`assets/styles.css`](assets/styles.css) |
| Estrutura da página, ordem dos scripts | [`index.html`](index.html) |
| Cache offline, versão do deploy | [`service-worker.js`](service-worker.js) — `CACHE_NAME` |
| Cache-Control e detecção de static no Vercel | [`vercel.json`](vercel.json) |
| Conferência estática dos shaders, das listas de uniformes e da ordem dos scripts | [`scripts/check.mjs`](scripts/check.mjs) |
| O que vai no deploy do Vercel | [`.vercelignore`](.vercelignore) |
| Histórico das mudanças | [`CHANGELOG.md`](CHANGELOG.md) |

- `assets/shaders.glsl.js` são os quatro shaders em texto (`VERTEX_BG`, `FRAGMENT_BG`, `VERTEX_POINTS`, `FRAGMENT_POINTS`). É carregado **antes** de `shaders.js`, que só os lê de `window.v1su4rtGlsl`. Quase todo o ajuste visual acontece aqui, e nenhum precisador do renderizador muda.
- `assets/shaders.js` constrói a geometria em CPU e desenha. Cada ponto leva sete atributos — posição, **posição B** (a casa no disco de sementes), normal, cor, semente, raio e banda; o resto é feito no shader. A normal do disco **não** é um oitavo atributo: vem da curvatura analítica da calota, porque o teto do WebGL 1 são 8 atributos de vértice e a nuvem já usa 7. **Atenção ao `mediump`:** no celular o passo é 2⁻¹⁰, por isso a fase `age` é dobrada na CPU antes de ir para o shader.
- **Todos os números do som estão no bloco `TUNE`**, no topo de `assets/interaction.js`: FFT, portas e curso mínimo por banda, ataque/release, os **dois** detetores de ataque (grave e agudos) com as suas refractárias, o curso do **timbre**, a re-centragem do giroscópio (`orientRecenter`, `orientDeadband`) e o joelho suave. Não há ganhos espalhados pelo arquivo — para mudar a reação ao som, muda-se ali. `orientRecenter: 0` desliga a re-centragem e prende a base à pose do instante em que a permissão foi concedida. As bandas normalizam-se sozinhas (piso de ruído + envelope de pico), por isso não há um valor "certo" para a música de cada casa.
- **Os números do instante** estão no mesmo `TUNE`, no bloco `hit*`: `hitSplitHz` é o corte de um polo que separa grave de agudo no waveform, `hitHoldFall`/`hitOver` são a referência que decai e a margem que um golpe tem de lhe ganhar, `hitNoiseCrawl`/`hitNoiseOver` são o piso de ruído que sobe devagar (sem ele, ruído branco de sala fazia a flor cintilar sem parar), `hitFloorLo`/`hitFloorHi` são os pisos absolutos e `hitBalance` é a margem com que o agudo tem de dominar para dar cintilar em vez de flash.
- **Todos os números do enquadramento estão no bloco `FRAME`**, em `assets/shaders.js`. O FOV é vertical e fixo, por isso é a **largura** que corta: `reach` é o meio-comprimento da corola aberta e `fill` a fração da meia-largura visível que ela pode ocupar. Se mexer em `WHORLS`/`LEAVES` e a flor crescer, atualize `reach` — senão volta a cortar as pontas em retrato. A névoa dos shaders é normalizada por `u_eye.z`, por isso lê-se igual com a câmara recuada.
- `service-worker.js`: cache-first. Ao mudar qualquer arquivo em `APP_FILES`, aumente `CACHE_NAME` e registe a mudança no `CHANGELOG.md`.
- `manifest.webmanifest`, `icon.svg`, `icons/`: instalação como app.
- `privacy.html`: nota de privacidade.
- `scripts/deploy.ps1`: stage, commit e push.
- `scripts/check.mjs`: conferência estática, sem dependências. Lê o texto GLSL dos quatro shaders e as listas de `buildProgram()` de `shaders.js`, e reclama nos quatro sentidos: nome na lista que o shader não tem, nome que o shader lê e a lista não envia, `varying` com precisões diferentes entre os estágios, uniforme listado que o renderizador nunca escreve. Também passa os cinco `.js` por um parser, confere a ordem dos scripts no `index.html` e que cada arquivo do `APP_FILES` existe. **Corre-o antes de commitar qualquer mexida nos shaders:** um nome de uniforme escrito a menos é `getUniformLocation` devolver `null` e `gl.uniform1f(null, v)` não fazer nada em silêncio — o visual fica morto e a consola limpa.
- `ESF-01.slnx`: agrupa os arquivos no Visual Studio 2026.
- `TESTES.md`: roteiro de testes manuais.

Ordem de carregamento: `shaders.glsl.js` → `shaders.js` → `interaction.js` → `app.js`, todas com `defer`.

## Problemas comuns

- **Versão antiga aparecendo:** aumente `CACHE_NAME` no `service-worker.js`, ou desregistre em DevTools → Application → Service Workers. Em desenvolvimento, active **Disable cache** no DevTools: o service worker deixa passar pedidos que peçam recarregamento forçado.
- **O primeiro frame demora:** escreva `v1su4rtShaders.buildTime()` na consola. É o tempo de CPU gasto a sortear os 47 mil pontos, antes de se desenhar seja o que for — medido 68–102 ms num desktop e o número a olhar num celular antes de se decidir se a construção merece um worker. Não é uma tela em branco longa por causa de rede: os `.js` somam ~90 KB.
- **Microfone sem reação:** olhe primeiro para o **medidor** abaixo dos botões. Se ele não se mexer, o problema é a captura (permissão, HTTPS, ou o microfone errado no sistema) e não o shader — ao fim de 5 s sem sinal o painel diz isso mesmo. Se ele mexer e a flor não, aumente **Sensibilidade áudio**.
- **A flor pisca sozinha num quarto silencioso:** não devia acontecer (as bandas só sobem com sinal acima do seu curso mínimo). Se acontecer, suba `beatFloor`/`beatMinLevel` no bloco `TUNE`.
- **Palmas e pratos não se veem:** o cintilar dos agudos é discreto de propósito (não soma luz ao frame). Se não notar nada, suba **Sensibilidade do áudio**; se ainda assim não chegar, desça `beat2Floor` ou suba `beat2Ratio` em `TUNE` — o primeiro deixa entrar mais golpes, o segundo exige saltos maiores.
- **A flor não fica mais clara quando toca música:** é contrato, não avaria. Com o microfone no teto a flor pode chegar a ~1,8× o brilho do silêncio e não passa disso: os termos de áudio que cintilam são médios-preservantes (`spark`, `hatFlick`) e o empurrão de tamanho das batidas é devolvido no alpha. Se uma mexida nova somar luz ao frame, ela vai bater nesse teto e estourar em branco nas orlas.
- **Pontos minúsculos apagam-se ou tremem no celular:** não mexa na elipse de `v_rot`/`v_e` sem a porta de pixels (`e² ≤ box1/2`). Num sprite de 2×2 as quatro amostras caem todas no meio-raio: com o eixo maior alinhado com as amostras, o reforço de alpha passa a ser luz pura somada; a 45°, as quatro caem fora da elipse e o ponto fica preto. É por isso que o alongamento depende do tamanho real em pixels e não só do `face`.
- **A flor volta a centrar-se sozinha depois de inclinar o aparelho:** é a re-centragem da pose (`orientRecenter`), para segurar o celular de lado não deixar a corola pendurada para sempre. Para voltar ao comportamento antigo, ponha `orientRecenter: 0`; para que a pose se apague mais depressa, suba o valor.
- **Microfone negado e a flor muda de cor/ritmo mesmo assim:** bata no ecrã — o toque entra pelo mesmo canal da batida de grave. Não move o medidor nem o vigia de sinal, que só veem o microfone.
- **Flor cortada nas pontas em retrato:** o `reach` do bloco `FRAME` ficou abaixo do tamanho real da corola depois de mexer em `WHORLS`. Aumente `reach`, ou diminua `fill`.
- **Tela cheia sem efeito no iPhone:** é o Safari, não o site. Instale com **Compartilhar → Adicionar à Tela de Início**.
- **Giroscópio sem reação:** no iOS a permissão de movimento só é pedida ao tocar em **Ativar interações**; se negada, recarregue a página.
