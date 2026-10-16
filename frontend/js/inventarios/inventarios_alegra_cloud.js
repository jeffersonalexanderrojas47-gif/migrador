//CLOUD

(function(){

  'use strict';

  // ── Estado propio ────────────────────────────────────────────────

  const INV_S    = { file:null };
  const INV_LOG  = [];
  const INV_EXCL = [];
  let   INV_WB   = null;

  // Estado entre fases (lectura → modal de precios → proceso)
 let INV_PENDIENTE = null;
  let INV_PRECIOS_SEL = null;

  // Control de generación automática de códigos
  let INV_CODIGOS_AUTO = null;
  // ══════════════════════════════════════════════════════════════════
  // TÍTULOS DEL INVENTARIO (plantilla WO Escritorio)
  // Orden EXACTO de las columnas del Excel.
  // ══════════════════════════════════════════════════════════════════

  const INV_COLUMNAS = [

    'Código','Descripción','Unidad Medida','Tipo Impuesto Ventas','Valor IVA','Suma al Costo','Bodega 1','Maneja Talla - Color','Maneja Lotes','Maneja Seriales','Ver en POS','Pertenece a un Producto',
    'Facturar Sin Existencias','Centro de Costos','Grupo Inventario', 'Existencia Máxima Permitida', 'Existencia Mínima Permitida','Existencia Mínima Reorden', 'Otros impuestos 1', 'Valor Impuestos 1',
    'Otros Impuestos 2','Valor Impuestos 2', 'Bodega 2', 'Bodega 3', 'Utilidad Estimada', 'Favoritos POS', 'Código de Barras', 'Codigo Fabricación', 'Activo', 'Nombre Lista Precios 1', 'Valor Lista Precios 1', 
    'Nombre Lista Precios 2','Valor Lista Precios 2', 'Nombre Lista Precios 3','Valor Lista Precios 3', 'Nombre Lista Precios 4', 'Valor Lista Precios 4', 'Nombre Lista Precios 5', 'Valor Lista Precios 5', 
    'Nombre Lista Precios 6','Valor Lista Precios 6', 'Tallas', 'Colores'

  ];


  // ══════════════════════════════════════════════════════════════════
  // UTILIDADES GENERALES
  // ══════════════════════════════════════════════════════════════════

  function invSleep(ms){
    return new Promise(r => setTimeout(r, ms));
  }

  // Clave para comparar textos: sin tildes, sin signos, minúsculas,
  // un solo espacio. "Código  Centro-Costos" = "codigo centro costos"
  function invClave(valor){
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function invVacio(v){
    return v === undefined || v === null || String(v).trim() === '';
  }

  function invNormalizarIVA(valor){
    if(invVacio(valor)) return 0;

    const texto = String(valor)
      .trim()
      .replace(/%/g, '')
      .replace(',', '.');

    const coincidencia = texto.match(/-?\d+(?:\.\d+)?/);
    if(!coincidencia) return valor;

    let numero = Number(coincidencia[0]);
    if(!Number.isFinite(numero)) return valor;

    // Cloud espera la tarifa como porcentaje: 0.19 → 19, 0.16 → 16.
    // Si ya llega como 19 o 19%, se conserva como 19.
    if(numero > 0 && numero < 1){
      numero *= 100;
    }

    return Math.round(numero * 100) / 100;
  }

  // Quita el envoltorio que Alegra usa para conservar ceros a la
  // izquierda en el CSV:  ="003"  →  003
  function invLimpiarRef(v){
    let s = String(v ?? '').trim();
    const m = s.match(/^="(.*)"$/);          // ="003"
    if(m) return m[1].trim();
    if(/^=\S/.test(s)) s = s.slice(1).replace(/^"|"$/g,'');   // =003
    return s.trim();
  }


  // ══════════════════════════════════════════════════════════════════
  // UI DE LA PÁGINA DE INVENTARIOS (ids inv-*)
  // ══════════════════════════════════════════════════════════════════

  function invLog(msg, lvl, fase){

    INV_LOG.push({
      ts: new Date().toISOString(),
      fase: fase || '',
      lvl: lvl || 'i',
      msg
    });

    const panel = document.getElementById('inv-logp');
    if(!panel) return;

    const now = new Date().toLocaleTimeString('es-CO',{ hour12:false });
    const css = { i:'li', w:'lw', o:'lo', e:'le-e' }[lvl] || 'li';

    panel.innerHTML +=
      '<div class="le">' +
        '<span class="lt">'+now+'</span>' +
        '<span class="'+css+'">'+msg+'</span>' +
      '</div>';

    panel.scrollTop = panel.scrollHeight;
  }

  function invSetStep(n){
    for(let i = 1; i <= 4; i++){
      const wz = document.getElementById('inv-wt'+i);
      if(wz) wz.className = 'wz' + (i < n ? ' done' : i === n ? ' on' : '');
      const sec = document.getElementById('inv-s'+i);
      if(sec) sec.style.display = (i === n) ? 'block' : 'none';
    }
  }

  function invSetPStep(n){
    for(let i = 0; i <= 5; i++){
      const el = document.getElementById('inv-ps'+i);
      if(!el) continue;
      el.classList.toggle('act', i === n);
      el.classList.toggle('don', i < n);
    }
  }

  function invSetPct(pct, msg){
    const pb = document.getElementById('inv-pbar');
    const pp = document.getElementById('inv-ppct');
    const ph = document.getElementById('inv-pph');
    if(pb) pb.style.width = pct + '%';
    if(pp) pp.textContent = pct + '%';
    if(ph && msg) ph.textContent = msg;
  }

  function invTexto(id, valor){
    const el = document.getElementById(id);
    if(el) el.textContent = valor;
  }


  // ══════════════════════════════════════════════════════════════════
  // LECTURA DE ARCHIVOS (CSV / XLSX / XLS)
  //
  // Resultado: { hdrs:[...], rows:[ {titulo:valor} ] }
  // Cada fila además trae (ocultos, no se exportan):
  //   __arr → valores por posición (para encabezados repetidos,
  //           como las 3 columnas "Impuesto" de Alegra)
  //   __raw → valor crudo de Excel por título (números reales)
  // ══════════════════════════════════════════════════════════════════

  // Alegra exporta en Latin-1; otros archivos vienen en UTF-8.
  function invDecodificar(buffer){
    const bytes = new Uint8Array(buffer);
    try{
      return new TextDecoder('utf-8', { fatal:true }).decode(bytes);
    }catch(e){
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  }

  function invParseCSVLine(line, sep){

    const out = [];
    let cur = '';
    let inQ = false;

    for(let i = 0; i < line.length; i++){

      const ch = line[i];

      if(inQ){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else inQ = false;
        }else{
          cur += ch;
        }
      }else{
        // Las comillas solo abren un campo si están al inicio de él;
        // en medio del texto (ej. Tornillo ½") se toman como texto.
        if(ch === '"' && cur === '') inQ = true;
        else if(ch === sep){ out.push(cur); cur = ''; }
        else                cur += ch;
      }
    }

    out.push(cur);
    return out;
  }

  // Busca la fila de encabezados en las primeras filas: la que tenga
  // "Tipo" y "Nombre" (exportación de Alegra) o al menos 3 títulos de
  // la plantilla. Si no encuentra, usa la primera.
  function invFilaEncabezado(aoa){

    const plantilla = new Set(INV_COLUMNAS.map(invClave));
    const equivalencias = [
      'codigo del producto o servicio',
      'nombre',
      'item inventariable',
      'unidad de medida',
      'venta en negativo',
      'categoria'
    ];

    let mejor = 0;
    let mejorPuntaje = -1;

    for(let i = 0; i < Math.min(aoa.length, 12); i++){
      const claves = (aoa[i] || []).map(invClave);
      if(!claves.length) continue;

      let puntaje = 0;
      puntaje += claves.filter(k => plantilla.has(k)).length * 2;
      puntaje += claves.filter(k => equivalencias.includes(k)).length * 4;
      if(claves.includes('tipo')) puntaje += 1;
      if(claves.includes('nombre')) puntaje += 2;

      if(puntaje > mejorPuntaje){
        mejorPuntaje = puntaje;
        mejor = i;
      }
    }

    return mejor;
  }

  function invArmarFilas(aoa, aoaRaw){

    if(!aoa.length) return { hdrs:[], rows:[] };

    const hi   = invFilaEncabezado(aoa);
    const hdrs = (aoa[hi] || []).map(h => String(h ?? '').trim());
    const rows = [];

    for(let i = hi + 1; i < aoa.length; i++){

      const vals = aoa[i] || [];

      if(vals.every(v => invVacio(v))) continue;

      const arr = hdrs.map((h, idx) =>
        String(vals[idx] !== undefined && vals[idx] !== null ? vals[idx] : '').trim()
      );

      const o = {};
      hdrs.forEach((h, idx) => {
        if(h && !(h in o)) o[h] = arr[idx];
      });

      const crudo = {};
      const rawVals = aoaRaw ? (aoaRaw[i] || []) : [];
      hdrs.forEach((h, idx) => {
        if(h && !(h in crudo)) crudo[h] = rawVals[idx];
      });

      Object.defineProperty(o, '__arr', { value: arr,   enumerable:false });
      Object.defineProperty(o, '__raw', { value: crudo, enumerable:false });

      rows.push(o);
    }

    return { hdrs, rows };
  }

  function invReadCSV(file){

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = e => {
        try{

          let text = invDecodificar(e.target.result);

          if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

          let lines = text.split(/\r?\n/).filter(l => l.length > 0);

          // Alegra agrega "sep=;" como primera línea para Excel
          let sep = null;
          if(lines.length && /^\?*sep\s*=/i.test(lines[0])){
            const m = lines[0].match(/sep\s*=\s*(.)/i);
            if(m) sep = m[1];
            lines = lines.slice(1);
          }

          if(!lines.length){
            resolve({ hdrs:[], rows:[] });
            return;
          }

          // Separador: el que más aparezca en la primera línea útil
          if(!sep){
            const l0 = lines[0];
            const n  = c => (l0.match(new RegExp('\\' + c, 'g')) || []).length;
            sep = [';', ',', '\t'].sort((a, b) => n(b) - n(a))[0];
          }

          const aoa = lines.map(l => invParseCSVLine(l, sep));

          resolve(invArmarFilas(aoa, null));

        }catch(err){
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('No se pudo leer ' + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  function invReadXLSX(file){

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = e => {
        try{

          const wb = XLSX.read(
            new Uint8Array(e.target.result),
            { type:'array', cellText:true, raw:false }
          );

          const ws = wb.Sheets[wb.SheetNames[0]];

          const aoa    = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
          const aoaRaw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true });

          resolve(invArmarFilas(aoa, aoaRaw));

        }catch(err){
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('No se pudo leer ' + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  function invReadFile(file){

    if(!file) return Promise.resolve(null);

    const name = (file.name || '').toLowerCase();

    if(name.endsWith('.xlsx') || name.endsWith('.xls')){
      return invReadXLSX(file);
    }

    return invReadCSV(file);
  }


  // ══════════════════════════════════════════════════════════════════
  // TÍTULOS DE LA PLANTILLA QUE VENGAN DIRECTO EN EL ARCHIVO
  // (si el archivo ya trae columnas con nombre de la plantilla,
  //  esas tienen prioridad sobre la traducción desde Alegra)
  // ══════════════════════════════════════════════════════════════════

  function invMapearColumnas(hdrs){

    const porClave = new Map();

    (hdrs || []).forEach(h => {
      const k = invClave(h);
      if(k && !porClave.has(k)) porClave.set(k, h);
    });

    const mapa        = {};
    const encontrados = [];
    const faltantes   = [];

    INV_COLUMNAS.forEach(titulo => {
      const real = porClave.get(invClave(titulo));

      if(real !== undefined){
        mapa[titulo] = real;
        encontrados.push(titulo);
      }else{
        mapa[titulo] = null;
        faltantes.push(titulo);
      }
    });

    return { mapa, encontrados, faltantes };
  }


  // ══════════════════════════════════════════════════════════════════
  // EQUIVALENCIAS: TÍTULO DE ENTRADA (Alegra) → TÍTULO DE SALIDA
  //
  // Esta tabla manda. Para agregar o cambiar una equivalencia, solo
  // se edita aquí. El orden del Excel NO depende de esta tabla: siempre
  // sale en el orden de INV_COLUMNAS.
  // ══════════════════════════════════════════════════════════════════

  const INV_EQUIVALENCIAS = [
    { entrada:'Código del producto o servicio', salida:'Código' },
    { entrada:'Nombre',                         salida:'Descripción' },
    { entrada:'Ítem inventariable',             salida:'Activo' },
    { entrada:'Unidad de medida',               salida:'Unidad Medida' },
    { entrada:'Categoría',                      salida:'Grupo Inventario' },
    { entrada:'Impuesto',                       salida:'Valor IVA' }
  ];

  // Variantes que pueden aparecer en distintas exportaciones de Alegra.
  const INV_ALIASES = {
    'Código del producto o servicio': [
      'codigo del producto o servicio', 'codigo producto o servicio',
      'codigo del producto', 'codigo', 'referencia', 'sku'
    ],
    'Nombre': ['nombre', 'nombre del producto', 'nombre producto', 'descripcion'],
    'Ítem inventariable': [
      'item inventariable', 'es inventariable', 'inventariable',
      'item de inventario', 'maneja inventario'
    ],
    'Unidad de medida': ['unidad de medida', 'unidad', 'unidad medida'],
    'Impuesto': ['impuesto', 'iva', 'porcentaje de impuesto', 'tarifa de impuesto', 'impuesto ventas'],
    'Venta en negativo': ['venta en negativo', 'vender en negativo', 'ventas en negativo'],
    'Categoría': ['categoria', 'categoría', 'grupo', 'categoria del producto']
  };

  function invBuscarColumna(hdrs, entrada){
    const claves = (hdrs || []).map(invClave);
    const aliases = (INV_ALIASES[entrada] || [invClave(entrada)]).map(invClave);
    for(const alias of aliases){
      const idx = claves.indexOf(alias);
      if(idx >= 0) return { idx, real: hdrs[idx] };
    }
    return { idx:-1, real:null };
  }

  // Ubica cada título de entrada en el archivo (sin importar mayúsculas,
  // tildes ni espacios). Devuelve [{entrada, salida, idx, real}].
  function invUbicarEquivalencias(hdrs){

    return INV_EQUIVALENCIAS.map(eq => {
      const found = invBuscarColumna(hdrs, eq.entrada);
      return {
        entrada: eq.entrada,
        salida:  eq.salida,
        idx: found.idx,
        real: found.real
      };
    });
  }


  function invPorIndice(r, idx){
    if(idx < 0 || !r.__arr) return '';
    return String(r.__arr[idx] ?? '').trim();
  }

  // Columnas "Precio: <Nombre>" = listas de precio reales de Alegra.
  // "Precio base" y "Precio total" no son listas → no se incluyen.
  function invDetectarColsPrecio(hdrs){
    const out = [];
    (hdrs || []).forEach((h, idx) => {
      const raw = String(h || '').trim();
      const k = invClave(raw);
      const esCostoInicial = k === 'costo inicial';
      const esPrecioBase = k === 'precio base';
      const esPrecioLista = /^precio\s*:\s*.+$/i.test(raw);
      if(esCostoInicial || esPrecioBase || esPrecioLista){
        out.push({ idx, h:raw, nombre:raw });
      }
    });
    return out;
  }


  // ── Unidad de medida ─────────────────────────────────────────────

  const INV_UNIDAD = {
  'und.':         'Unidad',
  'und':          'Unidad',
  'unidad':       'Unidad',
  'Servicio':     'Unidad',
  'log':          'Día',
  'dia':          'Día',
  'kg':           'Kilogramo',
  'kilogramo':    'Kilogramo',
  'gr':           'Gramo',
  'gramo':        'Gramo',
  'lt':           'Litro',
  'litro':        'Litro',
  'ml':           'Mililitro',
  'mililitro':    'Mililitro',
  'mt':           'Metro',
  'metro':        'Metro',
  'metros':       'Metro',
  'cm':           'Centímetro',
  'hora':         'Hora',
  'hr':           'Hora',
  'horas':        'Hora',
  'cj':           'Caja',
  'caja':         'Caja',
  'pq':           'Paquete',
  'paquete':      'Paquete',
  'par':          'Par',
  'docena':       'Docena',
  'galon':        'Galón',
  'Galón':        'Galón',
  'gal':          'Galón',
 
  };

  function invMapUnidad(v){
    // Vacío → Unidad (salida: Und.)
    if(invVacio(v)) return 'Und.';

    const raw = String(v).trim();
    const k = invClave(raw);

    // Primero intenta coincidencia exacta.
    if(INV_UNIDAD[k]) return INV_UNIDAD[k];

    // Luego permite coincidencias normalizadas dentro del texto.
    for(const [pat, val] of Object.entries(INV_UNIDAD)){
      if(k === pat || k.split(' ').includes(pat)) return val;
    }

    // Si trae información pero no está en la lista, conserva el valor original.
    return raw;
  }



  // ══════════════════════════════════════════════════════════════════
  // COLUMNAS DE PRECIO: SOLO NÚMEROS
  //
  // Aplica a todo título que empiece por "Precio".
  //   "$ 1.250.000" → 1250000 | "1,250.50" → 1250.5 | "1.250,50" → 1250.5
  //   "N/A", "abc", "12 und" → vacío
  // ══════════════════════════════════════════════════════════════════

  function invEsColumnaPrecio(titulo){
  const k = invClave(titulo);

  return (
    /^precio\b/.test(k) ||
    INV_PRECIOS_CERO_DEFAULT.has(k)
  );
}
  // Devuelve { valor, conLetras }. valor = número o null.
  function invLimpiarPrecio(texto, crudo){

    if(typeof crudo === 'number' && isFinite(crudo)){
      return { valor: crudo, conLetras:false };
    }

    const s = invLimpiarRef(texto);

    if(!s) return { valor:null, conLetras:false };

    if(/[A-Za-zÀ-ÿ]/.test(s)){
      return { valor:null, conLetras:true };
    }

    let n = s.replace(/[^0-9.,-]/g,'');

    if(!/\d/.test(n)) return { valor:null, conLetras:false };

    const negativo = n.startsWith('-');
    n = n.replace(/-/g,'');

    const tienePunto = n.includes('.');
    const tieneComa  = n.includes(',');

    if(tienePunto && tieneComa){
      if(n.lastIndexOf(',') > n.lastIndexOf('.')){
        n = n.replace(/\./g,'').replace(',', '.');   // 1.250,50
      }else{
        n = n.replace(/,/g,'');                       // 1,250.50
      }
    }else if(tieneComa){
      const partes = n.split(',');
      n = (partes.length > 2 || partes[partes.length-1].length === 3)
        ? partes.join('')
        : partes.join('.');
    }else if(tienePunto){
      const partes = n.split('.');
      n = (partes.length > 2 || partes[partes.length-1].length === 3)
        ? partes.join('')
        : n;
    }

    const num = parseFloat(n);

    if(!isFinite(num)) return { valor:null, conLetras:false };

    return { valor: negativo ? -num : num, conLetras:false };
  }


  // ══════════════════════════════════════════════════════════════════
  // COLUMNAS DE NÚMEROS ENTEROS: Exis. Máxima, Exis. Mínima
  //   "15" → 15 | "1.200" → 1200 | "10,6" → 11 | "20 und" → vacío
  // ══════════════════════════════════════════════════════════════════

  const INV_COL_ENTERO = new Set(['Existencia Máxima Permitida', 'Existencia Mínima Permitida'].map(invClave));

  function invEsColumnaEntero(titulo){
    return INV_COL_ENTERO.has(invClave(titulo));
  }

  // ══════════════════════════════════════════════════════════════════
  // COLUMNAS CON 0 POR DEFECTO
  // Si la columna viene vacía o no existe en la entrada, se genera 0.
  // ══════════════════════════════════════════════════════════════════

  const INV_COL_CERO_DEFAULT = new Set([
    'Existencia Máxima Permitida',
    'Existencia Mínima Permitida',
    'Existencia Mínima Reorden'
  ].map(invClave));

  function invEsColumnaCeroDefault(titulo){
    return INV_COL_CERO_DEFAULT.has(invClave(titulo));
  }

  function invAplicarCeroDefault(titulo, valor){
    return invEsColumnaCeroDefault(titulo) && invVacio(valor)
      ? 0
      : valor;
  }

  // ══════════════════════════════════════════════════════════════════
  // GRUPO UNO POR DEFECTO
  // Si Grupo Uno viene vacío o la columna no existe en la entrada,
  // se coloca el texto indicado para World Office.
  // ══════════════════════════════════════════════════════════════════

  const INV_GRUPO_UNO_DEFAULT = 'PRODUCTOS NO FABRICADOS POR LA EMPRESA';

  function invAplicarGrupoUnoDefault(titulo, valor){
    return invClave(titulo) === invClave('Grupo Uno') && invVacio(valor)
      ? INV_GRUPO_UNO_DEFAULT
      : valor;
  }

  // ══════════════════════════════════════════════════════════════════
  // PRECIOS 1 A 4 CON 0 POR DEFECTO
  // Si vienen vacíos o no existen en la entrada, se genera 0.
  // Los demás precios mantienen su comportamiento actual.
  // ══════════════════════════════════════════════════════════════════

  const INV_PRECIOS_CERO_DEFAULT = new Set([
  'Valor Lista Precios 1',
  'Valor Lista Precios 2',
  'Valor Lista Precios 3',
  'Valor Lista Precios 4',
  'Valor Lista Precios 5',
  'Valor Lista Precios 6'
].map(invClave));

  function invEsPrecioCeroDefault(titulo){
    return INV_PRECIOS_CERO_DEFAULT.has(invClave(titulo));
  }

  function invAplicarPrecioCeroDefault(titulo, valor){
    return invEsPrecioCeroDefault(titulo) && invVacio(valor)
      ? 0
      : valor;
  }

  function invLimpiarEntero(texto, crudo){
    const res = invLimpiarPrecio(texto, crudo);
    if(res.valor === null) return res;
    return { valor: Math.round(res.valor), conLetras:false };
  }


  // ══════════════════════════════════════════════════════════════════
  // COLUMNAS SI / NO
  //   Si → -1 | No → 0 | -1 y 0 se dejan igual | otro valor → vacío
  // ══════════════════════════════════════════════════════════════════

  const INV_COL_SINO = new Set([
    //'Activo',
    //'Producto',
    //'Facturar sin Existen.',
    //'Pertenece Produc.',
    //'Producto Proceso',
   // 'Maneja Seriales'
  ].map(invClave));

  function invEsColumnaSiNo(titulo){
    return INV_COL_SINO.has(invClave(titulo));
  }

  // Devuelve { valor, desconocido }
  function invLimpiarSiNo(texto, crudo){

    if(crudo === -1 || crudo === 0){
      return { valor: crudo, desconocido:false };
    }

    if(texto === -1 || texto === 0){
      return { valor: texto, desconocido:false };
    }

    const original = String(texto ?? '').trim();
    if(!original) return { valor:null, desconocido:false };

    const k = invClave(original);

    if(k === 'si') return { valor:-1, desconocido:false };
    if(k === 'no') return { valor: 0, desconocido:false };

    const num = original.replace(/\s+/g,'');
    if(num === '-1') return { valor:-1, desconocido:false };
    if(num === '0')  return { valor: 0, desconocido:false };

    return { valor:null, desconocido:true };
  }

  // ══════════════════════════════════════════════════════════════════
  // MODAL: ELEGIR LISTAS DE PRECIO "Precio: <Nombre>"
  // ══════════════════════════════════════════════════════════════════

  function invMostrarModalPrecios(cols){

    const opciones = [
  { value:'', label:'No importar' },
  { value:'Valor Lista Precios 1', label:'Valor Lista Precios 1' },
  { value:'Valor Lista Precios 2', label:'Valor Lista Precios 2' },
  { value:'Valor Lista Precios 3', label:'Valor Lista Precios 3' },
  { value:'Valor Lista Precios 4', label:'Valor Lista Precios 4' }
];

    function asignacionInicial(nombre){
  const k = invClave(nombre);

  if(k === 'costo inicial') return 'Valor Lista Precios 1';
  if(k === 'precio base') return 'Valor Lista Precios 2';
  if(k === 'precio general') return 'Valor Lista Precios 3';
  if(k === 'precio distribuidores') return 'Valor Lista Precios 4';

  return '';
}

    const filasHTML = cols.map((c, i) => {
      const valorInicial = asignacionInicial(c.h);
      const optionsHTML = opciones.map(o => {
        const selected = o.value === valorInicial ? ' selected' : '';
        return `<option value="${o.value}"${selected}>${o.label}</option>`;
      }).join('');
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);">
          <div style="flex:1;min-width:0;color:rgba(255,255,255,.92);font-size:12.5px;overflow-wrap:anywhere;">${c.h}</div>
          <select id="inv-precio-${i}" data-precio-col="${i}" style="width:161px;min-width:145px;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:#24176f;color:#fff;font-size:12px;cursor:pointer;">${optionsHTML}</select>
        </div>`;
    }).join('');

    let modal = document.getElementById('inv-modal-precios');
    if(!modal){
      modal=document.createElement('div');
      modal.id='inv-modal-precios';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0;" onclick="window.invCerrarModalPrecios()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;">
        <div style="width:100%;max-width:560px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto;">
          <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:20px;font-weight:700;color:#fff;">Columnas de precio a incluir</div>
            <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;">Asigna cada columna de Alegra a Valor Lista Precios 1, Valor Lista Precios 2, Valor Lista Precios 3 o Valor Lista Precios 4.</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 145px;gap:14px;padding:8px 12px;margin-bottom:4px;color:rgba(255,255,255,.55);font-size:11px;font-weight:700;text-transform:uppercase;">
            <div>Columna de Alegra</div><div>Destino</div>
          </div>
          <div style="max-height:340px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:20px;">
            ${filasHTML || `<div style="padding:20px;text-align:center;color:rgba(255,255,255,.6);font-size:12px;">No se encontraron columnas de precio.</div>`}
          </div>
          <div id="inv-precio-error" style="display:none;margin-bottom:14px;padding:10px 12px;border-radius:8px;background:rgba(220,38,38,.18);border:1px solid rgba(248,113,113,.35);color:#fecaca;font-size:12px;"></div>
          <div style="display:flex;gap:12px;">
            <button type="button" onclick="window.invCerrarModalPrecios()" style="flex:1;padding:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:10px;color:#fff;font-size:14px;cursor:pointer;">Cancelar</button>
            <button type="button" onclick="window.invConfirmarModalPrecios()" style="flex:2;padding:12px;background:linear-gradient(135deg,#5b4fcf,#7c6ef0);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(91,79,207,.4);">✅ Continuar Migración</button>
          </div>
        </div>
      </div>`;
    modal.style.display='block';
  }

  function invCerrarModalPrecios(){
    const modal = document.getElementById('inv-modal-precios');
    if(modal) modal.style.display = 'none';
  }

  async function invConfirmarModalPrecios(){

    if(!INV_PENDIENTE) return;

    const sel = [];
    const usados = new Map();
    let duplicado = null;

    INV_PENDIENTE.colsPrecio.forEach((c, i) => {
      const select = document.getElementById('inv-precio-' + i);
      const destino = select ? select.value : '';
      if(!destino) return;
      if(usados.has(destino)){
        duplicado = { destino, anterior: usados.get(destino), actual: c.h };
        return;
      }
      usados.set(destino, c.h);
      sel.push({ idx:c.idx, h:c.h, nombre:c.nombre, destino });
    });

    const error = document.getElementById('inv-precio-error');
    if(duplicado){
      if(error){
        error.textContent = 'El destino "' + duplicado.destino + '" está asignado más de una vez: "' + duplicado.anterior + '" y "' + duplicado.actual + '". Cada precio del 1 al 4 solo puede utilizarse una vez.';
        error.style.display='block';
      }
      return;
    }
    if(error) error.style.display='none';

    INV_PRECIOS_SEL = sel;

    const vacios = (INV_PENDIENTE.datos.rows || []).filter(r => {
      const eq = invUbicarEquivalencias(INV_PENDIENTE.datos.hdrs).find(e => e.salida === 'Código');
      const valor = eq && eq.idx >= 0 ? invPorIndice(r, eq.idx) : '';
      return invVacio(invLimpiarRef(valor));
    }).length;

    invCerrarModalPrecios();

      if(vacios > 0){

        invMostrarModalCodigosVacios(vacios);

        return;
      }
    INV_CODIGOS_AUTO = { aplicar:false, inicio:1 };
    await invContinuarDespuesPrecios();
  }

  window.invCerrarModalPrecios    = invCerrarModalPrecios;
  window.invConfirmarModalPrecios = invConfirmarModalPrecios;

  // ══════════════════════════════════════════════════════════════════
// MODAL: CÓDIGOS VACÍOS
// ══════════════════════════════════════════════════════════════════

  function invMostrarModalCodigosVacios(cantidad){
    let modal = document.getElementById('inv-modal-codigos');
    if(!modal){
      modal=document.createElement('div');
      modal.id='inv-modal-codigos';
      modal.style.cssText='position:fixed;inset:0;z-index:9600;overflow:auto;display:none';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0;"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;">
        <div style="width:100%;max-width:500px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
          <div style="text-align:center;margin-bottom:22px;">
            <div style="font-size:20px;font-weight:700;color:#fff;">Códigos vacíos</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:8px;line-height:1.5;">Se encontraron <strong style="color:#fff;">${cantidad}</strong> registro(s) sin código.</div>
            <div style="font-size:12px;color:rgba(255,255,255,.55);margin-top:8px;">¿Deseas asignarles códigos automáticamente?</div>
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;color:rgba(255,255,255,.8);font-size:12px;margin-bottom:7px;">Código inicial</label>
            <input id="inv-codigo-inicio" type="text" value="00001" inputmode="numeric" maxlength="12" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.18);color:#fff;font-size:14px;outline:none;">
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:6px;">Ejemplo: 00001, 00002, 00003...</div>
          </div>
          <div style="display:flex;gap:12px;">
            <button type="button" onclick="window.invNoGenerarCodigos()" style="flex:1;padding:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:10px;color:#fff;font-size:14px;cursor:pointer;">No, dejar vacíos</button>
            <button type="button" onclick="window.invGenerarCodigos()" style="flex:1;padding:12px;background:linear-gradient(135deg,#5b4fcf,#7c6ef0);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Sí, generar códigos</button>
          </div>
        </div>
      </div>`;
    modal.style.display='block';
  }

  function invCerrarModalCodigos(){
    const modal=document.getElementById('inv-modal-codigos');
    if(modal) modal.style.display='none';
  }

  function invContarCodigosVacios(datos){

  const directo = invMapearColumnas(datos.hdrs);
  const equivalencias = invUbicarEquivalencias(datos.hdrs);

  const eqCodigo = equivalencias.find(
    e => e.salida === 'Código'
  );

  let cantidad = 0;

  for(const r of datos.rows){

    let codigo = '';

    if(eqCodigo && eqCodigo.idx >= 0){

      codigo = invLimpiarRef(
        invPorIndice(r, eqCodigo.idx)
      );

    }else{

      const real = directo.mapa['Código'];

      if(real){
        codigo = invLimpiarRef(r[real]);
      }
    }

    if(!codigo){
      cantidad++;
    }
  }

  return cantidad;
}

async function invContinuarDespuesPrecios(){

  if(!INV_PENDIENTE){
    return;
  }

  const cantidad =
    INV_PENDIENTE.codigosVacios || 0;

  if(cantidad > 0){

    invMostrarModalCodigosVacios(cantidad);

    return;
  }

   INV_CODIGOS_AUTO = { aplicar:false, inicio:1 };

  await invProcesar();
}

  function invNoGenerarCodigos(){
    INV_CODIGOS_AUTO = { aplicar:false, inicio:1 };
    invCerrarModalCodigos();
    invProcesar();
  }

  function invGenerarCodigos(){
    const input=document.getElementById('inv-codigo-inicio');
    const raw=String(input ? input.value : '00001').trim();
    if(!/^\d+$/.test(raw)){ alert('El código inicial debe contener solamente números.'); return; }
    const inicio=Number(raw);
    if(!Number.isSafeInteger(inicio) || inicio < 0){ alert('El código inicial no es válido.'); return; }
    INV_CODIGOS_AUTO={ aplicar:true, inicio, ancho:Math.max(5, raw.length) };
    invCerrarModalCodigos();
    invProcesar();
  }

  window.invCerrarModalCodigos=invCerrarModalCodigos;
  window.invNoGenerarCodigos=invNoGenerarCodigos;
  window.invGenerarCodigos=invGenerarCodigos;

  // ══════════════════════════════════════════════════════════════════
  // FASE 1: leer el archivo y, si trae listas de precio, mostrar el
  // modal para elegir cuáles incluir.
  // ══════════════════════════════════════════════════════════════════

  async function invIniciar(){

    // Alegra usa el mismo input de Inventarios del HTML: f-inv-m.
    // Esto evita que el archivo seleccionado quede desconectado del ETL.
    const domInput = document.getElementById('f-inv-m');
    const file = INV_S.file
      || (domInput && domInput.files && domInput.files[0])
      || (window.__ALEGRA_INV_S && window.__ALEGRA_INV_S.file)
      || null;

    if(!file){
      alert('Carga el archivo de Alegra (Items).');
      invLog('❌ No se encontró archivo en f-inv-m.', 'e', 'Lectura');
      return;
    }

    INV_S.file = file;

    try{

      const datos = await invReadFile(file);
      const colsPrecio = invDetectarColsPrecio(datos.hdrs);

      const codigosVacios =
        invContarCodigosVacios(datos);

      INV_PENDIENTE = {
        datos,
        colsPrecio,
        archivo: file.name,
        codigosVacios
      };

      if(colsPrecio.length){

          invMostrarModalPrecios(colsPrecio);

        }else{

          INV_PRECIOS_SEL = [];

          await invContinuarDespuesPrecios();

        }

    }catch(err){
      alert('No se pudo leer el archivo: ' + err.message);
      console.error(err);
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // FASE 2: PROCESO — Alegra → plantilla WO Escritorio
  // ══════════════════════════════════════════════════════════════════

  async function invProcesar(){

    if(!INV_PENDIENTE){
      alert('Carga el archivo de Alegra (Items).');
      return;

      
    }

    const { datos, archivo } = INV_PENDIENTE;
    const preciosSel = INV_PRECIOS_SEL || [];

    INV_LOG.length = 0;
    INV_EXCL.length = 0;
    INV_WB = null;

    const panel = document.getElementById('inv-logp');
    if(panel) panel.innerHTML = '';

    invSetStep(3);
    invSetPStep(0);
    invSetPct(0, 'Iniciando...');

    const t0 = Date.now();

    try{

      // ── 1. Lectura ──
      invSetPStep(1);
      invSetPct(15, 'Leyendo archivo...');
      invLog('📂 Leyendo archivo de Alegra (Items): ' + archivo, 'i', 'Lectura');
      await invSleep(30);

      const directo = invMapearColumnas(datos.hdrs);

      // Equivalencias entrada → salida
      const equivalencias = invUbicarEquivalencias(datos.hdrs);

      // Un título de salida que tenga equivalencia no se toma "directo"
      // (ej. la "Descripción" de Alegra NO va a Descripción; va el Nombre)
      equivalencias.forEach(e => { directo.mapa[e.salida] = null; });

      invLog('   ' + datos.rows.length + ' registros, ' + datos.hdrs.length + ' columnas', 'i', 'Lectura');
      invLog('   Encabezados detectados: ' + datos.hdrs.join(' | '), 'i', 'Lectura');
      equivalencias.forEach(e => {
        invLog(
          '   ' + (e.idx >= 0 ? '✔ ' : '✖ ') + e.entrada + ' → ' + e.salida +
          (e.idx >= 0 ? '' : '  (no viene en el archivo: la columna queda vacía)'),
          e.idx >= 0 ? 'i' : 'w', 'Equivalencias'
        );
      });

      invLog('   Listas de precio elegidas: ' + preciosSel.length, 'i', 'Lectura');

      if(directo.encontrados.length){
        invLog('   Títulos de la plantilla que vienen directo en el archivo: ' + directo.encontrados.length, 'i', 'Lectura');
      }


      // ── 2. Transformación ──
      invSetPStep(2);
      invSetPct(40, 'Transformando...');
      invLog('🔄 Transformando registros...', 'i', 'Transformación');
      await invSleep(30);

      const st = {
        preciosConLetras:0, ejemplosLetras:[],
        enterosConLetras:0, ejemplosEnteros:[],
        sinoDesconocido:0,  ejemplosSiNo:[],
        sinCodigo:0,
        multiImpuesto:0
      };

      const vistos   = new Set();
      const defaults = [];
      const filas    = [];
      let siguienteCodigo = (INV_CODIGOS_AUTO && INV_CODIGOS_AUTO.aplicar)
        ? INV_CODIGOS_AUTO.inicio : null;
      const anchoCodigoAuto = (INV_CODIGOS_AUTO && INV_CODIGOS_AUTO.aplicar)
        ? INV_CODIGOS_AUTO.ancho : 5;
      const obtenerCodigoAuto = () => {
        while(true){
          const candidato = String(siguienteCodigo).padStart(anchoCodigoAuto,'0');
          siguienteCodigo++;
          if(!vistos.has(candidato)) return candidato;
        }
      };

      for(const r of datos.rows){

        // Valor directo (si el archivo ya trae el título de salida)
        const dir = titulo => {
          const real = directo.mapa[titulo];
          return real ? { v: r[real], raw: r.__raw ? r.__raw[real] : undefined } : { v:'', raw:undefined };
        };

        // ── Valores según la tabla de equivalencias
        const eqv = {};
        equivalencias.forEach(e => {
          if(e.idx < 0) return;
          eqv[invClave(e.salida)] = {
            v:   invPorIndice(r, e.idx),
            raw: r.__raw ? r.__raw[e.real] : undefined
          };
        });

        // ── Código (obligatorio) y control de duplicados
        let cod = invLimpiarRef(
          eqv[invClave('Código')] ? eqv[invClave('Código')].v : dir('Código').v
        );

        const descripcion = String(
          eqv[invClave('Descripción')] ? eqv[invClave('Descripción')].v : dir('Descripción').v
        || '').trim();

        // Si el usuario autorizó generación automática, solo los códigos vacíos se completan.
        if(!cod && INV_CODIGOS_AUTO && INV_CODIGOS_AUTO.aplicar){
          cod = obtenerCodigoAuto();
          defaults.push({ cod, nombre:descripcion, campo:'Código', valor:cod, motivo:'Código generado automáticamente para registro sin código' });
        }else if(!cod){
          st.sinCodigo++;
        }

        // Duplicados solo se revisan cuando sí hay código.
        if(cod){
          if(vistos.has(cod)){
            INV_EXCL.push({ cod, nom: descripcion, motivo:'Código duplicado' });
            continue;
          }
          vistos.add(cod);
        }

        // ── Listas de precio elegidas en el modal → Precio 1..4
        const precios = {};

            preciosSel.forEach(c => {
              if(!c || !c.destino || c.idx < 0) return;

              const destino = invClave(c.destino);

              // Solo permitimos Valor Lista Precios 1, 2, 3 y 4
              if(!INV_PRECIOS_CERO_DEFAULT.has(destino)) return;

              precios[destino] = {
                nombre: String(c.h || c.nombre || '').replace(/^precio\s*:\s*/i, '').trim(),
                valor: invPorIndice(r, c.idx),
                crudo: (r.__raw && c.h !== undefined)
                  ? r.__raw[c.h]
                  : undefined
              };
            });
        // ── Armar la fila en el orden de los títulos de salida
        //    Prioridad: equivalencia > título directo > precio del modal > vacío
        const fila = {};

        INV_COLUMNAS.forEach(titulo => {

          let valor = null, crudo;

          if(titulo === 'Código'){
            valor = cod;
          }else if(titulo === 'Descripción'){
            valor = descripcion;
          }else if(eqv[invClave(titulo)] && !invVacio(eqv[invClave(titulo)].v)){
            valor = eqv[invClave(titulo)].v; crudo = eqv[invClave(titulo)].raw;
          }else if(!invVacio(dir(titulo).v)){
            valor = dir(titulo).v; crudo = dir(titulo).raw;
          }else if(INV_PRECIOS_CERO_DEFAULT.has(invClave(titulo))){
              const clavePrecio = invClave(titulo);
              const precioSeleccionado = precios[clavePrecio];

              if(precioSeleccionado){
                valor = precioSeleccionado.valor;
                crudo = precioSeleccionado.crudo;
              }
          }
        
          // En World Office Cloud, las listas de precios 1 a 4 deben
          // llevar el mismo texto que la columna Descripción.
          // No tomar el nombre del encabezado del precio de Alegra.
          const matchNombreLista = invClave(titulo).match(/^nombre lista precios ([1-6])$/);
          if(matchNombreLista){
            const numeroLista = Number(matchNombreLista[1]);
            if(numeroLista >= 1 && numeroLista <= 4){
              valor = descripcion;
            }else{
              // Las listas 5 y 6 se conservan vacías salvo que exista
              // un valor directo para ellas en la plantilla de entrada.
              valor = null;
            }
          }

          // ── Valores por defecto ──
          // Exis. Máxima, Exis. Mínima y Punto Reorden → 0 si están vacíos.
          valor = invAplicarCeroDefault(titulo, valor);

          // Grupo Uno vacío → texto predeterminado.
          valor = invAplicarGrupoUnoDefault(titulo, valor);

          // Precio 1, 2, 3 y 4 vacíos → 0.
          valor = invAplicarPrecioCeroDefault(titulo, valor);

          if(invClave(titulo) === invClave('Unidad Medida') && !invVacio(valor)){
            valor = invMapUnidad(valor);
          }

          // ── Normalización especial del IVA ──
          // Alegra puede exportar encabezados "Impuesto" repetidos. Si el
          // valor elegido no contiene una tarifa reconocible, buscar otra
          // columna Impuesto/IVA con dato en la misma fila.
          if(invClave(titulo) === invClave('Valor IVA')){
            const ivaActual = invNormalizarIVA(valor);
            if(typeof ivaActual !== 'number' || !Number.isFinite(ivaActual)){
              const candidatosIVA = datos.hdrs.map((h, idx) => ({h, idx, k:invClave(h)}))
                .filter(x => ['impuesto','iva','porcentaje de impuesto','tarifa de impuesto','impuesto ventas'].includes(x.k));
              for(const cIVA of candidatosIVA){
                const candidato = invNormalizarIVA(invPorIndice(r, cIVA.idx));
                if(typeof candidato === 'number' && Number.isFinite(candidato)){
                  valor = candidato;
                  break;
                }
              }
            }else{
              valor = ivaActual;
            }
          }

          // ── Tipo Iva según Iva ──
          // Iva = 19 → Gravado
          // Cualquier otro valor → Exento


      if(invClave(titulo) === invClave('Tipo Impuesto Ventas')){

        const tipoIva = String(
          fila['Tipo Impuesto Ventas'] ?? ''
        ).trim();

        if(
          tipoIva === 'Gravado' ||
          tipoIva === 'Exento' ||
          tipoIva === 'Excluido' ||
          tipoIva === 'No Gravado' ||
          tipoIva === 'No Gravado'
        ){

        valor = tipoIva;

        }else{

          let iva = Number(
            String(fila['Valor IVA'] ?? '')
              .trim()
              .replace(',', '.')
          );


          valor = (Number.isFinite(iva) && iva === 19)
            ? 'Gravado'
            : 'No Gravado';

        }

      }          

          
          // ── Clasificación y Clasificación Niif según Tipo Iva ──
          // Tipo Iva = Gravado → Producto
          // Cualquier otro valor → Servicio
          if(titulo === 'Clasificación' || titulo === 'Clasificación Niif'){

              const tipoIva = String(fila['Tipo Iva'] ?? '').trim();

              if(
                tipoIva === 'Producto' ||
                tipoIva === 'Servicio' ||
                tipoIva === 'Gasto' ||
                tipoIva === 'Activo Fijo'
              ){
                valor = tipoIva;
              }else{
                valor = tipoIva === 'Gravado'
                  ? 'Producto'
                  : 'Servicio';
              }

            }

           // ── Clasificación y Clasificación Niif según Tipo Iva ──

          if(titulo === 'Producto'){
            valor = fila['Clasificación Niif'] === 'Producto'
              ? -1
              : 0;
          }

          // ── Clasificación y Clasificación Niif según Tipo Iva ──

          if(titulo === 'Facturar sin Existen.'){
            valor = fila['Producto'] === -1
              ? 0
              : -1;
          }


          if(invEsColumnaSiNo(titulo)){
            const res = invLimpiarSiNo(valor, crudo);
            if(res.desconocido){
              st.sinoDesconocido++;
              if(st.ejemplosSiNo.length < 5) st.ejemplosSiNo.push(titulo + ': "' + valor + '"');
            }
            fila[titulo] = res.valor;
            return;
          }

          if(invEsColumnaEntero(titulo)){
            const res = invLimpiarEntero(valor, crudo);
            if(res.conLetras){
              st.enterosConLetras++;
              if(st.ejemplosEnteros.length < 5) st.ejemplosEnteros.push(titulo + ': "' + valor + '"');
            }
            fila[titulo] = res.valor;
            return;
          }

          if(invEsColumnaPrecio(titulo)){

            const res = invLimpiarPrecio(valor, crudo);
            if(res.conLetras){
              st.preciosConLetras++;
              if(st.ejemplosLetras.length < 5) st.ejemplosLetras.push(titulo + ': "' + valor + '"');
            }
            fila[titulo] = res.valor;
            return;
          }

          // Suma al Costo: si viene vacío, colocar No
            if (invClave(titulo) === invClave('Suma al Costo')) {
              if (invVacio(valor)) {
                valor = 'No';
              }
            }


            if (invClave(titulo) === invClave('Pertenece a un Producto')) {
              if (invVacio(valor)) {
                valor = 'No';
              }
            }

            if (invClave(titulo) === invClave('Ver en POS')) {
              if (invVacio(valor)) {
                valor = 'No';
              }
              
            }

      // Bodega 1: si viene vacío, colocar Principal
                    if (invClave(titulo) === invClave('Bodega 1')) {
                      if (invVacio(valor)) {
                        valor = 'Principal';
                      }
                    }



          fila[titulo] = invVacio(valor) ? null : valor;
            });

           
            // ── Ajustar Tipo Impuesto Ventas según Valor IVA ──

            const claveTipoIva = Object.keys(fila).find(
              k => invClave(k) === invClave('Tipo Impuesto Ventas')
            );

            const claveValorIva = Object.keys(fila).find(
              k => invClave(k) === invClave('Valor IVA')
            );

            if (claveTipoIva && claveValorIva) {
              let iva = Number(
                String(fila[claveValorIva] ?? '')
                  .trim()
                  .replace(',', '.')
              );

              if (iva > 0 && iva < 1) {
                iva *= 100;
              }

              fila[claveTipoIva] =
                Number.isFinite(iva) && iva === 19
                  ? 'Gravado'
                  : 'No Gravados';
            }
                    filas.push(fila);
                  }


      // ── Avisos
      if(st.sinoDesconocido){
        invLog('   ' + st.sinoDesconocido + ' valores Si/No no reconocidos quedaron vacíos (ej: ' + st.ejemplosSiNo.join(' ; ') + ')', 'w', 'Si/No');
      }
      if(st.enterosConLetras){
        invLog('   ' + st.enterosConLetras + ' existencias máx/mín tenían letras y quedaron vacías (ej: ' + st.ejemplosEnteros.join(' ; ') + ')', 'w', 'Existencias');
      }
      if(st.preciosConLetras){
        invLog('   ' + st.preciosConLetras + ' precios tenían letras y quedaron vacíos (ej: ' + st.ejemplosLetras.join(' ; ') + ')', 'w', 'Precios');
      }

      if(st.sinCodigo){
        invLog('   ' + st.sinCodigo + ' registros sin Código del producto o servicio — se dejaron con Código vacío', 'w', 'Transformación');
      }

      invLog('✅ ' + filas.length + ' registros transformados', 'o', 'Transformación');

      if(INV_EXCL.length){
        invLog('   ⚠ ' + INV_EXCL.length + ' excluidos por código duplicado', 'w', 'Transformación');
      }

      // ── 3. Excel ──
      invSetPStep(4);
      invSetPct(85, 'Generando Excel...');
      invLog('📊 Construyendo archivo Excel...', 'i', 'Escritura');
      await invSleep(30);

      const dur = ((Date.now() - t0) / 1000).toFixed(1);

      INV_WB = invBuildWB(filas, {
        archivo_entrada: archivo,
        registros_entrada: datos.rows.length,
        registros_salida: filas.length,
        excluidos: INV_EXCL.length,
        registros_sin_codigo: st.sinCodigo,
        equivalencias_encontradas: equivalencias.filter(e => e.idx >= 0).length + ' de ' + equivalencias.length,
        listas_de_precio: preciosSel.length,
        precios_vaciados_por_letras: st.preciosConLetras,
        existencias_vaciadas_por_letras: st.enterosConLetras,
        sino_valores_no_reconocidos: st.sinoDesconocido,
        duracion_seg: dur
      }, INV_EXCL, defaults);

      const fn = invBuildFN();

      invSetPct(100, '¡Listo!');
      invSetPStep(5);
      invLog('✅ Excel listo en ' + dur + 's — ' + filas.length + ' productos', 'o', 'Escritura');

      invTexto('inv-dl-fn', fn);
      invTexto('inv-dl-dest', 'Para importar en World Office Cloud');
      invTexto('inv-st-in', datos.rows.length.toLocaleString('es-CO'));
      invTexto('inv-st-ok', filas.length.toLocaleString('es-CO'));

      try{
        const reg = {
          filename_out: fn,
          orig_soft: 'Alegra',
          dest_soft: 'World Office Cloud',
          module: 'Inventarios',
          records_in: datos.rows.length,
          records_out: filas.length,
          errors: 0,
          warnings: INV_EXCL.length,
          duration_sec: parseFloat(dur),
          status: 'completed'
        };

        if(typeof window.logMigrationToBackend === 'function'){
          await window.logMigrationToBackend(reg);
        }else if(typeof window.api === 'function' && window.AUTH){
          await window.api('POST', '/migrations', reg, window.AUTH.token);
        }
      }catch(e){}

      invSetStep(4);

      return { filas, wb: INV_WB, fn, excluidos: INV_EXCL.slice() };

    }catch(err){

      invLog('❌ Error: ' + err.message, 'e', 'Pipeline');
      console.error(err);
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // GENERAR EXCEL
  // Hojas: Inventario · Log · Resumen · Excluidos · Campos por Defecto
  // ══════════════════════════════════════════════════════════════════

 function invCrearHojaGrupoDos(wb, filas){

  const datos = [
    [
      'ID Grupo Inventario Dos',
      'Código Agrupación',
      'Descripción'
    ]
  ];

  const gruposVistos = new Set();

  let idGrupo = 15;

  (filas || []).forEach(fila => {

    let grupoDos = fila['Grupo Dos'];

    // Ignorar valores vacíos
    if(grupoDos == null){
      return;
    }

    grupoDos = String(grupoDos).trim();

    if(!grupoDos){
      return;
    }

    // Evitar repetidos
    const clave = grupoDos
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if(gruposVistos.has(clave)){
      return;
    }

    gruposVistos.add(clave);

    // ID consecutivo comenzando en 15
    const primerasCuatro = grupoDos
      .replace(/\s+/g, '')
      .substring(0, 4)
      .toUpperCase();

    const codigoAgrupacion =
      primerasCuatro + idGrupo;

    datos.push([
      idGrupo,
      codigoAgrupacion,
      grupoDos
    ]);

    idGrupo++;

  });

  const wsGrupoDos =
    XLSX.utils.aoa_to_sheet(datos);

  wsGrupoDos['!cols'] = [
    { wch: 25 },
    { wch: 20 },
    { wch: 45 }
  ];

  XLSX.utils.book_append_sheet(
    wb,
    wsGrupoDos,
    'Grupo Dos'
  );
}
  function invBuildWB(filas, stats, excluidos, defaults){

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(filas, { header: INV_COLUMNAS });

    if(!filas.length){
      XLSX.utils.sheet_add_aoa(ws, [INV_COLUMNAS], { origin:'A1' });
    }

    ws['!cols'] = INV_COLUMNAS.map(t => ({ wch: Math.max(12, t.length + 2) }));

    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    // Hoja adicional 'Grupo Dos' desactivada por ahora.
    // invCrearHojaGrupoDos(wb, filas);

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(INV_LOG.map(x => ({
        Fecha: x.ts,
        Fase: x.fase,
        Nivel: x.lvl === 'e' ? 'ERROR' : x.lvl === 'w' ? 'WARN' : 'INFO',
        Mensaje: x.msg
      }))),
      'Log'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(Object.entries(stats || {}).map(([Clave, Valor]) => ({ Clave, Valor }))),
      'Resumen'
    );

    const ex = [['Código','Nombre','Motivo']];
    (excluidos || []).forEach(e => ex.push([e.cod, e.nom, e.motivo]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ex), 'Excluidos');

    if(defaults && defaults.length){
      const df = [['Código','Nombre','Campo','Valor Asignado','Motivo']];
      defaults.forEach(d => df.push([d.cod, d.nombre, d.campo, d.valor, d.motivo]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(df), 'Campos por Defecto');
    }

    return wb;
  }

  function invBuildFN(){
    return 'inventarios_alegra_cloud.xlsx';
  }

  function invDescargar(){

    if(!INV_WB){
      alert('Primero ejecuta el proceso de inventario.');
      return;
    }

    try{
      XLSX.writeFile(INV_WB, invBuildFN());
    }catch(e){
      console.error('Error al descargar:', e);
      alert('Error al descargar: ' + e.message);
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA DE INVENTARIOS
  //   • Opción "Alegra" en inv-sorig
  //   • Casilla "Alegra - Items" (compartida con el módulo Cloud
  //     hermano mediante window.__ALEGRA_INV_S)
  //   • routeInvETL / routeInvDownload: solo Alegra → World Office Cloud
  //   • showPg('inventarios'): limpia el estado propio
  // ══════════════════════════════════════════════════════════════════

  function invInstalar(){
    // Registrar las rutas SIEMPRE, aunque algún elemento visual todavía no exista.
    // Antes, un return temprano por falta de #inv-sorig o #f-inv-m impedía
    // registrar routeInvETL y provocaba: "No se encontró el proceso ETL...".
    if(!window.__INV_ALEGRA_CLOUD_ROUTES_INSTALLED){
      window.__INV_ALEGRA_CLOUD_ROUTES_INSTALLED = true;

      const esMiRuta = () => {
        const origEl = document.getElementById('inv-sorig');
        const destEl = document.getElementById('inv-sdest');
        const orig = origEl ? String(origEl.value || '').trim() : '';
        const dest = destEl ? String(destEl.value || '').trim() : '';
        return orig === 'Alegra' && dest === 'World Office Cloud';
      };

      const _origRouteInvETL = window.routeInvETL;
      window.routeInvETL = function(){
        if(esMiRuta()){
          const inputActual = document.getElementById('f-inv-m');
          const f = (inputActual && inputActual.files && inputActual.files[0])
            || (window.__ALEGRA_INV_S && window.__ALEGRA_INV_S.file)
            || INV_S.file;
          if(f) INV_S.file = f;
          return invIniciar();
        }
        if(typeof _origRouteInvETL === 'function') return _origRouteInvETL.apply(this, arguments);
        console.warn('[inventarios.js] No hay ruta ETL registrada para esta combinación de origen y destino.');
      };

      const _origRouteInvDownload = window.routeInvDownload;
      window.routeInvDownload = function(){
        if(esMiRuta()) return invDescargar();
        if(typeof _origRouteInvDownload === 'function') return _origRouteInvDownload.apply(this, arguments);
      };

      const _origShowPg = window.showPg;
      window.showPg = function(name){
        const resultado = typeof _origShowPg === 'function'
          ? _origShowPg.apply(this, arguments)
          : undefined;
        if(name === 'inventarios'){
          setTimeout(() => {
            INV_S.file = null;
            INV_WB = null;
            INV_PENDIENTE = null;
            INV_PRECIOS_SEL = null;
            INV_CODIGOS_AUTO = null;
            invCerrarModalPrecios();
            invCerrarModalCodigos();
            if(window.__ALEGRA_INV_S) window.__ALEGRA_INV_S.file = null;
            const slot = document.getElementById('sl-inv-m');
            if(slot) slot.classList.remove('ok');
            const nm = document.getElementById('nm-inv-m');
            if(nm) nm.textContent = '';
          }, 15);
        }
        return resultado;
      };
    }

    const sorigEl = document.getElementById('inv-sorig');
    const input = document.getElementById('f-inv-m');
    // Si la vista todavía no está montada, las rutas ya quedaron registradas.
    if(!sorigEl || !input) return;

    if(!sorigEl.querySelector('option[value="Alegra"]')){
      const opt = document.createElement('option');
      opt.value = 'Alegra';
      opt.textContent = 'Alegra';
      sorigEl.appendChild(opt);
    }

    window.__ALEGRA_INV_S = window.__ALEGRA_INV_S || { file:null };

    // Evitar agregar el mismo listener si invInstalar se ejecuta de nuevo.
    if(!input.dataset.invAlegraCloudBound){
      input.dataset.invAlegraCloudBound = '1';
      input.addEventListener('change', function(){
        const f = input.files && input.files[0];
        if(!f) return;
        INV_S.file = f;
        window.__ALEGRA_INV_S.file = f;
        const slot = document.getElementById('sl-inv-m');
        const nm = document.getElementById('nm-inv-m');
        if(slot) slot.classList.add('ok');
        if(nm) nm.textContent = f.name;
        invLog('📂 Archivo seleccionado: ' + f.name, 'i', 'Lectura');
      });
    }

    function invToggle(){
      const esAlegra = sorigEl.value === 'Alegra';
      const cardS = document.getElementById('inv-fsub');
      const fn = document.getElementById('inv-file-name');
      const fd = document.getElementById('inv-file-desc');
      if(cardS) cardS.textContent = esAlegra
        ? 'Exportación de productos desde Alegra'
        : 'Exportación de Siigo Nube';
      if(fn) fn.textContent = esAlegra
        ? 'Productos_Alegra.csv / Productos_Alegra.xlsx'
        : 'Listado_de_productos___Servicios.xlsx';
      if(fd) fd.textContent = esAlegra
        ? 'Archivo de productos exportado desde Alegra'
        : 'Exportación directa de Siigo Nube';
    }

    if(!sorigEl.dataset.invAlegraCloudBound){
      sorigEl.dataset.invAlegraCloudBound = '1';
      sorigEl.addEventListener('change', invToggle);
    }
    invToggle();
  }

  // ══════════════════════════════════════════════════════════════════
  // API DEL MÓDULO (para pruebas desde la consola)
  // ══════════════════════════════════════════════════════════════════

  window.INV = {
    columnas: INV_COLUMNAS.slice(),
    leer: invReadFile,
    limpiarPrecio: invLimpiarPrecio,
    limpiarEntero: invLimpiarEntero,
    limpiarSiNo: invLimpiarSiNo,
    equivalencias: INV_EQUIVALENCIAS,
    iniciar: invIniciar,
    descargar: invDescargar,
    estado: INV_S
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', invInstalar);
  }else{
    invInstalar();
  }

  console.log('%c[inventarios.js] v13 — Alegra usa el mismo cargador de Inventarios y detecta encabezados/alias', 'color:#16a34a;font-weight:bold');

})();
