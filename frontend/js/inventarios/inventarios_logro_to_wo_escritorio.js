// ══════════════════════════════════════════════════════════════════
// ETL: Inventarios — Logro → World Office Escritorio
// Módulo: inventarios_logro_to_wo_escritorio.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución: inyecta la opción
// "Logro" en el selector de origen de Inventarios (#inv-sorig), agrega
// su propio slot de archivo ("Lista de Items"), y envuelve
// routeInvETL()/routeInvDownload()/showPg() (definidos en app.js) para
// interceptar el flujo SOLO cuando el origen elegido es "Logro" y el
// destino "World Office Escritorio". Para destino Cloud deja pasar
// hacia el archivo hermano inventarios_logro_to_wo_cloud.js.
//
// AUTOCONTENIDO: no depende de ningún helper de
// inventarios_siigo_nube_to_wo_escritorio.js, inventarios_siimed_erp_
// to_wo_escritorio.js, ni de sus hermanos Cloud — todos los nombres de
// función/variable llevan el prefijo "invLogroInvEsc"/"INV_LOGRO_INV_ESC_"
// para no colisionar con las funciones globales `invSetStep`/`invLog`/
// `INV_COLS`/etc. que ya existen en el archivo original de Siigo Nube
// (¡ojo! esos son `function`/`let` de nivel superior — redeclararlos
// con el mismo nombre los reemplazaría silenciosamente). Tampoco usa
// el mismo estado compartido que los módulos de SIIMED
// (window.__SIIMED_INV_S) ni el de Terceros de Logro (window.__LOGRO_S)
// — usa su propia clave window.__LOGRO_INV_S. Solo depende de
// utilidades verdaderamente globales de la app: api, AUTH (de app.js).
//
// NO DEPENDE DEL NOMBRE DEL ARCHIVO: la fila de encabezados se ubica
// buscando en las primeras filas una que contenga las columnas "ítem"
// y "descripción".
//
// ESTRUCTURA DEL ARCHIVO DE ORIGEN ("Lista De Items" de Logro): un
// archivo plano de una sola hoja, encabezados en la fila 1: Categoría,
// Ítem (código), Descripción, Tipo Ítem (Inventariable/Servicio),
// Precio Vta. (única columna de precio — a diferencia de SIIMED que
// trae hasta 12, Logro solo trae una, por eso este módulo NO necesita
// el modal de selección de columnas de precio), IVA Vta. (viene vacía
// en el export típico), IVA Compra (19.00%/5.00%/EXCLUIDO/EXENTO — la
// que realmente trae el dato), ICO Vta./ICO Comp. (impoconsumo, si
// aplica), Ret., Cant. Disp. (existencia actual), Estado
// (Activo/Inactivo).
//
// DECISIONES DOCUMENTADAS (confirmadas contigo antes de escribir este
// archivo, o sin dato de origen — avisa si tu caso necesita otro
// criterio):
//   • IVA: se usa "IVA Compra" (la columna con dato real — "IVA Vta."
//     viene vacía en el export) — decisión tuya explícita. Se mapea
//     texto→categoría: "19.00%"/"5.00%" (cualquier % > 0) → Gravado,
//     "EXCLUIDO" → Excluido, "EXENTO" → Exento, vacío → No Gravados.
//     Si hay Impoconsumo (ICO Vta./ICO Comp.) el producto se marca
//     Impoconsumo y el IVA pasa a No Gravados (igual que en los demás
//     módulos de Inventarios).
//   • Cant. Disp. (existencia actual): NO se migra — decisión tuya
//     explícita. Ninguna plantilla de creación de productos de World
//     Office tiene un campo de "existencia actual" (solo umbrales:
//     Exis. Máxima/Mínima, Punto de Reorden), así que el producto se
//     crea sin existencia, igual que con Siigo Nube y SIIMED — la
//     existencia real se carga después por otro proceso.
//   • Precio: una sola columna ("Precio Vta.") → Precio 1. No hay
//     modal de selección de precios porque no hay ambigüedad posible.
//   • Grupo Uno = Categoría (Logro solo trae un nivel de agrupación,
//     a diferencia de SIIMED que trae dos — Grupo Dos queda vacío).
//   • Unid. Medida: el archivo de Logro no trae columna de unidad de
//     medida por producto → se usa "Unidad" fijo (igual que Siigo
//     Nube, que tampoco trae este dato).
//   • Ret. (retención): no se migra — ninguna plantilla de creación
//     de productos de World Office tiene un campo de retención para
//     inventarios (es un dato de facturación/terceros, no de producto).
//   • No hay columna de código de barras, referencia, marca ni
//     descripción larga en el archivo de Logro → esos campos quedan
//     vacíos (Código Barras, Código Internacional, Personalizado 1/2,
//     Observaciones).
//   • Tipo Ítem: solo se vio "Inventariable" en tu archivo de muestra,
//     pero por si Logro también exporta "Servicio" en otros catálogos,
//     se detecta por texto ("servicio" en el valor) → Servicio; todo
//     lo demás (incluye "Inventariable") → Producto.
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const INV_LOGRO_ESC_S = { file:null };
  let INV_LOGRO_ESC_WB = null;
  const INV_LOGRO_ESC_LOG = [];
  const INV_LOGRO_ESC_EXCL = [];

  // ── UI helpers propios (copia con prefijo — ver nota de cabecera) ──
  function invLogroInvEscLog(msg,lvl,fase){
    const ts=new Date().toISOString();
    INV_LOGRO_ESC_LOG.push({ts,fase:fase||'',lvl:lvl||'i',msg});
    const panel=document.getElementById('inv-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+='<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop=panel.scrollHeight;
  }
  function invLogroInvEscSleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function invLogroInvEscSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('inv-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('inv-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function invLogroInvEscSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('inv-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function invLogroInvEscSetPct(pct,msg){
    const pb=document.getElementById('inv-pbar');
    const pp=document.getElementById('inv-ppct');
    const ph=document.getElementById('inv-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }
  function invLogroInvNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function invLogroInvLimpiarNum(v){
    if(v===null||v===undefined||v==='')return 0;
    const n=parseFloat(String(v).replace(/[^0-9.,\-]/g,'').replace(',','.'));
    return isNaN(n)?0:n;
  }

  function invLogroInvMapActivo(v){
    const k=invLogroInvNorm(v);
    if(k.includes('inactivo'))return 0;
    if(k.includes('activo'))return -1;
    return -1; // sin dato → activo por defecto
  }
  function invLogroInvEsServicio(tipo){
    return invLogroInvNorm(tipo).includes('servicio');
  }

  // ── IVA / Impoconsumo — el archivo de Logro trae el IVA como texto
  //    en la columna "IVA Compra" (19.00%, EXCLUIDO, EXENTO, o vacío),
  //    y el Impoconsumo en columnas separadas (ICO Vta./ICO Comp.), a
  //    diferencia de Siigo Nube que codifica todo en una sola columna
  //    ("IVA 19%", "Impoconsumo 8%"). ─────────────────────────────────
  function invLogroInvEsImpo(icoVta,icoComp){
    return invLogroInvLimpiarNum(icoVta)>0 || invLogroInvLimpiarNum(icoComp)>0;
  }
  function invLogroInvIvaEsc(ivaTxt,esImpo){
    if(esImpo) return {tipo:'No Gravados',valor:0};
    const k=invLogroInvNorm(ivaTxt);
    if(k.includes('exento')) return {tipo:'Exento',valor:0};
    if(k.includes('excluido')) return {tipo:'Excluido',valor:0};
    const n=invLogroInvLimpiarNum(ivaTxt);
    if(n>0) return {tipo:'Gravado',valor:n/100};
    return {tipo:'No Gravados',valor:0}; // sin dato → No Gravados
  }

  // ── 88 columnas destino — copia idéntica de la plantilla WO
  //    Escritorio de Inventarios (mismo orden que INV_COLS del
  //    módulo de Siigo Nube) ───────────────────────────────────────
  const INV_LOGRO_ESC_COLS = [
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

  function invLogroInvEscGenCod(nombre,usados){
    if(!nombre||!nombre.trim())return '';
    const words=(nombre.trim().match(/\w+/g)||[]);
    if(!words.length)return '';
    let base=(words.length===1?words[0].substring(0,3):words.map(w=>w.substring(0,3)).join('')).toUpperCase();
    let cod=base,n=1;
    while(usados.has(cod)){cod=base+n;n++;}
    return cod;
  }
  function invLogroInvEscBuildGrupos(rows){
    const g1Map=new Map();
    const u1=new Set();
    rows.forEach(r=>{
      const g1=String(r['Grupo Uno']||'').trim();
      if(g1&&!g1Map.has(g1)){const c=invLogroInvEscGenCod(g1,u1);if(c){u1.add(c);g1Map.set(g1,c);}}
    });
    return{
      g1:[...g1Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n}))
    };
  }

  // ── Lectura del Excel — detecta la fila de encabezados buscando
  //    "ÍTEM" + "DESCRIPCIÓN" en las primeras filas (tolera filas de
  //    metadatos previas), no depende del nombre del archivo. ────────
  async function invLogroInvEscReadFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          let hi=-1;
          for(let i=0;i<Math.min(all.length,20);i++){
            const rn=(all[i]||[]).map(v=>invLogroInvNorm(v));
            if(rn.includes('item')&&rn.includes('descripcion')){hi=i;break;}
          }
          if(hi<0) return reject(new Error('No se encontró la fila de encabezados (se esperaban columnas "Ítem" y "Descripción").'));
          const hdrs=all[hi].map(v=>String(v||'').trim());
          const rows=all.slice(hi+1).filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined));
          resolve({hdrs,rows});
        }catch(err){reject(err);}
      };
      reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // PIPELINE — Logro → World Office Escritorio
  // (Sin modal de precios: el archivo de Logro solo trae una
  // columna de precio, "Precio Vta.", así que no hay nada que elegir.)
  // ══════════════════════════════════════════════════════════════
  async function startInvLogroEscETL(){
    const file = INV_LOGRO_ESC_S.file || (window.__LOGRO_INV_S && window.__LOGRO_INV_S.file);
    if(!file){ alert('Carga el archivo de Logro (Lista de Items).'); return; }

    invLogroInvEscSetStep(3);
    INV_LOGRO_ESC_LOG.length=0; INV_LOGRO_ESC_EXCL.length=0;
    const panel=document.getElementById('inv-logp'); if(panel)panel.innerHTML='';
    invLogroInvEscSetPStep(0); invLogroInvEscSetPct(0,'Iniciando...');
    const t0=Date.now();

    try{
      invLogroInvEscSetPStep(1); invLogroInvEscSetPct(15,'Leyendo archivo...');
      invLogroInvEscLog('📂 Leyendo archivo de Logro...','i','Lectura');
      await invLogroInvEscSleep(30);

      const data = await invLogroInvEscReadFile(file);
      const H=data.hdrs, HN=H.map(invLogroInvNorm);
      const fi=t=>HN.findIndex(h=>h===invLogroInvNorm(t));
      const cCod=fi('item'), cNom=fi('descripcion'), cCateg=fi('categoria');
      const cTipo=fi('tipo item'), cPrecio=fi('precio vta.'), cIvaComp=fi('iva compra');
      const cIcoVta=fi('ico vta.'), cIcoComp=fi('ico comp.'), cEstado=fi('estado');

      invLogroInvEscLog(`   Cols → Ítem[${cCod}] Descripción[${cNom}] IVA Compra[${cIvaComp}] Precio Vta.[${cPrecio}]`,'i','Lectura');
      invLogroInvEscLog(`   ${data.rows.length} registros encontrados`,'i','Lectura');

      invLogroInvEscSetPStep(2); invLogroInvEscSetPct(35,'Consolidando...');
      invLogroInvEscLog('🔗 Consolidando registros...','i','Consolidación');
      await invLogroInvEscSleep(30);

      const seen=new Set(), out=[], defaults=[];
      const total=data.rows.length;

      for(const r of data.rows){
        const cod = cCod>=0 ? String(r[cCod]||'').trim() : '';
        const nombre = cNom>=0 ? String(r[cNom]||'').trim() : '';
        if(!cod){ INV_LOGRO_ESC_EXCL.push({cod:'',nom:nombre,motivo:'Sin código'}); continue; }
        if(seen.has(cod)){ INV_LOGRO_ESC_EXCL.push({cod,nom:nombre,motivo:'Código duplicado'}); continue; }
        seen.add(cod);

        const categRaw = cCateg>=0 ? String(r[cCateg]||'').trim() : '';
        const tipoRaw = cTipo>=0 ? String(r[cTipo]||'').trim() : 'Inventariable';
        const precioRaw = cPrecio>=0 ? r[cPrecio] : 0;
        const ivaCompRaw = cIvaComp>=0 ? r[cIvaComp] : '';
        const icoVtaRaw = cIcoVta>=0 ? r[cIcoVta] : 0;
        const icoCompRaw = cIcoComp>=0 ? r[cIcoComp] : 0;
        const estadoRaw = cEstado>=0 ? r[cEstado] : 'Activo';

        const activoVal = invLogroInvMapActivo(estadoRaw);
        const esServicio = invLogroInvEsServicio(tipoRaw);
        const esImpo = invLogroInvEsImpo(icoVtaRaw,icoCompRaw);
        const ivaInfo = invLogroInvIvaEsc(ivaCompRaw, esImpo);
        const pctImpoVal = esImpo ? (invLogroInvLimpiarNum(icoVtaRaw)||invLogroInvLimpiarNum(icoCompRaw)) : '';

        if(!estadoRaw) defaults.push({cod,nombre,campo:'Activo',valor:'-1',motivo:'Estado vacío → activo'});
        if(!ivaCompRaw && !esImpo) defaults.push({cod,nombre,campo:'Iva / Tipo Iva',valor:'0 / No Gravados',motivo:'Sin impuesto en origen (IVA Compra vacío)'});

        const row = {
          'Código': cod,
          'Descripción': nombre,
          'Activo': activoVal,
          'Exis. Máxima': 0,
          'Exis. Mínima': 0,
          'Punto Reorden': 0,
          'Unid. Medida': 'Unidad',
          'Precio 1': invLogroInvLimpiarNum(precioRaw),
          'Precio 2':0,'Precio 3':0,'Precio 4':0,
          'Grupo Uno': categRaw||'',
          'Iva ': ivaInfo.valor,
          'Tipo Iva': ivaInfo.tipo,
          'Clasificación': esServicio?'Servicio':'Producto',
          'Clasificación Niif': esServicio?'Servicio':'Producto',
          'Producto': esServicio?0:-1,
          'Facturar sin Existen.': -1,
          'Pertenece Produc.': '',
          'Producto Proceso': '',
          'Maneja Seriales': 0,
          'Observaciones': null,
          'Verificar Utilidad': 0,
          'Utilidad Estimada': '',
          'Arancel': '',
          'Impoconsumo': esImpo?-1:'',
          'Porcentaje de impoconsumo': esImpo?pctImpoVal:'',
          'ImpoConsumo al Costo': '',
          'Iva Mayor Vr al costo': '',
          'Gasto que afecta el Costo': '',
          'Centro Costos': '',
          'Código Barras': '',
          'Favorito POS': '','Imagen POS':'','Impresora':'','Ocultar Imprimir':'',
          'Código Internacional': '',
          'Grupo Dos': '',
          'Grupo Tres':'','Grupo Cuatro':'','Grupo Cinco':'','Grupo Seis':'',
          'Grupo Siete':'','Grupo Ocho':'','Grupo Nueve':'','Grupo Diez':'',
          'Precio 5':0,'Precio 6':0,'Precio 7':0,'Precio 8':0,'Precio 9':0,
          'Precio 10':0,'Precio 11':0,'Precio 12':0,'Precio 13':0,'Precio 14':0,
          'Precio 15':0,'Precio 16':0,'Precio 17':0,'Precio 18':0,'Precio 19':0,
          'Precio 20':0,'Precio 21':0,'Precio 22':0,'Precio 23':0,'Precio 24':0,
          'Precio 25':0,'Precio 26':0,'Precio 27':0,'Precio 28':0,'Precio 29':0,
          'Precio 30':0,
          'Personalizado 1': '',
          'Personalizado 2': '',
          'Personalizado 3':'','Personalizado 4':'','Personalizado 5':'',
          'Personalizado 6':'','Personalizado 7':'','Personalizado 8':'',
          'Personalizado 9':'','Personalizado 10':'','Personalizado 11':'',
          'Personalizado 12':'','Personalizado 13':'','Personalizado 14':'',
          'Personalizado 15':'','Código Centro Costos':''
        };

        out.push(row);
      }

      invLogroInvEscLog(`✅ ${out.length} registros transformados`,'o','Consolidación');
      if(INV_LOGRO_ESC_EXCL.length) invLogroInvEscLog(`   ⚠ ${INV_LOGRO_ESC_EXCL.length} excluidos`,'w','Consolidación');

      invLogroInvEscSetPStep(4); invLogroInvEscSetPct(85,'Generando Excel...');
      invLogroInvEscLog('📊 Construyendo archivo Excel...','i','Escritura');
      await invLogroInvEscSleep(30);

      INV_LOGRO_ESC_WB = invLogroInvEscBuildWB(out, INV_LOGRO_ESC_LOG, {registros_entrada:total,registros_salida:out.length}, INV_LOGRO_ESC_EXCL, defaults);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      invLogroInvEscSetPct(100,'¡Listo!'); invLogroInvEscSetPStep(5);
      invLogroInvEscLog(`✅ Excel listo en ${dur}s — ${out.length} productos`,'o','Escritura');

      const fn = invLogroInvEscBuildFN();
      const fnEl=document.getElementById('inv-dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('inv-dl-dest'); if(lbl) lbl.textContent='Para importar en World Office Escritorio';
      const stIn=document.getElementById('inv-st-in'); if(stIn) stIn.textContent=total;
      const stOk=document.getElementById('inv-st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'Logro', dest_soft:'World Office Escritorio',
          module:'Inventarios', records_in:total, records_out:out.length,
          errors:0, warnings:INV_LOGRO_ESC_EXCL.length, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      invLogroInvEscSetStep(4);
    }catch(err){
      invLogroInvEscLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
      alert('No se pudo procesar el archivo: '+err.message);
    }
  }

  function invLogroInvEscBuildFN(){
    const d=new Date();
    return 'inventarios_logro_wo_escritorio_'+d.getFullYear()+'_'+String(d.getMonth()+1).padStart(2,'0')+'_'+String(d.getDate()).padStart(2,'0')+'.xlsx';
  }

  function invLogroInvEscBuildWB(rows,logEntries,stats,excluded,defaults){
    const wb=XLSX.utils.book_new();

    const aoa=[INV_LOGRO_ESC_COLS.slice()];
    rows.forEach(r=>aoa.push(INV_LOGRO_ESC_COLS.map(c=>{const v=r[c];return(v===undefined||v==='')?null:(v??null);})));
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

  function invLogroInvEscDoDownload(){
    if(!INV_LOGRO_ESC_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    try{ XLSX.writeFile(INV_LOGRO_ESC_WB, invLogroInvEscBuildFN()); }
    catch(e){ console.error('Download error:',e); alert('Error al descargar: '+e.message); }
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function invLogroInvEscInstall(){
    const sorigEl = document.getElementById('inv-sorig');
    const fslotsEl = document.querySelector('#inv-s2 .fslots');
    if(!sorigEl || !fslotsEl) return;

    // 1) Opción "Logro" en el selector de origen de Inventarios
    //    (comprobación para no duplicarla si el módulo Cloud hermano
    //    ya la agregó).
    if(!sorigEl.querySelector('option[value="Logro"]')){
      const opt=document.createElement('option');
      opt.value='Logro'; opt.textContent='Logro';
      sorigEl.appendChild(opt);
    }

    // 2) Slot de archivo propio, compartido con el módulo Cloud
    //    hermano vía window.__LOGRO_INV_S — mismo patrón que ya usan
    //    los módulos de SIIMED entre Escritorio y Cloud (con su propia
    //    clave, distinta de window.__SIIMED_INV_S y de window.__LOGRO_S
    //    que usan los módulos de Terceros de Logro).
    window.__LOGRO_INV_S = window.__LOGRO_INV_S || { file:null };

    if(!document.getElementById('sl-logro-inv')){
      const slotHTML =
        '<div class="fslot" id="sl-logro-inv" style="display:none">'+
          '<input type="file" id="f-logro-inv" accept=".xlsx,.xls" onchange="window.__logroInvOnFile(this)">'+
          '<div class="fs-badge badge-req">Obligatorio</div>'+
          '<div class="fs-ico">📦</div>'+
          '<div class="fs-name">Lista De Items.xlsx</div>'+
          '<div class="fs-desc">Exportación directa de Logro</div>'+
          '<div class="fs-sel" id="nm-logro-inv"></div>'+
        '</div>';
      fslotsEl.insertAdjacentHTML('beforeend', slotHTML);
    }

    window.__logroInvOnFile = window.__logroInvOnFile || function(input){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-logro-inv'), nm=document.getElementById('nm-logro-inv');
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__LOGRO_INV_S.file = f;
      INV_LOGRO_ESC_S.file = f;
    };
    if(window.__LOGRO_INV_S.file) INV_LOGRO_ESC_S.file = window.__LOGRO_INV_S.file;

    // 3) Alternar visibilidad del slot de Siigo Nube/SIIMED vs. el de
    //    Logro según el origen elegido.
    function invLogroInvToggle(){
      const isLogro = sorigEl.value === 'Logro';
      const siigoSlot = document.getElementById('sl-inv-m');
      const siimedSlot = document.getElementById('sl-siimed-inv');
      const logroSlot = document.getElementById('sl-logro-inv');
      if(siigoSlot) siigoSlot.style.display = isLogro ? 'none' : siigoSlot.style.display;
      if(siimedSlot) siimedSlot.style.display = isLogro ? 'none' : siimedSlot.style.display;
      if(logroSlot) logroSlot.style.display = isLogro ? '' : 'none';
      if(isLogro){
        const cardS = document.querySelector('#inv-s2 .card-s');
        if(cardS) cardS.textContent = 'Exportación de Logro';
      }
    }
    sorigEl.addEventListener('change', invLogroInvToggle);
    invLogroInvToggle();

    // 4) routeInvETL(): solo intercepta Logro → Escritorio.
    const _origRouteInvETL = window.routeInvETL;
    window.routeInvETL = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='Logro' && dest==='World Office Escritorio'){
        startInvLogroEscETL();
        return;
      }
      if(typeof _origRouteInvETL==='function') _origRouteInvETL();
    };

    // 5) routeInvDownload(): mismo criterio.
    const _origRouteInvDownload = window.routeInvDownload;
    window.routeInvDownload = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='Logro' && dest==='World Office Escritorio'){ invLogroInvEscDoDownload(); return; }
      if(typeof _origRouteInvDownload==='function') _origRouteInvDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Inventarios (sin
    //    tocar el de Siigo Nube ni el de SIIMED).
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg==='function') _origShowPg(name);
      if(name==='inventarios'){
        setTimeout(()=>{
          INV_LOGRO_ESC_S.file = null;
          INV_LOGRO_ESC_WB = null;
          if(window.__LOGRO_INV_S) window.__LOGRO_INV_S.file = null;
          const slot=document.getElementById('sl-logro-inv'); if(slot) slot.className='fslot';
          const nm=document.getElementById('nm-logro-inv'); if(nm) nm.textContent='';
          const inp=document.getElementById('f-logro-inv'); if(inp) inp.value='';
          invLogroInvToggle();
        },15);
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', invLogroInvEscInstall);
  } else {
    invLogroInvEscInstall();
  }

})();