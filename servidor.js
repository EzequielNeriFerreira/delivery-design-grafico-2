import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const pastaProjeto = dirname(fileURLToPath(import.meta.url));
const tipos = ['users', 'restaurants', 'foods'];

// O .env fica somente no servidor; variáveis já definidas no ambiente têm prioridade.
try {
  loadEnvFile(resolve(pastaProjeto, '.env'));
} catch (erro) {
  if (erro.code !== 'ENOENT') throw erro;
}

function configuracaoSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !chave) return null;
  try {
    const endereco = new URL(url);
    if (endereco.protocol !== 'https:' || endereco.username || endereco.password ||
        endereco.search || endereco.hash || endereco.pathname !== '/') return null;
    if (!chave.startsWith('sb_publishable_')) return null;
    return { url: endereco.origin, chave };
  } catch {
    return null;
  }
}

// A chave pública só poderá ler o que as permissões e políticas RLS autorizarem.
async function consultarSupabase(tipo, id) {
  const config = configuracaoSupabase();
  if (!config) {
    console.error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env do servidor.');
    return { status: 503, error: 'O serviço de dados ainda não está configurado.' };
  }
  const campos = {
    users: 'id,name,email',
    restaurants: 'id,name,image',
    foods: 'id,name,image,price,rating,deliveryTime,deliveryFee',
  };
  const endereco = new URL('/rest/v1/' + tipo, config.url);
  endereco.searchParams.set('select', campos[tipo]);
  endereco.searchParams.set('order', 'id.asc');
  if (id !== undefined) endereco.searchParams.set('id', 'eq.' + id);
  // O Supabase limita o tamanho de cada resposta. A lista completa usa páginas.
  const dados = [];
  let inicio = 0;
  try {
    do {
      const resposta = await fetch(endereco, {
        headers: {
          apikey: config.chave,
          Accept: 'application/json',
          'Accept-Profile': 'public',
          Prefer: 'count=exact',
          'Range-Unit': 'items',
          Range: id === undefined ? `${inicio}-${inicio + 999}` : '0-0',
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!resposta.ok) {
        console.error(`Falha na consulta ao Supabase: HTTP ${resposta.status}.`);
        return { status: 502, error: 'Não foi possível consultar os dados.' };
      }
      const pagina = await resposta.json();
      if (!Array.isArray(pagina)) throw new Error('Resposta inesperada.');
      dados.push(...pagina);
      inicio += pagina.length;
      const total = Number(resposta.headers.get('content-range')?.split('/')[1]);
      if (id !== undefined || pagina.length === 0 ||
          (Number.isFinite(total) && inicio >= total)) break;
      // count=exact é obrigatório para não truncar silenciosamente o catálogo.
      if (!Number.isFinite(total)) throw new Error('Total de registros indisponível.');
    } while (true);
    return { dados: id === undefined ? dados : dados[0] };
  } catch (erro) {
    const timeout = erro.name === 'TimeoutError';
    console.error(timeout ? 'Tempo de consulta ao Supabase esgotado.' : 'Falha de comunicação com o Supabase.');
    return { status: timeout ? 504 : 502, error: 'Não foi possível consultar os dados. Tente novamente.' };
  }
}

function responder(res, status, dados, semCorpo = false) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(semCorpo ? undefined : JSON.stringify(dados));
}

// As únicas operações da atividade são listagem e consulta por identificador.
export async function atenderApi(req, res, url) {
  const semCorpo = req.method === 'HEAD';
  const caminho = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const partes = caminho.replace(/\/$/, '').split('/').slice(1);
  const [tipo, id] = partes;
  if (!tipos.includes(tipo) || partes.length > 2) {
    return responder(res, 404, { error: 'Rota não encontrada.' }, semCorpo);
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return responder(res, 405, { error: 'Método não permitido.' });
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET, HEAD, OPTIONS' });
    return res.end();
  }
  if (url.search) return responder(res, 400, { error: 'Esta consulta não aceita parâmetros de busca.' }, semCorpo);
  if (id !== undefined && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
    return responder(res, 400, { error: 'O identificador deve ser um número inteiro positivo.' }, semCorpo);
  }
  const resultado = await consultarSupabase(tipo, id);
  if (resultado.error) return responder(res, resultado.status, { error: resultado.error }, semCorpo);
  const dados = resultado.dados;
  if (dados === undefined) return responder(res, 404, { error: 'Registro não encontrado.' }, semCorpo);
  return responder(res, 200, dados, semCorpo);
}

// Cria os handlers explícitos usados pelo roteamento de funções do Vercel.
export function criarHandlerVercel(tipo, detalhe = false) {
  return async function handler(req, res) {
    const origem = new URL(req.url || '/', 'https://delivery.vercel.app');
    const base = `/api/${tipo}`;
    let caminho = origem.pathname;

    if (caminho === base && detalhe) {
      const valorId = req.query?.id;
      const id = Array.isArray(valorId) ? valorId[0] : valorId;
      if (id !== undefined) caminho += `/${encodeURIComponent(String(id))}`;
    }

    const url = new URL(caminho, origem.origin);
    const idNaRota = detalhe ? caminho.slice(base.length + 1) : '';
    for (const [chave, valor] of origem.searchParams) {
      if (chave === '...path') continue;
      if (detalhe && chave === 'id' && valor === idNaRota) continue;
      url.searchParams.append(chave, valor);
    }

    await atenderApi(req, res, url);
  };
}

const formatos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

// Na produção, o mesmo processo serve o build do site e a API em /api.
function atenderSite(req, res, url, pastaSite) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return responder(res, 405, { error: 'Método não permitido.' });
  }
  let caminho;
  try {
    caminho = decodeURIComponent(url.pathname);
  } catch {
    return responder(res, 400, { error: 'Endereço inválido.' }, req.method === 'HEAD');
  }
  const arquivo = resolve(pastaSite, '.' + caminho);
  if (caminho.includes('\\') || caminho.includes('\0') || (arquivo !== pastaSite && !arquivo.startsWith(pastaSite + sep))) {
    return responder(res, 400, { error: 'Endereço inválido.' }, req.method === 'HEAD');
  }
  let destino = arquivo;
  try {
    if (!statSync(destino).isFile()) destino = resolve(pastaSite, 'index.html');
  } catch {
    if (extname(caminho) || caminho.startsWith('/assets/')) return responder(res, 404, { error: 'Arquivo não encontrado.' }, req.method === 'HEAD');
    destino = resolve(pastaSite, 'index.html');
  }
  try {
    const conteudo = readFileSync(destino);
    res.writeHead(200, { 'Content-Type': formatos[extname(destino)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : conteudo);
  } catch {
    responder(res, 503, { error: 'Build indisponível. Execute npm run build antes de iniciar.' }, req.method === 'HEAD');
  }
}

// Decide se o endereço pedido é uma consulta da API ou uma página do site.
export function criarServidor({ apenasApi = false, vite, pastaSite = resolve(pastaProjeto, 'dist') } = {}) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (apenasApi || url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await atenderApi(req, res, url);
      }
      if (vite) return vite.middlewares(req, res);
      atenderSite(req, res, url, pastaSite);
    } catch (erro) {
      console.error('Falha ao atender consulta:', erro);
      responder(res, 500, { error: 'Não foi possível concluir a consulta.' }, req.method === 'HEAD');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desenvolvimento = process.argv.includes('--dev');
  const apenasApi = process.argv.includes('--api');
  const porta = Number(process.env.PORT || (apenasApi ? 3001 : 5173));
  if (!configuracaoSupabase()) console.warn('Supabase pendente: configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env.');
  let vite;
  if (desenvolvimento) {
    const ferramentasVite = await import('vite');
    vite = await ferramentasVite.createServer({ server: { middlewareMode: true } });
  }
  const servidor = criarServidor({ apenasApi, vite });
  servidor.on('error', async erro => {
    console.error('Não foi possível iniciar o servidor:', erro.message);
    await vite?.close();
    process.exitCode = 1;
  });
  servidor.listen(porta, '127.0.0.1', () => console.log(`Delivery: http://127.0.0.1:${porta}`));
  let encerrando = false;
  const encerrar = async () => {
    if (encerrando) return;
    encerrando = true;
    await vite?.close();
    servidor.close();
    servidor.closeAllConnections();
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}
