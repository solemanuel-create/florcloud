# FL0R-CLOUD — testes manuais

Serviço local: `python -m http.server 8000` → `http://localhost:8000`. Para sensores em celular, use a versão publicada em HTTPS.

## 1. Desktop (Chrome)

- [ ] Abre sem erros no Console e sem 404.
- [ ] O visual anima em tela cheia; o painel aparece no canto inferior esquerdo.
- [ ] **A flor em nuvem de pontos está visível**: corola de pontos vermelhos em cinco voltas, miolo alaranjado, caule verde com folhas. Em repouso é vermelho-escuro, não branco estourado.
- [ ] Perto, vê-se o grão: cada pétala é feita de pontos separados, com nervura clara e orla acesa e **escuro entre as pétalas** (o contraste não vem de uma mancha lisa).
- [ ] A flor vista em 3/4: percebe-se profundidade (pétalas da frente maiores, de trás mais escuras pela névoa).
- [ ] Mover o mouse inclina a flor (não só o fundo).

## 1b. Reação da flor ao som

Com **Ativar interações** ligado e música com grave e agudo separáveis:

- [ ] **Graves**: a corola abre de fora para dentro e a flor inclina-se para a frente.
- [ ] **Graves fortes (o fumo)**: acima de ~0,3 a borda da corola **descola pontos que sobem e se desfazem como fumaça colorida**, e a mancha da flor alarga-se; ao parar o grave os pontos voltam ao lugar.
- [ ] **Batidas**: uma onda visível corre **do centro para a borda** e nasce no instante do golpe, não num ponto à sorte do ciclo; a rotação dá um empurrão.
- [ ] **Médios**: as pétalas ondulam à volta do centro (vaga em azimute) e a orla ganha brilho.
- [ ] **Agudos**: o miolo acende e os pontos da corola cintilam mais depressa; as **orlas/pontas das pétalas tremelicam** sem que a flor inteira fique mais clara (a média de luz não muda).
- [ ] **Palmas / estalidos / prato fechado** (ataque sem bombo): as orlas ficam mais densas e irregulares por uma fração de segundo. A flor **não** dá flash de fundo — é o contratempo, não a batida.
- [ ] **Timbre**: uma nota grave sostenida e uma nota aguda sostenida, ao mesmo volume, põem a borda acesa em sítios diferentes da corola. A música passa a ler-se por *que* som é, não só por quanto som há.
- [ ] **Elipse das pétalas (B1)**: em 3/4, uma pétala vista quase de topo aparece como uma **faixa** de pontos e não como um círculo de pontos. Aproxime com **Intensidade da nuvem** em 1 e depois em 2: os pontos pequenos **não apagam** nem piscam a preto — é a porta de 2 px.
- [ ] **Orçamento de luz (B1/C4)**: com a flor em movimento, o centro nunca estoura em branco e, em silêncio, a imagem volta ao mesmo nível de brilho de sempre. Se a flor ficar visivelmente mais clara com música do que sem, pare e meça antes de commitar.
- [ ] **Luz que anda (B2)**: deixe a flor ~2 min em silêncio e repare que as nervuras acendem primeiro de um lado e depois do outro, sem ciclo visível a competir com a rotação. Inclua o aparelho (ou o mouse) para cima e para baixo: a elevação da luz acompanha, e a flor acende do lado para onde pende.
- [ ] **Dobra das pontas (C1)**: com grave forte, as pontas das pétalas levantam-se **antes** da base (silhueta passa de taça a copo); ao parar o grave, a base volta a descer primeiro.
- [ ] **Calafrio (C2)**: com música de médios ricos, uma ondulação percorre a espessura das lâminas à volta da corola. O caule e as folhas ficam quietos — é ponderado por `floral`.
- [ ] **Empurrão de tamanho (C4)**: nas batidas os pontos crescem por um instante e voltam; o brilho global **não** sobe com o crescimento.
- [ ] **Giro com inércia e precessão (C5)**: ao parar a música, a rotação abranda em vez de parar seco (a mola é de ~0,45 s); com médios, o eixo da flor descreve um cone de ±1–2° — pouco, para a silhueta não descolar.

- [ ] **Bater no ecrã** dá exatamente o flash de uma batida de grave (mesma luz, mesmo decaimento). Teste **com o microfone negado**: continua a dar.
- [ ] Bater no ecrã **não** mexe no medidor nem faz o vigia de sinal calar — o dedo não finge que há som.
- [ ] **Sincronia (S1)**: com `v1su4rtShaders.sinceHits()` no console, bata no ecrã — `beat` cai a ~0 no instante do toque e volta a contar. Com música, um metrónomo a 120 bpm deve ver `beat` a zerar 2× por segundo; se zerar a meio do intervalo, a fase está solta.
- [ ] **Um golpe, um disparo (S2)**: uma nota grave **corrida** (segurada, sem ataque novo) não pode pôr a flor a piscar em loop. Só um topo novo conta.
- [ ] **Chiado de sala (S2)**: ventoinha, ar condicionado ou ganho alto não cintilam a flor depois de ~0,5 s. Se der um flash por segundo durante minutos, o piso de ruído do caminho rápido (`hitNoiseCrawl`/`hitNoiseOver`) não está a apanhar o nível da sala.
- [ ] **Grave contra agudo (S2)**: um bombo dá flash **e não** tremelicar; um prato dá tremelico **e não** flash. Um passo no ar pode dar tremelico — é banda larga, e o agudo domina.
- [ ] **A luz não acompanhou a fase (S1)**: com o microfone fechado, a média do frame inteiro está onde estava (emparelhado: 15,04 antes / 15,06 depois, zero píxeis queimados). Se a flor ficar mais clara ou mais escura sem ninguém ter mexido nos sliders, o carimbo do golpe mexeu numa amplitude e não só na fase.
- [ ] **Giroscópio**: incline o aparelho e segure-o assim 15–30 s → a flor volta a centrar-se devagar, ficando a pender pouco (8° de banda morta). Um gesto rápido de 0,5 s usa o curso todo e não é apagado.
- [ ] **Sala vazia, sem música**: a flor **não** pisca nem respira em pulso. O medidor mal se mexe.
- [ ] **Medidor do microfone** (barra abaixo dos botões): sobe com a voz/música, encosta quase no fim num volume alto e volta a zero no silêncio. Aparece só depois de ativar.
- [ ] **Vigia de sinal**: ative o microfone e faça silêncio total 5 s → aparece "Microfone ativo, mas não capta nada". Dê som → a mensagem volta à normal.
- [ ] Sensibilidade a `0.5` com música: reage pouco mas de forma visível; a `3` satura sem ficar branca colada.
- [ ] Volume alto sobe a exposição, mas o vermelho continua vermelho (as pétalas não ficam brancas).
- [ ] Em silêncio a flor volta ao repouso suave, sem tremer.
- [ ] **Intensidade da nuvem de pontos**: a `0` a flor inteira desaparece e só fica o fundo; a `1` o visual é o padrão; a `2` os pontos crescem e brilham o dobro. O número à direita acompanha o slider.
- [ ] **Mistura de cor (B3)**: a `0,5` a flor é magenta-azulada — **nunca verde-lima**; a `1` o vermelho-vivo do referente chega ao ciano e o verde do caule a magenta-frio, na mesma rotação. A relação entre pétala, miolo e cálice continua legível. O fundo não muda com o slider.
- [ ] **Mistura de forma (B4)**: a `1` a cabeça vira um disco de sementes com as voltas visíveis; cálice, caule e folhas ficam onde estavam e o disco pousa **em cima** deles, não flutua no escuro. A `0,5` vê-se a corola ainda aberta com a espiral a formar-se.
- [ ] **O disco continua a ouvir**: com a forma a `1` e música, a borda de fora cintila com os agudos e o centro respira com os graves — a reindexação não partiu o mapa frequência↔raio.
- [ ] **Luz do disco**: passar a forma de `0` a `1` não lhe sobe o brilho global (medido −3%), nem com a nuvem a `2`. Zero pixels a branco de todo.
- [ ] **Cor e forma somam-se**: os dois sliders no máximo são uma cabeça de sementes ciano, sem um dos dois anular o outro.
- [ ] **Memória do painel (A6)**: mexa em todos os sliders e recarregue a página → voltam onde estavam. Limpe o armazenamento do site → voltam aos valores de origem.
- [ ] Application → Manifest: nome, ícones 192/512/maskable, `display: standalone`.
- [ ] Application → Service Workers: "activated and is running".
- [ ] Network → Offline → recarregar: a página abre do cache.
- [ ] **Ativar interações** pede o microfone; falar/tocar música anima ondas (volume), deformação (graves) e brilhos (agudos).
- [ ] Sem giroscópio, a mensagem avisa e sugere usar mouse ou toque.
- [ ] **Desativar interações** solta o microfone (o ícone de gravação some da aba).

## 2. Tamanhos de tela

Em DevTools → modo dispositivo (ou redimensionando a janela):

- [ ] 360 px: painel na largura toda, embaixo; botão com altura de toque confortável.
- [ ] **Retrato (390×844 ou 360×780): a corola inteira cabe na tela** — as pontas das pétalas não são cortadas nas bordas, e com **graves no máximo** (sensibilidade 3, música com grave forte) continuam dentro.
- [ ] **Retrato**: a flor fica ligeiramente acima do centro, por cima do painel; o painel abre **recolido**, e o medidor continua visível.
- [ ] **Deitado → em pé** (rodar o aparelho): o enquadramento muda e a flor passa a caber, sem recarregar.
- [ ] 768 px: painel em cartão de 380 px no canto.
- [ ] 1280 px+: painel de 400 px; visual ocupa toda a tela.
- [ ] Celular deitado (ex. 800×360): painel estreito, sliders lado a lado, nada cortado.
- [ ] Janela baixa com o painel expandido: os botões do cabeçalho ficam visíveis e o corpo do painel leva scroll.
- [ ] O botão de seta recolhe e mostra o painel.
- [ ] **Botão de tela cheia**: entra e sai; o ícone muda entre cantos para fora / para dentro; o painel continua utilizável lá dentro; Esc (desktop) e o gesto do Android saem e o ícone acompanha.

## 3. Android (Chrome, HTTPS)

- [ ] Instalar app / Adicionar à tela inicial; abre sem barra de endereço.
- [ ] Modo avião: o app abre do cache.
- [ ] **Ativar interações**: aceitar microfone; o visual reage ao som.
- [ ] Inclinar o aparelho move o centro das formas; deitar o celular continua coerente.
- [ ] Sliders mudam a intensidade na hora (valores mostram 2 casas, ex. 1.50).
- [ ] **Pontos pequenos no celular**: com a resolução interna a cair sozinha (apareço fraco) e **Intensidade da nuvem** em 0,5, a flor não ganha buracos pretos nem orlas a piscar — é a porta de pixels da elipse a segurar o eixo menor em 2 px.
- [ ] Arrastar o dedo na tela move o centro.

## 4. iOS (Safari, HTTPS)

- [ ] Compartilhar → Adicionar à Tela de Início.
- [ ] **Ativar interações**: aceitar microfone e movimento no mesmo toque.
- [ ] Se negar o movimento: mensagem pede para recarregar a página.
- [ ] Microfone e giroscópio reagem como no Android.
- [ ] **Tela cheia**: o Safari do iPhone não faz `requestFullscreen` de páginas, por isso o botão mostra a mensagem a apontar para "Adicionar à Tela de Início"; aberta como app, a página já vai de borda a borda.

## 5. Acessibilidade e desempenho

- [ ] Navegação por Tab passa por: botão ativar, **tela cheia**, recolher, sliders, privacidade; foco visível.
- [ ] Com "reduzir movimento" ligado no sistema, a animação fica mais lenta **e o flash das batidas fica visivelmente mais fraco** (não um estroboscópio a tela cheia). No console: `v1su4rtShaders.setFlashScale(0)` deve apagar por completo o flash de batida e de toque, sem apagar o resto.
- [ ] `prefers-reduced-motion` alternado com a página aberta (mudar a preferência do SO) aplica-se sem recarregar.
- [ ] Em aparelho fraco, a imagem perde definição em vez de travar.
- [ ] `v1su4rtShaders.buildTime()` na consola: é o tempo de CPU a construir a nuvem, antes do primeiro desenho. Num desktop fica em ~70–100 ms; se num celular passar dos ~400 ms, é aí que se decide o worker.
- [ ] O canvas não pede MSAA (`antialias: false`): as orlas dos pontos são suavizadas no fragmento, por isso não deve haver serrilhado visível em nenhum tamanho de tela.
- [ ] `privacy.html` abre e o link **Voltar** funciona.

## 6. Depois de cada mudança

- [ ] Aumentar `CACHE_NAME` em `service-worker.js`.
- [ ] `node scripts/check.mjs` — depois de qualquer mexida nos shaders ou nas listas de `buildProgram()`.
- [ ] Desregistar o service worker e limpar as caches antes de reabrir a página no navegador de testes: sem isso fica a versão velha e a conclusão não vale.
- [ ] Hard reload (Ctrl+Shift+R) no desktop; no celular, fechar e reabrir o app.
- [ ] `git status` antes de commitar.
- [ ] **Medir luz entre builds** exige as duas mãos na porta: os sete canais de áudio fixados em 0, `u_light` na constante de origem, `#cloud-intens` **verificado e igual** nos dois lados, e resolução interna e número de pontos registados ao lado do número — `tuneQuality()` mexe nos dois últimos sozinho quando o fps cai. Uma comparação sem esses valores não vale nada: foi assim que três números anteriores se deitaram fora.
- [ ] **Comparar formas diferentes** exige mudar a métrica: o recorte central deixa de cobrir a mesma coisa quando a flor morpha. Meça o **frame inteiro** — média dos três canais e percentagem de pixels queimados (`min(R,G,B) > 240`).
- [ ] **Não emule um fator de cor com o `u_cloud`.** O `u_cloud` entra no alpha, que é cortado a 1,0 antes de multiplicar, e a emulação lê-se mais clara que escalar a cor dentro do shader: dava +17% onde o fator compilado media −3%. Meça sempre o build compilado, depois de limpar caches e recarregar.
- [ ] **Antes de otimizar latência, confirme que é latência.** O espetro chega ao JavaScript aos 10 ms e o waveform aos 2 ms; nada disso explicava a batida a cair num zero da senoide. O movimento conduzia o *instante* pelo relógio corrido do shader, não pelo golpe. `sinceHits()` responde à pergunta em dois segundos; uma afinação de atraso não.
- [ ] **A comparação de luz é por par, no mesmo minuto.** Os primeiros números do S1 saíram 12,9% abaixo do referente porque o `#cloud-intens` tinha sido mexido entre os dois lados. Reabra os dois builds seguidos e grave todos os `input[type=range]` ao lado da mediana, como acima.
