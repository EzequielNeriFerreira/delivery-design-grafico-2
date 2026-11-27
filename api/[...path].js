import { atenderApi } from '../servidor.js';

export default async function handler(req, res) {
  const origem = new URL(req.url || '/', 'https://delivery.vercel.app');
  const rota = req.query?.path;
  const caminho = Array.isArray(rota)
    ? rota.join('/')
    : typeof rota === 'string'
      ? rota
      : '';
  const url = new URL(caminho ? `/api/${caminho}` : origem.pathname, origem.origin);

  for (const [chave, valor] of origem.searchParams) {
    if (chave !== 'path') url.searchParams.append(chave, valor);
  }

  await atenderApi(req, res, url);
}
