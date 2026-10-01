// ══════════════════════════════════════════════════════════════════
// ETL: Inventarios — SIIMED ERP → World Office Escritorio
// Módulo: inventarios_siimed_erp_to_wo_escritorio.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución: inyecta la opción
// "SIIMED ERP" en el selector de origen de Inventarios (#inv-sorig),
// agrega su propio slot de archivo ("Exportación Catálogo de
// Productos"), y envuelve routeInvETL()/routeInvDownload()/showPg()
// (definidos en app.js) para interceptar el flujo SOLO cuando el
// origen elegido es "SIIMED ERP" y el destino "World Office
// Escritorio". Para destino Cloud deja pasar hacia el archivo hermano
// inventarios_siimed_erp_to_wo_cloud.js.
//
// AUTOCONTENIDO: no depende de ningún helper de
// inventarios_siigo_nube_to_wo_escritorio.js ni de su hermano Cloud —
// todos los nombres de función/variable llevan el prefijo
// "invSiimedEsc"/"INV_SIIMED_ESC_" para no colisionar con las
// funciones globales `invSetStep`/`invLog`/`INV_COLS`/etc. que ya
// existen en el archivo original de Siigo Nube (¡ojo! esos son
// `function`/`let` de nivel superior — redeclararlos con el mismo
// nombre los reemplazaría silenciosamente y rompería el módulo de
// Siigo Nube). Solo depende de utilidades verdaderamente globales de
// la app: api, AUTH (de app.js).
//
// NO DEPENDE DEL NOMBRE DEL ARCHIVO: la fila de encabezados se ubica
// buscando en las primeras filas una que contenga las columnas
// "PRODUCTO" y "DESCRIPCIÓN" (típico export de SIIMED ERP: primeras
// filas son metadatos — nombre de la empresa, título, fecha,
// "Procesado:" — antes de los encabezados reales).
//
// ESTRUCTURA DEL ARCHIVO DE ORIGEN (Exportación Catálogo de
// Productos.xlsx de SIIMED ERP): PRODUCTO (código), DESCRIPCIÓN,
// REFERENCIA, PRECIO 1..12 (columnas numéricas ya nombradas, a
// diferencia de Siigo que solo trae 2-3 con nombres variables — aun
// así este módulo detecta por texto "precio" en el encabezado, no por
// el nombre exacto, para tolerar variaciones), IVA (número plano:
// 19, 0 — NO es texto "IVA 19%" como en Siigo), STOCK MÁXIMO, STOCK
// MÍNIMO, UNIDAD DE MEDIDA (siglas reales: UNI, AMP, FRA, CAJ...),
// MARCA, EQUIVALENCIA, CÓDIGO DE BARRAS (viene como "0" cuando no
// aplica — se trata como vacío), ESTADO (Activo/Inactivo), TIPO
// PRODUCTO (Producto/Servicio), NOMBRE LÍNEA, NOMBRE GRUPO, VALOR
// IMPOCONSUMO, PORCENTAJE IMPOCONSUMO, DESCRIPCIÓN LARGA.
//
// DECISIONES DOCUMENTADAS (sin dato de origen confiable, o donde
// SIIMED ofrece un dato más rico que el que Siigo Nube usa — avisa si
// tu caso necesita otro criterio):
//   • Precios: modal interactivo (ver invSiimedEscShowPriceModal) para
//     elegir cuáles columnas de precio incluir — igual que pediste,
//     "mismo modal que Cloud" — sin límite práctico de columnas (la
//     plantilla Escritorio soporta hasta 30 precios).
//   • IVA en 0 (sin Impoconsumo): se clasifica como "Exento" (decisión
//     tuya explícita — Siigo Nube usa "Excluido" para IVA 0%, pero
//     SIIMED no distingue Excluido/Exento/No Gravado con IVA=0, así
//     que aquí se usa el criterio que elegiste).
//   • Grupo Uno / Grupo Dos: NOMBRE LÍNEA / NOMBRE GRUPO del archivo
//     de SIIMED (categorías reales de tu catálogo) — más rico que el
//     "Producto/Servicio + Categoría" que usa Siigo Nube, porque
//     SIIMED sí trae estos dos niveles de agrupación.
//   • Unid. Medida: se usa el valor real de "UNIDAD DE MEDIDA" del
//     archivo (UNI, AMP, CAJ...) en vez del "Und." fijo que usa Siigo
//     Nube — porque SIIMED sí trae este dato por producto.
//   • Exis. Máxima: se usa "STOCK MÁXIMO" del archivo (Siigo Nube deja
//     esto en 0 porque su archivo no trae ese dato; SIIMED sí lo trae).
//   • Facturar sin Existen.: siempre activo (-1) — no hay columna
//     "INVENTARIABLE" en el archivo de SIIMED.
//   • Pertenece Produc.: siempre vacío/No — no hay columna "ES
//     INCLUIDO" en el archivo de SIIMED.
//   • Código Internacional: se usa "EQUIVALENCIA" del archivo.
//   • Personalizado 1 = REFERENCIA, Personalizado 2 = MARCA.
//   • Código Barras: si el archivo trae literalmente "0" (SIIMED lo
//     usa como "no aplica"), se deja vacío en vez de migrar "0".
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const INV_SIIMED_ESC_S = { file:null };
  let INV_SIIMED_ESC_WB = null;
  const INV_SIIMED_ESC_LOG = [];
  const INV_SIIMED_ESC_EXCL = [];

  // ── UI helpers propios (copia con prefijo — ver nota de cabecera) ──
  function invSiimedEscLog(msg,lvl,fase){
    const ts=new Date().toISOString();
    INV_SIIMED_ESC_LOG.push({ts,fase:fase||'',lvl:lvl||'i',msg});
    const panel=document.getElementById('inv-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+='<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop=panel.scrollHeight;
  }
  function invSiimedEscSleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function invSiimedEscSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('inv-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('inv-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function invSiimedEscSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('inv-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function invSiimedEscSetPct(pct,msg){
    const pb=document.getElementById('inv-pbar');
    const pp=document.getElementById('inv-ppct');
    const ph=document.getElementById('inv-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }
  function invSiimedNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function invSiimedLimpiarNum(v){
    if(v===null||v===undefined||v==='')return 0;
    const n=parseFloat(String(v).replace(/[^0-9.,\-]/g,'').replace(',','.'));
    return isNaN(n)?0:n;
  }

  // ── Mapeo Unidad de Medida (siglas de SIIMED → texto legible) ─────
  const INV_SIIMED_UNIDADES = {
    'uni':'Unidad','unidad':'Unidad','und':'Unidad',
    'amp':'Ampolla','fra':'Frasco','bol':'Bolsa','rol':'Rollo',
    'tab':'Tableta','sob':'Sobre','par':'Par','caj':'Caja',
    'paq':'Paquete','tub':'Tubo','cap':'Cápsula','disp':'Dispositivo',
    'hora':'Hora','gal':'Galón','kit':'Kit'
  };
  function invSiimedMapUnidad(v){
    const raw=String(v||'').trim();
    if(!raw)return 'Und.';
    const k=invSiimedNorm(raw);
    return INV_SIIMED_UNIDADES[k]||raw;
  }

  function invSiimedMapActivo(v){
    const k=invSiimedNorm(v);
    if(k.includes('inactivo'))return 0;
    if(k.includes('activo'))return -1;
    return -1; // sin dato → activo por defecto
  }
  function invSiimedEsServicio(tipo){
    return invSiimedNorm(tipo).includes('servicio');
  }

  // ── IVA / Impoconsumo — el archivo de SIIMED trae el IVA como
  //    número plano (19, 0), y el Impoconsumo en columnas numéricas
  //    separadas (VALOR IMPOCONSUMO / PORCENTAJE IMPOCONSUMO), a
  //    diferencia de Siigo Nube que codifica todo como texto en una
  //    sola columna ("IVA 19%", "Impoconsumo 8%"). ───────────────────
  function invSiimedEsImpo(valorImpo,pctImpo){
    return invSiimedLimpiarNum(valorImpo)>0 || invSiimedLimpiarNum(pctImpo)>0;
  }
  function invSiimedIvaEsc(ivaNum,esImpo){
    if(esImpo) return {tipo:'No Gravados',valor:0};
    const n=invSiimedLimpiarNum(ivaNum);
    if(n>0) return {tipo:'Gravado',valor:n/100};
    return {tipo:'Exento',valor:0}; // IVA=0 sin Impoconsumo → Exento (decisión del usuario)
  }

  // ── 88 columnas destino — copia idéntica de la plantilla WO
  //    Escritorio de Inventarios (mismo orden que INV_COLS del
  //    módulo de Siigo Nube) ───────────────────────────────────────
  const INV_SIIMED_ESC_COLS = [
    'Código','Descripción','Activo','Exis. Máxima','Exis. Mínima',
    'Punto Reorden','Unid. Medida','Precio 1','Precio 2','Precio 3',
    'Precio 4','Grupo Uno','Iva ','Tipo Iva','Clasificación',
    'Clasificación Niif','Producto','Facturar sin Existen.','Pertenece Produc.',
    'Producto Proceso','Maneja Seriales','Observaciones','Verificar Utilidad',
    'Utilidad Estimada','Arancel','Impoconsumo','Porcentaje de impoconsumo',
    'ImpoConsumo al Costo','Iva Mayor Vr al costo','Gasto que afecta el Costo',
    'Centro Costos','Código Barras','Favorito POS','Imagen POS','Impresora',
    'Ocultar Imprimir','Código Internacional','Grupo Dos','Grupo Tres',
    'Grupo Cuatro','Grupo Cinco','Grupo Seis','Grupo Siete','Grupo Ocho',
    'Grupo Nueve','Grupo Diez',
    'Precio 5','Precio 6','Precio 7','Precio 8','Precio 9','Precio 10',
    'Precio 11','Precio 12','Precio 13','Precio 14','Precio 15','Precio 16',
    'Precio 17','Precio 18','Precio 19','Precio 20','Precio 21','Precio 22',
    'Precio 23','Precio 24','Precio 25','Precio 26','Precio 27','Precio 28',
    'Precio 29','Precio 30',
    'Personalizado 1','Personalizado 2','Personalizado 3','Personalizado 4',
    'Personalizado 5','Personalizado 6','Personalizado 7','Personalizado 8',
    'Personalizado 9','Personalizado 10','Personalizado 11','Personalizado 12',
    'Personalizado 13','Personalizado 14','Personalizado 15','Código Centro Costos'
  ];

  function invSiimedEscGenCod(nombre,usados){
    if(!nombre||!nombre.trim())return '';
    const words=(nombre.trim().match(/\w+/g)||[]);
    if(!words.length)return '';
    let base=(words.length===1?words[0].substring(0,3):words.map(w=>w.substring(0,3)).join('')).toUpperCase();
    let cod=base,n=1;
    while(usados.has(cod)){cod=base+n;n++;}
    return cod;
  }
  function invSiimedEscBuildGrupos(rows){
    const g1Map=new Map(),g2Map=new Map();
    const u1=new Set(),u2=new Set();
    rows.forEach(r=>{
      const g1=String(r['Grupo Uno']||'').trim();
      const g2=String(r['Grupo Dos']||'').trim();
      if(g1&&!g1Map.has(g1)){const c=invSiimedEscGenCod(g1,u1);if(c){u1.add(c);g1Map.set(g1,c);}}
      if(g2&&!g2Map.has(g2)){const c=invSiimedEscGenCod(g2,u2);if(c){u2.add(c);g2Map.set(g2,c);}}
    });
    return{
      g1:[...g1Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n})),
      g2:[...g2Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n}))
    };
  }

  // ── Lectura del Excel — detecta la fila de encabezados buscando
  //    "PRODUCTO" + "DESCRIPCIÓN" en las primeras filas (tolera
  //    filas de metadatos previas: nombre de empresa, título, fecha,
  //    "Procesado:..."), no depende del nombre del archivo. ─────────
  async function invSiimedEscReadFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          let hi=-1;
          for(let i=0;i<Math.min(all.length,20);i++){
            const rn=(all[i]||[]).map(v=>invSiimedNorm(v));
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

  // ── Detección de columnas de precio — cualquier encabezado cuyo
  //    texto normalizado contenga "precio" (tolera variaciones de
  //    nombre, no exige exactamente "PRECIO N"). ─────────────────────
  function invSiimedDetectarColsPrecio(hdrs){
    const excluye=['predeterminado','proveedor','tolerancia'];
    return hdrs
      .map((h,idx)=>({h:String(h||'').trim(),idx}))
      .filter(({h})=>{
        if(!h)return false;
        const k=invSiimedNorm(h);
        if(!k.includes('precio'))return false;
        return !excluye.some(x=>k.includes(x));
      });
  }

  // Estado pendiente entre fases (lectura → modal de precios → pipeline real)
  let _invSiimedEscPending = null;
  let _invSiimedEscPriceSel = null; // [{col, idx, nombre}] en orden

  // ══════════════════════════════════════════════════════════════
  // FASE 1: lee el archivo, detecta columnas de precio candidatas y
  // muestra el modal para que el usuario elija cuáles incluir.
  // ══════════════════════════════════════════════════════════════
  async function startInvSiimedEscETL(){
    const file = INV_SIIMED_ESC_S.file || (window.__SIIMED_INV_S && window.__SIIMED_INV_S.file);
    if(!file){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Productos).'); return; }
    try{
      const data = await invSiimedEscReadFile(file);
      const priceCols = invSiimedDetectarColsPrecio(data.hdrs);
      _invSiimedEscPending = { data, priceCols, t0: Date.now() };
      if(priceCols.length){
        invSiimedEscShowPriceModal(priceCols);
      } else {
        _invSiimedEscPriceSel = [];
        await _runInvSiimedEscETL();
      }
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  // ── Modal: elegir columnas de precio a incluir (sin límite —
  //    la plantilla Escritorio soporta hasta 30 precios) ────────────
  function invSiimedEscShowPriceModal(priceCols){
    const rowsHTML = priceCols.map((c,i)=>`
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;
        border-bottom:1px solid rgba(255,255,255,.1);font-size:12.5px;color:rgba(255,255,255,.9);cursor:pointer">
        <input type="checkbox" id="inv-siimed-esc-price-${i}" checked style="width:16px;height:16px">
        <span>${c.h}</span>
      </label>`).join('');

    let modal = document.getElementById('inv-siimed-esc-price-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'inv-siimed-esc-price-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.invSiimedEscClosePriceModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:480px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto">
          <div style="text-align:center;margin-bottom:18px">
            <div style="font-size:20px;font-weight:700;color:#fff">Columnas de precio a incluir</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">
              Se detectaron ${priceCols.length} columna(s) de precio en el archivo. Desmarca las que no quieras migrar.
            </div>
          </div>
          <div style="max-height:340px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:20px">
            ${rowsHTML}
          </div>
          <div style="display:flex;gap:12px">
            <button onclick="window.invSiimedEscClosePriceModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.invSiimedEscConfirmPriceModal()" style="flex:2;padding:12px;
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
  }
  function invSiimedEscClosePriceModal(){
    const modal=document.getElementById('inv-siimed-esc-price-modal');
    if(modal) modal.style.display='none';
  }
  window.invSiimedEscClosePriceModal = invSiimedEscClosePriceModal;

  async function invSiimedEscConfirmPriceModal(){
    if(!_invSiimedEscPending) return;
    const priceCols = _invSiimedEscPending.priceCols;
    const sel=[];
    priceCols.forEach((c,i)=>{
      const cb=document.getElementById('inv-siimed-esc-price-'+i);
      if(cb && cb.checked) sel.push(c);
    });
    if(sel.length>30){
      alert('Selecciona máximo 30 columnas de precio (la plantilla de Escritorio soporta hasta 30).');
      return;
    }
    _invSiimedEscPriceSel = sel;
    invSiimedEscClosePriceModal();
    await _runInvSiimedEscETL();
  }
  window.invSiimedEscConfirmPriceModal = invSiimedEscConfirmPriceModal;

  // ══════════════════════════════════════════════════════════════
  // FASE 2: PIPELINE real — SIIMED ERP → World Office Escritorio
  // ══════════════════════════════════════════════════════════════
  async function _runInvSiimedEscETL(){
    if(!_invSiimedEscPending){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Productos).'); return; }
    const { data } = _invSiimedEscPending;
    const priceSel = _invSiimedEscPriceSel || [];

    invSiimedEscSetStep(3);
    INV_SIIMED_ESC_LOG.length=0; INV_SIIMED_ESC_EXCL.length=0;
    const panel=document.getElementById('inv-logp'); if(panel)panel.innerHTML='';
    invSiimedEscSetPStep(0); invSiimedEscSetPct(0,'Iniciando...');
    const t0=Date.now();

    try{
      invSiimedEscSetPStep(1); invSiimedEscSetPct(15,'Leyendo archivo...');
      invSiimedEscLog('📂 Leyendo archivo de SIIMED ERP...','i','Lectura');
      await invSiimedEscSleep(30);

      const H=data.hdrs, HN=H.map(invSiimedNorm);
      const fi=t=>HN.findIndex(h=>h===invSiimedNorm(t));
      const cCod=fi('producto'), cNom=fi('descripcion'), cRef=fi('referencia');
      const cIva=fi('iva'), cEstado=fi('estado'), cTipo=fi('tipo producto');
      const cStockMax=fi('stock maximo'), cStockMin=fi('stock minimo');
      const cUnidad=HN.findIndex(h=>h.startsWith('unidad de medida'));
      const cMarca=fi('marca'), cEquiv=fi('equivalencia'), cBarras=fi('codigo de barras');
      const cLinea=fi('nombre linea'), cGrupo=fi('nombre grupo');
      const cImpoVal=fi('valor impoconsumo'), cImpoPct=fi('porcentaje impoconsumo');
      const cDescLarga=fi('descripcion larga');

      invSiimedEscLog(`   Cols → Código[${cCod}] Descripción[${cNom}] IVA[${cIva}] Precios seleccionados: ${priceSel.length}`,'i','Lectura');
      invSiimedEscLog(`   ${data.rows.length} registros encontrados`,'i','Lectura');

      invSiimedEscSetPStep(2); invSiimedEscSetPct(35,'Consolidando...');
      invSiimedEscLog('🔗 Consolidando registros...','i','Consolidación');
      await invSiimedEscSleep(30);

      const seen=new Set(), out=[], defaults=[];
      const total=data.rows.length;

      for(const r of data.rows){
        const cod = cCod>=0 ? String(r[cCod]||'').trim() : '';
        const nombre = cNom>=0 ? String(r[cNom]||'').trim() : '';
        if(!cod){ INV_SIIMED_ESC_EXCL.push({cod:'',nom:nombre,motivo:'Sin código'}); continue; }
        if(seen.has(cod)){ INV_SIIMED_ESC_EXCL.push({cod,nom:nombre,motivo:'Código duplicado'}); continue; }
        seen.add(cod);

        const estadoRaw = cEstado>=0 ? r[cEstado] : 'Activo';
        const tipoRaw = cTipo>=0 ? String(r[cTipo]||'').trim() : 'Producto';
        const ivaRaw = cIva>=0 ? r[cIva] : 0;
        const stockMaxRaw = cStockMax>=0 ? r[cStockMax] : 0;
        const stockMinRaw = cStockMin>=0 ? r[cStockMin] : 0;
        const unidadRaw = cUnidad>=0 ? r[cUnidad] : '';
        const refRaw = cRef>=0 ? String(r[cRef]||'').trim() : '';
        const marcaRaw = cMarca>=0 ? String(r[cMarca]||'').trim() : '';
        const equivRaw = cEquiv>=0 ? String(r[cEquiv]||'').trim() : '';
        const barrasRaw = cBarras>=0 ? String(r[cBarras]||'').trim() : '';
        const lineaRaw = cLinea>=0 ? String(r[cLinea]||'').trim() : '';
        const grupoRaw = cGrupo>=0 ? String(r[cGrupo]||'').trim() : '';
        const impoValRaw = cImpoVal>=0 ? r[cImpoVal] : 0;
        const impoPctRaw = cImpoPct>=0 ? r[cImpoPct] : 0;
        const descLargaRaw = cDescLarga>=0 ? String(r[cDescLarga]||'').trim() : '';

        const activoVal = invSiimedMapActivo(estadoRaw);
        const esServicio = invSiimedEsServicio(tipoRaw);
        const esImpo = invSiimedEsImpo(impoValRaw,impoPctRaw);
        const ivaInfo = invSiimedIvaEsc(ivaRaw, esImpo);
        const pctImpoVal = esImpo ? (invSiimedLimpiarNum(impoPctRaw)||invSiimedLimpiarNum(impoValRaw))/(invSiimedLimpiarNum(impoPctRaw)>1?100:1) : '';

        const barras = (barrasRaw && barrasRaw!=='0') ? barrasRaw : '';

        if(!estadoRaw) defaults.push({cod,nombre,campo:'Activo',valor:'-1',motivo:'Estado vacío → activo'});
        if(!ivaRaw && !esImpo) defaults.push({cod,nombre,campo:'Iva / Tipo Iva',valor:'0 / Exento',motivo:'Sin impuesto en origen'});

        const row = {
          'Código': cod,
          'Descripción': nombre,
          'Activo': activoVal,
          'Exis. Máxima': invSiimedLimpiarNum(stockMaxRaw),
          'Exis. Mínima': invSiimedLimpiarNum(stockMinRaw),
          'Punto Reorden': 0,
          'Unid. Medida': invSiimedMapUnidad(unidadRaw),
          'Precio 1':0,'Precio 2':0,'Precio 3':0,'Precio 4':0,
          'Grupo Uno': lineaRaw||'',
          'Iva ': ivaInfo.valor,
          'Tipo Iva': ivaInfo.tipo,
          'Clasificación': esServicio?'Servicio':'Producto',
          'Clasificación Niif': esServicio?'Servicio':'Producto',
          'Producto': esServicio?0:-1,
          'Facturar sin Existen.': -1,
          'Pertenece Produc.': '',
          'Producto Proceso': '',
          'Maneja Seriales': 0,
          'Observaciones': descLargaRaw||null,
          'Verificar Utilidad': 0,
          'Utilidad Estimada': '',
          'Arancel': '',
          'Impoconsumo': esImpo?-1:'',
          'Porcentaje de impoconsumo': esImpo?pctImpoVal:'',
          'ImpoConsumo al Costo': '',
          'Iva Mayor Vr al costo': '',
          'Gasto que afecta el Costo': '',
          'Centro Costos': '',
          'Código Barras': barras,
          'Favorito POS': '','Imagen POS':'','Impresora':'','Ocultar Imprimir':'',
          'Código Internacional': equivRaw||'',
          'Grupo Dos': grupoRaw||'',
          'Grupo Tres':'','Grupo Cuatro':'','Grupo Cinco':'','Grupo Seis':'',
          'Grupo Siete':'','Grupo Ocho':'','Grupo Nueve':'','Grupo Diez':'',
          'Precio 5':0,'Precio 6':0,'Precio 7':0,'Precio 8':0,'Precio 9':0,
          'Precio 10':0,'Precio 11':0,'Precio 12':0,'Precio 13':0,'Precio 14':0,
          'Precio 15':0,'Precio 16':0,'Precio 17':0,'Precio 18':0,'Precio 19':0,
          'Precio 20':0,'Precio 21':0,'Precio 22':0,'Precio 23':0,'Precio 24':0,
          'Precio 25':0,'Precio 26':0,'Precio 27':0,'Precio 28':0,'Precio 29':0,
          'Precio 30':0,
          'Personalizado 1': refRaw||'',
          'Personalizado 2': marcaRaw||'',
          'Personalizado 3':'','Personalizado 4':'','Personalizado 5':'',
          'Personalizado 6':'','Personalizado 7':'','Personalizado 8':'',
          'Personalizado 9':'','Personalizado 10':'','Personalizado 11':'',
          'Personalizado 12':'','Personalizado 13':'','Personalizado 14':'',
          'Personalizado 15':'','Código Centro Costos':''
        };

        // Precios seleccionados en el modal → Precio 1, Precio 2, ... en
        // el orden en que aparecen en el archivo (hasta 30 slots).
        priceSel.forEach((c,i)=>{
          if(i>=30) return;
          row['Precio '+(i+1)] = invSiimedLimpiarNum(r[c.idx]);
        });

        out.push(row);
      }

      invSiimedEscLog(`✅ ${out.length} registros transformados`,'o','Consolidación');
      if(INV_SIIMED_ESC_EXCL.length) invSiimedEscLog(`   ⚠ ${INV_SIIMED_ESC_EXCL.length} excluidos`,'w','Consolidación');

      invSiimedEscSetPStep(4); invSiimedEscSetPct(85,'Generando Excel...');
      invSiimedEscLog('📊 Construyendo archivo Excel...','i','Escritura');
      await invSiimedEscSleep(30);

      INV_SIIMED_ESC_WB = invSiimedEscBuildWB(out, INV_SIIMED_ESC_LOG, {registros_entrada:total,registros_salida:out.length}, INV_SIIMED_ESC_EXCL, defaults);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      invSiimedEscSetPct(100,'¡Listo!'); invSiimedEscSetPStep(5);
      invSiimedEscLog(`✅ Excel listo en ${dur}s — ${out.length} productos`,'o','Escritura');

      const fn = invSiimedEscBuildFN();
      const fnEl=document.getElementById('inv-dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('inv-dl-dest'); if(lbl) lbl.textContent='Para importar en World Office Escritorio';
      const stIn=document.getElementById('inv-st-in'); if(stIn) stIn.textContent=total;
      const stOk=document.getElementById('inv-st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'SIIMED ERP', dest_soft:'World Office Escritorio',
          module:'Inventarios', records_in:total, records_out:out.length,
          errors:0, warnings:INV_SIIMED_ESC_EXCL.length, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      invSiimedEscSetStep(4);
    }catch(err){
      invSiimedEscLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
    }
  }

  function invSiimedEscBuildFN(){
    const d=new Date();
    return 'inventarios_siimed_erp_wo_escritorio_'+d.getFullYear()+'_'+String(d.getMonth()+1).padStart(2,'0')+'_'+String(d.getDate()).padStart(2,'0')+'.xlsx';
  }

  function invSiimedEscBuildWB(rows,logEntries,stats,excluded,defaults){
    const wb=XLSX.utils.book_new();

    const aoa=[INV_SIIMED_ESC_COLS.slice()];
    rows.forEach(r=>aoa.push(INV_SIIMED_ESC_COLS.map(c=>{const v=r[c];return(v===undefined||v==='')?null:(v??null);})));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Crear Productos y servicios');

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

  function invSiimedEscDoDownload(){
    if(!INV_SIIMED_ESC_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    try{ XLSX.writeFile(INV_SIIMED_ESC_WB, invSiimedEscBuildFN()); }
    catch(e){ console.error('Download error:',e); alert('Error al descargar: '+e.message); }
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function invSiimedEscInstall(){
    const sorigEl = document.getElementById('inv-sorig');
    const fslotsEl = document.querySelector('#inv-s2 .fslots');
    if(!sorigEl || !fslotsEl) return;

    // 1) Opción "SIIMED ERP" en el selector de origen de Inventarios
    //    (comprobación para no duplicarla si el módulo Cloud hermano
    //    ya la agregó).
    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

    // 2) Slot de archivo propio, compartido con el módulo Cloud
    //    hermano vía window.__SIIMED_INV_S — mismo patrón que ya usan
    //    los módulos de Terceros entre Escritorio y Cloud.
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
      INV_SIIMED_ESC_S.file = f;
    };
    if(window.__SIIMED_INV_S.file) INV_SIIMED_ESC_S.file = window.__SIIMED_INV_S.file;

    // 3) Alternar visibilidad del slot de Siigo Nube vs. el de SIIMED
    //    según el origen elegido.
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

    // 4) routeInvETL(): solo intercepta SIIMED ERP → Escritorio.
    const _origRouteInvETL = window.routeInvETL;
    window.routeInvETL = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='SIIMED ERP' && dest==='World Office Escritorio'){
        startInvSiimedEscETL();
        return;
      }
      if(typeof _origRouteInvETL==='function') _origRouteInvETL();
    };

    // 5) routeInvDownload(): mismo criterio.
    const _origRouteInvDownload = window.routeInvDownload;
    window.routeInvDownload = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='SIIMED ERP' && dest==='World Office Escritorio'){ invSiimedEscDoDownload(); return; }
      if(typeof _origRouteInvDownload==='function') _origRouteInvDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Inventarios (sin
    //    tocar invReset()/invCldReset() de Siigo Nube).
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg==='function') _origShowPg(name);
      if(name==='inventarios'){
        setTimeout(()=>{
          INV_SIIMED_ESC_S.file = null;
          INV_SIIMED_ESC_WB = null;
          _invSiimedEscPending = null;
          _invSiimedEscPriceSel = null;
          invSiimedEscClosePriceModal();
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
    document.addEventListener('DOMContentLoaded', invSiimedEscInstall);
  } else {
    invSiimedEscInstall();
  }

})();