# FL0R-CLOUD

Shaders visuais em tela cheia que reagem ao **microfone** e ao **giroscópio**. Site estático, sem dependências, instalável (PWA) e com cache offline.

A tela mostra uma **flor desenhada inteiramente em nuvem de pontos** — cerca de 47 mil pontos, cada um com a sua normal, cor e fase — sobre um fundo animado, e um painel pequeno: botão **Ativar interações**, botão de **tela cheia**, botão para recolher o painel, o **medidor do microfone** e os controles de sensibilidade (áudio e giroscópio) mais o controle **Intensidade da nuvem de pontos**. Em celular vertical o painel abre recolhido, para não tapar a flor. **Bater no ecrã** dá o flash de uma batida de grave, com ou sem microfone.

## Como reage

O espectro é mapeado pelo **raio da flor**: a borda pertence aos graves, o centro aos agudos. Por isso a flor abre de fora para dentro conforme a frequência. Cada ponto tem uma fase própria: nasce, cresce e desfaz-se, de modo que a nuvem mantém a densidade média enquanto cada grão vive a sua vida curta.

| Entrada | Efeito no fundo | Efeito na flor |
| --- | --- | --- |
| Volume | ondas a partir do centro, brilho | abre todas as pétalas e sobe a exposição |
| Graves | amplitude da deformação | endireita a corola, ondula a borda, e acima de 0,28 **descola pontos da borda para dentro, que sobem e se desfazem em fumo colorido** |
| Médios | deslocamento de cor | onda que corre à volta das pétalas e realce na orla |
| Agudos | encurta o comprimento de onda do fundo e levanta o grão | acende o miolo, faz cintilar os pontos da corola e tremelicar as orlas, sem somar luz |
| Batidas (grave) | flash | onda que viaja da borda ao centro e um empurrão na rotação |
| Contratempos (agudos) | — | **segundo harmónico no cintilar**: o waveform fica mais denso e irregular, com a mesma luz média |
| Timbre (que som é) | — | desloca a fronteira grave/agudo na corola: som escuro põe os graves mais para dentro |
| Toque no ecrã | flash | idêntico a uma batida de grave — é o que mantém o ritmo vivo sem microfone |
| Giroscópio | move o centro das formas (a pose do aparelho re-centra-se sozinha em ~10 s) | inclina a flor em 3/4 |
| Mouse / toque | mesmo efeito do giroscópio | mesmo efeito do giroscópio, para telas sem sensor |

Cada banda do espectro **normaliza-se sozinha**: um piso de ruído que cai de imediato e sobe devagar, um envelope de pico que se deixa cair devagar, e a escala entre os dois. Por isso a reação não depende de calibrar ganhos para a música de cada casa, e um quarto silencioso não faz a flor piscar. O curso mínimo por banda é o que impede o silêncio de ser amplificado até ao teto; o `beatMinLevel` é o que exige que uma batida seja alta de verdade, e não apenas um sobressalto da média — e é por isso que o contratempo dos agudos partilha essa mesma porta: o que autoriza um flash é a sala dar som, não o microfone ouvir o próprio chiado.

Há **dois detetores de ataque independentes**, um sobre os graves e outro sobre os agudos, cada um com limiar e refratário próprios. Um bombo dá flash; uma palma ou um prato fechado dão o cintilar mais fundo. As bandas só dizem *quanta* energia há em cada zona; o **timbre** (centro de massa do espectro, em escala log) é o que distingue uma flauta de uma guitarra ao mesmo volume.

O contraste da corola vem da luz por ponto: cada ponto é iluminado pela sua própria normal, com uma face clara, uma sombra funda (`0,02` contra `2,30`), a luz que atravessa a pétala fina por detrás e a orla acesa quando o ponto está visto de topo. É isso que faz a nuvem ler como pétalas translúcidas e não como mancha.

O slider **Intensidade da nuvem de pontos** é um ganho sobre a nuvem toda, levado ao shader pelo uniforme `u_cloud`: `0` apaga a flor (fica só o fundo), `1` é o valor desenhado, `2` duplica o brilho e dá um quarto mais de tamanho a cada ponto. Não altera o fundo. No console: `v1su4rtShaders.setCloudIntensity(0.5)`.

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
| Bandas de frequência, portas, suavização, batida, contratempo, timbre, giroscópio | [`assets/interaction.js`](assets/interaction.js) — bloco `TUNE` |
| Painel, sliders, tela cheia, medidor, avisos do microfone | [`assets/app.js`](assets/app.js) |
| Layout responsivo do painel | [`assets/styles.css`](assets/styles.css) |
| Estrutura da página, ordem dos scripts | [`index.html`](index.html) |
| Cache offline, versão do deploy | [`service-worker.js`](service-worker.js) — `CACHE_NAME` |
| Cache-Control e detecção de static no Vercel | [`vercel.json`](vercel.json) |
| O que vai no deploy do Vercel | [`.vercelignore`](.vercelignore) |
| Histórico das mudanças | [`CHANGELOG.md`](CHANGELOG.md) |

- `assets/shaders.glsl.js` são os quatro shaders em texto (`VERTEX_BG`, `FRAGMENT_BG`, `VERTEX_POINTS`, `FRAGMENT_POINTS`). É carregado **antes** de `shaders.js`, que só os lê de `window.v1su4rtGlsl`. Quase todo o ajuste visual acontece aqui, e nenhum precisador do renderizador muda.
- `assets/shaders.js` constrói a geometria em CPU e desenha. Cada ponto leva posição, cor, normal e semente; o resto é feito no shader. **Atenção ao `mediump`:** no celular o passo é 2⁻¹⁰, por isso a fase `age` é dobrada na CPU antes de ir para o shader.
- **Todos os números do som estão no bloco `TUNE`**, no topo de `assets/interaction.js`: FFT, portas e curso mínimo por banda, ataque/release, os **dois** detetores de ataque (grave e agudos) com as suas refractárias, o curso do **timbre**, a re-centragem do giroscópio (`orientRecenter`, `orientDeadband`) e o joelho suave. Não há ganhos espalhados pelo arquivo — para mudar a reação ao som, muda-se ali. `orientRecenter: 0` desliga a re-centragem e prende a base à pose do instante em que a permissão foi concedida. As bandas normalizam-se sozinhas (piso de ruído + envelope de pico), por isso não há um valor "certo" para a música de cada casa.
- **Todos os números do enquadramento estão no bloco `FRAME`**, em `assets/shaders.js`. O FOV é vertical e fixo, por isso é a **largura** que corta: `reach` é o meio-comprimento da corola aberta e `fill` a fração da meia-largura visível que ela pode ocupar. Se mexer em `WHORLS`/`LEAVES` e a flor crescer, atualize `reach` — senão volta a cortar as pontas em retrato. A névoa dos shaders é normalizada por `u_eye.z`, por isso lê-se igual com a câmara recuada.
- `service-worker.js`: cache-first. Ao mudar qualquer arquivo em `APP_FILES`, aumente `CACHE_NAME` e registe a mudança no `CHANGELOG.md`.
- `manifest.webmanifest`, `icon.svg`, `icons/`: instalação como app.
- `privacy.html`: nota de privacidade.
- `scripts/deploy.ps1`: stage, commit e push.
- `ESF-01.slnx`: agrupa os arquivos no Visual Studio 2026.
- `TESTES.md`: roteiro de testes manuais.

Ordem de carregamento: `shaders.glsl.js` → `shaders.js` → `interaction.js` → `app.js`, todas com `defer`.

## Problemas comuns

- **Versão antiga aparecendo:** aumente `CACHE_NAME` no `service-worker.js`, ou desregistre em DevTools → Application → Service Workers. Em desenvolvimento, active **Disable cache** no DevTools: o service worker deixa passar pedidos que peçam recarregamento forçado.
- **Microfone sem reação:** olhe primeiro para o **medidor** abaixo dos botões. Se ele não se mexer, o problema é a captura (permissão, HTTPS, ou o microfone errado no sistema) e não o shader — ao fim de 5 s sem sinal o painel diz isso mesmo. Se ele mexer e a flor não, aumente **Sensibilidade áudio**.
- **A flor pisca sozinha num quarto silencioso:** não devia acontecer (as bandas só sobem com sinal acima do seu curso mínimo). Se acontecer, suba `beatFloor`/`beatMinLevel` no bloco `TUNE`.
- **Palmas e pratos não se veem:** o cintilar dos agudos é discreto de propósito (não soma luz ao frame). Se não notar nada, suba **Sensibilidade do áudio**; se ainda assim não chegar, desça `beat2Floor` ou suba `beat2Ratio` em `TUNE` — o primeiro deixa entrar mais golpes, o segundo exige saltos maiores.
- **A flor volta a centrar-se sozinha depois de inclinar o aparelho:** é a re-centragem da pose (`orientRecenter`), para segurar o celular de lado não deixar a corola pendurada para sempre. Para voltar ao comportamento antigo, ponha `orientRecenter: 0`; para que a pose se apague mais depressa, suba o valor.
- **Microfone negado e a flor muda de cor/ritmo mesmo assim:** bata no ecrã — o toque entra pelo mesmo canal da batida de grave. Não move o medidor nem o vigia de sinal, que só veem o microfone.
- **Flor cortada nas pontas em retrato:** o `reach` do bloco `FRAME` ficou abaixo do tamanho real da corola depois de mexer em `WHORLS`. Aumente `reach`, ou diminua `fill`.
- **Tela cheia sem efeito no iPhone:** é o Safari, não o site. Instale com **Compartilhar → Adicionar à Tela de Início**.
- **Giroscópio sem reação:** no iOS a permissão de movimento só é pedida ao tocar em **Ativar interações**; se negada, recarregue a página.
