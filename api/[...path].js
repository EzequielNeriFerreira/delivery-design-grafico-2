import { atenderApi } from '../servidor.js';

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://delivery.vercel.app');
  await atenderApi(req, res, url);
}
