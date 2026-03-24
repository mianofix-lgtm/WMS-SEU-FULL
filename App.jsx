import { useState, useMemo, useEffect, useCallback } from "react";

const CURVA_COLORS = { A: "#dc2626", B: "#d97706", C: "#16a34a", "": "#94a3b8" };

// inverter: true = A1 aparece em cima (lado do corredor acima), A4 embaixo
const WAREHOUSE = {
  ruas: [
    { id: "R1", label: "RUA 1", vaos: 4,  andares: 4, tipo: "seufull",  inverter: false },
    { id: "R2", label: "RUA 2", vaos: 10, andares: 4, tipo: "seufull",  inverter: false },
    { id: "R3", label: "RUA 3", vaos: 10, andares: 4, tipo: "mianofix", inverter: false },
    { id: "R4", label: "RUA 4", vaos: 10, andares: 4, tipo: "mianofix", inverter: false },
    { id: "R5", label: "RUA 5", vaos: 10, andares: 4, tipo: "mianofix", inverter: false },
  ],
};

const LADOS = ["A","B"];
const EMPTY = { sku:"", nome:"", qtd:"", valorUnit:"", curva:"", loja:"", obs:"" };
const EMPTY_AREA = { descricao:"", loja:"", qtd:"", valorUnit:"", obs:"", paletes:"1", dataEntrada:"" };
const STORAGE_KEY = "wms_several_v3";

function cellId(r,v,l,a){ return `${r}-P${String(v).padStart(2,"0")}${l}-A${a}`; }
function loadLocal(){ try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):{}; } catch(e){ return {}; } }
function saveLocal(d){ try { localStorage.setItem(STORAGE_KEY,JSON.stringify(d)); } catch(e){} }

const FB_KEY = "AIzaSyAaVjIxfLAZWySdn2rYdUvwpsetL1xjrFE";
const FB_PID = "wms-seu-full";
const FS_URL = `https://firestore.googleapis.com/v1/projects/${FB_PID}/databases/(default)/documents/wms/estoque`;

async function cloudLoad(){
  const r = await fetch(`${FS_URL}?key=${FB_KEY}`);
  if(r.status===404) return null;
  if(!r.ok) throw new Error();
  const d = await r.json();
  if(!d.fields?.data?.stringValue) return null;
  return JSON.parse(d.fields.data.stringValue);
}
async function cloudSave(cells){
  const r = await fetch(`${FS_URL}?key=${FB_KEY}`, {
    method:"PATCH", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ fields:{ data:{ stringValue: JSON.stringify(cells) }, updatedAt:{ stringValue: new Date().toISOString() } } })
  });
  if(!r.ok) throw new Error();
}

// Gera etiqueta HTML e abre janela de impressao
function printLabel(id, cell, ruaTipo) {
  const [ruaId, vaoPart, andarPart] = id.split("-");
  const vao = vaoPart;
  const andar = andarPart;
  const qrData = encodeURIComponent(id);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Etiqueta ${id}</title>
  <style>
    @page { size: 100mm 150mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 100mm; height: 150mm; font-family: 'Arial', sans-serif; padding: 6mm; background: #fff; }
    .header { background: #1e3a5f; color: white; padding: 5mm; border-radius: 3mm; margin-bottom: 4mm; text-align: center; }
    .header h1 { font-size: 14pt; font-weight: 900; letter-spacing: 1px; }
    .header p { font-size: 8pt; opacity: 0.8; margin-top: 1mm; }
    .address-box { background: #f0f9ff; border: 2px solid #1e3a5f; border-radius: 3mm; padding: 4mm; margin-bottom: 4mm; text-align: center; }
    .address-box .label { font-size: 7pt; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .address-box .value { font-size: 22pt; font-weight: 900; color: #1e3a5f; line-height: 1.1; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-bottom: 4mm; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2mm; padding: 3mm; }
    .info-box .label { font-size: 7pt; color: #888; text-transform: uppercase; }
    .info-box .value { font-size: 10pt; font-weight: 700; color: #1e293b; margin-top: 1mm; word-break: break-word; }
    .produto-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2mm; padding: 3mm; margin-bottom: 3mm; }
    .produto-box .label { font-size: 7pt; color: #888; text-transform: uppercase; }
    .produto-box .value { font-size: 11pt; font-weight: 700; color: #1e293b; margin-top: 1mm; }
    .bottom { display: flex; align-items: center; justify-content: space-between; }
    .qr-area { text-align: center; }
    .qr-area img { width: 24mm; height: 24mm; }
    .qr-area p { font-size: 6pt; color: #888; margin-top: 1mm; }
    .qty-box { flex: 1; margin-right: 4mm; background: #f0fdf4; border: 2px solid #16a34a; border-radius: 3mm; padding: 4mm; text-align: center; }
    .qty-box .label { font-size: 7pt; color: #16a34a; text-transform: uppercase; letter-spacing: 1px; }
    .qty-box .value { font-size: 24pt; font-weight: 900; color: #15803d; }
    .footer { text-align: center; font-size: 6pt; color: #ccc; margin-top: 2mm; }
  </style>
  </head><body>
  <div class="header">
    <h1>WMS SEU FULL</h1>
    <p>Etiqueta de Identificacao de Palete</p>
  </div>
  <div class="address-box">
    <div class="label">Endereco</div>
    <div class="value">${id}</div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <div class="label">SKU / Codigo</div>
      <div class="value">${cell?.sku || '-'}</div>
    </div>
    <div class="info-box">
      <div class="label">Curva ABC</div>
      <div class="value">${cell?.curva || '-'}</div>
    </div>
    ${cell?.loja ? `<div class="info-box" style="grid-column:1/-1"><div class="label">Loja de Origem</div><div class="value">${cell.loja}</div></div>` : ''}
  </div>
  <div class="produto-box">
    <div class="label">Produto</div>
    <div class="value">${cell?.nome || 'Posicao vazia'}</div>
  </div>
  <div class="bottom">
    <div class="qty-box">
      <div class="label">Quantidade</div>
      <div class="value">${cell?.qtd || '0'}</div>
    </div>
    <div class="qr-area">
      <img src="${qrUrl}" alt="QR"/>
      <p>Escaneie para<br/>localizar</p>
    </div>
  </div>
  <div class="footer">Impresso em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  </body></html>`;
  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 800);
}

// P10: A1 e A2 = empilhadeira, A3 e A4 = normais
function isAcesso(vaos, vao, andar){ return vaos === 10 && vao === 10 && andar <= 2; }

export default function App() {
  const [cells,    setCells]    = useState(loadLocal);
  const [sel,      setSel]      = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [areaModal,setAreaModal]= useState(null);
  const [areaForm, setAreaForm] = useState(EMPTY_AREA);
  const [view,     setView]     = useState("mapa");
  const [fTipo,    setFTipo]    = useState("todos");
  const [fCurva,   setFCurva]   = useState("todos");
  const [search,   setSearch]   = useState("");
  const [toast,    setToast]    = useState(null);
  const [cloud,    setCloud]    = useState("connecting");
  const [lastSave, setLastSave] = useState(null);

  function showToast(msg,type="ok"){ setToast({msg,type}); setTimeout(()=>setToast(null),3000); }

  useEffect(()=>{
    setCloud("connecting");
    cloudLoad()
      .then(data=>{ if(data){ setCells(data); saveLocal(data); } setCloud("ok"); })
      .catch(()=>{ setCloud("error"); showToast("Usando dados locais","warn"); });
  },[]);

  const persist = useCallback((newCells)=>{
    setCells(newCells); saveLocal(newCells); setCloud("saving");
    cloudSave(newCells)
      .then(()=>{ setCloud("ok"); setLastSave(new Date()); })
      .catch(()=>{ setCloud("error"); showToast("Salvo localmente","warn"); });
  },[]);

  function openCell(id){ setSel(id); setForm(cells[id]?{...cells[id]}:{...EMPTY}); }
  function saveCell(){ if(!sel) return; persist({...cells,[sel]:{...form}}); setSel(null); showToast("Salvo na nuvem!"); }
  function clearCell(){ if(!sel) return; const n={...cells}; delete n[sel]; persist(n); setSel(null); showToast("Posicao limpa.","warn"); }
  function openArea(slot,tipo){ setAreaModal({slot,tipo}); setAreaForm(cells[slot]?{...cells[slot]}:{...EMPTY_AREA}); }
  function saveArea(){ if(!areaModal) return; persist({...cells,[areaModal.slot]:{...areaForm,_area:areaModal.tipo}}); setAreaModal(null); showToast("Salvo na nuvem!"); }
  function clearArea(){ if(!areaModal) return; const n={...cells}; delete n[areaModal.slot]; persist(n); setAreaModal(null); showToast("Limpo.","warn"); }

  const fullSlots = Array.from({length:40},(_,i)=>`FULL-${String(i+1).padStart(2,"0")}`);
  const flexSlots = Array.from({length:60},(_,i)=>`FLEX-${String(i+1).padStart(2,"0")}`);

  function exportCSV(){
    const h=["Posicao","Area","SKU/Desc","Qtd","Vlr Unit","Vlr Total","Curva","Loja","Obs"];
    const rows=allCells.map(r=>[r.id,r._area||r.tipo||"porta-palet",r.sku||r.descricao||"",r.qtd,r.valorUnit,((parseFloat(r.qtd)||0)*(parseFloat(r.valorUnit)||0)).toFixed(2),r.curva||"",r.loja||"",r.obs||""]);
    const csv=[h,...rows].map(r=>r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="estoque_wms.csv"; a.click();
    showToast("CSV exportado!");
  }

  const allCells=useMemo(()=>{
    const rows=[];
    WAREHOUSE.ruas.forEach(rua=>{
      for(let v=1;v<=rua.vaos;v++)
        for(const lado of LADOS)
          for(let a=1;a<=rua.andares;a++){
            if(isAcesso(rua.vaos,v,a)) continue;
            const id=cellId(rua.id,v,lado,a),c=cells[id];
            if(c&&c.sku) rows.push({id,rua:rua.id,vao:v,lado,andar:a,tipo:rua.tipo,...c});
          }
    });
    [...flexSlots,...fullSlots].forEach(slot=>{
      const c=cells[slot];
      if(c&&(c.descricao||c.loja)) rows.push({id:slot,tipo:slot.startsWith("FLEX")?"flex":"full",...c});
    });
    return rows;
  },[cells]);

  const filtered=useMemo(()=>allCells.filter(r=>{
    if(fTipo==="flex"&&r.tipo!=="flex") return false;
    if(fTipo==="full"&&r.tipo!=="full") return false;
    if(fTipo==="seufull"&&r.tipo!=="seufull") return false;
    if(fTipo==="mianofix"&&r.tipo!=="mianofix") return false;
    if(fCurva!=="todos"&&r.curva!==fCurva) return false;
    const term=search.toLowerCase();
    if(term&&!r.nome?.toLowerCase().includes(term)&&!r.sku?.toLowerCase().includes(term)&&!r.descricao?.toLowerCase().includes(term)) return false;
    return true;
  }),[allCells,fTipo,fCurva,search]);

  const totais=useMemo(()=>{ let vt=0,ti=0; allCells.forEach(r=>{ vt+=(parseFloat(r.qtd)||0)*(parseFloat(r.valorUnit)||0); ti+=parseFloat(r.qtd)||0; }); return {vt,ti,skus:allCells.length}; },[allCells]);
  const curvaCount=useMemo(()=>{ const c={A:0,B:0,C:0}; allCells.forEach(r=>{if(r.curva)c[r.curva]=(c[r.curva]||0)+1;}); return c; },[allCells]);

  const selParts=sel?sel.split("-"):[];
  const selRuaObj=WAREHOUSE.ruas.find(r=>r.id===selParts[0]);
  const selAndar=selParts[2]?parseInt(selParts[2].replace("A","")):0;
  const selLado=selParts[1]?selParts[1].slice(-1):"";
  const alertaAlto=selAndar>=3;

  const cloudInfo={
    connecting:{label:"Conectando...",color:"#fbbf24"},
    ok:{label:lastSave?`Salvo as ${lastSave.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`:"Nuvem conectada",color:"#4ade80"},
    saving:{label:"Salvando...",color:"#60a5fa"},
    error:{label:"Salvo localmente",color:"#fb923c"},
  }[cloud];

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#f1f5f9",minHeight:"100vh",color:"#1e293b"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:8px;height:8px;}::-webkit-scrollbar-track{background:#e2e8f0;}::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:4px;}
        .hdr{background:#1e3a5f;color:#fff;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px #0003;flex-wrap:wrap;gap:10px;}
        .hdr-logo{font-size:18px;font-weight:700;}.hdr-sub{font-size:12px;color:#93c5fd;margin-top:2px;}
        .hdr-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .cloud-badge{font-size:13px;font-weight:700;padding:6px 14px;border-radius:20px;background:#ffffff22;}
        .nav{display:flex;gap:6px;}
        .nb{padding:9px 22px;font-family:inherit;font-size:14px;font-weight:600;border:none;border-radius:6px;cursor:pointer;background:transparent;color:#bfdbfe;transition:all .15s;}
        .nb.on{background:#fff;color:#1e3a5f;}.nb:hover:not(.on){background:#ffffff22;color:#fff;}
        .toolbar{background:#0f2942;padding:10px 28px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:2px solid #1e3a5f;}
        .toolbar span{font-size:13px;color:#7dd3fc;font-weight:600;}
        .tbtn{padding:8px 18px;font-family:inherit;font-size:13px;font-weight:700;border:1.5px solid;border-radius:6px;cursor:pointer;}
        .tbtn-csv{background:#1c1917;color:#fb923c;border-color:#ea580c;}
        .kbar{background:#fff;border-bottom:2px solid #e2e8f0;padding:14px 28px;display:flex;gap:12px;flex-wrap:wrap;}
        .kpi{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:11px 20px;min-width:130px;}
        .kpi-l{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
        .kpi-v{font-size:24px;font-weight:800;margin-top:3px;}
        .main{padding:24px 28px;}
        .sec-title{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
        .sec-title::before{content:"";display:block;width:4px;height:18px;background:#1e3a5f;border-radius:2px;}
        .legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:12px 18px;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;align-items:center;}
        .li{display:flex;align-items:center;gap:7px;font-size:13px;color:#374151;font-weight:500;}
        .ld{width:18px;height:18px;border-radius:4px;border:2px solid;}
        .wh{background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:24px;overflow-x:auto;box-shadow:0 2px 8px #0001;}
        .corredor{background:#dbeafe;border:2px dashed #93c5fd;padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:2px;color:#1d4ed8;text-align:center;border-radius:6px;margin:10px 0;}
        .costas{background:#f1f5f9;border:1px dashed #cbd5e1;padding:3px 16px;font-size:11px;color:#94a3b8;text-align:center;border-radius:4px;margin:2px 0;}
        .rua-block{display:flex;align-items:flex-start;gap:16px;margin-bottom:10px;}
        .rua-lbl{width:72px;flex-shrink:0;padding-top:8px;}
        .rua-lbl-main{font-size:15px;font-weight:800;color:#1e293b;}.rua-lbl-sub{font-size:11px;font-weight:700;margin-top:3px;}
        .andares{display:flex;gap:4px;}
        .andar-row{display:flex;gap:2px;align-items:center;}
        .a-lbl{width:28px;font-size:12px;font-weight:700;color:#94a3b8;text-align:right;flex-shrink:0;margin-right:2px;}
        .vao-group{display:flex;gap:1px;margin-right:4px;}
        .cell{border-radius:4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .15s;border:2px solid;flex-shrink:0;gap:2px;position:relative;}
        .cell:hover{transform:scale(1.12);box-shadow:0 4px 14px #0003;z-index:5;}
        .cell-acesso{border:2px dashed #e2e8f0!important;background:#f8fafc!important;cursor:default;}
        .cell-dot{border-radius:50%;}
        .cell-sku{font-size:8px;font-weight:800;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px;text-align:center;}
        .cell-plus{font-size:16px;color:#cbd5e1;font-weight:300;line-height:1;}
        .lado-tag{position:absolute;top:1px;left:2px;font-size:7px;font-weight:800;color:#94a3b8;}
        .vao-lbl-row{display:flex;gap:4px;padding-left:32px;margin-top:5px;}
        .vao-lbl{font-size:9px;font-weight:600;color:#cbd5e1;text-align:center;flex-shrink:0;}
        .areas-row{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-top:16px;}
        .full-box{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px;}
        .full-dashboard{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}
        .fd-card{background:#fff;border:1.5px solid #86efac;border-radius:8px;padding:10px 12px;text-align:center;}
        .fd-card.alerta{border-color:#f59e0b;background:#fffbeb;}
        .fd-card.perigo{border-color:#ef4444;background:#fef2f2;}
        .fd-label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
        .fd-value{font-size:18px;font-weight:800;}
        .fd-sub{font-size:10px;color:#94a3b8;margin-top:2px;}
        .coleta-bar{display:flex;gap:8px;margin-bottom:10px;}
        .coleta-card{flex:1;background:#fff;border:1.5px solid #86efac;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:10px;}
        .coleta-dia{font-size:13px;font-weight:800;color:#15803d;}
        .coleta-info{font-size:11px;color:#64748b;}
        .coleta-dias{font-size:20px;font-weight:800;color:#1d4ed8;}
        .full-title{font-size:13px;font-weight:800;color:#15803d;margin-bottom:3px;}
        .full-sub{font-size:11px;color:#4ade80;margin-bottom:10px;}
        .full-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;}
        .palet{height:58px;border-radius:6px;border:2px solid;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .15s;gap:2px;position:relative;}
        .palet:hover{transform:scale(1.05);box-shadow:0 3px 10px #0002;z-index:3;}
        .palet.empty{background:#f0fdf4;border-color:#86efac;}
        .palet.filled{background:#dcfce7;border-color:#4ade80;}
        .palet-num{font-size:8px;font-weight:700;color:#94a3b8;position:absolute;top:3px;left:4px;}
        .palet-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;}
        .palet-loja{font-size:8px;font-weight:700;color:#15803d;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;}
        .palet-desc{font-size:7px;color:#4ade80;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;}
        .flex-box{background:#eff6ff;border:2px solid #93c5fd;border-radius:10px;padding:14px;}
        .flex-title{font-size:13px;font-weight:800;color:#1d4ed8;margin-bottom:3px;}
        .flex-sub{font-size:11px;color:#60a5fa;margin-bottom:10px;}
        .flex-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;}
        .gav{height:36px;border-radius:3px;border:1.5px solid;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .12s;gap:1px;position:relative;}
        .gav:hover{transform:scale(1.08);box-shadow:0 2px 6px #0002;z-index:3;}
        .gav.empty{background:#eff6ff;border-color:#bfdbfe;}
        .gav.filled{background:#dbeafe;border-color:#3b82f6;}
        .gav-num{font-size:7px;font-weight:700;color:#94a3b8;position:absolute;top:1px;left:2px;}
        .gav-dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;}
        .gav-desc{font-size:7px;font-weight:700;color:#1d4ed8;max-width:95%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;}
        .overlay{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:200;}
        .modal{background:#fff;border-radius:12px;width:520px;max-width:95vw;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px #0005;}
        .modal-hdr{color:#fff;padding:22px 28px;border-radius:12px 12px 0 0;}
        .modal-hdr.palet{background:#1e3a5f;}.modal-hdr.flex{background:#1d4ed8;}.modal-hdr.full{background:#15803d;}
        .modal-hdr-id{font-size:20px;font-weight:800;}.modal-hdr-sub{font-size:13px;opacity:.8;margin-top:4px;}
        .modal-body{padding:24px 28px;}
        .alerta{background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:12px 16px;font-size:13px;color:#dc2626;font-weight:700;margin-bottom:16px;}
        .field{margin-bottom:16px;}
        .field label{display:block;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;}
        .field input,.field select{width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:8px;padding:12px 14px;color:#1e293b;font-family:inherit;font-size:15px;outline:none;transition:border-color .2s;}
        .field input:focus,.field select:focus{border-color:#1d4ed8;background:#fff;}
        .frow{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        .vt-box{background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:12px 16px;font-size:14px;color:#15803d;font-weight:700;margin-bottom:14px;}
        .modal-foot{padding:18px 28px;border-top:2px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end;background:#f8fafc;border-radius:0 0 12px 12px;}
        .btn{padding:11px 24px;font-family:inherit;font-size:14px;font-weight:700;border:none;border-radius:8px;cursor:pointer;transition:all .15s;}
        .btn-primary{background:#1e3a5f;color:#fff;}.btn-primary:hover{background:#1d4ed8;}
        .btn-success{background:#15803d;color:#fff;}.btn-success:hover{background:#16a34a;}
        .btn-danger{background:#fef2f2;color:#dc2626;border:2px solid #fca5a5;}.btn-danger:hover{background:#fee2e2;}
        .btn-ghost{background:#f1f5f9;color:#475569;border:2px solid #e2e8f0;}.btn-ghost:hover{background:#e2e8f0;}
        .filters{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center;}
        .filters input,.filters select{background:#fff;border:2px solid #e2e8f0;border-radius:8px;padding:10px 14px;color:#1e293b;font-family:inherit;font-size:14px;outline:none;}
        .filters input:focus,.filters select:focus{border-color:#1d4ed8;}
        .tbl-wrap{background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;}
        table{width:100%;border-collapse:collapse;font-size:14px;}
        th{background:#f1f5f9;color:#374151;text-transform:uppercase;letter-spacing:.8px;font-size:11px;font-weight:700;padding:12px 14px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap;}
        td{padding:11px 14px;border-bottom:1px solid #f1f5f9;color:#334155;}
        tr:hover td{background:#f8fafc;}tr:last-child td{border-bottom:none;}
        .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;}
        .badge-A{background:#fef2f2;color:#dc2626;}.badge-B{background:#fffbeb;color:#b45309;}.badge-C{background:#f0fdf4;color:#15803d;}
        .badge-sf{background:#eff6ff;color:#1d4ed8;}.badge-mn{background:#fffbeb;color:#b45309;}
        .badge-fx{background:#dbeafe;color:#1d4ed8;}.badge-fl{background:#dcfce7;color:#15803d;}
        .fin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px;}
        .fin-card{background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:20px;}
        .fin-card-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;}
        .fin-card-value{font-size:26px;font-weight:800;}.fin-card-sub{font-size:12px;color:#94a3b8;margin-top:5px;}
        .prog-bar{height:7px;background:#e2e8f0;border-radius:4px;margin-top:12px;overflow:hidden;}
        .prog-fill{height:100%;border-radius:4px;transition:width .6s;}
        .toast{position:fixed;bottom:28px;right:28px;background:#1e3a5f;color:#fff;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:700;box-shadow:0 8px 28px #0003;z-index:300;animation:slideUp .3s ease;}
        .toast.warn{background:#b45309;}
        @keyframes slideUp{from{transform:translateY(16px);opacity:0;}to{transform:translateY(0);opacity:1;}}
        .empty-state{text-align:center;padding:70px 40px;color:#94a3b8;font-size:15px;line-height:1.8;}
        .empty-state .icon{font-size:40px;margin-bottom:14px;}
      `}</style>

      <div className="hdr">
        <div><div className="hdr-logo">WMS SEU FULL</div><div className="hdr-sub">Sistema de Gestao de Armazem</div></div>
        <div className="hdr-right">
          <div className="cloud-badge" style={{color:cloudInfo.color}}>{cloudInfo.label}</div>
          <nav className="nav">
            {[["mapa","Mapa"],["inventario","Inventario"],["financeiro","Financeiro"]].map(([v,l])=>(
              <button key={v} className={`nb${view===v?" on":""}`} onClick={()=>setView(v)}>{l}</button>
            ))}
          </nav>
        </div>
      </div>

      <div className="toolbar">
        <span>Firebase Google Cloud - Ruas 3 e 5: A1 proximo ao corredor</span>
        <button className="tbtn tbtn-csv" onClick={exportCSV} style={{marginLeft:"auto"}}>Exportar Excel (.csv)</button>
      </div>

      <div className="kbar">
        <div className="kpi"><div className="kpi-l">SKUs alocados</div><div className="kpi-v" style={{color:"#1d4ed8"}}>{totais.skus}</div></div>
        <div className="kpi"><div className="kpi-l">Total de itens</div><div className="kpi-v">{totais.ti.toLocaleString("pt-BR")}</div></div>
        <div className="kpi"><div className="kpi-l">Valor em estoque</div><div className="kpi-v" style={{color:"#15803d"}}>R$ {totais.vt.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div></div>
        <div className="kpi"><div className="kpi-l">Curva A</div><div className="kpi-v" style={{color:"#dc2626"}}>{curvaCount.A} pos</div></div>
        <div className="kpi"><div className="kpi-l">Curva B</div><div className="kpi-v" style={{color:"#d97706"}}>{curvaCount.B} pos</div></div>
        <div className="kpi"><div className="kpi-l">Curva C</div><div className="kpi-v" style={{color:"#16a34a"}}>{curvaCount.C} pos</div></div>
      </div>

      <div className="main">
        {view==="mapa"&&<>
          <div className="sec-title">Layout do Armazem</div>
          <div className="legend">
            <div className="li"><div className="ld" style={{background:"#eff6ff",borderColor:"#93c5fd"}}></div>Seu Full vazio</div>
            <div className="li"><div className="ld" style={{background:"#fffbeb",borderColor:"#fcd34d"}}></div>Mianofix vazio</div>
            <div className="li"><div className="ld" style={{background:"#fef2f2",borderColor:"#fca5a5"}}></div>Curva A</div>
            <div className="li"><div className="ld" style={{background:"#fffbeb",borderColor:"#fcd34d"}}></div>Curva B</div>
            <div className="li"><div className="ld" style={{background:"#f0fdf4",borderColor:"#86efac"}}></div>Curva C</div>
            <div style={{marginLeft:"auto",background:"#fefce8",border:"1.5px solid #fde047",borderRadius:"6px",padding:"6px 14px",fontSize:"12px",color:"#854d0e",fontWeight:700}}>Andares 3 e 4 so Curva B ou C</div>
          </div>

          <div className="wh">
            {WAREHOUSE.ruas.map((rua,ri)=>{
              const CW=28, CH=42;
              const andaresList = (rua.id==="R1"||rua.id==="R3"||rua.id==="R5") ? [4,3,2,1] : [1,2,3,4];
              return (
                <div key={rua.id}>
                  {ri===1 && <div className="corredor">CORREDOR</div>}
                  {ri===2 && <div className="costas">costas com costas - Ruas 2 e 3</div>}
                  {ri===3 && <div className="corredor">CORREDOR</div>}
                  {ri===4 && <div className="costas">costas com costas - Ruas 4 e 5</div>}
                  <div className="rua-block">
                    <div className="rua-lbl">
                      <div className="rua-lbl-main">{rua.label}</div>
                      <div className="rua-lbl-sub" style={{color:rua.tipo==="seufull"?"#1d4ed8":"#b45309"}}>{rua.tipo==="seufull"?"SEU FULL":"MIANOFIX"}</div>
                    </div>
                    <div>
                      <div className="andares" style={{flexDirection:"column"}}>
                        {andaresList.map(andar=>(
                          <div key={andar} className="andar-row">
                            <div className="a-lbl">A{andar}</div>
                            {Array.from({length:rua.vaos},(_,vi)=>{
                              const vao=vi+1;
                              if(isAcesso(rua.vaos,vao,andar)){
                                return(
                                  <div key={vao} className="vao-group">
                                    <div className="cell cell-acesso" style={{width:CW*2+1,height:CH}}>
                                      <span style={{fontSize:"7px",color:"#94a3b8",fontWeight:700}}>EMP.</span>
                                    </div>
                                  </div>
                                );
                              }
                              return(
                                <div key={vao} className="vao-group">
                                  {LADOS.map(lado=>{
                                    const id=cellId(rua.id,vao,lado,andar);
                                    const c=cells[id], has=c&&c.sku;
                                    let bg,bc;
                                    if(!has){bg=rua.tipo==="seufull"?"#eff6ff":"#fffbeb";bc=rua.tipo==="seufull"?"#93c5fd":"#fcd34d";}
                                    else{const cv=c.curva||"X";const bgs={A:"#fef2f2",B:"#fffbeb",C:"#f0fdf4",X:"#f8fafc"};const bcs={A:"#fca5a5",B:"#fcd34d",C:"#86efac",X:"#e2e8f0"};bg=bgs[cv];bc=bcs[cv];}
                                    return(
                                      <div key={lado} className="cell" style={{width:CW,height:CH,background:bg,borderColor:bc}}
                                        title={has?`${c.sku} - ${c.nome}`:id+" vazio"}
                                        onClick={()=>openCell(id)}>
                                        <span className="lado-tag">{lado}</span>
                                        {has?<><div className="cell-dot" style={{width:7,height:7,background:CURVA_COLORS[c.curva||""]}}></div><div className="cell-sku" style={{width:CW-6}}>{c.sku}</div></>:<span className="cell-plus">+</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      <div className="vao-lbl-row">
                        {Array.from({length:rua.vaos},(_,vi)=>(
                          <div key={vi} className="vao-lbl" style={{width:CW*2+1+4}}>P{vi+1}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="corredor" style={{marginTop:16}}>CORREDOR — ÁREA DE RECEBIMENTO E DESPACHO</div>

            {/* FLEX esquerda, FULL direita */}
            <div className="areas-row" style={{gridTemplateColumns:"2fr 3fr"}}>
              {/* ESTOQUE FLEX - esquerda */}
              <div className="flex-box">
                <div className="flex-title">Estoque Flex</div>
                <div className="flex-sub">60 gavetas - estoque picado</div>
                <div className="flex-grid">
                  {flexSlots.map(slot=>{
                    const c=cells[slot], has=c&&(c.descricao||c.loja);
                    return(
                      <div key={slot} className={`gav ${has?"filled":"empty"}`}
                        onClick={()=>openArea(slot,"flex")}
                        title={has?`${c.loja||""} - ${c.descricao||""}`:slot}>
                        <span className="gav-num">{slot.replace("FLEX-","")}</span>
                        {has
                          ?<><div className="gav-dot"></div><div className="gav-desc">{c.descricao||c.loja}</div></>
                          :<span style={{fontSize:"12px",color:"#93c5fd"}}>+</span>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* FULL PRONTO - direita */}
              <div className="full-box">
                <div className="full-title">Full Pronto</div>
                <div className="full-sub">40 paletes - aguardando despacho</div>

                {/* DASHBOARD FULL */}
                {(()=>{
                  const fullItems = fullSlots.map(s=>cells[s]).filter(Boolean).filter(c=>c.loja||c.descricao);
                  const totalPaletes = fullItems.reduce((s,c)=>s+(parseInt(c.paletes)||1),0);
                  const totalValor = fullItems.reduce((s,c)=>s+(parseFloat(c.qtd)||0)*(parseFloat(c.valorUnit)||0),0);
                  const pctPaletes = Math.min(100,(totalPaletes/28)*100);
                  const pctValor = Math.min(100,(totalValor/1000000)*100);
                  const hoje = new Date();
                  const diaSemana = hoje.getDay();
                  // proxima segunda (1) e sexta (5)
                  const diasParaSeg = ((1-diaSemana+7)%7)||7;
                  const diasParaSex = ((5-diaSemana+7)%7)||7;
                  const proxSeg = new Date(hoje); proxSeg.setDate(hoje.getDate()+diasParaSeg);
                  const proxSex = new Date(hoje); proxSex.setDate(hoje.getDate()+diasParaSex);
                  const fmtData = d => d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
                  const paletesAlerta = totalPaletes>=24;
                  const valorAlerta = totalValor>=900000;
                  return(<>
                    <div className="full-dashboard">
                      <div className={`fd-card${paletesAlerta?" perigo":""}`}>
                        <div className="fd-label">Paletes</div>
                        <div className="fd-value" style={{color:paletesAlerta?"#dc2626":"#15803d"}}>{totalPaletes}<span style={{fontSize:"12px",color:"#94a3b8"}}>/28</span></div>
                        <div className="fd-sub">{pctPaletes.toFixed(0)}% da carreta</div>
                        <div style={{height:4,background:"#e2e8f0",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:pctPaletes+"%",background:paletesAlerta?"#ef4444":"#16a34a",borderRadius:2}}></div>
                        </div>
                      </div>
                      <div className={`fd-card${valorAlerta?" alerta":""}`}>
                        <div className="fd-label">Valor Total</div>
                        <div className="fd-value" style={{fontSize:"13px",color:valorAlerta?"#d97706":"#15803d"}}>R$ {totalValor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                        <div className="fd-sub">{pctValor.toFixed(0)}% do limite</div>
                        <div style={{height:4,background:"#e2e8f0",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:pctValor+"%",background:valorAlerta?"#f59e0b":"#16a34a",borderRadius:2}}></div>
                        </div>
                      </div>
                      <div className="fd-card">
                        <div className="fd-label">SKUs no Full</div>
                        <div className="fd-value" style={{color:"#1d4ed8"}}>{fullItems.length}</div>
                        <div className="fd-sub">posicoes ocupadas</div>
                      </div>
                      <div className="fd-card">
                        <div className="fd-label">Limite Restante</div>
                        <div className="fd-value" style={{fontSize:"13px",color:"#15803d"}}>R$ {Math.max(0,1000000-totalValor).toLocaleString("pt-BR",{minimumFractionDigits:0})}</div>
                        <div className="fd-sub">ate R$ 1.000.000</div>
                      </div>
                    </div>
                    <div className="coleta-bar">
                      <div className="coleta-card">
                        <div style={{textAlign:"center"}}>
                          <div className="coleta-dias">{diasParaSeg}</div>
                          <div style={{fontSize:"9px",color:"#94a3b8"}}>dias</div>
                        </div>
                        <div>
                          <div className="coleta-dia">Segunda-feira</div>
                          <div className="coleta-info">{fmtData(proxSeg)} · Coleta programada</div>
                        </div>
                      </div>
                      <div className="coleta-card">
                        <div style={{textAlign:"center"}}>
                          <div className="coleta-dias">{diasParaSex}</div>
                          <div style={{fontSize:"9px",color:"#94a3b8"}}>dias</div>
                        </div>
                        <div>
                          <div className="coleta-dia">Sexta-feira</div>
                          <div className="coleta-info">{fmtData(proxSex)} · Coleta programada</div>
                        </div>
                      </div>
                    </div>
                  </>);
                })()}

                <div className="full-grid">
                  {fullSlots.map(slot=>{
                    const c=cells[slot], has=c&&(c.descricao||c.loja);
                    return(
                      <div key={slot} className={`palet ${has?"filled":"empty"}`}
                        onClick={()=>openArea(slot,"full")}
                        title={has?`${c.loja||""} - ${c.descricao||""}`:slot}>
                        <span className="palet-num">{slot.replace("FULL-","")}</span>
                        {has
                          ?<><div className="palet-dot"></div><div className="palet-loja">{c.loja||"-"}</div><div className="palet-desc">{c.paletes||1}pal</div></>
                          :<span style={{fontSize:"18px",color:"#86efac"}}>+</span>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>}

        {view==="inventario"&&<>
          <div className="sec-title">Inventario Completo</div>
          <div className="filters">
            <input placeholder="Buscar SKU ou nome..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:260}}/>
            <select value={fTipo} onChange={e=>setFTipo(e.target.value)}>
              <option value="todos">Todas as areas</option>
              <option value="seufull">Seu Full (Ruas 1-2)</option>
              <option value="mianofix">Mianofix (Ruas 3-5)</option>
              <option value="flex">Estoque Flex</option>
              <option value="full">Full Pronto</option>
            </select>
            <select value={fCurva} onChange={e=>setFCurva(e.target.value)}>
              <option value="todos">Todas as curvas</option>
              <option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option>
            </select>
            <button className="btn btn-primary" onClick={exportCSV} style={{marginLeft:"auto"}}>Exportar CSV</button>
          </div>
          {filtered.length===0
            ?<div className="empty-state"><div className="icon">📭</div>Nenhum item encontrado.</div>
            :<div className="tbl-wrap"><table>
              <thead><tr>
                <th>Posicao</th><th>Area</th><th>SKU / Descricao</th><th>Nome / Loja</th>
                <th style={{textAlign:"right"}}>Qtd</th><th style={{textAlign:"right"}}>Vlr Unit</th>
                <th style={{textAlign:"right"}}>Vlr Total</th><th>Curva</th><th>Obs</th>
              </tr></thead>
              <tbody>{filtered.map(r=>{
                const isArea=r.tipo==="flex"||r.tipo==="full";
                return(
                  <tr key={r.id} style={{cursor:"pointer"}} onClick={()=>isArea?openArea(r.id,r.tipo):openCell(r.id)}>
                    <td style={{fontWeight:800,color:"#1e3a5f"}}>{r.id}</td>
                    <td>
                      {r.tipo==="seufull"&&<span className="badge badge-sf">SEU FULL</span>}
                      {r.tipo==="mianofix"&&<span className="badge badge-mn">MIANOFIX</span>}
                      {r.tipo==="flex"&&<span className="badge badge-fx">FLEX</span>}
                      {r.tipo==="full"&&<span className="badge badge-fl">FULL PRONTO</span>}
                    </td>
                    <td style={{fontWeight:700}}>{r.sku||r.descricao||"-"}</td>
                    <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{r.nome||r.loja||"-"}</td>
                    <td style={{textAlign:"right",fontWeight:700}}>{parseFloat(r.qtd||0).toLocaleString("pt-BR")}</td>
                    <td style={{textAlign:"right"}}>R$ {parseFloat(r.valorUnit||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td>
                    <td style={{textAlign:"right",fontWeight:800,color:"#15803d"}}>R$ {((parseFloat(r.qtd)||0)*(parseFloat(r.valorUnit)||0)).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td>
                    <td>{r.curva&&<span className={`badge badge-${r.curva}`}>{r.curva}</span>}</td>
                    <td style={{color:"#94a3b8",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis"}}>{r.obs||"-"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          }
        </>}

        {view==="financeiro"&&<>
          <div className="sec-title">Painel Financeiro do Estoque</div>
          <div className="fin-grid">
            <div className="fin-card"><div className="fin-card-title">Valor Total em Estoque</div><div className="fin-card-value" style={{color:"#15803d"}}>R$ {totais.vt.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div></div>
            <div className="fin-card"><div className="fin-card-title">Total de Itens</div><div className="fin-card-value" style={{color:"#1d4ed8"}}>{totais.ti.toLocaleString("pt-BR")}</div></div>
            <div className="fin-card"><div className="fin-card-title">SKUs e Posicoes</div><div className="fin-card-value">{totais.skus}</div></div>
          </div>
          <div className="sec-title">Curva ABC</div>
          <div className="fin-grid">
            {["A","B","C"].map(c=>{
              const itens=allCells.filter(r=>r.curva===c);
              const valor=itens.reduce((s,r)=>(parseFloat(r.qtd)||0)*(parseFloat(r.valorUnit)||0)+s,0);
              const pct=totais.vt>0?(valor/totais.vt*100).toFixed(1):0;
              const clr={A:"#dc2626",B:"#d97706",C:"#16a34a"}[c];
              return <div key={c} className="fin-card"><div className="fin-card-title">Curva {c} - {itens.length} posicoes</div><div className="fin-card-value" style={{color:clr}}>R$ {valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div><div className="fin-card-sub">{pct}% do valor total</div><div className="prog-bar"><div className="prog-fill" style={{width:`${pct}%`,background:clr}}></div></div></div>;
            })}
          </div>
          <div className="sec-title">Por Area</div>
          <div className="fin-grid">
            {[["seufull","Seu Full - Ruas 1-2","#1d4ed8"],["mianofix","Mianofix - Ruas 3-5","#b45309"],["flex","Estoque Flex","#1d4ed8"],["full","Full Pronto","#15803d"]].map(([tipo,label,clr])=>{
              const itens=allCells.filter(r=>r.tipo===tipo);
              const valor=itens.reduce((s,r)=>(parseFloat(r.qtd)||0)*(parseFloat(r.valorUnit)||0)+s,0);
              const pct=totais.vt>0?(valor/totais.vt*100).toFixed(1):0;
              return <div key={tipo} className="fin-card"><div className="fin-card-title">{label}</div><div className="fin-card-value" style={{color:clr}}>{itens.length} itens</div><div className="fin-card-sub">R$ {valor.toLocaleString("pt-BR",{minimumFractionDigits:2})} - {pct}%</div><div className="prog-bar"><div className="prog-fill" style={{width:`${pct}%`,background:clr}}></div></div></div>;
            })}
          </div>
          <div style={{background:"#fefce8",border:"2px solid #fde047",borderRadius:"10px",padding:"18px 22px",fontSize:"14px",color:"#854d0e",lineHeight:1.8,fontWeight:600}}>
            Regra de Ouro: Curva A sempre nos Andares 1 e 2. Andares 3 e 4 para Curva C.
          </div>
        </>}
      </div>

      {sel&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setSel(null)}}>
        <div className="modal">
          <div className="modal-hdr palet">
            <div className="modal-hdr-id">{sel}</div>
            <div className="modal-hdr-sub">{selRuaObj?.tipo==="seufull"?"Area Seu Full":"Area Mianofix / Iscali"} - Lado {selLado} - Andar {selAndar}</div>
          </div>
          <div className="modal-body">
            {alertaAlto&&<div className="alerta">ANDAR {selAndar} - Nao alocar Curva A. Use Curva B ou C.</div>}
            <div className="frow">
              <div className="field"><label>SKU / Codigo</label><input value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} placeholder="EX-001"/></div>
              <div className="field"><label>Curva ABC</label><select value={form.curva} onChange={e=>setForm(f=>({...f,curva:e.target.value}))}><option value="">Selecionar...</option><option value="A">A - Alto giro</option><option value="B">B - Medio giro</option><option value="C">C - Baixo giro</option></select></div>
            </div>
            <div className="field"><label>Nome do Produto</label><input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Descricao do produto"/></div>
            <div className="frow">
              <div className="field"><label>Quantidade</label><input type="number" value={form.qtd} onChange={e=>setForm(f=>({...f,qtd:e.target.value}))} placeholder="0"/></div>
              <div className="field"><label>Valor Unitario (R$)</label><input type="number" value={form.valorUnit} onChange={e=>setForm(f=>({...f,valorUnit:e.target.value}))} placeholder="0,00"/></div>
            </div>
            {selRuaObj?.tipo==="seufull"&&<div className="field"><label>Loja de Origem</label><input value={form.loja} onChange={e=>setForm(f=>({...f,loja:e.target.value}))} placeholder="Nome da loja cliente"/></div>}
            <div className="field"><label>Observacao</label><input value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} placeholder="Notas..."/></div>
            {form.qtd&&form.valorUnit&&<div className="vt-box">Valor total: R$ {((parseFloat(form.qtd)||0)*(parseFloat(form.valorUnit)||0)).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>}
          </div>
          <div className="modal-foot">
            <button className="btn btn-danger" onClick={clearCell}>Limpar</button>
            <button className="btn btn-ghost" onClick={()=>setSel(null)}>Cancelar</button>
            {cells[sel]?.sku && <button className="btn" style={{background:"#f59e0b",color:"#fff"}} onClick={()=>printLabel(sel,cells[sel],selRuaObj?.tipo)}>Imprimir Etiqueta</button>}
            <button className="btn btn-primary" onClick={saveCell}>Salvar na Nuvem</button>
          </div>
        </div>
      </div>}

      {areaModal&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setAreaModal(null)}}>
        <div className="modal">
          <div className={`modal-hdr ${areaModal.tipo}`}>
            <div className="modal-hdr-id">{areaModal.slot}</div>
            <div className="modal-hdr-sub">{areaModal.tipo==="flex"?"Estoque Flex - gaveta":"Full Pronto - palete"}</div>
          </div>
          <div className="modal-body">
            <div className="field"><label>Descricao / Produto</label><input value={areaForm.descricao} onChange={e=>setAreaForm(f=>({...f,descricao:e.target.value}))} placeholder="O que esta aqui..."/></div>
            <div className="field"><label>Loja / Cliente</label><input value={areaForm.loja} onChange={e=>setAreaForm(f=>({...f,loja:e.target.value}))} placeholder="Nome da loja ou cliente"/></div>
            <div className="frow">
              <div className="field"><label>Quantidade de Itens</label><input type="number" value={areaForm.qtd} onChange={e=>setAreaForm(f=>({...f,qtd:e.target.value}))} placeholder="0"/></div>
              <div className="field"><label>Valor Unitario (R$)</label><input type="number" value={areaForm.valorUnit} onChange={e=>setAreaForm(f=>({...f,valorUnit:e.target.value}))} placeholder="0,00"/></div>
            </div>
            {areaModal?.tipo==="full"&&<div className="frow">
              <div className="field"><label>Numero de Paletes</label><input type="number" value={areaForm.paletes} onChange={e=>setAreaForm(f=>({...f,paletes:e.target.value}))} placeholder="1" min="1"/></div>
              <div className="field"><label>Data de Entrada</label><input type="date" value={areaForm.dataEntrada} onChange={e=>setAreaForm(f=>({...f,dataEntrada:e.target.value}))}/></div>
            </div>}
            <div className="field"><label>Observacao</label><input value={areaForm.obs} onChange={e=>setAreaForm(f=>({...f,obs:e.target.value}))} placeholder="Pedido, data, notas..."/></div>
            {areaForm.qtd&&areaForm.valorUnit&&<div className="vt-box">Valor total: R$ {((parseFloat(areaForm.qtd)||0)*(parseFloat(areaForm.valorUnit)||0)).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>}
          </div>
          <div className="modal-foot">
            <button className="btn btn-danger" onClick={clearArea}>Limpar</button>
            <button className="btn btn-ghost" onClick={()=>setAreaModal(null)}>Cancelar</button>
            <button className={`btn ${areaModal.tipo==="full"?"btn-success":"btn-primary"}`} onClick={saveArea}>Salvar na Nuvem</button>
          </div>
        </div>
      </div>}

      {toast&&<div className={`toast${toast.type==="warn"?" warn":""}`}>{toast.msg}</div>}
    </div>
  );
}
