/* Verificação estática do par GLSL <-> renderizador.

   Corre com o Node embutido do Qoder, sem dependências:

     ELECTRON_RUN_AS_NODE=1 Qoder.exe scripts/check.mjs

   Existe porque o renderizador falha em silêncio: um nome de uniforme trocado em
   shaders.glsl.js faz gl.getUniformLocation devolver null, e gl.uniform1f(null, v)
   não desenha nada, não dá erro e não dá aviso — a flor simplesmente deixa de
   responder. shaders.js tem uma verificação igual, mas essa só corre com WebGL e
   depois do compilador ter deitado fora o que não é lido. Esta corre antes de
   qualquer deploy e sobre o texto, por apanha também o que o navegador só diria
   no celular de outra pessoa.

   Sai com código 1 e a lista do que está trocado. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);

/* ---------- 1. o texto dos quatro shaders ---------- */

const glslSrc = read('assets/shaders.glsl.js');
const STAGES = ['VERTEX_BG', 'FRAGMENT_BG', 'VERTEX_POINTS', 'FRAGMENT_POINTS'];
const glsl = {};

for (const name of STAGES) {
  const m = glslSrc.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!m) fail(`shaders.glsl.js: não encontrou o template \`${name}\``);
  else glsl[name] = m[1];
}

// declarações de linha: uniform/varying/attribute, com ou sem qualificador de
// precisão. Arrays (mat4 u_x[3]) não são usados aqui, mas apanha-os pelo nome.
function decls(src, kind) {
  const out = new Map();
  const re = new RegExp(`^\\s*${kind}\\s+(?:(?:low|medium|high)\\s+precision\\s+)?(\\w+)\\s+(\\w+)\\s*(?:\\[\\d+\\])?;`, 'gm');
  let m;
  while ((m = re.exec(src))) out.set(m[2], { type: m[1], src: m[0].trim() });
  return out;
}

const programs = [
  { label: 'fundo', vs: 'VERTEX_BG', fs: 'FRAGMENT_BG' },
  { label: 'nuvem', vs: 'VERTEX_POINTS', fs: 'FRAGMENT_POINTS' },
];

/* ---------- 2. as listas de shaders.js ---------- */

const jsSrc = read('assets/shaders.js');
const calls = [...jsSrc.matchAll(/buildProgram\(([\s\S]*?)\);/g)]
  // a definição da função também casa com o padrão: ficam só as chamadas, que são
  // as que nomeiam os dois shaders por extenso
  .filter((c) => /VERTEX_\w+,\s*FRAGMENT_\w+/.test(c[1]));
if (calls.length !== 2) fail(`shaders.js: esperava 2 chamadas buildProgram(), encontrei ${calls.length}`);

const listed = {};
for (const c of calls) {
  const text = c[1];
  const stages = [...text.matchAll(/(VERTEX_BG|FRAGMENT_BG|VERTEX_POINTS|FRAGMENT_POINTS)/g)].map((m) => m[1]);
  const arrays = [...text.matchAll(/\[([\s\S]*?)\]/g)].map((a) => [...a[1].matchAll(/'([^']+)'/g)].map((s) => s[1]));
  if (stages.length !== 2) fail(`shaders.js: buildProgram com shaders não reconhecidos: ${stages.join(', ')}`);
  if (arrays.length !== 2) fail(`shaders.js: buildProgram(${stages[0]}) com listas de atributos/uniformes ilegíveis`);
  listed[stages[0]] = { attribs: arrays[0] ?? [], uniforms: arrays[1] ?? [] };
}

/* ---------- 3. cruzamento ---------- */

for (const p of programs) {
  const vs = glsl[p.vs];
  const fs = glsl[p.fs];
  if (vs == null || fs == null) continue;
  const list = listed[p.vs];
  if (!list) continue;

  const uVs = decls(vs, 'uniform');
  const uFs = decls(fs, 'uniform');
  const declared = new Set([...uVs.keys(), ...uFs.keys()]);
  const aVs = decls(vs, 'attribute');

  for (const name of declared) {
    if (!list.uniforms.includes(name)) {
      fail(`${p.label}: o shader declara '${name}' e a lista de buildProgram() em shaders.js não o envia (vai ficar null e o visual não responde)`);
    }
  }
  for (const name of list.uniforms) {
    if (!declared.has(name)) {
      fail(`${p.label}: shaders.js envia '${name}' mas nenhum dos dois shaders o declara (nome trocado, ou sobra da última mudança)`);
    }
  }
  for (const name of aVs.keys()) {
    if (!list.attribs.includes(name)) {
      fail(`${p.label}: o vertex shader pede o atributo '${name}' e a lista de buildProgram() não o declara`);
    }
  }
  for (const name of list.attribs) {
    if (!aVs.has(name)) fail(`${p.label}: shaders.js envia o atributo '${name}', que o vertex shader não declara`);
  }

  // varying: os dois estágios têm de declarar o MESMO nome com a MESMA precisão —
  // é a regra que está no topo de shaders.glsl.js, e ligar mal dá programa morto
  const vVs = decls(vs, 'varying');
  const vFs = decls(fs, 'varying');
  for (const [name, d] of vVs) {
    const other = vFs.get(name);
    if (!other) fail(`${p.label}: '${name}' é varying no vértice e não é no fragmento`);
    else if (!/precision/.test(d.src) !== !/precision/.test(other.src)) {
      fail(`${p.label}: '${name}' tem precisão declarada num estágio e não no outro: "${d.src}" / "${other.src}"`);
    }
  }
  for (const name of vFs.keys()) {
    if (!vVs.has(name)) fail(`${p.label}: '${name}' é lido no fragmento mas o vértice nunca o escreve`);
  }

  // um uniforme declarado e na lista mas nunca escrito é o mesmo bug com outra
  // assinatura: o valor fica no zero de fábrica e nada no código o diz
  for (const name of list.uniforms) {
    const used = new RegExp(`p\\.uniform\\.${name}\\b`).test(jsSrc);
    if (!used) fail(`${p.label}: '${name}' está na lista mas shaders.js nunca faz p.uniform.${name}`);
  }
}

/* ---------- 4. o resto da casa ---------- */

// sintaxe primeiro: os quatro shaders vivem dentro de template literals, e um
// acento grave perdido num comentário parte o arquivo inteiro sem que nenhum
// navegador diga porquê — foi assim que este check nasceu a mais
const vm = await import('node:vm');
const syntax = ['assets/shaders.glsl.js', 'assets/shaders.js', 'assets/interaction.js', 'assets/app.js', 'service-worker.js'];
for (const f of syntax) {
  try {
    new vm.Script(read(f), { filename: f });
  } catch (e) {
    fail(`${f}: não compila (${e.message})`);
  }
}

const html = read('index.html');
const order = [...html.matchAll(/<script[^>]*src="[^"]*\/([\w.-]+\.js)"/g)].map((m) => m[1]);
const want = ['shaders.glsl.js', 'shaders.js', 'interaction.js', 'app.js'];
const got = order.filter((n) => want.includes(n));
if (got.join(',') !== want.join(',')) {
  fail(`index.html: ordem dos scripts é ${got.join(' → ')}, e tem de ser ${want.join(' → ')} (shaders.js lê window.v1su4rtGlsl)`);
}
for (const n of got) {
  const tag = html.match(new RegExp(`<script[^>]*${n}"[^>]*>`));
  if (tag && !/defer/.test(tag[0])) fail(`index.html: <script src="${n}"> sem defer`);
}

const sw = read('service-worker.js');
const cache = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
if (!cache) fail('service-worker.js: CACHE_NAME não encontrado');
for (const n of want) {
  if (!sw.includes(`./assets/${n}`) && !sw.includes(`'./${n}'`)) {
    fail(`service-worker.js: '${n}' não está em APP_FILES — fica de fora do cache offline`);
  }
}

/* ---------- 5. o disco de sementes: os dois lados do mesmo número ---------- */

// A normal do disco (B4) sai no shader de HEAD_K = 2·dome/r², e a geometria de
// shaders.js põe os pontos na calota descrita por SEED_HEAD. Se um dos dois mudar sem
// o outro, o disco acende com a normal errada e a consola não diz nada — é exatamente
// o género de troca que este arquivo existe para apanhar antes do deploy.
const head = glslSrc.match(/const SEED_HEAD = \{([^}]*)\}/);
if (!head) {
  fail('shaders.glsl.js: SEED_HEAD não encontrado, e shaders.js lê-o para construir a_posB');
} else {
  const num = (key) => {
    const m = head[1].match(new RegExp(key + ':\\s*([0-9.eE+-]+)'));
    return m ? parseFloat(m[1]) : NaN;
  };
  const headR = num('r');
  const headDome = num('dome');
  const glslK = (glsl.VERTEX_POINTS || '').match(/const float HEAD_K = ([0-9.eE+-]+);/);
  const others = ['y', 'golden'].map(num);
  if (!glslK) fail('VERTEX_POINTS: não encontrou «const float HEAD_K = ...»');
  if (![headR, headDome].concat(others).every(isFinite)) {
    fail('SEED_HEAD: r, y, dome e golden têm de ser quatro números');
  } else if (glslK) {
    const kDoShader = parseFloat(glslK[1]);
    const kDaGeometria = (2 * headDome) / (headR * headR);
    if (Math.abs(kDoShader - kDaGeometria) > 5e-4) {
      fail(`SEED_HEAD e HEAD_K trocados: a geometria pede ${kDaGeometria.toFixed(5)} (2·dome/r²), o shader usa ${kDoShader.toFixed(5)}`);
    }
  }
}

notes.push(`programas: ${programs.map((p) => `${p.label}(${(listed[p.vs]?.uniforms ?? []).length} uniformes, ${(listed[p.vs]?.attribs ?? []).length} atributos)`).join(', ')}`);
notes.push(`CACHE_NAME: ${cache ? cache[1] : '?'}`);

for (const n of notes) console.log('  · ' + n);
if (errors.length) {
  console.error(`\ncheck.mjs: ${errors.length} problema(s)`);
  for (const e of errors) console.error('  ! ' + e);
  process.exit(1);
}
console.log('\ncheck.mjs: GLSL, listas de shaders.js, index.html e service-worker.js batem certo entre si.');
