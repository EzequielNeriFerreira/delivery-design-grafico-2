import { atenderApi } from '../servidor.js';

export default async function handler(req, res) {
  const origem = new URL(req.url || '/', 'https://delivery.vercel.app');
  const url = new URL(origem.pathname, origem.origin);

  for (const [chave, valor] of origem.searchParams) {
    if (chave !== '...path') url.searchParams.append(chave, valor);
  }

  await atenderApi(req, res, url);
}
