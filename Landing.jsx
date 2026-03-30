import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LOGO_ICON, LOGO_WORDMARK } from './logo.js';

export default function Landing() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('sf-visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.sf-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className="sf-landing">
        {/* NAV */}
        <nav className="sf-nav">
          <a href="#" className="sf-nav-logo">
            <img src={LOGO_ICON} alt="Seu Full" style={{width:40,height:40,borderRadius:10}} />
            <div className="sf-nav-text">Seu<span>Full</span></div>
          </a>
          <div className="sf-nav-links">
            <a href="#servicos">Serviços</a>
            <a href="#vantagens">Vantagens</a>
            <a href="#contato">Contato</a>
            <Link to="/login" className="sf-btn-portal">Portal do Cliente →</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="sf-hero">
          <div className="sf-hero-glow"></div>
          <div className="sf-hero-content">
            <div className="sf-hero-text">
              <div className="sf-badge"><span className="sf-badge-dot"></span>Fulfillment & Logística para E-commerce</div>
              <h1>Você cuida da <em>estratégia</em>,<br/>nós cuidamos da sua <em>logística</em>.</h1>
              <p>Soluções operacionais completas para empresas que desejam se destacar nos marketplaces. Recebimento, armazenamento, separação, montagem, embalagem e envio — tudo integrado.</p>
              <div className="sf-hero-btns">
                <a href="https://wa.me/5511971944949" className="sf-btn-main">Fale Conosco →</a>
                <Link to="/login" className="sf-btn-outline">Acessar Portal</Link>
              </div>
            </div>
            <div className="sf-hero-visual">
              <div className="sf-hero-card">
                <div className="sf-hero-bar"></div>
                <div className="sf-stats">
                  <div className="sf-stat"><div className="sf-stat-n">Operação</div><div className="sf-stat-l">End-to-End</div></div>
                  <div className="sf-stat"><div className="sf-stat-n">Escala</div><div className="sf-stat-l">Sob Demanda</div></div>
                  <div className="sf-stat-div"></div>
                  <div className="sf-stat"><div className="sf-stat-n">Tecnologia</div><div className="sf-stat-l">WMS Proprietário</div></div>
                  <div className="sf-stat"><div className="sf-stat-n">Nacional</div><div className="sf-stat-l">Cobertura de Envios</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FULFILLMENT */}
        <section className="sf-what">
          <div className="sf-container sf-reveal">
            <div className="sf-what-grid">
              <div>
                <div className="sf-label">O que é Fulfillment</div>
                <h2 className="sf-title">O processo logístico <em>completo</em> para o seu e-commerce</h2>
                <p className="sf-desc">Fulfillment envolve recebimento, armazenamento, separação, etiquetagem, montagem, embalagem e envio de produtos ao cliente final. Nossa missão é simplificar operações e trazer eficiência.</p>
                <blockquote className="sf-quote">"Enquanto cuidamos do operacional, você se dedica ao crescimento do seu negócio."</blockquote>
              </div>
              <div className="sf-what-visual">
                <div className="sf-big-card">
                  <div className="sf-big-text">Operação<br/><span>End-to-End</span></div>
                  <div className="sf-big-sub">Do recebimento à entrega final em plataformas como Mercado Livre e Amazon</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SERVIÇOS */}
        <section id="servicos" className="sf-container" style={{paddingTop:120,paddingBottom:120}}>
          <div className="sf-reveal">
            <div className="sf-label">Nossos Serviços</div>
            <h2 className="sf-title">Tudo que sua operação <em>precisa</em></h2>
            <p className="sf-desc">Cada etapa da cadeia logística coberta com excelência e tecnologia.</p>
          </div>
          <div className="sf-srv-grid">
            {[
              ['📦','Armazenamento Seguro','Produtos protegidos, organizados e sempre prontos para movimentação. Controle de estoque em tempo real via WMS proprietário.'],
              ['🎯','Separação e Embalagem','Cada pedido é preparado com atenção aos detalhes para garantir a melhor experiência ao cliente e compliance com marketplaces.'],
              ['🔧','Montagem de Kits','Criamos kits conforme sua necessidade e garantimos apresentação impecável. Embalagem personalizada com a identidade da sua marca.'],
              ['🚛','Coleta de Fornecedores','Retiramos mercadorias com pontualidade e critério em toda a Grande São Paulo e regiões adjacentes.'],
              ['🏭','Entrega nos CDs','Transporte eficiente para plataformas como Mercado Livre e Amazon, assegurando compliance e pontualidade.'],
              ['↩️','Triagem de Devoluções','Otimizamos a gestão de produtos devolvidos, reduzindo custos e processos com triagem ágil e reintegração ao estoque.'],
            ].map(([icon,title,desc],i) => (
              <div key={i} className="sf-srv sf-reveal" style={{transitionDelay:`${i*0.08}s`}}>
                <div className="sf-srv-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VANTAGENS */}
        <section id="vantagens" className="sf-benefits">
          <div className="sf-container" style={{paddingTop:120,paddingBottom:120}}>
            <div style={{textAlign:'center'}} className="sf-reveal">
              <div className="sf-label">Benefícios Estratégicos</div>
              <h2 className="sf-title" style={{margin:'0 auto'}}>Por que escolher o <em>Seu Full</em>?</h2>
            </div>
            <div className="sf-ben-grid">
              {[['🚀','Foco Total no Crescimento'],['⚡','Operação Logística Otimizada'],['🧠','Acesso a Especialistas'],['🛡️','Menos Riscos Operacionais'],['⭐','Experiência Superior ao Cliente']].map(([icon,title],i) => (
                <div key={i} className="sf-ben sf-reveal" style={{transitionDelay:`${i*0.08}s`}}>
                  <div className="sf-ben-icon">{icon}</div>
                  <h4>{title}</h4>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* REDUÇÃO DE CUSTOS */}
        <section className="sf-container" style={{paddingTop:120,paddingBottom:120}}>
          <div className="sf-reveal">
            <div className="sf-label">Terceirização Inteligente</div>
            <h2 className="sf-title">Como a terceirização <em>reduz custos</em></h2>
          </div>
          <div className="sf-costs-grid">
            <div>
              {[
                ['Redução de Infraestrutura','Elimine investimentos em armazéns, veículos e equipes especializadas.'],
                ['Menos Custos Operacionais','Evite despesas com treinamento, salários adicionais e manutenção.'],
                ['Escalabilidade sob Demanda','Pague apenas pelo que utiliza, ajustando a operação conforme necessidade.'],
                ['Mais Tempo para o Core Business','Concentre-se no crescimento estratégico enquanto garantimos eficiência operacional.'],
                ['Menos Erros e Devoluções','Processos otimizados reduzem falhas e aumentam a satisfação do cliente.'],
              ].map(([title,desc],i) => (
                <div key={i} className="sf-cost-item sf-reveal" style={{transitionDelay:`${i*0.1}s`}}>
                  <div className="sf-cost-arrow">›</div>
                  <div><h4>{title}</h4><p>{desc}</p></div>
                </div>
              ))}
            </div>
            <div className="sf-reveal">
              <div className="sf-big-card">
                <div className="sf-big-text" style={{fontSize:36}}>Confiança<br/><span>Comprovada</span></div>
                <div className="sf-big-sub">Empresas de diversos segmentos já transformaram sua logística com o Seu Full</div>
              </div>
              <div className="sf-big-card" style={{marginTop:20,background:'#00C896',borderColor:'#00C896'}}>
                <div className="sf-big-text" style={{fontSize:36,color:'#2E2C3A'}}>Foco<br/><span style={{color:'#2E2C3A'}}>Total</span></div>
                <div className="sf-big-sub" style={{color:'#2E2C3A',opacity:0.7}}>100% dedicados ao e-commerce e marketplaces</div>
              </div>
            </div>
          </div>
        </section>

        {/* PORTAL CTA */}
        <section className="sf-portal-cta">
          <div className="sf-portal-glow"></div>
          <div className="sf-portal-box sf-reveal">
            <div className="sf-label" style={{textAlign:'center'}}>Portal do Cliente</div>
            <h2 className="sf-title" style={{textAlign:'center',margin:'0 auto 16px'}}>Acesse o <em>Portal</em> e acompanhe sua operação em tempo real</h2>
            <p style={{fontSize:16,lineHeight:1.7,color:'#8B8D97',marginBottom:32,textAlign:'center'}}>Veja seu estoque, movimentações, relatórios e muito mais. Acesso seguro com login individual para cada empresa.</p>
            <div className="sf-portal-feats">
              <span>✓ Estoque em tempo real</span>
              <span>✓ Relatórios de movimentação</span>
              <span>✓ Etiquetas e rastreamento</span>
            </div>
            <div style={{textAlign:'center'}}>
              <Link to="/login" className="sf-btn-main">Acessar Portal do Cliente →</Link>
              <div style={{marginTop:16}}><Link to="/cadastro" style={{color:"#00C896",fontSize:14,fontWeight:600,textDecoration:"none"}}>Ainda não tem conta? Cadastre-se →</Link></div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer id="contato" className="sf-footer">
          <div className="sf-container">
            <div className="sf-footer-top">
              <div className="sf-footer-brand">
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <img src={LOGO_ICON} alt="Seu Full" style={{width:40,height:40,borderRadius:10}} />
                  <div className="sf-nav-text">Seu<span>Full</span></div>
                </div>
                <p>Soluções operacionais completas para sua logística. Do fulfillment à gestão pós-venda — seu parceiro estratégico no e-commerce.</p>
              </div>
              <div className="sf-footer-col">
                <h4>Contato</h4>
                <a href="https://wa.me/5511971944949">(11) 97194-4949</a>
                <a href="https://wa.me/5511943749798">(11) 94374-9798</a>
              </div>
              <div className="sf-footer-col">
                <h4>Cobertura</h4>
                <span>Coletas: Grande São Paulo</span>
                <span>Envios: Todo o Brasil</span>
                <span>CDs: Mercado Livre, Amazon e mais</span>
              </div>
            </div>
            <div className="sf-footer-bot">
              <p>© 2026 Seu Full Particular. Todos os direitos reservados.</p>
              <p style={{color:'#00C896',fontWeight:600}}>seufull.com.br</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
.sf-landing{background:#08090D;color:#fff;font-family:'Outfit',sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased;}
.sf-container{max-width:1280px;margin:0 auto;padding:0 48px;}
@media(max-width:768px){.sf-container{padding:0 24px;}}

/* Animations */
.sf-reveal{opacity:0;transform:translateY(40px);transition:all 0.8s cubic-bezier(0.16,1,0.3,1);}
.sf-visible{opacity:1;transform:translateY(0);}
@keyframes fadeUp{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}

/* Nav */
.sf-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:20px 48px;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(20px);background:#08090Dcc;border-bottom:1px solid #1E2028;transition:all .3s;}
.sf-nav-logo{display:flex;align-items:center;gap:12px;text-decoration:none;}
.sf-nav-icon{width:40px;height:40px;background:#00C896;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#2E2C3A;}
.sf-nav-text{font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;}
.sf-nav-text span{color:#00C896;}
.sf-nav-links{display:flex;align-items:center;gap:32px;}
.sf-nav-links a{color:#8B8D97;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;transition:color .2s;}
.sf-nav-links a:hover{color:#00C896;}
.sf-btn-portal{display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:#00C896;color:#2E2C3A;font-family:inherit;font-size:14px;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;transition:all .25s;}
.sf-btn-portal:hover{background:#00daa6;transform:translateY(-1px);box-shadow:0 8px 30px #00C89640;}
@media(max-width:768px){.sf-nav{padding:16px 24px;}.sf-nav-links{display:none;}}

/* Hero */
.sf-hero{min-height:100vh;display:flex;align-items:center;padding:140px 48px 80px;position:relative;overflow:hidden;}
.sf-hero-glow{position:absolute;top:-200px;right:-200px;width:800px;height:800px;background:radial-gradient(circle,#00C89640 0%,transparent 70%);pointer-events:none;}
.sf-hero-content{max-width:1280px;margin:0 auto;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;position:relative;z-index:2;}
.sf-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;background:#00C89620;border:1px solid #00C89633;border-radius:100px;font-size:13px;font-weight:600;color:#00C896;letter-spacing:.5px;margin-bottom:28px;animation:fadeUp .8s ease-out;}
.sf-badge-dot{width:8px;height:8px;background:#00C896;border-radius:50%;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.sf-hero h1{font-size:clamp(42px,5.5vw,72px);font-weight:900;line-height:1.05;letter-spacing:-2px;margin-bottom:24px;animation:fadeUp .8s ease-out .1s both;}
.sf-hero h1 em,.sf-title em{font-style:normal;color:#00C896;}
.sf-hero-text p{font-size:18px;line-height:1.7;color:#C0C2CC;max-width:520px;margin-bottom:40px;animation:fadeUp .8s ease-out .2s both;}
.sf-hero-btns{display:flex;gap:16px;animation:fadeUp .8s ease-out .3s both;}
.sf-btn-main{display:inline-flex;align-items:center;gap:10px;padding:16px 36px;background:#00C896;color:#2E2C3A;font-family:inherit;font-size:16px;font-weight:700;border:none;border-radius:10px;cursor:pointer;text-decoration:none;transition:all .3s;}
.sf-btn-main:hover{background:#00daa6;transform:translateY(-2px);box-shadow:0 12px 40px #00C89640;}
.sf-btn-outline{display:inline-flex;align-items:center;gap:10px;padding:16px 36px;background:transparent;color:#fff;font-family:inherit;font-size:16px;font-weight:600;border:1.5px solid #1E2028;border-radius:10px;cursor:pointer;text-decoration:none;transition:all .3s;}
.sf-btn-outline:hover{border-color:#00C896;color:#00C896;}
.sf-hero-visual{animation:fadeUp .8s ease-out .4s both;}
.sf-hero-card{background:#0F1117;border:1px solid #1E2028;border-radius:20px;padding:40px;width:100%;max-width:480px;position:relative;overflow:hidden;}
.sf-hero-bar{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#00C896,#00C89600);}
.sf-stats{display:grid;grid-template-columns:1fr 1fr;gap:28px;}
.sf-stat{text-align:center;}
.sf-stat-n{font-size:32px;font-weight:900;color:#00C896;line-height:1;letter-spacing:-1px;}
.sf-stat-l{font-size:13px;color:#8B8D97;margin-top:8px;font-weight:500;text-transform:uppercase;letter-spacing:1px;}
.sf-stat-div{grid-column:span 2;height:1px;background:#1E2028;}
@media(max-width:1024px){.sf-hero-content{grid-template-columns:1fr;gap:40px;}.sf-hero{padding:120px 24px 60px;}}

/* What section */
.sf-what{background:#0F1117;border-top:1px solid #1E2028;border-bottom:1px solid #1E2028;padding:100px 0;}
.sf-what-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;}
.sf-label{font-size:13px;font-weight:700;color:#00C896;text-transform:uppercase;letter-spacing:3px;margin-bottom:16px;}
.sf-title{font-size:clamp(32px,4vw,52px);font-weight:900;line-height:1.1;letter-spacing:-1.5px;margin-bottom:20px;}
.sf-desc{font-size:17px;line-height:1.7;color:#8B8D97;max-width:600px;}
.sf-quote{font-size:20px;line-height:1.7;color:#C0C2CC;border-left:3px solid #00C896;padding-left:24px;margin-top:32px;font-style:italic;}
.sf-big-card{background:#0F1117;border:1px solid #1E2028;border-radius:20px;padding:48px;text-align:center;}
.sf-big-text{font-size:42px;font-weight:900;letter-spacing:-1px;line-height:1.2;}
.sf-big-text span{color:#00C896;}
.sf-big-sub{font-size:16px;color:#8B8D97;margin-top:20px;}
@media(max-width:1024px){.sf-what-grid{grid-template-columns:1fr;}}

/* Services */
.sf-srv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:60px;}
.sf-srv{background:#0F1117;border:1px solid #1E2028;border-radius:16px;padding:36px 32px;transition:all .35s;position:relative;overflow:hidden;}
.sf-srv::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#00C896;transform:scaleX(0);transform-origin:left;transition:transform .4s;}
.sf-srv:hover::before{transform:scaleX(1);}
.sf-srv:hover{background:#161820;border-color:#00C89633;transform:translateY(-4px);}
.sf-srv-icon{width:52px;height:52px;background:#00C89620;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:20px;}
.sf-srv h3{font-size:18px;font-weight:700;margin-bottom:12px;letter-spacing:-.3px;}
.sf-srv p{font-size:14px;line-height:1.7;color:#8B8D97;}
@media(max-width:1024px){.sf-srv-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:768px){.sf-srv-grid{grid-template-columns:1fr;}}

/* Benefits */
.sf-benefits{background:linear-gradient(180deg,#08090D,#0C0E14);}
.sf-ben-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-top:60px;}
.sf-ben{text-align:center;padding:32px 20px;background:#0F1117;border:1px solid #1E2028;border-radius:16px;transition:all .3s;}
.sf-ben:hover{border-color:#00C896;transform:translateY(-4px);}
.sf-ben-icon{width:64px;height:64px;margin:0 auto 20px;background:#00C89620;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;}
.sf-ben h4{font-size:14px;font-weight:700;line-height:1.4;text-transform:uppercase;letter-spacing:.5px;}
@media(max-width:1024px){.sf-ben-grid{grid-template-columns:repeat(3,1fr);}}
@media(max-width:768px){.sf-ben-grid{grid-template-columns:repeat(2,1fr);}}

/* Costs */
.sf-costs-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start;margin-top:60px;}
.sf-cost-item{display:flex;gap:20px;align-items:flex-start;padding:24px;background:#0F1117;border:1px solid #1E2028;border-radius:14px;transition:all .3s;margin-bottom:16px;}
.sf-cost-item:hover{border-color:#00C89644;background:#161820;}
.sf-cost-arrow{width:36px;height:36px;min-width:36px;background:#00C896;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#2E2C3A;font-size:18px;font-weight:900;}
.sf-cost-item h4{font-size:15px;font-weight:700;margin-bottom:6px;color:#00C896;}
.sf-cost-item p{font-size:14px;line-height:1.6;color:#8B8D97;}
@media(max-width:1024px){.sf-costs-grid{grid-template-columns:1fr;}}

/* Portal CTA */
.sf-portal-cta{text-align:center;padding:120px 48px;position:relative;}
.sf-portal-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(circle,#00C89620 0%,transparent 70%);pointer-events:none;}
.sf-portal-box{position:relative;z-index:2;max-width:700px;margin:0 auto;padding:64px;background:#0F1117;border:1px solid #1E2028;border-radius:24px;}
.sf-portal-box .sf-title{font-size:36px;}
.sf-portal-feats{display:flex;justify-content:center;gap:32px;margin-bottom:36px;flex-wrap:wrap;}
.sf-portal-feats span{font-size:14px;color:#C0C2CC;font-weight:500;}
.sf-portal-feats span::first-letter{color:#00C896;}
@media(max-width:768px){.sf-portal-cta{padding:80px 24px;}.sf-portal-box{padding:36px 24px;}.sf-portal-feats{flex-direction:column;align-items:center;gap:12px;}}

/* Footer */
.sf-footer{border-top:1px solid #1E2028;padding:60px 0 40px;}
.sf-footer-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;gap:40px;}
.sf-footer-brand p{color:#8B8D97;font-size:14px;line-height:1.7;max-width:360px;margin-top:16px;}
.sf-footer-col h4{font-size:13px;font-weight:700;color:#00C896;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;}
.sf-footer-col a,.sf-footer-col span{display:block;color:#C0C2CC;text-decoration:none;font-size:15px;margin-bottom:8px;font-weight:500;transition:color .2s;}
.sf-footer-col a:hover{color:#00C896;}
.sf-footer-bot{padding-top:24px;border-top:1px solid #1E2028;display:flex;justify-content:space-between;align-items:center;}
.sf-footer-bot p{font-size:13px;color:#8B8D97;}
@media(max-width:768px){.sf-footer-top{flex-direction:column;}.sf-footer-bot{flex-direction:column;gap:12px;text-align:center;}}
`;
