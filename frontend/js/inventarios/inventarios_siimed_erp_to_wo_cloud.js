// ══════════════════════════════════════════════════════════════════
// ETL: Inventarios — SIIMED ERP → World Office Cloud
// Módulo: inventarios_siimed_erp_to_wo_cloud.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Hermano de inventarios_siimed_erp_to_wo_escritorio.js pero
// COMPLETAMENTE SEPARADO: no comparte código ni funciones con él,
// solo el File subido por el usuario (vía window.__SIIMED_INV_S.file)
// — igual que ya ocurre entre los módulos Escritorio/Cloud de SIIMED
// ERP en Terceros. Tampoco depende de
// inventarios_siigo_nube_to_wo_cloud.js (ver nota de autocontención
// en el archivo hermano de Escritorio — misma razón: evitar colisión
// con las funciones/variables globales `invCld*`/`INV_CLD_*` que ya
// existen en ese archivo).
//
// Ver inventarios_siimed_erp_to_wo_escritorio.js para el detalle
// completo de la estructura del archivo de origen y las decisiones de
// mapeo documentadas (Grupo Uno/Dos, Unid. Medida, IVA=0→Exento,
// Facturar sin Existencias, etc.) — se repiten aquí adaptadas a la
// plantilla Cloud (43 columnas, "Importación Productos").
//
// PRECIOS: a diferencia de Escritorio (sin límite práctico), la
// plantilla Cloud solo tiene 6 "Listas de Precios" — el modal exige
// elegir máximo 6 de las columnas de precio detectadas.
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const INV_SIIMED_CLD_S = { file:null };
  let INV_SIIMED_CLD_WB = null;
  const INV_SIIMED_CLD_LOG = [];
  const INV_SIIMED_CLD_EXCL = [];

  // ── UI helpers propios (copia con prefijo — ver nota de cabecera) ──
  function invSiimedCldLog(msg,lvl,fase){
    const ts=new Date().toISOString();
    INV_SIIMED_CLD_LOG.push({ts,fase:fase||'',lvl:lvl||'i',msg});
    const panel=document.getElementById('inv-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+='<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop=panel.scrollHeight;
  }
  function invSiimedCldSleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function invSiimedCldSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('inv-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('inv-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function invSiimedCldSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('inv-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function invSiimedCldSetPct(pct,msg){
    const pb=document.getElementById('inv-pbar');
    const pp=document.getElementById('inv-ppct');
    const ph=document.getElementById('inv-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }
  function invSiimedCldNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function invSiimedCldLimpiarNum(v){
    if(v===null||v===undefined||v==='')return '';
    const n=parseFloat(String(v).replace(/[^0-9.,\-]/g,'').replace(',','.'));
    return isNaN(n)?'':Math.round(n*100)/100;
  }

  const INV_SIIMED_CLD_UNIDADES = {
    'uni':'Unidad','unidad':'Unidad','und':'Unidad',
    'amp':'Ampolla','fra':'Frasco','bol':'Bolsa','rol':'Rollo',
    'tab':'Tableta','sob':'Sobre','par':'Par','caj':'Caja',
    'paq':'Paquete','tub':'Tubo','cap':'Cápsula','disp':'Dispositivo',
    'hora':'Hora','gal':'Galón','kit':'Kit'
  };
  function invSiimedCldMapUnidad(v){
    const raw=String(v||'').trim();
    if(!raw)return 'Unidad';
    const k=invSiimedCldNorm(raw);
    return INV_SIIMED_CLD_UNIDADES[k]||raw;
  }
  function invSiimedCldMapActivo(v){
    const k=invSiimedCldNorm(v);
    if(k.includes('inactivo'))return 'No';
    return 'Si';
  }
  function invSiimedCldEsServicio(tipo){
    return invSiimedCldNorm(tipo).includes('servicio');
  }
  function invSiimedCldEsImpo(valorImpo,pctImpo){
    return invSiimedCldLimpiarNum(valorImpo)>0 || invSiimedCldLimpiarNum(pctImpo)>0;
  }
  // IVA plano de SIIMED (19, 0) + Impoconsumo por columnas separadas.
  // IVA=0 sin Impoconsumo → "Exento" (decisión explícita del usuario).
  function invSiimedCldMapImpuesto(ivaNum, esImpo, pctImpo){
    if(esImpo){
      const pct = invSiimedCldLimpiarNum(pctImpo);
      return { tipo:'No Gravado', valor:0, esImpo:true, pctImpo: pct>0?pct:'' };
    }
    const n = invSiimedCldLimpiarNum(ivaNum) || 0;
    if(n>0) return { tipo:'Gravado', valor:n, esImpo:false, pctImpo:'' };
    return { tipo:'Exento', valor:0, esImpo:false, pctImpo:'' };
  }

  function invSiimedCldGenCod(nombre,usados){
    if(!nombre||!nombre.trim())return '';
    const words=(nombre.trim().match(/\w+/g)||[]);
    if(!words.length)return '';
    let base=(words.length===1?words[0].substring(0,3):words.map(w=>w.substring(0,3)).join('')).toUpperCase();
    let cod=base,n=1;
    while(usados.has(cod)){cod=base+n;n++;}
    return cod;
  }
  function invSiimedCldBuildGrupos(rows){
    const g1Map=new Map(),g2Map=new Map();
    const u1=new Set(),u2=new Set();
    rows.forEach(r=>{
      const g1=String(r['Grupo Inventario']||'').trim();
      const g2=String(r['_categ']||'').trim();
      if(g1&&!g1Map.has(g1)){const c=invSiimedCldGenCod(g1,u1);if(c){u1.add(c);g1Map.set(g1,c);}}
      if(g2&&!g2Map.has(g2)){const c=invSiimedCldGenCod(g2,u2);if(c){u2.add(c);g2Map.set(g2,c);}}
    });
    return{
      g1:[...g1Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n})),
      g2:[...g2Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n}))
    };
  }

  // ── 43 columnas destino — copia idéntica de la plantilla WO Cloud
  //    de Inventarios (mismo orden que INV_CLD_COLS del módulo de
  //    Siigo Nube) ────────────────────────────────────────────────
  const INV_SIIMED_CLD_COLS = [
    'Código *','Descripción *','Unidad Medida *','Tipo Impuesto Ventas *',
    'Valor IVA *','Suma al Costo*','Bodega 1 *','Maneja Talla - Color',
    'Maneja Lotes','Maneja Seriales','Ver en POS*','Pertenece a un Producto*',
    'Facturar Sin Existencias','Centro de Costos','Grupo Inventario',
    'Existencia Máxima Permitida','Existencia Mínima Permitida','Existencia Mínima Reorden',
    'Otros impuestos 1','Valor Impuestos 1','Otros Impuestos 2','Valor Impuestos 2',
    'Bodega 2','Bodega 3','Utilidad Estimada','Favoritos POS','Código de Barras',
    'Codigo Fabricación','Activo',
    'Nombre Lista Precios 1','Valor Lista Precios 1',
    'Nombre Lista Precios 2','Valor Lista Precios 2',
    'Nombre Lista Precios 3','Valor Lista Precios 3',
    'Nombre Lista Precios 4','Valor Lista Precios 4',
    'Nombre Lista Precios 5','Valor Lista Precios 5',
    'Nombre Lista Precios 6','Valor Lista Precios 6',
    'Tallas','Colores'
  ];

  // ── Lectura del Excel — misma detección por contenido que el
  //    módulo hermano de Escritorio (no depende del nombre del
  //    archivo) ───────────────────────────────────────────────────
  async function invSiimedCldReadFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          let hi=-1;
          for(let i=0;i<Math.min(all.length,20);i++){
            const rn=(all[i]||[]).map(v=>invSiimedCldNorm(v));
            if(rn.includes('producto')&&rn.includes('descripcion')){hi=i;break;}
          }
          if(hi<0) return reject(new Error('No se encontró la fila de encabezados (se esperaban columnas "PRODUCTO" y "DESCRIPCIÓN").'));
          const hdrs=all[hi].map(v=>String(v||'').trim());
          const rows=all.slice(hi+1).filter(r=>{
            if(!r.some(v=>v!==''&&v!==null&&v!==undefined))return false;
            const first=String(r[0]||'').trim().toLowerCase();
            if(first.startsWith('procesado'))return false;
            return true;
          });
          resolve({hdrs,rows});
        }catch(err){reject(err);}
      };
      reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  function invSiimedDetectarColsPrecioCld(hdrs){
    const excluye=['predeterminado','proveedor','tolerancia'];
    return hdrs
      .map((h,idx)=>({h:String(h||'').trim(),idx}))
      .filter(({h})=>{
        if(!h)return false;
        const k=invSiimedCldNorm(h);
        if(!k.includes('precio'))return false;
        return !excluye.some(x=>k.includes(x));
      });
  }

  // Estado pendiente entre fases (lectura → modal de precios → pipeline real)
  let _invSiimedCldPending = null;
  let _invSiimedCldPriceSel = null; // hasta 6 {col, idx, nombre}

  // ══════════════════════════════════════════════════════════════
  // FASE 1: lee el archivo, detecta columnas de precio candidatas y
  // muestra el modal (máximo 6 — la plantilla Cloud solo tiene 6
  // Listas de Precios).
  // ══════════════════════════════════════════════════════════════
  async function startInvSiimedCldETL(){
    const file = INV_SIIMED_CLD_S.file || (window.__SIIMED_INV_S && window.__SIIMED_INV_S.file);
    if(!file){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Productos).'); return; }
    try{
      const data = await invSiimedCldReadFile(file);
      const priceCols = invSiimedDetectarColsPrecioCld(data.hdrs);
      _invSiimedCldPending = { data, priceCols, t0: Date.now() };
      if(priceCols.length){
        invSiimedCldShowPriceModal(priceCols);
      } else {
        _invSiimedCldPriceSel = [];
        await _runInvSiimedCldETL();
      }
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  // ── Modal: elegir hasta 6 columnas de precio + nombre de la lista
  //    (mismo estilo que invCldShowPriceModal de Siigo Nube → Cloud,
  //    con checkboxes en vez de 3 selects fijos, porque SIIMED trae
  //    hasta 12 columnas candidatas en vez de 2-3) ───────────────────
  function invSiimedCldShowPriceModal(priceCols){
    const rowsHTML = priceCols.map((c,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;
        border-bottom:1px solid rgba(255,255,255,.1)">
        <input type="checkbox" id="inv-siimed-cld-price-chk-${i}" ${i<6?'checked':''}
          onchange="window.invSiimedCldCheckLimit && window.invSiimedCldCheckLimit()"
          style="width:16px;height:16px;flex:none">
        <span style="flex:none;font-size:12.5px;color:rgba(255,255,255,.9);min-width:110px">${c.h}</span>
        <input type="text" id="inv-siimed-cld-price-name-${i}" value="${c.h}"
          placeholder="Nombre de la lista"
          style="flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
          border-radius:6px;padding:6px 8px;color:#fff;font-size:12px;outline:none">
      </div>`).join('');

    let modal = document.getElementById('inv-siimed-cld-price-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'inv-siimed-cld-price-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.invSiimedCldClosePriceModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:560px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto">
          <div style="text-align:center;margin-bottom:18px">
            <div style="font-size:20px;font-weight:700;color:#fff">Configurar Listas de Precios</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">
              Se detectaron ${priceCols.length} columna(s) de precio. World Office Cloud solo admite
              <strong>6 listas de precios</strong> — elige cuáles incluir y, si quieres, cambia el
              nombre con el que aparecerá cada lista.
            </div>
          </div>
          <div id="inv-siimed-cld-price-count" style="text-align:center;font-size:12px;color:#ffd166;margin-bottom:10px"></div>
          <div style="max-height:340px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:20px">
            ${rowsHTML}
          </div>
          <div style="display:flex;gap:12px">
            <button onclick="window.invSiimedCldClosePriceModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.invSiimedCldConfirmPriceModal()" style="flex:2;padding:12px;
              background:linear-gradient(135deg,#5b4fcf,#7c6ef0);
              border:1px solid rgba(255,255,255,.15);border-radius:10px;
              color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:0 4px 16px rgba(91,79,207,.4)">
              ✅ Continuar Migración
            </button>
          </div>
        </div>
      </div>`;
    modal.style.display='block';

    window.invSiimedCldCheckLimit = function(){
      let n=0;
      priceCols.forEach((c,i)=>{ const cb=document.getElementById('inv-siimed-cld-price-chk-'+i); if(cb&&cb.checked)n++; });
      const el=document.getElementById('inv-siimed-cld-price-count');
      if(el) el.textContent = n>6 ? `⚠ ${n} seleccionadas — máximo 6` : `${n} de 6 seleccionadas`;
    };
    window.invSiimedCldCheckLimit();
  }
  function invSiimedCldClosePriceModal(){
    const modal=document.getElementById('inv-siimed-cld-price-modal');
    if(modal) modal.style.display='none';
  }
  window.invSiimedCldClosePriceModal = invSiimedCldClosePriceModal;

  async function invSiimedCldConfirmPriceModal(){
    if(!_invSiimedCldPending) return;
    const priceCols = _invSiimedCldPending.priceCols;
    const sel=[];
    priceCols.forEach((c,i)=>{
      const cb=document.getElementById('inv-siimed-cld-price-chk-'+i);
      if(cb && cb.checked){
        const nmEl=document.getElementById('inv-siimed-cld-price-name-'+i);
        sel.push({ idx:c.idx, nombre: (nmEl&&nmEl.value.trim()) ? nmEl.value.trim() : c.h });
      }
    });
    if(sel.length>6){
      alert('Selecciona máximo 6 columnas de precio (World Office Cloud tiene 6 listas de precios).');
      return;
    }
    _invSiimedCldPriceSel = sel;
    invSiimedCldClosePriceModal();
    await _runInvSiimedCldETL();
  }
  window.invSiimedCldConfirmPriceModal = invSiimedCldConfirmPriceModal;

  // ══════════════════════════════════════════════════════════════
  // FASE 2: PIPELINE real — SIIMED ERP → World Office Cloud
  // ══════════════════════════════════════════════════════════════
  async function _runInvSiimedCldETL(){
    if(!_invSiimedCldPending){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Productos).'); return; }
    const { data } = _invSiimedCldPending;
    const priceSel = _invSiimedCldPriceSel || [];

    invSiimedCldSetStep(3);
    INV_SIIMED_CLD_LOG.length=0; INV_SIIMED_CLD_EXCL.length=0;
    const panel=document.getElementById('inv-logp'); if(panel)panel.innerHTML='';
    invSiimedCldSetPStep(0); invSiimedCldSetPct(0,'Iniciando...');
    const t0=Date.now();

    try{
      invSiimedCldSetPStep(1); invSiimedCldSetPct(15,'Leyendo archivo...');
      invSiimedCldLog('📂 Leyendo archivo de SIIMED ERP...','i','Lectura');
      await invSiimedCldSleep(30);

      const H=data.hdrs, HN=H.map(invSiimedCldNorm);
      const fi=t=>HN.findIndex(h=>h===invSiimedCldNorm(t));
      const cCod=fi('producto'), cNom=fi('descripcion'), cRef=fi('referencia');
      const cIva=fi('iva'), cEstado=fi('estado'), cTipo=fi('tipo producto');
      const cStockMax=fi('stock maximo'), cStockMin=fi('stock minimo');
      const cUnidad=HN.findIndex(h=>h.startsWith('unidad de medida'));
      const cBarras=fi('codigo de barras');
      const cLinea=fi('nombre linea'), cGrupo=fi('nombre grupo');
      const cImpoVal=fi('valor impoconsumo'), cImpoPct=fi('porcentaje impoconsumo');

      invSiimedCldLog(`   Cols → Código[${cCod}] Descripción[${cNom}] IVA[${cIva}] Precios seleccionados: ${priceSel.length}`,'i','Lectura');
      invSiimedCldLog(`   ${data.rows.length} registros encontrados`,'i','Lectura');

      invSiimedCldSetPStep(2); invSiimedCldSetPct(35,'Consolidando...');
      invSiimedCldLog('🔗 Consolidando registros...','i','Consolidación');
      await invSiimedCldSleep(30);

      const seen=new Set(), out=[], defaults=[];
      const total=data.rows.length;

      for(const r of data.rows){
        const cod = cCod>=0 ? String(r[cCod]||'').trim() : '';
        const nom = cNom>=0 ? String(r[cNom]||'').trim() : '';
        if(!cod){ INV_SIIMED_CLD_EXCL.push({cod:'',nom,motivo:'Sin código'}); continue; }
        if(seen.has(cod)){ INV_SIIMED_CLD_EXCL.push({cod,nom,motivo:'Código duplicado'}); continue; }
        seen.add(cod);

        const estadoRaw = cEstado>=0 ? r[cEstado] : 'Activo';
        const tipoRaw = cTipo>=0 ? String(r[cTipo]||'').trim() : 'Producto';
        const ivaRaw = cIva>=0 ? r[cIva] : 0;
        const stockMaxRaw = cStockMax>=0 ? r[cStockMax] : 0;
        const stockMinRaw = cStockMin>=0 ? r[cStockMin] : 0;
        const unidadRaw = cUnidad>=0 ? r[cUnidad] : '';
        const refRaw = cRef>=0 ? String(r[cRef]||'').trim() : '';
        const barrasRaw = cBarras>=0 ? String(r[cBarras]||'').trim() : '';
        const lineaRaw = cLinea>=0 ? String(r[cLinea]||'').trim() : '';
        const grupoRaw = cGrupo>=0 ? String(r[cGrupo]||'').trim() : '';
        const impoValRaw = cImpoVal>=0 ? r[cImpoVal] : 0;
        const impoPctRaw = cImpoPct>=0 ? r[cImpoPct] : 0;

        const activoVal = invSiimedCldMapActivo(estadoRaw);
        const esServicio = invSiimedCldEsServicio(tipoRaw);
        const esImpo = invSiimedCldEsImpo(impoValRaw,impoPctRaw);
        const impuesto = invSiimedCldMapImpuesto(ivaRaw, esImpo, impoPctRaw);
        const barras = (barrasRaw && barrasRaw!=='0') ? barrasRaw : '';

        if(!estadoRaw) defaults.push({cod,nombre:nom,campo:'Activo',valor:'Si',motivo:'Estado vacío → activo'});
        if(!ivaRaw && !esImpo) defaults.push({cod,nombre:nom,campo:'Tipo Impuesto / IVA',valor:'Exento / 0',motivo:'Sin impuesto en origen'});

        const tipoClasi = esServicio?'Servicio':'Producto';
        const ivaKey = impuesto.esImpo ? 'Impoconsumo'
                     : impuesto.tipo==='Gravado' ? `IVA ${impuesto.valor}%`
                     : impuesto.tipo;

        const row = {
          'Código *': cod,
          'Descripción *': nom,
          'Unidad Medida *': invSiimedCldMapUnidad(unidadRaw),
          'Tipo Impuesto Ventas *': impuesto.tipo,
          'Valor IVA *': impuesto.valor,
          'Suma al Costo*': 'No',
          'Bodega 1 *': 'PRINCIPAL',
          'Maneja Talla - Color': 'No',
          'Maneja Lotes': 'No',
          'Maneja Seriales': 'No',
          'Ver en POS*': 'Si',
          'Pertenece a un Producto*': 'No',
          'Facturar Sin Existencias': 'Si',
          'Centro de Costos': '',
          'Grupo Inventario': lineaRaw||tipoRaw||'',
          'Existencia Máxima Permitida': invSiimedCldLimpiarNum(stockMaxRaw)||0,
          'Existencia Mínima Permitida': invSiimedCldLimpiarNum(stockMinRaw)||0,
          'Existencia Mínima Reorden': 0,
          'Otros impuestos 1': impuesto.esImpo?'IMPOCONSUMO':'',
          'Valor Impuestos 1': impuesto.esImpo?impuesto.pctImpo:'',
          'Otros Impuestos 2': '','Valor Impuestos 2': '',
          'Bodega 2': '','Bodega 3': '',
          'Utilidad Estimada': '',
          'Favoritos POS': 'No',
          'Código de Barras': barras,
          'Codigo Fabricación': refRaw||'',
          'Activo': activoVal,
          'Nombre Lista Precios 1':'','Valor Lista Precios 1':'',
          'Nombre Lista Precios 2':'','Valor Lista Precios 2':'',
          'Nombre Lista Precios 3':'','Valor Lista Precios 3':'',
          'Nombre Lista Precios 4':'','Valor Lista Precios 4':'',
          'Nombre Lista Precios 5':'','Valor Lista Precios 5':'',
          'Nombre Lista Precios 6':'','Valor Lista Precios 6':'',
          'Tallas':'','Colores':'',
          '_tipoClasi': tipoClasi,
          '_ivaKey': ivaKey,
          '_categ': grupoRaw
        };

        priceSel.forEach((c,i)=>{
          if(i>=6) return;
          const val = invSiimedCldLimpiarNum(r[c.idx]);
          if(val!==''&&val!==0){
            row['Nombre Lista Precios '+(i+1)] = c.nombre;
            row['Valor Lista Precios '+(i+1)] = val;
          }
        });

        out.push(row);
      }

      invSiimedCldLog(`✅ ${out.length} registros transformados`,'o','Consolidación');
      if(INV_SIIMED_CLD_EXCL.length) invSiimedCldLog(`   ⚠ ${INV_SIIMED_CLD_EXCL.length} excluidos`,'w','Consolidación');

      invSiimedCldSetPStep(4); invSiimedCldSetPct(85,'Generando Excel...');
      invSiimedCldLog('📊 Construyendo archivo Excel...','i','Escritura');
      await invSiimedCldSleep(30);

      const grupos = invSiimedCldBuildGrupos(out);
      INV_SIIMED_CLD_WB = invSiimedCldBuildWB(out, INV_SIIMED_CLD_LOG, {registros_entrada:total,registros_salida:out.length}, INV_SIIMED_CLD_EXCL, defaults, grupos);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      invSiimedCldSetPct(100,'¡Listo!'); invSiimedCldSetPStep(5);
      invSiimedCldLog(`✅ Excel listo en ${dur}s — ${out.length} productos`,'o','Escritura');

      const fn = invSiimedCldBuildFN();
      const fnEl=document.getElementById('inv-dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('inv-dl-dest'); if(lbl) lbl.textContent='Para importar en World Office Cloud';
      const stIn=document.getElementById('inv-st-in'); if(stIn) stIn.textContent=total;
      const stOk=document.getElementById('inv-st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'SIIMED ERP', dest_soft:'World Office Cloud',
          module:'Inventarios', records_in:total, records_out:out.length,
          errors:0, warnings:INV_SIIMED_CLD_EXCL.length, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      invSiimedCldSetStep(4);
    }catch(err){
      invSiimedCldLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
    }
  }

  function invSiimedCldBuildFN(){
    const d=new Date();
    return 'inventarios_siimed_erp_wo_cloud_'+d.getFullYear()+'_'+String(d.getMonth()+1).padStart(2,'0')+'_'+String(d.getDate()).padStart(2,'0')+'.xlsx';
  }

  function invSiimedCldBuildWB(rows,logEntries,stats,excluded,defaults,grupos){
    const wb=XLSX.utils.book_new();

    function buildAoa(subset){
      const aoa=[Array(INV_SIIMED_CLD_COLS.length).fill(''), INV_SIIMED_CLD_COLS.slice()];
      subset.forEach(r=>aoa.push(INV_SIIMED_CLD_COLS.map(c=>{const v=r[c];return v===undefined?'':v??'';})));
      return aoa;
    }

    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(buildAoa(rows)),'Importación Productos');

    const grupos_iva=new Map();
    rows.forEach(r=>{
      const tipo=r['_tipoClasi']||'Producto';
      const ivaK=r['_ivaKey']||'Exento';
      const name=(`${tipo} ${ivaK}`).substring(0,31);
      if(!grupos_iva.has(name))grupos_iva.set(name,[]);
      grupos_iva.get(name).push(r);
    });
    const sortKey=n=>{
      const isServ=n.startsWith('Servicio')?1:0;
      const m=n.match(/(\d+)/); const num=m?parseInt(m[1]):0;
      return `${isServ}_${String(num).padStart(3,'0')}_${n}`;
    };
    [...grupos_iva.entries()]
      .sort((a,b)=>sortKey(a[0]).localeCompare(sortKey(b[0])))
      .forEach(([name,sub])=>{
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(buildAoa(sub)),name);
      });

    try{
      if(grupos){
        const maxLen=Math.max(grupos.g1.length,grupos.g2.length);
        const gAoa=[['Codigo','Grupo 1','','Codigo','Grupo 2']];
        for(let i=0;i<maxLen;i++){
          const g1=grupos.g1[i]||{cod:'',nom:''};
          const g2=grupos.g2[i]||{cod:'',nom:''};
          gAoa.push([g1.cod,g1.nom,'',g2.cod,g2.nom]);
        }
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(gAoa),'Grupos');
      }
    }catch(eg){console.warn('Grupos sheet:',eg);}

    const logsAoa=[['Timestamp','Fase','Nivel','Mensaje']];
    (logEntries||[]).forEach(e=>logsAoa.push([e.ts,e.fase||'',e.lvl==='e'?'ERROR':e.lvl==='w'?'WARN':'INFO',e.msg]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(logsAoa),'Logs');

    const s=stats||{};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Métrica','Valor'],
      ['Registros entrada',s.registros_entrada||0],
      ['Registros salida',rows.length],
      ['Excluidos',excluded?excluded.length:0]
    ]),'Estadísticas');

    const exAoa=[['Código','Nombre','Motivo']];
    (excluded||[]).forEach(e=>exAoa.push([e.cod,e.nom,e.motivo]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(exAoa),'Excluidos');

    if(defaults&&defaults.length){
      const defAoa=[['Código','Nombre','Campo','Valor Asignado','Motivo']];
      defaults.forEach(d=>defAoa.push([d.cod,d.nombre,d.campo,d.valor,d.motivo]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(defAoa),'Campos por Defecto');
    }

    return wb;
  }

  function invSiimedCldDoDownload(){
    if(!INV_SIIMED_CLD_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    XLSX.writeFile(INV_SIIMED_CLD_WB, invSiimedCldBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function invSiimedCldInstall(){
    const sorigEl = document.getElementById('inv-sorig');
    const fslotsEl = document.querySelector('#inv-s2 .fslots');
    if(!sorigEl || !fslotsEl) return;

    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

    window.__SIIMED_INV_S = window.__SIIMED_INV_S || { file:null };

    if(!document.getElementById('sl-siimed-inv')){
      const slotHTML =
        '<div class="fslot" id="sl-siimed-inv" style="display:none">'+
          '<input type="file" id="f-siimed-inv" accept=".xlsx,.xls" onchange="window.__siimedInvOnFile(this)">'+
          '<div class="fs-badge badge-req">Obligatorio</div>'+
          '<div class="fs-ico">📦</div>'+
          '<div class="fs-name">Exportación Catálogo de Productos.xlsx</div>'+
          '<div class="fs-desc">Exportación directa de SIIMED ERP</div>'+
          '<div class="fs-sel" id="nm-siimed-inv"></div>'+
        '</div>';
      fslotsEl.insertAdjacentHTML('beforeend', slotHTML);
    }

    window.__siimedInvOnFile = window.__siimedInvOnFile || function(input){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-siimed-inv'), nm=document.getElementById('nm-siimed-inv');
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__SIIMED_INV_S.file = f;
      INV_SIIMED_CLD_S.file = f;
    };
    // Si el módulo Escritorio hermano ya definió __siimedInvOnFile,
    // aseguramos que también actualice nuestra copia local del File.
    const _prevOnFile = window.__siimedInvOnFile;
    window.__siimedInvOnFile = function(input){
      _prevOnFile(input);
      if(window.__SIIMED_INV_S && window.__SIIMED_INV_S.file) INV_SIIMED_CLD_S.file = window.__SIIMED_INV_S.file;
    };
    if(window.__SIIMED_INV_S.file) INV_SIIMED_CLD_S.file = window.__SIIMED_INV_S.file;

    function invSiimedToggle(){
      const isSiimed = sorigEl.value === 'SIIMED ERP';
      const siigoSlot = document.getElementById('sl-inv-m');
      const siimedSlot = document.getElementById('sl-siimed-inv');
      if(siigoSlot) siigoSlot.style.display = isSiimed ? 'none' : '';
      if(siimedSlot) siimedSlot.style.display = isSiimed ? '' : 'none';
      const cardS = document.querySelector('#inv-s2 .card-s');
      if(cardS) cardS.textContent = isSiimed ? 'Exportación de SIIMED ERP' : 'Exportación de Siigo Nube';
    }
    sorigEl.addEventListener('change', invSiimedToggle);
    invSiimedToggle();

    const _origRouteInvETL = window.routeInvETL;
    window.routeInvETL = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='SIIMED ERP' && dest==='World Office Cloud'){
        startInvSiimedCldETL();
        return;
      }
      if(typeof _origRouteInvETL==='function') _origRouteInvETL();
    };

    const _origRouteInvDownload = window.routeInvDownload;
    window.routeInvDownload = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='SIIMED ERP' && dest==='World Office Cloud'){ invSiimedCldDoDownload(); return; }
      if(typeof _origRouteInvDownload==='function') _origRouteInvDownload();
    };

    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg==='function') _origShowPg(name);
      if(name==='inventarios'){
        setTimeout(()=>{
          INV_SIIMED_CLD_S.file = null;
          INV_SIIMED_CLD_WB = null;
          _invSiimedCldPending = null;
          _invSiimedCldPriceSel = null;
          invSiimedCldClosePriceModal();
          if(window.__SIIMED_INV_S) window.__SIIMED_INV_S.file = null;
          const slot=document.getElementById('sl-siimed-inv'); if(slot) slot.className='fslot';
          const nm=document.getElementById('nm-siimed-inv'); if(nm) nm.textContent='';
          const inp=document.getElementById('f-siimed-inv'); if(inp) inp.value='';
          invSiimedToggle();
        },15);
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', invSiimedCldInstall);
  } else {
    invSiimedCldInstall();
  }

})();