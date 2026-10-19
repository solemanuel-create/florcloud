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
- [ ] **Um toque não inclina (G5b)**: toque num canto do ecrã e **segure o dedo ali, sem se mover**, um segundo. Tem de dar a batida — flash, decaimento, o `beat` a zerar — e a flor **não pode inclinar um grau**. Na build anterior o mesmo toque punha o canal no teto (medido 1,000 em x e y) e a flor dava um coice a cada batida dada com o dedo. No rato: clique num canto sem mover o cursor → nada de inclinação.
- [ ] **Arrastar inclina (G5b)**: o mesmo dedo, agora **a mover-se** do centro para o canto, tem de levar a flor ao teto de sempre. É o preço do contrato: sem giroscópio, só o mover inclina. No rato basta mexer o cursor (o hover já punha o tilt onde ele estava, antes do clique).
- [ ] **Sincronia (S1)**: com `v1su4rtShaders.sinceHits()` no console, bata no ecrã — `beat` cai a ~0 no instante do toque e volta a contar. Com música, um metrónomo a 120 bpm deve ver `beat` a zerar 2× por segundo; se zerar a meio do intervalo, a fase está solta.
- [ ] **Um golpe, um disparo (S2)**: uma nota grave **corrida** (segurada, sem ataque novo) não pode pôr a flor a piscar em loop. Só um topo novo conta.
- [ ] **Chiado de sala (S2)**: ventoinha, ar condicionado ou ganho alto não cintilam a flor depois de ~0,5 s. Se der um flash por segundo durante minutos, o piso de ruído do caminho rápido (`hitNoiseCrawl`/`hitNoiseOver`) não está a apanhar o nível da sala.
- [ ] **Grave contra agudo (S2)**: um bombo dá flash **e não** tremelicar; um prato dá tremelico **e não** flash. Um passo no ar pode dar tremelico — é banda larga, e o agudo domina.
- [ ] **A luz não acompanhou a fase (S1)**: com o microfone fechado, a média do frame inteiro está onde estava (emparelhado: 15,04 antes / 15,06 depois, zero píxeis queimados). Se a flor ficar mais clara ou mais escura sem ninguém ter mexido nos sliders, o carimbo do golpe mexeu numa amplitude e não só na fase.
- [ ] **A régua (O5)**: `v1su4rtProbe.run()` no console, com ou sem microfone. Deve dar 50% das bandas **≤ 15 ms**, 90% **≤ 30 ms**, `hitMs` ≤ 2 frames, `stampMs` ≤ 3 frames, e `jit` do nível abaixo de 0,15. Se `settle` vier 1 em tudo, a sensibilidade do painel está no topo e a travessia está a medir o joelho suave — a régua fixa-a em 1 sozinha, mas o `console.table` mostra o que viu.
- [ ] **Tremura com ataque rápido (O1)**: som segurado (nota no telemóvel, ventoinha) — a flor não pode picotar em brilho. `attack: 90` foi medido com 0 de pico-a-pico nas bandas e 0,065–0,078 no nível **num tom sintético**, que é a entrada mais mansa que há; em música real o ouvido é o teste.
- [ ] **O instante do médio (M1)**: `v1su4rtProbe.run({ hz: 700 })` tem de devolver `hit3Ms` e `midStampMs` (medidos: **7,5 ms** e **14,2 ms** — uma frame a 145 fps entre o disparo e o carimbo). Com `{ hz: 60 }` os dois campos têm de vir **`null`**: um bumbo não chama o relógio do médio. Se dispararem nos dois, os baldes não estão separados.
- [ ] **Médio com fase (M1)**, ouvido no ecrã: uma caixa, uma palma abafada ou uma sílaba cantada põem a corola a ondular **naquele instante**; o movimento não pode começar a meio de uma ondulação que já estava a correr. `v1su4rtShaders.sinceHits()` agora devolve `mid` além de `beat` e `off` — com um metrónomo a 120 bpm a bater palmas em contratempo, `mid` zera onde `beat` não zera.
- [ ] **Cor por banda (M2)**: grave forte só → a **borda de fora** da corola vai a magenta, ficando o miolo com a cor de base; agudos só → o **miolo** vai a ciano; os dois → dois anéis concêntricos legíveis, sem branco estourado (medido 0,001% de píxeis queimados no teto). O caule e as folhas não mudam de cor — é o que ainda diz que isto é uma planta.
- [ ] **A cor da banda não roda com o slider (M2)**: acenda uma banda só e passe **Mistura de cor** de 0 a 1. O magenta tem de continuar magenta e o ciano ciano, mudando só o fundo entre eles. Era este o defeito: antes, o vetor de cor de cada banda mudava 0,64–0,72 na travessia do slider; agora muda 0,14 (grave) e 0,17 (agudo).
- [ ] **O médio é neutro (M2)**: com só os médios acesos a flor é a flor de sempre — mais luz no rebordo e o calafrio da M1 — e **não** fica âmbar nem verde. Se ele inventar uma cor, o destino do médio voltou para o shader.
- [ ] **Luz do teto (M2)**: as três bandas no máximo têm de ficar **abaixo** do brilho anterior (medido −18% no frame inteiro), nunca acima. A conta do fecho de soma é obrigatória: sem ela o agudo a 1,0 dava +81% e 2,33% de píxeis queimados.
- [ ] **A luz que anda engana as medidas (B2)**: a órbita lenta do direcional move a mediana do frame inteiro ao longo de ~2 min. Duas janelas de 21 s separadas por minutos não são um par — são duas amostras de duas luzes diferentes.
- [ ] **A pose quieta passa a ser o centro (G1)**: ative as interações com o telemóvel **deitado na mesa**, e ao fim de um segundo pegue nele e segure-o na pose com que o olha. A flor tem de estar outra vez ao centro **ao fim de ~6 s** (medido 6,57 s); na build anterior ficava colada no teto 17,19° durante **23,8 s**. Repita ao contrário: ativá-lo já na mão e levantá-lo para a cara — tem de assentar em ~4 s em vez de 17 s.
- [ ] **O preço da adoção (G1)**: incline 30° para um lado **e segure**. A flor desvanece até aos 5,16° de sempre em ~8 s (antes ainda estava aos 9,93° aos 12 s). É esperado, não é uma regressão: quem quer manter uma inclinação tem de a fazer **a caminho**. Para ter o comportamento antigo de volta, `orientStillDeg: 0` no bloco `TUNE`.
- [ ] **A tremer ainda adota (G1)**: a mesma cena de cima, com a mão a tremer um pouco (±0,5-1°). Tem de adotar, só que mais devagar (medido com jitter de ±0,6°: 7,83 s contra 6,57 s parado). Uma pose que se **move** a sério nunca é adotada — fica no regime lento de 10 s.
- [ ] **O flick não é comido (G1)**: um gesto rápido de 0,5 s até aos 40° usa o curso todo e não é apagado pela adoção — pico medido **16,92°**, o mesmo da build anterior. 0,5 s é menos que os 1,2 s de quietude exigidos.
- [ ] **Curso curto para cima (G2)**: a partir da pose de uso, tombe o telemóvel **10° para trás**. A flor inclina **2,4×** mais do que na build anterior (medido **15,35°** em vez de 6,36°), e 15° de aparelho já chegam ao teto. Para baixo e para os lados nada se mexe: são os mesmos 40° de curso de sempre, idênticos ao milésimo nas duas builds.
- [ ] **A banda morta é proporcional (G2)**: segurando o aparelho quieto na mesma pose, a flor pende os mesmos **5,16°** para cima e para baixo. Se pender ~9° para cima, a banda do `_recenter` voltou a ser fixa em graus de aparelho em vez de fração de curso (`dbY`).
- [ ] **Um teto para os três (G3)**: com o **Sensibilidade ao giroscópio** em 1,5 (o de fábrica), incline devagar do neutro até ao limite do pulso e olhe **as três coisas ao mesmo tempo** — a flor, o centro das formas do fundo, e de que lado ela está acesa. **Nenhuma das três pode congelar enquanto as outras duas ainda se mexem.** Era este o defeito: a luz parava aos 26,4°, a flor aos 31,7°, o fundo aos 39,6°, e acima de 40° não se mexia nada em parte nenhuma.
- [ ] **O meio do curso está mais vivo (G3)**: é aqui que a mexida se vê. À mesma inclinação de sempre (10–20° do aparelho), o centro das formas do fundo desloca-se **50% mais** e a flor inclina **20% mais** do que na build anterior; a luz não se mexe nenhuma. Compare as duas builds lado a lado se duvidar — é ganho de escala, não de forma.
- [ ] **O topo do curso**: não procure diferença visível entre 40° e 70° — são **0,2° de flor** e **0,002 de uv**, e ninguém os vê. O que mudou lá em cima é estrutural: deixou de haver um muro, e os três chegam ao teto no mesmo ângulo (99% aos **41,4°**, o resto até `tiltMaxDeg`, 70°, que só corta um sensor avariado). Desde `v23` isto é o `x` e o `y` para baixo; **para cima do `y` os 99% são aos ~15°**, porque o curso encolheu — o teto é o mesmo, a distância até ele é que é um terço.
- [ ] **Os máximos não mudaram (G3)**: com o **giroscópio**, ao fim do curso a flor inclina o mesmo de sempre (17,19°), o centro do fundo desloca os mesmos 0,18 de uv, a luz os mesmos 10,31°. Se alguma das três parecer **mais** torta do que na versão anterior, pare: os coeficientes subiram demais. No **rato/arrasto** o topo da luz é 9% mais baixo à sensibilidade 1 — é o preço do teto único no extremo do arrasto, está medido no CHANGELOG, não é uma regressão a concertar.
- [ ] **Vigia do sensor (G5a)**: com o giroscópio ativo, deixe o aparelho absolutamente parado **7–8 s** (em alguns Androides o sensor pára de emitir). A flor tem de largar a pose e voltar ao centro, o rato/arrasto retoma o comando e a mensagem diz que o sensor não está disponível. Volte a inclinar: **retoma sozinha**, sem desativar e reativar nem recarregar.
- [ ] **O vigia não fala à toa (G5a)**: a mensagem de "sensor indisponível" aparece **uma vez** por perda, não em loop; e um aparelho sem giroscópio nenhum não pode entrar a alternar entre as duas mensagens.
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
- [ ] **Retrato com o fundo inclinado (G3)**: o centro das formas do fundo desloca-se agora **0,18** de uv (antes 0,12, mas com um canal que chegava a 1,5 sem corte). Com a sensibilidade no máximo e o aparelho/arrasto todo para um canto, as ondas do fundo têm de continuar dentro da tela — sem deixar uma faixa vazia num lado e apertada no outro.
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
- [ ] **Permissão tardia (G5a)**: ao tocar em **Ativar interações**, deixe o diálogo de permissão aberto **mais de 5 s** sem responder (ou responda só ao fim de meio minuto). O painel tem de dizer que o sensor não está disponível — e no instante em que der **Permitir**, a flor tem de começar a inclinar **sem desligar e ligar as interações e sem recarregar**, com a mensagem a voltar ao normal. Era este o buraco: o listener desinscrevia-se aos 1,5 s e a permissão tardia ficava muda para sempre.
- [ ] **A pose da permissão é o neutro**: ao permitir com o telemóvel inclinado na mão, a flor não deve dar um salto para o lado quando o sensor entra em ação — começa onde está.
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
