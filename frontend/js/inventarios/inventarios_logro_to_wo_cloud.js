// ══════════════════════════════════════════════════════════════════
// ETL: Inventarios — Logro → World Office Cloud
// Módulo: inventarios_logro_to_wo_cloud.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Hermano de inventarios_logro_to_wo_escritorio.js pero COMPLETAMENTE
// SEPARADO: no comparte código ni funciones con él, solo el File
// subido por el usuario (vía window.__LOGRO_INV_S.file) — igual que ya
// ocurre entre los módulos Escritorio/Cloud de SIIMED ERP y de Logro
// en Terceros. Tampoco depende de inventarios_siigo_nube_to_wo_cloud.js
// ni de inventarios_siimed_erp_to_wo_cloud.js (mismos motivos de
// autocontención que su hermano de Escritorio: evitar colisión con
// funciones/variables globales `invCld*`/`INV_CLD_*`/`invSiimedCld*`/
// `INV_SIIMED_CLD_*` que ya existen en esos archivos).
//
// Ver inventarios_logro_to_wo_escritorio.js para el detalle completo
// de la estructura del archivo de origen y las decisiones de mapeo
// documentadas (IVA Compra, Cant. Disp. no migrada, Unid. Medida fija,
// etc.) — se repiten aquí adaptadas a la plantilla Cloud (43 columnas,
// "Importación Productos").
//
// PRECIOS: el archivo de Logro solo trae UNA columna de precio
// ("Precio Vta."), así que se coloca directo en "Nombre/Valor Lista
// Precios 1" — no hace falta modal de selección (a diferencia de
// SIIMED, que sí lo necesita porque trae hasta 12 columnas candidatas).
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const INV_LOGRO_CLD_S = { file:null };
  let INV_LOGRO_CLD_WB = null;
  const INV_LOGRO_CLD_LOG = [];
  const INV_LOGRO_CLD_EXCL = [];

  // ── UI helpers propios (copia con prefijo — ver nota de cabecera) ──
  function invLogroInvCldLog(msg,lvl,fase){
    const ts=new Date().toISOString();
    INV_LOGRO_CLD_LOG.push({ts,fase:fase||'',lvl:lvl||'i',msg});
    const panel=document.getElementById('inv-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+='<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop=panel.scrollHeight;
  }
  function invLogroInvCldSleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function invLogroInvCldSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('inv-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('inv-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function invLogroInvCldSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('inv-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function invLogroInvCldSetPct(pct,msg){
    const pb=document.getElementById('inv-pbar');
    const pp=document.getElementById('inv-ppct');
    const ph=document.getElementById('inv-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }
  function invLogroInvCldNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function invLogroInvCldLimpiarNum(v){
    if(v===null||v===undefined||v==='')return '';
    const n=parseFloat(String(v).replace(/[^0-9.,\-]/g,'').replace(',','.'));
    return isNaN(n)?'':Math.round(n*100)/100;
  }

  function invLogroInvCldMapActivo(v){
    const k=invLogroInvCldNorm(v);
    if(k.includes('inactivo'))return 'No';
    return 'Si';
  }
  function invLogroInvCldEsServicio(tipo){
    return invLogroInvCldNorm(tipo).includes('servicio');
  }
  function invLogroInvCldEsImpo(icoVta,icoComp){
    return invLogroInvCldLimpiarNum(icoVta)>0 || invLogroInvCldLimpiarNum(icoComp)>0;
  }
  // IVA de Logro viene como texto en "IVA Compra" (19.00%, EXCLUIDO,
  // EXENTO, o vacío) — decisión confirmada: se usa esta columna porque
  // "IVA Vta." viene vacía en el export.
  function invLogroInvCldMapImpuesto(ivaTxt, esImpo, icoVta, icoComp){
    if(esImpo){
      const pct = invLogroInvCldLimpiarNum(icoVta) || invLogroInvCldLimpiarNum(icoComp);
      return { tipo:'No Gravado', valor:0, esImpo:true, pctImpo: pct>0?pct:'' };
    }
    const k = invLogroInvCldNorm(ivaTxt);
    if(k.includes('exento')) return { tipo:'Exento', valor:0, esImpo:false, pctImpo:'' };
    if(k.includes('excluido')) return { tipo:'Excluido', valor:0, esImpo:false, pctImpo:'' };
    const n = invLogroInvCldLimpiarNum(ivaTxt) || 0;
    if(n>0) return { tipo:'Gravado', valor:n, esImpo:false, pctImpo:'' };
    return { tipo:'No Gravado', valor:0, esImpo:false, pctImpo:'' };
  }

  function invLogroInvCldGenCod(nombre,usados){
    if(!nombre||!nombre.trim())return '';
    const words=(nombre.trim().match(/\w+/g)||[]);
    if(!words.length)return '';
    let base=(words.length===1?words[0].substring(0,3):words.map(w=>w.substring(0,3)).join('')).toUpperCase();
    let cod=base,n=1;
    while(usados.has(cod)){cod=base+n;n++;}
    return cod;
  }
  // Logro solo trae un nivel de agrupación (Categoría) — a diferencia
  // de SIIMED que trae dos (Línea/Grupo), así que aquí solo se
  // construye "Grupo 1"; la columna "Grupo 2" de la hoja "Grupos"
  // queda vacía.
  function invLogroInvCldBuildGrupos(rows){
    const g1Map=new Map();
    const u1=new Set();
    rows.forEach(r=>{
      const g1=String(r['Grupo Inventario']||'').trim();
      if(g1&&!g1Map.has(g1)){const c=invLogroInvCldGenCod(g1,u1);if(c){u1.add(c);g1Map.set(g1,c);}}
    });
    return{
      g1:[...g1Map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>({cod:c,nom:n}))
    };
  }

  // ── 43 columnas destino — copia idéntica de la plantilla WO Cloud
  //    de Inventarios (mismo orden que INV_CLD_COLS del módulo de
  //    Siigo Nube) ────────────────────────────────────────────────
  const INV_LOGRO_CLD_COLS = [
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
  async function invLogroInvCldReadFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          let hi=-1;
          for(let i=0;i<Math.min(all.length,20);i++){
            const rn=(all[i]||[]).map(v=>invLogroInvCldNorm(v));
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
  // PIPELINE — Logro → World Office Cloud
  // (Sin modal de precios: una sola columna de precio en el origen.)
  // ══════════════════════════════════════════════════════════════
  async function startInvLogroCldETL(){
    const file = INV_LOGRO_CLD_S.file || (window.__LOGRO_INV_S && window.__LOGRO_INV_S.file);
    if(!file){ alert('Carga el archivo de Logro (Lista de Items).'); return; }

    invLogroInvCldSetStep(3);
    INV_LOGRO_CLD_LOG.length=0; INV_LOGRO_CLD_EXCL.length=0;
    const panel=document.getElementById('inv-logp'); if(panel)panel.innerHTML='';
    invLogroInvCldSetPStep(0); invLogroInvCldSetPct(0,'Iniciando...');
    const t0=Date.now();

    try{
      invLogroInvCldSetPStep(1); invLogroInvCldSetPct(15,'Leyendo archivo...');
      invLogroInvCldLog('📂 Leyendo archivo de Logro...','i','Lectura');
      await invLogroInvCldSleep(30);

      const data = await invLogroInvCldReadFile(file);
      const H=data.hdrs, HN=H.map(invLogroInvCldNorm);
      const fi=t=>HN.findIndex(h=>h===invLogroInvCldNorm(t));
      const cCod=fi('item'), cNom=fi('descripcion'), cCateg=fi('categoria');
      const cTipo=fi('tipo item'), cPrecio=fi('precio vta.'), cIvaComp=fi('iva compra');
      const cIcoVta=fi('ico vta.'), cIcoComp=fi('ico comp.'), cEstado=fi('estado');

      invLogroInvCldLog(`   Cols → Ítem[${cCod}] Descripción[${cNom}] IVA Compra[${cIvaComp}] Precio Vta.[${cPrecio}]`,'i','Lectura');
      invLogroInvCldLog(`   ${data.rows.length} registros encontrados`,'i','Lectura');

      invLogroInvCldSetPStep(2); invLogroInvCldSetPct(35,'Consolidando...');
      invLogroInvCldLog('🔗 Consolidando registros...','i','Consolidación');
      await invLogroInvCldSleep(30);

      const seen=new Set(), out=[], defaults=[];
      const total=data.rows.length;

      for(const r of data.rows){
        const cod = cCod>=0 ? String(r[cCod]||'').trim() : '';
        const nom = cNom>=0 ? String(r[cNom]||'').trim() : '';
        if(!cod){ INV_LOGRO_CLD_EXCL.push({cod:'',nom,motivo:'Sin código'}); continue; }
        if(seen.has(cod)){ INV_LOGRO_CLD_EXCL.push({cod,nom,motivo:'Código duplicado'}); continue; }
        seen.add(cod);

        const categRaw = cCateg>=0 ? String(r[cCateg]||'').trim() : '';
        const tipoRaw = cTipo>=0 ? String(r[cTipo]||'').trim() : 'Inventariable';
        const precioRaw = cPrecio>=0 ? r[cPrecio] : 0;
        const ivaCompRaw = cIvaComp>=0 ? r[cIvaComp] : '';
        const icoVtaRaw = cIcoVta>=0 ? r[cIcoVta] : 0;
        const icoCompRaw = cIcoComp>=0 ? r[cIcoComp] : 0;
        const estadoRaw = cEstado>=0 ? r[cEstado] : 'Activo';

        const activoVal = invLogroInvCldMapActivo(estadoRaw);
        const esServicio = invLogroInvCldEsServicio(tipoRaw);
        const esImpo = invLogroInvCldEsImpo(icoVtaRaw,icoCompRaw);
        const impuesto = invLogroInvCldMapImpuesto(ivaCompRaw, esImpo, icoVtaRaw, icoCompRaw);

        if(!estadoRaw) defaults.push({cod,nombre:nom,campo:'Activo',valor:'Si',motivo:'Estado vacío → activo'});
        if(!ivaCompRaw && !esImpo) defaults.push({cod,nombre:nom,campo:'Tipo Impuesto / IVA',valor:'No Gravado / 0',motivo:'Sin impuesto en origen (IVA Compra vacío)'});

        const tipoClasi = esServicio?'Servicio':'Producto';
        const ivaKey = impuesto.esImpo ? 'Impoconsumo'
                     : impuesto.tipo==='Gravado' ? `IVA ${impuesto.valor}%`
                     : impuesto.tipo;

        const precioVal = invLogroInvCldLimpiarNum(precioRaw);

        const row = {
          'Código *': cod,
          'Descripción *': nom,
          'Unidad Medida *': 'Unidad',
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
          'Grupo Inventario': categRaw||'',
          'Existencia Máxima Permitida': 0,
          'Existencia Mínima Permitida': 0,
          'Existencia Mínima Reorden': 0,
          'Otros impuestos 1': impuesto.esImpo?'IMPOCONSUMO':'',
          'Valor Impuestos 1': impuesto.esImpo?impuesto.pctImpo:'',
          'Otros Impuestos 2': '','Valor Impuestos 2': '',
          'Bodega 2': '','Bodega 3': '',
          'Utilidad Estimada': '',
          'Favoritos POS': 'No',
          'Código de Barras': '',
          'Codigo Fabricación': '',
          'Activo': activoVal,
          'Nombre Lista Precios 1': (precioVal!==''&&precioVal!==0) ? 'Precio Vta.' : '',
          'Valor Lista Precios 1': (precioVal!==''&&precioVal!==0) ? precioVal : '',
          'Nombre Lista Precios 2':'','Valor Lista Precios 2':'',
          'Nombre Lista Precios 3':'','Valor Lista Precios 3':'',
          'Nombre Lista Precios 4':'','Valor Lista Precios 4':'',
          'Nombre Lista Precios 5':'','Valor Lista Precios 5':'',
          'Nombre Lista Precios 6':'','Valor Lista Precios 6':'',
          'Tallas':'','Colores':'',
          '_tipoClasi': tipoClasi,
          '_ivaKey': ivaKey
        };

        out.push(row);
      }

      invLogroInvCldLog(`✅ ${out.length} registros transformados`,'o','Consolidación');
      if(INV_LOGRO_CLD_EXCL.length) invLogroInvCldLog(`   ⚠ ${INV_LOGRO_CLD_EXCL.length} excluidos`,'w','Consolidación');

      invLogroInvCldSetPStep(4); invLogroInvCldSetPct(85,'Generando Excel...');
      invLogroInvCldLog('📊 Construyendo archivo Excel...','i','Escritura');
      await invLogroInvCldSleep(30);

      const grupos = invLogroInvCldBuildGrupos(out);
      INV_LOGRO_CLD_WB = invLogroInvCldBuildWB(out, INV_LOGRO_CLD_LOG, {registros_entrada:total,registros_salida:out.length}, INV_LOGRO_CLD_EXCL, defaults, grupos);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      invLogroInvCldSetPct(100,'¡Listo!'); invLogroInvCldSetPStep(5);
      invLogroInvCldLog(`✅ Excel listo en ${dur}s — ${out.length} productos`,'o','Escritura');

      const fn = invLogroInvCldBuildFN();
      const fnEl=document.getElementById('inv-dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('inv-dl-dest'); if(lbl) lbl.textContent='Para importar en World Office Cloud';
      const stIn=document.getElementById('inv-st-in'); if(stIn) stIn.textContent=total;
      const stOk=document.getElementById('inv-st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'Logro', dest_soft:'World Office Cloud',
          module:'Inventarios', records_in:total, records_out:out.length,
          errors:0, warnings:INV_LOGRO_CLD_EXCL.length, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      invLogroInvCldSetStep(4);
    }catch(err){
      invLogroInvCldLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
      alert('No se pudo procesar el archivo: '+err.message);
    }
  }

  function invLogroInvCldBuildFN(){
    const d=new Date();
    return 'inventarios_logro_wo_cloud_'+d.getFullYear()+'_'+String(d.getMonth()+1).padStart(2,'0')+'_'+String(d.getDate()).padStart(2,'0')+'.xlsx';
  }

  function invLogroInvCldBuildWB(rows,logEntries,stats,excluded,defaults,grupos){
    const wb=XLSX.utils.book_new();

    function buildAoa(subset){
      const aoa=[Array(INV_LOGRO_CLD_COLS.length).fill(''), INV_LOGRO_CLD_COLS.slice()];
      subset.forEach(r=>aoa.push(INV_LOGRO_CLD_COLS.map(c=>{const v=r[c];return v===undefined?'':v??'';})));
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
        const gAoa=[['Codigo','Grupo 1']];
        grupos.g1.forEach(g=>gAoa.push([g.cod,g.nom]));
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

  function invLogroInvCldDoDownload(){
    if(!INV_LOGRO_CLD_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    XLSX.writeFile(INV_LOGRO_CLD_WB, invLogroInvCldBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function invLogroInvCldInstall(){
    const sorigEl = document.getElementById('inv-sorig');
    const fslotsEl = document.querySelector('#inv-s2 .fslots');
    if(!sorigEl || !fslotsEl) return;

    if(!sorigEl.querySelector('option[value="Logro"]')){
      const opt=document.createElement('option');
      opt.value='Logro'; opt.textContent='Logro';
      sorigEl.appendChild(opt);
    }

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

    // Igual que en SIIMED: primero garantizamos que exista un handler
    // base funcional (por si este archivo Cloud carga antes que su
    // hermano Escritorio), luego lo envolvemos para que, sin importar
    // cuál de los dos cargó primero, ambos mantengan su copia local
    // del File sincronizada con el estado compartido.
    window.__logroInvOnFile = window.__logroInvOnFile || function(input){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-logro-inv'), nm=document.getElementById('nm-logro-inv');
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__LOGRO_INV_S.file = f;
      INV_LOGRO_CLD_S.file = f;
    };
    const _prevOnFile = window.__logroInvOnFile;
    window.__logroInvOnFile = function(input){
      _prevOnFile(input);
      if(window.__LOGRO_INV_S && window.__LOGRO_INV_S.file) INV_LOGRO_CLD_S.file = window.__LOGRO_INV_S.file;
    };
    if(window.__LOGRO_INV_S.file) INV_LOGRO_CLD_S.file = window.__LOGRO_INV_S.file;

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

    const _origRouteInvETL = window.routeInvETL;
    window.routeInvETL = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='Logro' && dest==='World Office Cloud'){
        startInvLogroCldETL();
        return;
      }
      if(typeof _origRouteInvETL==='function') _origRouteInvETL();
    };

    const _origRouteInvDownload = window.routeInvDownload;
    window.routeInvDownload = function(){
      const orig=(document.getElementById('inv-sorig')||{}).value;
      const dest=(document.getElementById('inv-sdest')||{}).value;
      if(orig==='Logro' && dest==='World Office Cloud'){ invLogroInvCldDoDownload(); return; }
      if(typeof _origRouteInvDownload==='function') _origRouteInvDownload();
    };

    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg==='function') _origShowPg(name);
      if(name==='inventarios'){
        setTimeout(()=>{
          INV_LOGRO_CLD_S.file = null;
          INV_LOGRO_CLD_WB = null;
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
    document.addEventListener('DOMContentLoaded', invLogroInvCldInstall);
  } else {
    invLogroInvCldInstall();
  }

})();