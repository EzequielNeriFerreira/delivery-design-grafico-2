// Todas as páginas consultam a API do próprio site.
function erroDaConsulta(tipo, mensagem) {
  const erro = new Error(mensagem);
  erro.kind = tipo;
  return erro;
}

function texto(valor) {
  if (typeof valor !== 'string') return undefined;
  if (valor.trim() === '') return undefined;
  return valor.trim();
}

function numero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}

// Contrato do servidor local: listas em array e detalhe como objeto.
function prepararRegistro(tipo, registro) {
  if (!registro || typeof registro !== 'object' || Array.isArray(registro) ||
      'error' in registro || 'errors' in registro || !texto(registro.name)) {
    throw erroDaConsulta('schema', 'A resposta não contém dados válidos.');
  }

  const id = Number(registro.id);
  const item = {
    id: Number.isSafeInteger(id) && id > 0 ? String(id) : null,
    name: registro.name.trim(),
  };
  try {
    const endereco = texto(registro.image);
    if (endereco?.startsWith('/assets/') && !endereco.includes('..')) {
      item.image = endereco;
    } else if (endereco) {
      const imagem = new URL(endereco);
      if (imagem.protocol === 'https:' || imagem.protocol === 'http:') item.image = imagem.href;
    }
  } catch {
    // Sem endereço válido, a página mostra "Imagem não disponível".
  }

  if (tipo === 'foods') {
    if (numero(registro.price)) item.price = registro.price;
    if (numero(registro.rating) && registro.rating <= 5) item.rating = registro.rating;
    if (texto(registro.deliveryTime)) item.deliveryTime = registro.deliveryTime.trim();
    if (numero(registro.deliveryFee)) item.deliveryFee = registro.deliveryFee;
  }
  if (tipo === 'users') {
    const email = texto(registro.email);
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) item.email = email;
  }
  return item;
}

async function consultar(caminho, signal) {
  // Interrompe a consulta ao sair da página ou após 10 segundos.
  const prazo = AbortSignal.timeout(10000);
  const cancelamento = signal ? AbortSignal.any([signal, prazo]) : prazo;

  try {
    const resposta = await fetch('/api' + caminho, { signal: cancelamento });
    if (resposta.status === 404) {
      throw erroDaConsulta('not-found', 'Registro não encontrado.');
    }
    if (!resposta.ok) throw new Error('Não foi possível consultar os dados.');
    return await resposta.json();
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (prazo.aborted) throw erroDaConsulta('timeout', 'A consulta demorou demais.');
    throw erro;
  }
}

export async function carregarLista(tipo, signal) {
  const dados = await consultar('/' + tipo, signal);
  if (!Array.isArray(dados)) throw new Error('Lista inválida.');
  return dados.map(item => prepararRegistro(tipo, item));
}

export async function carregarDetalhe(tipo, id, signal) {
  // Mantém os links antigos funcionando, mas busca os dados reais no Supabase.
  const idsAntigos = {
    'demo-user': 1, 'demo-marmita': 1, 'demo-combo': 2,
    'demo-xis-do-vini': 1, 'demo-sal-e-pimenta': 2, 'demo-outback': 3,
    'demo-santo-grill': 4, 'demo-pizza-hut': 5,
  };
  const numeroId = Number(idsAntigos[id] || id);
  if (!Number.isSafeInteger(numeroId) || numeroId < 1) {
    throw erroDaConsulta('not-found', 'Registro não encontrado.');
  }
  const dados = await consultar('/' + tipo + '/' + numeroId, signal);
  return prepararRegistro(tipo, dados);
}
