import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { carregarLista, carregarDetalhe } from './api';

const nomes = { foods: 'Comidas', restaurants: 'Restaurantes', users: 'Usuários' };
const tipos = ['foods', 'restaurants', 'users'];

// Ignora acentos e maiúsculas na pesquisa.
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function dinheiro(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Estrutura do site: menu, páginas e rodapé.
export function App() {
  const local = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuAberto(false);
  }, [local.pathname, local.search]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <a className="visually-hidden-focusable p-2" href="#main">Pular para o conteúdo</a>
      <header>
        <nav className="navbar navbar-expand-md bg-danger" data-bs-theme="dark" aria-label="Navegação principal">
          <div className="container">
            <Link className="navbar-brand fw-bold" to="/" aria-label="Delivery — Início">Delivery</Link>
            <button className="navbar-toggler" type="button" aria-label="Abrir ou fechar menu"
              aria-expanded={menuAberto} aria-controls="menu" onClick={() => setMenuAberto(!menuAberto)}>
              <span className="navbar-toggler-icon" />
            </button>
            <div id="menu" className={`collapse navbar-collapse ${menuAberto ? 'show' : ''}`}>
              <div className="navbar-nav">
                <NavLink className={({ isActive }) => `nav-link text-white ${isActive ? 'fw-bold text-decoration-underline' : ''}`}
                  end to="/" onClick={() => setMenuAberto(false)}>Início</NavLink>
                {tipos.map(tipo => (
                  <NavLink className={({ isActive }) => `nav-link text-white ${isActive ? 'fw-bold text-decoration-underline' : ''}`}
                    key={tipo} to={`/${tipo}`} onClick={() => setMenuAberto(false)}>{nomes[tipo]}</NavLink>
                ))}
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main id="main" className="container py-4 flex-grow-1" tabIndex={-1}>
        {/* A chave reinicia a página quando o endereço muda. */}
        <div key={local.pathname + local.search}>
          <Routes>
            <Route path="/" element={<PaginaInicial />} />
            <Route path="/foods" element={<PaginaLista tipo="foods" />} />
            <Route path="/foods/:id" element={<PaginaDetalhe tipo="foods" />} />
            <Route path="/restaurants" element={<PaginaLista tipo="restaurants" />} />
            <Route path="/restaurants/:id" element={<PaginaDetalhe tipo="restaurants" />} />
            <Route path="/users" element={<PaginaLista tipo="users" />} />
            <Route path="/users/:id" element={<PaginaDetalhe tipo="users" />} />
            <Route path="*" element={
              <section className="py-5">
                <h1>Página não encontrada</h1>
                <p>Use a navegação para explorar o projeto.</p>
                <Link className="btn btn-danger" to="/">Voltar ao início</Link>
              </section>
            } />
          </Routes>
        </div>
      </main>

      <footer className="border-top bg-light py-3">
        <div className="container small text-body-secondary">
          <p className="fw-bold mb-0">Delivery</p>
        </div>
      </footer>
    </div>
  );
}

// As páginas usam esta função para carregar os dados e tentar novamente se houver erro.
function useDados(tipo, id) {
  const [estado, setEstado] = useState({ status: 'loading', dados: null, erro: null });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const controle = new AbortController();
    setEstado({ status: 'loading', dados: null, erro: null });

    async function carregar() {
      try {
        let dados;
        if (id === undefined) {
          dados = await carregarLista(tipo, controle.signal);
        } else {
          dados = await carregarDetalhe(tipo, id, controle.signal);
        }

        if (!controle.signal.aborted) {
          setEstado({ status: 'success', dados, erro: null });
        }
      } catch (erro) {
        if (!controle.signal.aborted) {
          setEstado({ status: 'error', dados: null, erro });
        }
      }
    }

    carregar();
    // Ao trocar de página, interrompe a consulta da página anterior.
    return () => controle.abort();
  }, [tipo, id, tentativa]);

  function tentar() {
    setTentativa(valor => valor + 1);
  }

  return { ...estado, tentar };
}

function PaginaInicial() {
  const comidas = useDados('foods');
  const restaurantes = useDados('restaurants');
  if (comidas.erro || restaurantes.erro) {
    return <MensagemErro erro={comidas.erro || restaurantes.erro} tentar={() => { comidas.tentar(); restaurantes.tentar(); }} />;
  }
  if (comidas.status === 'loading' || restaurantes.status === 'loading') return <Carregando />;

  return (
    <>
      <section className="row align-items-center g-4 my-2 mb-5">
        <div className="col-md-6">
          <h1>Seu próximo sabor está por aqui.</h1>
          <p>Explore comidas e restaurantes.</p>
          <Link className="btn btn-danger" to="/foods">Explorar comidas</Link>
        </div>
        <div className="col-md-6">
          <Imagem src="/assets/burger-hero.jpg" nome="Hambúrguer com queijo, tomate e alface" classe="foto-destaque w-100 rounded object-fit-cover" />
        </div>
      </section>
      <section className="mb-5">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h2 className="h4 mb-0">Comidas recomendadas</h2>
          <Link className="link-danger" to="/foods">Ver comidas</Link>
        </div>
        <Cartoes tipo="foods" itens={comidas.dados} />
      </section>
      <section className="mb-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h2 className="h4 mb-0">Restaurantes recomendados</h2>
          <Link className="link-danger" to="/restaurants">Ver restaurantes</Link>
        </div>
        <Cartoes tipo="restaurants" itens={restaurantes.dados} />
      </section>
    </>
  );
}

function PaginaLista({ tipo }) {
  const resultado = useDados(tipo);
  const [busca, setBusca] = useState('');
  if (resultado.status === 'loading') return <Carregando />;
  if (resultado.erro) return <MensagemErro erro={resultado.erro} tentar={resultado.tentar} />;
  const itens = resultado.dados.filter(item => normalizar(item.name).includes(normalizar(busca)));

  return (
    <>
      <h1 className="h2">{nomes[tipo]}</h1>
      <label htmlFor="busca" className="form-label">Pesquisar por nome</label>
      <div className="input-group mb-4">
        <span className="input-group-text"><img src="/assets/search.svg" width="20" height="20" alt="" /></span>
        <input id="busca" className="form-control" type="search" placeholder="Pesquisar por nome"
          aria-label={`Pesquisar ${nomes[tipo].toLowerCase()} por nome`} value={busca} onChange={event => setBusca(event.target.value)} />
        {busca && <button className="btn btn-outline-secondary" aria-label="Limpar busca" onClick={() => setBusca('')}>×</button>}
      </div>
      {itens.length === 0 ? <ListaVazia filtrada={busca.trim().length > 0} limpar={busca ? () => setBusca('') : undefined} /> : (
        <>
          <p className="small text-body-secondary">{itens.length} resultado{itens.length === 1 ? '' : 's'}</p>
          <Cartoes tipo={tipo} itens={itens} />
        </>
      )}
    </>
  );
}

function PaginaDetalhe({ tipo }) {
  const { id } = useParams();
  const resultado = useDados(tipo, id);
  const item = resultado.dados;
  const textosVoltar = { foods: 'às comidas', restaurants: 'aos restaurantes', users: 'aos usuários' };

  return (
    <>
      <Link className="btn btn-outline-secondary my-3" to={`/${tipo}`}>← Voltar {textosVoltar[tipo]}</Link>
      {resultado.status === 'loading' && <Carregando />}
      {resultado.erro && <MensagemErro erro={resultado.erro} tentar={resultado.tentar} />}
      {item && (
        <article className="card p-3 p-md-4 mb-4">
          <div className="row g-4 align-items-center">
            {tipo !== 'users' && <div className="col-md-5">
              <Imagem src={item.image} nome={item.name} classe={`w-100 rounded ${tipo === 'foods' ? 'foto-destaque object-fit-cover' : 'logo-restaurante object-fit-contain'}`} />
            </div>}
            <div className={tipo === 'users' ? 'col-12' : 'col-md-7'}>
              <h1 className="h2 text-break">{item.name}</h1>
              {tipo === 'foods' && <>
                <p className="fs-4 text-danger fw-bold">{item.price !== undefined ? dinheiro(item.price) : 'Preço não informado'}</p>
                {item.rating !== undefined && <p>★ {item.rating.toLocaleString('pt-BR')} · Avaliação</p>}
                <dl>
                  <dt>Tempo estimado</dt><dd>{item.deliveryTime ?? 'Não informado'}</dd>
                  <dt>Taxa de entrega</dt><dd>{item.deliveryFee !== undefined ? dinheiro(item.deliveryFee) : 'Não informada'}</dd>
                </dl>
              </>}
              {tipo === 'restaurants' && <>
                <p className="text-body-secondary">Não há informações adicionais para este restaurante.</p>
              </>}
              {tipo === 'users' && <>
                {item.email ? <dl className="text-break"><dt>E-mail</dt><dd>{item.email}</dd></dl>
                  : <p className="text-body-secondary">Nenhuma informação de contato disponível.</p>}
              </>}
            </div>
          </div>
        </article>
      )}
    </>
  );
}

// Os mesmos cartões aparecem na página inicial e nas listagens.
function Cartoes({ tipo, itens }) {
  if (!itens.length) return <ListaVazia />;
  return <div className="row g-3">{itens.map((item, indice) => (
    <div className="col-12 col-sm-6 col-lg-4" key={item.id ?? indice}>
      <Cartao tipo={tipo} item={item} />
    </div>
  ))}</div>;
}

function Cartao({ tipo, item }) {
  const destino = item.id ? `/${tipo}/${item.id}` : null;
  const conteudo = <>
    {tipo !== 'users' && <Imagem src={item.image} nome={item.name}
      classe={`card-img-top ${tipo === 'foods' ? 'foto-comida object-fit-cover' : 'logo-restaurante object-fit-contain p-3'}`} />}
    <div className="card-body">
      <h3 className="h5 card-title text-break">{item.name}</h3>
      {tipo === 'foods' && <>
        <p className="text-danger fw-bold mb-2">{item.price !== undefined ? dinheiro(item.price) : 'Preço não informado'}</p>
        {item.rating !== undefined && <p className="small mb-1">★ {item.rating.toLocaleString('pt-BR')}</p>}
        <p className="small text-body-secondary mb-0">{item.deliveryTime}{item.deliveryFee !== undefined && ` · Entrega ${dinheiro(item.deliveryFee)}`}</p>
      </>}
      {tipo === 'restaurants' && <span className="small text-danger">Ver restaurante →</span>}
      {tipo === 'users' && <>
        {destino && <Link className="btn btn-danger btn-sm" to={destino}>Ver detalhe</Link>}
      </>}
      {!destino && <p className="small text-body-secondary">Detalhes indisponíveis no momento.</p>}
    </div>
  </>;
  if (destino && tipo !== 'users') return <Link className="card h-100 text-decoration-none text-body" to={destino}>{conteudo}</Link>;
  return <article className="card h-100">{conteudo}</article>;
}

function Imagem({ src, nome, classe }) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou) return <div className={`bg-light text-body-secondary d-flex align-items-center justify-content-center p-3 ${classe}`}
    role="img" aria-label={`Imagem não disponível: ${nome}`}>Imagem não disponível</div>;
  return <img src={src} alt={nome} className={classe} onError={() => setFalhou(true)} />;
}

function Carregando() {
  return <section className="py-5 text-center" aria-live="polite" aria-busy="true">
    <div className="spinner-border text-danger mb-3" aria-hidden="true" />
    <h1 className="h3">Carregando dados</h1>
    <p>Aguarde enquanto preparamos as informações.</p>
  </section>;
}

function ListaVazia({ filtrada = false, limpar = undefined }) {
  return <section className="alert alert-light border my-4" role="status">
    <h2 className="h4">{filtrada ? 'Nenhum resultado encontrado' : 'Nenhum registro disponível'}</h2>
    <p>{filtrada ? 'Tente outro nome ou limpe a busca para ver todos os itens.' : 'Ainda não há itens para mostrar. Volte mais tarde.'}</p>
    {limpar && <button className="btn btn-danger" onClick={limpar}>Limpar busca</button>}
  </section>;
}

function MensagemErro({ erro, tentar }) {
  let mensagem = 'Não foi possível mostrar as informações agora. Tente novamente em instantes.';
  if (erro.kind === 'not-found') {
    mensagem = 'Este item não está disponível. Você pode voltar ao início para escolher outro.';
  } else if (erro.kind === 'timeout') {
    mensagem = 'Está demorando mais que o esperado. Tente novamente em instantes.';
  }
  return <section aria-live="polite">
    <h1 className="h2">{erro.kind === 'not-found' ? 'Registro não encontrado' : 'Não foi possível carregar'}</h1>
    <div className="alert alert-danger mt-3">
      <p>{mensagem}</p>
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-danger" onClick={tentar}>Tentar novamente</button>
        <Link className="btn btn-outline-dark" to="/">Voltar ao início</Link>
      </div>
    </div>
  </section>;
}
