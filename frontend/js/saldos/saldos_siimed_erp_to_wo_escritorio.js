// ══════════════════════════════════════════════════════════════════
// ETL: Saldos Iniciales Contables — SIIMED ERP → World Office Escritorio
// Módulo: saldos_siimed_erp_to_wo_escritorio.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución (inyecta la opción
// "SIIMED ERP" en el selector de origen de Saldos, agrega su propio
// slot de archivo — "Balance de Prueba por Tercero" exportado desde
// SIIMED — y "envuelve" routeSalETL()/routeSalDownload()/showPg()
// para interceptar el flujo solo cuando el origen elegido es
// "SIIMED ERP" y el destino "World Office Escritorio". Cuando el
// destino es "World Office Cloud" deja pasar hacia
// saldos_siimed_erp_to_wo_cloud.js (archivo hermano, completamente
// separado, sin lógica compartida entre ambos salvo el archivo
// subido — igual que ya ocurre entre los módulos de SIIMED ERP y de
// Siigo Nube en Terceros/Inventarios).
//
// AUTOCONTENIDO: este archivo NO depende de ningún helper definido en
// otro módulo (Siigo Nube de Saldos, ni ningún módulo de Terceros o
// Inventarios). Cada proceso debe poder ejecutarse aunque los demás
// archivos .js fallen al cargar. Solo depende de utilidades globales
// del navegador (XLSX, FileReader) y, opcionalmente, de api()/AUTH si
// existen (para registrar la migración; si no existen, no falla).
//
// LÓGICA DE TRANSFORMACIÓN (misma que saldos_siigo_nube_to_wo_*.js,
// adaptada a la estructura real del "Balance de Prueba por Tercero"
// de SIIMED):
//   • Siigo Nube entrega una lista plana (1 fila = 1 cuenta con saldo).
//   • SIIMED entrega un árbol jerárquico: cada nivel de cuenta
//     (Grupo → Cuenta → Subcuenta → Auxiliar → Subauxiliar) repite
//     como fila "encabezado/subtotal" (sin tercero) ANTES de desglosar,
//     cuando aplica, el saldo por cada tercero (mismo código de cuenta,
//     una fila por tercero, con Identificación y Descripción propias).
//   • Regla aplicada (validada con el archivo real: Débitos = Créditos
//     exacto tras el filtrado):
//       1) Se excluyen las filas "padre" cuyo código de cuenta es
//          prefijo de otro código más específico presente en el
//          archivo (equivalente a la exclusión de "cuentas con
//          auxiliares" que ya hace Siigo Nube, adaptada a que aquí
//          el código completo siempre viene dado en la última
//          columna "CUENTA").
//       2) Se excluyen las filas sin tercero cuyo código SÍ aparece
//          en otras filas CON tercero (son el subtotal/placeholder
//          de esa cuenta — el saldo real vive en las filas por
//          tercero).
//       3) Lo que queda sin tercero y no es padre de nada son cuentas
//          reales que no manejan tercero (caja menor, bancos, etc.) —
//          se incluyen usando el NIT de la empresa como tercero.
//       4) Se eliminan saldos en cero.
//       5) Débito/Crédito: saldo (NUEVOSALDO) positivo → Débito,
//          negativo → Crédito (misma regla simplificada que ya usa
//          Siigo Nube en ambos destinos).
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  // ── Estado propio ──────────────────────────────────────────────
  const SAL_SIIMED_ESC_S   = { file: null };
  let   SAL_SIIMED_ESC_WB  = null;
  const SAL_SIIMED_ESC_LOG  = [];
  const SAL_SIIMED_ESC_EXCL = [];

  // ── Columnas destino (idéntico orden que saldos_siigo_nube_to_wo_escritorio.js) ─
  const SAL_SIIMED_ESC_COLS = [
    'Encab: Empresa','Encab: Tipo Documento','Encab: Prefijo',
    'Encab: Documento Número','Encab: Fecha','Encab: Tercero Interno',
    'Encab: Tercero Externo','Encab: Nota','Encab: FormaPago',
    'Encab: Verificado','Encab: Anulado',
    'Encab: Personalizado1','Encab: Personalizado2','Encab: Personalizado3',
    'Encab: Personalizado4','Encab: Personalizado5','Encab: Personalizado6',
    'Encab: Personalizado7','Encab: Personalizado8','Encab: Personalizado9',
    'Encab: Personalizado10','Encab: Personalizado11','Encab: Personalizado12',
    'Encab: Personalizado13','Encab: Personalizado14','Encab: Personalizado15',
    'Detalle: CuentaContable','Detalle: Nota','Detalle: TerceroExterno',
    'Detalle: Débito','Detalle: Crédito','Detalle: Vencimiento',
    'Detalle: Vendedor','Detalle: Cheque','Detalle: Banco Cheque',
    'Detalle: Centro Costos','Detalle: PorcentajeRetención',
    'Detalle: BaseRetención','Detalle: PagoRetención',
    'Detalle: Tipo Base','Detalle: Código Centro Costos'
  ];

  // ── Meses español → número (para leer "AGO/31/2026") ─────────────
  const SAL_SIIMED_ESC_MESES = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};

  // ── Helpers ───────────────────────────────────────────────────────
  function salSiimedEscNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function salSiimedEscLog(msg,lvl='i',fase=''){
    const ts=new Date().toISOString();
    SAL_SIIMED_ESC_LOG.push({ts,fase,lvl,msg});
    const panel=document.getElementById('sal-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+=`<div class="le"><span class="lt">${now}</span><span class="${css}">${msg}</span></div>`;
    panel.scrollTop=panel.scrollHeight;
  }
  function salSiimedEscSleep(ms){return new Promise(r=>setTimeout(r,ms));}

  function salSiimedEscSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('sal-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('sal-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function salSiimedEscSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('sal-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function salSiimedEscSetPct(pct,msg){
    const pb=document.getElementById('sal-pbar');
    const pp=document.getElementById('sal-ppct');
    const ph=document.getElementById('sal-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }

  function salSiimedEscLimpiarCuenta(v){
    if(v===null||v===undefined||v==='')return '';
    return String(v).split('.')[0].replace(/\D/g,'');
  }
  function salSiimedEscLimpiarId(v){
    if(v===null||v===undefined||v==='')return '';
    return String(v).split('.')[0].replace(/\D/g,'');
  }
  function salSiimedEscDebitoCred(saldo){
    const s=parseFloat(saldo)||0;
    const abs=Math.abs(s);
    if(s>=0) return {deb:abs, cred:0};
    return {deb:0, cred:abs};
  }

  // ── Leer Excel (Balance de Prueba por Tercero — SIIMED) ───────────
  async function salSiimedEscReadFile(file){
    return new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:false,cellText:true});
          const wsName = wb.SheetNames.find(n=>salSiimedEscNorm(n)==='datos')||wb.SheetNames[0];
          const ws=wb.Sheets[wsName];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

          // ── Empresa y fecha de corte (mejor esfuerzo, el usuario
          //    puede corregirlos en el modal de parámetros) ─────────
          let nombreEmpresa='', fechaCorte='';
          for(let i=0;i<8;i++){
            const row=all[i]||[];
            const c0=String(row[0]||'').trim();
            if(!nombreEmpresa && c0 && !/^norma internacional$/i.test(c0) &&
               !/^balance de prueba/i.test(c0) && !/^periodo/i.test(c0) &&
               !/^procesado/i.test(c0)){
              nombreEmpresa=c0;
            }
            row.forEach(v=>{
              const m=String(v||'').trim().match(/^([a-zñ]{3})\/(\d{1,2})\/(\d{4})$/i);
              if(m && !fechaCorte){
                const mes=SAL_SIIMED_ESC_MESES[m[1].toLowerCase()];
                if(mes) fechaCorte=`${String(m[2]).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${m[3]}`;
              }
            });
          }

          // ── Fila de encabezados: busca "GRUPO" + "IDENTIFICACION" ──
          let hdrIdx=-1;
          for(let i=0;i<Math.min(all.length,15);i++){
            const rn=(all[i]||[]).map(v=>salSiimedEscNorm(v));
            if(rn.includes('grupo') && rn.some(v=>v==='identificacion')){
              hdrIdx=i; break;
            }
          }
          if(hdrIdx<0) throw new Error('No se encontró la fila de encabezados (GRUPO / IDENTIFICACION) en el archivo.');

          const hdrsRaw=(all[hdrIdx]||[]).map(v=>String(v||'').trim());
          const HN=hdrsRaw.map(salSiimedEscNorm);

          const cGrupo   = HN.indexOf('grupo');
          const cDesc    = HN.indexOf('descripcion');
          const cIdent   = HN.indexOf('identificacion');
          const cSaldo   = HN.indexOf('nuevosaldo');
          // La columna "CUENTA" aparece dos veces (código parcial y
          // código completo); el código completo es siempre la ÚLTIMA
          // ocurrencia (última columna de la hoja).
          let cCuentaFull=-1;
          HN.forEach((h,idx)=>{ if(h==='cuenta') cCuentaFull=idx; });

          if(cCuentaFull<0||cSaldo<0||cGrupo<0){
            throw new Error('No se encontraron columnas requeridas: CUENTA (completa) / NUEVOSALDO / GRUPO.');
          }

          const rows=all.slice(hdrIdx+1).filter(r=>{
            if(!r || r.every(v=>v===''||v===null||v===undefined)) return false;
            // Excluir fila de totales y cualquier fila sin GRUPO (no es un registro de cuenta)
            if(r[cGrupo]===''||r[cGrupo]===null||r[cGrupo]===undefined) return false;
            const desc=String(r[cDesc]||'').trim();
            if(/^totales\s*=+>?/i.test(desc)) return false;
            return true;
          });

          res({rows,cCuentaFull,cDesc,cIdent,cSaldo,nombreEmpresa,fechaCorte});
        }catch(err){rej(err);}
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── ETL principal ─────────────────────────────────────────────────
  async function startSiimedSalEscETL(){
    const file = SAL_SIIMED_ESC_S.file || (window.__SIIMED_SAL_S && window.__SIIMED_SAL_S.file);
    if(!file){ alert('Carga el archivo Balance de Prueba por Tercero de SIIMED.'); return; }
    try{
      const data = await salSiimedEscReadFile(file);
      _siimedSalEscPending = data;
      salSiimedEscShowParamModal(data);
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  let _siimedSalEscPending = null;

  async function _runSiimedSalEscETL(params){
    const data=_siimedSalEscPending;
    if(!data)return;

    salSiimedEscSetStep(3);
    SAL_SIIMED_ESC_LOG.length=0; SAL_SIIMED_ESC_EXCL.length=0;
    const panel=document.getElementById('sal-logp');
    if(panel)panel.innerHTML='';
    salSiimedEscSetPStep(0); salSiimedEscSetPct(0,'Iniciando...');
    const t0=Date.now();
    await salSiimedEscSleep(50);

    try{
      salSiimedEscSetPStep(1); salSiimedEscSetPct(10,'Leyendo archivo...');
      salSiimedEscLog('📂 Leyendo Balance de Prueba por Tercero (SIIMED)...','i','Lectura');
      await salSiimedEscSleep(30);

      const {rows,cCuentaFull,cDesc,cIdent,cSaldo}=data;
      const totalOrigen=rows.length;
      salSiimedEscLog(`   ${totalOrigen} filas encontradas`,'i','Lectura');

      const empresa = params.empresa;
      const nit     = params.nit;
      const fecha   = params.fecha;
      salSiimedEscLog(`   Empresa: ${empresa} | NIT: ${nit} | Fecha: ${fecha}`,'i','Lectura');

      // ── Paso 2: construir registros base + set de todos los códigos ──
      salSiimedEscSetPStep(2); salSiimedEscSetPct(30,'Clasificando cuentas...');
      salSiimedEscLog('🔗 Analizando jerarquía de cuentas...','i','Clasificación');
      await salSiimedEscSleep(30);

      const registros=rows.map(r=>({
        cuenta: salSiimedEscLimpiarCuenta(r[cCuentaFull]),
        desc: cDesc>=0?String(r[cDesc]||'').trim():'',
        id: cIdent>=0?salSiimedEscLimpiarId(r[cIdent]):'',
        saldo: parseFloat(String(r[cSaldo]).replace(/[^0-9.\-]/g,''))||0
      })).filter(r=>r.cuenta);

      const todosLosCodigos = new Set(registros.map(r=>r.cuenta));
      const codigosConTercero = new Set(registros.filter(r=>r.id).map(r=>r.cuenta));

      const esPadre = (cuenta)=>{
        for(const other of todosLosCodigos){
          if(other!==cuenta && other.startsWith(cuenta)) return true;
        }
        return false;
      };

      // ── Paso 3: separar con tercero / sin tercero (leaves reales) ──
      salSiimedEscSetPStep(3); salSiimedEscSetPct(50,'Aplicando reglas de negocio...');
      salSiimedEscLog('🔧 Aplicando reglas de negocio...','i','Transformación');
      await salSiimedEscSleep(30);

      const conTercero=[];
      let excluidosPadre=0, excluidosHeader=0, excluidosCero=0;

      registros.forEach(r=>{
        if(r.id){
          if(Math.abs(r.saldo)<=0.001){ excluidosCero++; return; }
          conTercero.push(r);
        } else {
          if(codigosConTercero.has(r.cuenta)){
            excluidosHeader++;
            return; // subtotal/placeholder de una cuenta que sí desglosa por tercero
          }
          if(esPadre(r.cuenta)){
            excluidosPadre++;
            SAL_SIIMED_ESC_EXCL.push({cuenta:r.cuenta,desc:r.desc,motivo:'Cuenta padre (tiene auxiliares)',saldo:r.saldo});
            return;
          }
          if(Math.abs(r.saldo)<=0.001){ excluidosCero++; return; }
          conTercero.push(r); // leaf real sin tercero → se migra con el NIT de la empresa
        }
      });

      salSiimedEscLog(`   Con tercero: ${conTercero.filter(r=>r.id).length}, Cuentas propias sin tercero: ${conTercero.filter(r=>!r.id).length}`,'i','Transformación');
      salSiimedEscLog(`   Excluidas (subtotal con desglose por tercero): ${excluidosHeader}`,'i','Transformación');
      salSiimedEscLog(`   Excluidas (cuentas padre / con auxiliares): ${excluidosPadre}`,'w','Transformación');
      salSiimedEscLog(`   Saldos en cero eliminados: ${excluidosCero}`,'w','Filtrado');

      // ── Paso 4: generar filas destino ────────────────────────────
      salSiimedEscSetPStep(4); salSiimedEscSetPct(75,'Generando registros destino...');
      await salSiimedEscSleep(30);

      const out=[];
      const nota=`SALDOS INICIALES A ${fecha}`;
      const encabBase={
        'Encab: Empresa':          empresa,
        'Encab: Tipo Documento':   'SI',
        'Encab: Prefijo':          '',
        'Encab: Documento Número': 1,
        'Encab: Fecha':            fecha,
        'Encab: Tercero Interno':  nit,
        'Encab: Tercero Externo':  nit,
        'Encab: Nota':             nota,
        'Encab: FormaPago':        'Saldos Iniciales',
        'Encab: Verificado':       '',
        'Encab: Anulado':          0,
        'Encab: Personalizado1':'','Encab: Personalizado2':'','Encab: Personalizado3':'',
        'Encab: Personalizado4':'','Encab: Personalizado5':'','Encab: Personalizado6':'',
        'Encab: Personalizado7':'','Encab: Personalizado8':'','Encab: Personalizado9':'',
        'Encab: Personalizado10':'','Encab: Personalizado11':'','Encab: Personalizado12':'',
        'Encab: Personalizado13':'','Encab: Personalizado14':'','Encab: Personalizado15':'',
      };

      conTercero.forEach(({cuenta,id,saldo})=>{
        const {deb,cred}=salSiimedEscDebitoCred(saldo);
        out.push({
          ...encabBase,
          'Detalle: CuentaContable':     cuenta,
          'Detalle: Nota':               nota,
          'Detalle: TerceroExterno':     id||nit,
          'Detalle: Débito':             deb,
          'Detalle: Crédito':            cred,
          'Detalle: Vencimiento':        fecha,
          'Detalle: Vendedor':           '',
          'Detalle: Cheque':             '',
          'Detalle: Banco Cheque':       '',
          'Detalle: Centro Costos':      '',
          'Detalle: PorcentajeRetención':'',
          'Detalle: BaseRetención':      '',
          'Detalle: PagoRetención':      '',
          'Detalle: Tipo Base':          '',
          'Detalle: Código Centro Costos':'',
        });
      });

      const sumDeb=out.reduce((a,r)=>a+(r['Detalle: Débito']||0),0);
      const sumCred=out.reduce((a,r)=>a+(r['Detalle: Crédito']||0),0);
      salSiimedEscLog(`✅ ${out.length} registros generados`,'o','Transformación');
      salSiimedEscLog(`   Débitos:  $${sumDeb.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'i','Estadísticas');
      salSiimedEscLog(`   Créditos: $${sumCred.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'i','Estadísticas');
      const dif=Math.abs(sumDeb-sumCred);
      if(dif>0.01) salSiimedEscLog(`   ⚠ Diferencia D-C: $${dif.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'w','Estadísticas');
      else         salSiimedEscLog(`   ✓ Débitos = Créditos (cuadrado)`,'o','Estadísticas');

      // ── Paso 5: Excel ────────────────────────────────────────────
      salSiimedEscSetPStep(5); salSiimedEscSetPct(92,'Generando Excel...');
      salSiimedEscLog('📊 Construyendo archivo Excel...','i','Escritura');
      await salSiimedEscSleep(30);

      SAL_SIIMED_ESC_WB=salSiimedEscBuildWB(out,SAL_SIIMED_ESC_LOG,SAL_SIIMED_ESC_EXCL,{
        registros_entrada:totalOrigen,
        registros_salida:out.length,
        suma_debitos:sumDeb,
        suma_creditos:sumCred,
        diferencia:dif
      });

      const dur=((Date.now()-t0)/1000).toFixed(1);
      salSiimedEscSetPct(100,'¡Listo!');
      salSiimedEscLog(`✅ Excel listo en ${dur}s`,'o','Escritura');

      const fn=salSiimedEscBuildFN();
      const fnEl=document.getElementById('sal-dl-fn'); if(fnEl)fnEl.textContent=fn;
      const stIn=document.getElementById('sal-st-in'); if(stIn)stIn.textContent=totalOrigen;
      const stOk=document.getElementById('sal-st-ok'); if(stOk)stOk.textContent=out.length;
      const stD=document.getElementById('sal-st-deb');
      if(stD)stD.textContent='$'+Math.round(sumDeb).toLocaleString('es-CO');

      try{
        if(typeof api==='function' && typeof AUTH!=='undefined'){
          await api('POST','/migrations',{
            filename_out:fn,orig_soft:'SIIMED ERP',dest_soft:'World Office Escritorio',
            module:'Saldos Iniciales',records_in:totalOrigen,records_out:out.length,
            errors:0,warnings:dif>0.01?1:0,duration_sec:parseFloat(dur),status:'completed'
          },AUTH.token);
        }
      }catch(e){}

      salSiimedEscSetStep(4);

    }catch(err){
      salSiimedEscLog(`❌ Error: ${err.message}`,'e','Pipeline');
      salSiimedEscSetPct(0,'Error');
      console.error('SAL_SIIMED_ESC ETL Error:', err);
      alert('Error en migración: ' + err.message);
    }
  }

  // ── Modal de parámetros ───────────────────────────────────────────
  function salSiimedEscShowParamModal(data){
    let modal=document.getElementById('sal-siimed-esc-param-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='sal-siimed-esc-param-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML=`
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.salSiimedEscCloseParamModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:480px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5)">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:20px;font-weight:700;color:#fff">Parámetros de Migración</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">Datos para el encabezado del documento</div>
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Nombre Empresa *</div>
            <input id="sal-siimed-esc-p-empresa" type="text" placeholder="Nombre de la empresa"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">NIT Empresa *</div>
            <input id="sal-siimed-esc-p-nit" type="text" placeholder="NIT sin dígito de verificación"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div style="margin-bottom:24px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Fecha de Corte *</div>
            <input id="sal-siimed-esc-p-fecha" type="date"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div id="sal-siimed-esc-p-err" style="color:#fca5a5;font-size:12px;margin-bottom:12px;display:none">⚠ Completa los campos requeridos</div>
          <div style="display:flex;gap:12px">
            <button id="sal-siimed-esc-btn-cancel" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">Cancelar</button>
            <button id="sal-siimed-esc-btn-confirm" style="flex:2;padding:12px;
              background:linear-gradient(135deg,#5b4fcf,#7c6ef0);
              border:1px solid rgba(255,255,255,.15);border-radius:10px;
              color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:0 4px 16px rgba(91,79,207,.4)">✅ Ejecutar Migración</button>
          </div>
        </div>
      </div>`;

    modal.style.display='block';
    setTimeout(()=>{
      const de=document.getElementById('sal-siimed-esc-p-empresa');
      if(de) de.value = (data&&data.nombreEmpresa) || '';
      const df=document.getElementById('sal-siimed-esc-p-fecha');
      if(df){
        if(data&&data.fechaCorte){
          const [d,m,y]=data.fechaCorte.split('/');
          if(d&&m&&y) df.value=`${y}-${m}-${d}`;
        }
        if(!df.value) df.value=new Date().toISOString().split('T')[0];
      }
      const btnCancel=document.getElementById('sal-siimed-esc-btn-cancel');
      const btnConfirm=document.getElementById('sal-siimed-esc-btn-confirm');
      if(btnCancel)btnCancel.onclick=window.salSiimedEscCloseParamModal;
      if(btnConfirm)btnConfirm.onclick=window.salSiimedEscConfirmParamModal;
    },50);
  }

  window.salSiimedEscCloseParamModal=function(){
    const modal=document.getElementById('sal-siimed-esc-param-modal');
    if(modal)modal.style.display='none';
  };

  window.salSiimedEscConfirmParamModal=async function(){
    const empresa=(document.getElementById('sal-siimed-esc-p-empresa')?.value||'').trim();
    const nit=(document.getElementById('sal-siimed-esc-p-nit')?.value||'').trim();
    const fechaRaw=(document.getElementById('sal-siimed-esc-p-fecha')?.value||'').trim();
    const errEl=document.getElementById('sal-siimed-esc-p-err');

    if(!empresa||!nit||!fechaRaw){
      if(errEl)errEl.style.display='block';
      return;
    }
    if(errEl)errEl.style.display='none';

    const [y,m,d]=fechaRaw.split('-');
    const fecha=`${d}/${m}/${y}`;

    window.salSiimedEscCloseParamModal();
    await _runSiimedSalEscETL({empresa,nit,fecha});
  };

  // ── Nombre archivo ────────────────────────────────────────────────
  function salSiimedEscBuildFN(){
    const d=new Date();
    return `saldos_iniciales_siimed_erp_wo_escritorio_${d.getFullYear()}_${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getDate()).padStart(2,'0')}.xlsx`;
  }

  // ── Construir Workbook ────────────────────────────────────────────
  function salSiimedEscBuildWB(rows,logEntries,exclEntries,stats){
    const wb=XLSX.utils.book_new();

    const aoa=[SAL_SIIMED_ESC_COLS.slice()];
    rows.forEach(r=>aoa.push(SAL_SIIMED_ESC_COLS.map(c=>{
      const v=r[c]; return (v===undefined)?'':v??'';
    })));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Saldos Iniciales');

    const s=stats||{};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Métrica','Valor'],
      ['Registros entrada',s.registros_entrada||0],
      ['Registros salida',s.registros_salida||0],
      ['Suma Débitos',s.suma_debitos||0],
      ['Suma Créditos',s.suma_creditos||0],
      ['Diferencia D-C',s.diferencia||0],
    ]),'Estadísticas');

    const logsAoa=[['Timestamp','Fase','Nivel','Mensaje']];
    (logEntries||[]).forEach(e=>logsAoa.push([e.ts,e.fase||'',
      e.lvl==='e'?'ERROR':e.lvl==='w'?'WARN':'INFO',e.msg]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(logsAoa),'Logs');

    if(exclEntries && exclEntries.length){
      const exclAoa=[['Cuenta','Descripción','Motivo','Saldo']];
      exclEntries.forEach(e=>exclAoa.push([e.cuenta,e.desc,e.motivo,e.saldo]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(exclAoa),'Excluidos');
    }

    return wb;
  }

  // ── Descarga ──────────────────────────────────────────────────────
  function siimedEscSalDoDownload(){
    if(!SAL_SIIMED_ESC_WB){alert('Primero ejecuta el proceso ETL');return;}
    XLSX.writeFile(SAL_SIIMED_ESC_WB,salSiimedEscBuildFN());
  }

  // ── Instalación (opción de origen + slot de archivo + wrapping) ──
  function siimedSalEscInstall(){
    const sorigEl = document.getElementById('sal-sorig');
    const s2card = document.querySelector('#sal-s2 .card');
    if(!sorigEl || !s2card) return;

    // 1) Opción "SIIMED ERP" en el selector de origen de Saldos
    //    (comprobación para no duplicarla si el módulo Cloud hermano
    //    ya la agregó)
    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

    // 2) Slot único de archivo (compartido con el módulo Cloud hermano
    //    vía window.__SIIMED_SAL_S — SIIMED exporta un solo Balance de
    //    Prueba por Tercero que sirve para ambos destinos)
    window.__SIIMED_SAL_S = window.__SIIMED_SAL_S || { file:null };
    const siigoFslots = document.querySelector('#sal-s2 .fslots');
    const siigoInfo = document.querySelector('#sal-s2 .al.al-i');

    if(!document.getElementById('siimed-sal-fslots')){
      const infoHTML =
        '<div class="al al-i" id="siimed-sal-info" style="display:none;margin-bottom:14px">'+
          '<span>ℹ️</span>'+
          '<span>SIIMED ERP: exporta el <strong>Balance de Prueba por Tercero</strong>. Es el único archivo requerido — sirve para migrar tanto a World Office Escritorio como a World Office Cloud.</span>'+
        '</div>';
      const slotsHTML =
        '<div class="fslots" id="siimed-sal-fslots" style="display:none">'+
          '<div class="fslot" id="sl-siimed-sal">'+
            '<input type="file" id="f-siimed-sal" accept=".xlsx,.xls" onchange="window.__siimedSalOnFile(this)">'+
            '<div class="fs-badge badge-req">Obligatorio</div>'+
            '<div class="fs-ico">📊</div>'+
            '<div class="fs-name">Balance_prueba_tercero.xlsx</div>'+
            '<div class="fs-desc">Balance de Prueba por Tercero de SIIMED ERP</div>'+
            '<div class="fs-sel" id="nm-siimed-sal"></div>'+
          '</div>'+
        '</div>';
      if(siigoInfo) siigoInfo.insertAdjacentHTML('afterend', infoHTML);
      if(siigoFslots) siigoFslots.insertAdjacentHTML('afterend', slotsHTML);
    }

    window.__siimedSalOnFile = window.__siimedSalOnFile || function(input){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-siimed-sal'), nm=document.getElementById('nm-siimed-sal');
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__SIIMED_SAL_S.file = f;
      SAL_SIIMED_ESC_S.file = f;
    };
    // Si el módulo Cloud hermano ya cargó el archivo antes que este,
    // sincronizamos la referencia local.
    if(window.__SIIMED_SAL_S.file) SAL_SIIMED_ESC_S.file = window.__SIIMED_SAL_S.file;

    // 3) Alternar visibilidad según origen elegido
    function siimedSalToggle(){
      const isSiimed = sorigEl.value === 'SIIMED ERP';
      const siimedFslots=document.getElementById('siimed-sal-fslots');
      const siimedInfo=document.getElementById('siimed-sal-info');
      if(isSiimed){
        if(siigoFslots) siigoFslots.style.display='none';
        if(siigoInfo) siigoInfo.style.display='none';
      }
      if(siimedFslots) siimedFslots.style.display = isSiimed ? '' : 'none';
      if(siimedInfo) siimedInfo.style.display = isSiimed ? '' : 'none';
    }
    sorigEl.addEventListener('change', siimedSalToggle);
    siimedSalToggle();

    // 4) routeSalETL(): solo intercepta SIIMED ERP → World Office
    //    Escritorio. Para SIIMED ERP → Cloud, deja pasar (lo maneja
    //    el archivo hermano, que debe cargarse también en index.html).
    const _origRouteSalETL = window.routeSalETL;
    window.routeSalETL = function(){
      const orig = (document.getElementById('sal-sorig')||{}).value;
      const dest = (document.getElementById('sal-sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Escritorio'){
        startSiimedSalEscETL();
        return;
      }
      if(typeof _origRouteSalETL === 'function') _origRouteSalETL();
    };

    // 5) routeSalDownload(): mismo criterio
    const _origRouteSalDownload = window.routeSalDownload;
    window.routeSalDownload = function(){
      const orig = (document.getElementById('sal-sorig')||{}).value;
      const dest = (document.getElementById('sal-sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Escritorio'){ siimedEscSalDoDownload(); return; }
      if(typeof _origRouteSalDownload === 'function') _origRouteSalDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Saldos
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'saldos'){
        SAL_SIIMED_ESC_S.file = null;
        _siimedSalEscPending = null;
        window.salSiimedEscCloseParamModal();
        if(window.__SIIMED_SAL_S) window.__SIIMED_SAL_S.file = null;
        const slot=document.getElementById('sl-siimed-sal'); if(slot) slot.className='fslot';
        const nm=document.getElementById('nm-siimed-sal'); if(nm) nm.textContent='';
        const inp=document.getElementById('f-siimed-sal'); if(inp) inp.value='';
        siimedSalToggle();
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', siimedSalEscInstall);
  } else {
    siimedSalEscInstall();
  }

})();
