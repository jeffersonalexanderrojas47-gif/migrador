// ══════════════════════════════════════════════════════════════════
// ETL: Terceros — Logro → World Office Escritorio
// Módulo: terceros_logro_to_wo_escritorio.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución (inyecta la opción
// "Logro" en el selector de origen, agrega sus DOS slots de archivo
// — "Clientes de la compañía" y "Proveedores de la compañía", exportados
// directamente desde Logro — y "envuelve" routeETL()/routeDownload()/
// showPg() para interceptar el flujo solo cuando el origen elegido es
// "Logro" y el destino "World Office Escritorio". Cuando el destino es
// "World Office Cloud" deja pasar hacia terceros_logro_to_wo_cloud.js
// (archivo hermano, completamente separado, sin lógica compartida
// entre ambos salvo los Files subidos — igual que ya ocurre entre los
// módulos de SIIMED ERP y de Siigo Nube).
//
// AUTOCONTENIDO: este archivo NO depende de ningún helper definido en
// otro módulo de terceros (Siigo Nube, SIIMED ERP, Alegra). Cada
// proceso debe poder ejecutarse aunque los demás archivos .js de
// "terceros" fallen al cargar. Solo depende de utilidades
// verdaderamente globales de la app (definidas en app.js / cargadas
// antes de todos los módulos de terceros): setStep, setPStep, setPct,
// api, AUTH.
//
// ESTRUCTURA DEL ARCHIVO DE ORIGEN (Logro exporta dos reportes
// separados, cada uno con una fila por tercero — NO hay columna
// "Tipo" como en SIIMED; el tipo lo da el archivo en el que aparece):
//   Clientes de la compañía [Nombre].xlsx
//   Proveedores de la compañía [Nombre].xlsx
// Ambos con las mismas columnas base:
//   Primer Nombre, Segundo Nombre, Nombre Comercial, Nombre Legal,
//   Primer Apellido, Segundo Apellido, Cliente/Proveedor (nombre ya
//   concatenado), Identificación, Persona (Persona Natural / Persona
//   Jurídica — dato DIRECTO y confiable, a diferencia de SIIMED),
//   Tipo de Identificación (texto libre, ya viene en un vocabulario
//   muy cercano al de World Office), Inscrito en el RUT, Dirección,
//   Ciudad, Teléfono, Correo Electrónico, Grupo de Proveedores/
//   Grupo Clientes.
// El archivo de Clientes trae además: Saldo COP, Vendedor, Nombre
// Vendedor, Fecha Creación, Usuario Creación, Fecha Última
// Modificación, Usuario Última Modificación — ninguno de estos se usa
// en Terceros (Saldo COP pertenece al módulo de Saldos Iniciales;
// Vendedor se deja en null — ver nota más abajo).
// NOTA: el archivo de Proveedores de Logro trae la columna
// "Tipo de Identiticación" con una errata (falta la "f") — este
// módulo tolera ambas grafías al buscar la columna (ver logroCol()).
// Un mismo tercero puede aparecer en ambos archivos (Cliente Y
// Proveedor a la vez) — se consolida por "Identificación" en una
// sola fila de salida, igual que hace SIIMED con su columna "TIPO".
//
// DECISIONES DOCUMENTADAS (sin dato de origen confiable, se deja el
// valor por defecto más seguro — avisa si tu caso necesita otra
// cosa):
//   • Activo: no hay columna de estado en los archivos de Logro → se
//     migra siempre como Activo.
//   • Propiedad Retención / Tipo Contribuyente: no hay columna de
//     régimen tributario → Persona Jurídica si "Persona"=Jurídica,
//     si no "Persona Natural No Responsable del IVA".
//   • Actividad Económica: no hay columna de actividad económica en
//     los archivos de Logro → siempre null.
//   • Vendedor: aunque el archivo de Clientes SÍ trae "Vendedor"/
//     "Nombre Vendedor", se deja en null — igual que se decidió para
//     SIIMED, porque ese campo en World Office espera un código de
//     vendedor ya existente en el catálogo de WO, no un nombre libre.
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const LOGRO_ESC_S = { clientesFile:null, proveedoresFile:null };
  let LOGRO_ESC_WB = null;
  const LOGRO_ESC_LOG = [];

  function logroEscLog(msg, lvl, fase){
    const ts = new Date().toISOString();
    LOGRO_ESC_LOG.push({ ts, fase: fase || '', lvl: lvl || 'i', msg });
    const panel = document.getElementById('logp');
    if(!panel) return;
    const now = new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css = {i:'li', w:'lw', o:'lo', e:'le-e'}[lvl] || 'li';
    panel.innerHTML += '<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop = panel.scrollHeight;
  }
  function logroEscSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function logroNormId(x){
    const s=String(x??'').replace(/[,\s]/g,'').trim();
    if(!s||s==='nan'||s==='undefined')return '';
    return s.replace(/[^0-9A-Za-z\-]/g,'');
  }

  function logroCleanTxt(s){
    return String(s||'').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  function logroNormKey(s){
    return String(s||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }

  // ── Búsqueda de columna tolerante a variantes/erratas — el archivo
  //    de Proveedores de Logro trae "Tipo de Identiticación" (con
  //    errata) en vez de "Tipo de Identificación" ────────────────────
  function logroCol(hdrs, name){
    let idx = hdrs.findIndex(h=>String(h||'').trim().toLowerCase()===name.toLowerCase());
    if(idx>=0) return idx;
    const target = logroNormKey(name);
    idx = hdrs.findIndex(h=>logroNormKey(h)===target);
    if(idx>=0) return idx;
    // Tolerancia a la errata "Tipo de Identiticación" (Proveedores.xlsx).
    // Exige que el encabezado candidato también contenga "tipo" — si no,
    // "Identificación" (la columna del número, no del tipo) haría match
    // primero por contener "identific" y se leería la columna equivocada.
    if(target.includes('tipo') && target.includes('identific')){
      idx = hdrs.findIndex(h=>{
        const n=logroNormKey(h);
        return n.includes('tipo') && (n.includes('identific') || n.includes('identitic'));
      });
    }
    return idx;
  }

  // ── Mapeo "Tipo de Identificación" (texto libre de Logro, ya viene
  //    en un vocabulario muy cercano al de World Office) → Tipo
  //    Identificación (World Office Escritorio) ─────────────────────
  const LOGRO_TIPO_ID_ESC = {
    'cedula de ciudadania': 'CC',
    'nit': 'NIT',
    'tarjeta de identidad': 'TI',
    'cedula de extranjeria': 'Cédula de extranjería',
    'registro civil': 'REGISTRO CIVIL',
    'pasaporte': 'PASAPORTE',
    'tarjeta de extranjeria': 'TE',
    'documento de identificacion extranjero': 'Documento de identificación extranjero',
    'nuip': 'NUIP',
    'permiso especial de permanencia': 'Permiso especial de permanencia',
    'permiso proteccion temporal': 'Permiso especial de permanencia',
    'sin identificacion del exterior o uso exclusivo de la dian': 'Sin identificación del exterior o para uso definido por la DIAN',
    'sin identificacion del exterior o para uso definido por la dian': 'Sin identificación del exterior o para uso definido por la DIAN',
    'nit de otro pais': 'Documento de Identificación extranjero Persona Jurídica',
    'salvoconducto de permanencia': 'OTRO'
  };
  function logroMapTipoIdEsc(raw, idNorm){
    const k = logroNormKey(raw);
    if(LOGRO_TIPO_ID_ESC[k]) return LOGRO_TIPO_ID_ESC[k];
    if(!k){
      const n = String(idNorm||'').replace(/\D/g,'');
      return n.length===9 ? 'NIT' : 'CC';
    }
    return String(raw||'').trim();
  }

  // ── Separador de nombre de respaldo — mismo criterio ya usado en
  //    los demás módulos (tercSplitName). Solo se usa si, siendo
  //    persona natural, las columnas Primer/Segundo Nombre y
  //    Primer/Segundo Apellido vienen vacías para una fila puntual. ──
  function logroEscSplitName(nombre, tipoId){
    const n=String(nombre||'').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
    const vacio={p1:'',p2:'',a1:'',a2:''};
    if(!n)return vacio;
    const esNIT=tipoId&&/nit/i.test(String(tipoId));
    const tieneSufijo=/\b(SAS|LTDA|LIMITADA|CORP|INC)\b/.test(n);
    if(esNIT||tieneSufijo)return{p1:String(nombre).trim(),p2:'',a1:'',a2:''};
    const CONN=new Set(['DE','DEL','LA','LAS','LOS','Y','E','I','VAN','VON']);
    const raw=n.split(/\s+/).filter(Boolean);
    const parts=[];
    let i=0;
    while(i<raw.length){
      const tok=raw[i];
      if(CONN.has(tok)&&parts.length>0&&i+1<raw.length){
        const prev=parts.pop();
        const nxt=raw[i+1];
        parts.push(prev+' '+tok+' '+nxt);
        i+=2;
      }else{
        parts.push(tok);
        i++;
      }
    }
    const n2=parts.length;
    if(n2===0)return vacio;
    if(n2===1)return{p1:parts[0],p2:'',a1:'',a2:''};
    if(n2===2)return{p1:parts[0],p2:'',a1:parts[1],a2:''};
    if(n2===3)return{p1:parts[0],p2:'',a1:parts[1],a2:parts[2]};
    return{p1:parts[0],p2:parts[1],a1:parts[2],a2:parts.slice(3).join(' ')};
  }

  // ── NITs excluidos (lista predefinida — ya existen en la base de
  //    datos, mismo criterio usado en todos los demás módulos) ──────
  const LOGRO_ESC_NITS_EXCLUIR = new Set(["222222222","800003122","800037800","800088702","800112806","800118954","800130907","800138188","800140949","800147502","800148514","800149496","800197268","800211025","800216278","800219488","800224808","800226175","800227940","800229739","800231969","800251440","800253055","800256161","804002105","805000427","805001157","806008394","809008362","817001773","824001398","830003564","830008686","830009783","830054904","830074184","830113831","830125132","837000084","839000495","844003392","860002183","860002503","860002964","860003020","860007335","860007336","860007379","860007738","860008645","860011153","860013570","860022137","860034313","860034594","860035827","860043186","860045904","860050750","860051135","860066942","860503617","890000381","890101994","890102002","890102044","890102257","890200106","890200756","890201578","890203088","890203183","890270275","890300279","890303093","890303208","890399010","890480023","890480110","890480123","890500516","890500675","890700148","890704737","890806490","890900840","890900841","890900842","890903790","890903937","890903938","890904996","890980040","891080005","891080031","891180008","891190047","891200337","891280008","891480000","891500182","891500319","891600091","891780093","891800213","891800330","891856000","892000146","892115006","892200015","892399989","892400320","899999001","899999034","899999061","899999063","899999107","899999284","899999734","900156264","900200960","900226715","900298372","900336004","900406150","900604350","900914254","900935126","901037916","901093846","901469580","901543761"]);

  // ── Ciudades — catálogo World Office Escritorio (mismo catálogo
  //    usado en los demás módulos hacia Escritorio) ────────────────
  const LOGRO_ESC_CIUDADES = ["Abejorral", "Abrego", "Abriaquí", "Acacías", "Acandí", "Acevedo", "Achí", "Agrado", "Agua De Dios", "Aguachica", "Aguada", "Aguadas", "Aguazul", "Agustín Codazzi", "Aipe", "Albán", "Albania", "Alcalá", "Aldana", "Alejandría", "Algarrobo", "Algeciras", "Almaguer", "Almeida", "Alpujarra", "Altamira", "Alto Baudo", "Altos Del Rosario", "Alvarado", "Amagá", "Amalfi", "Ambalema", "Anapoima", "Ancuyá", "Andalucía", "Andes", "Angelópolis", "Angostura", "Anolaima", "Anorí", "Anserma", "Ansermanuevo", "Anza", "Anzoátegui", "Apartadó", "Apía", "Apulo", "Aquitania", "Aracataca", "Aranzazu", "Aratoca", "Arauca", "Arauquita", "Arbeláez", "Arboleda", "Arboledas", "Arboletes", "Arcabuco", "Arenal", "Argelia", "Ariguaní", "Arjona", "Armenia", "Armero", "Arroyohondo", "Astrea", "Ataco", "Atrato", "Ayapel", "Bagadó", "Bahía Solano", "Bajo Baudó", "Balboa", "Baranoa", "Baraya", "Barbacoas", "Barbosa", "Barichara", "Barranca De Upía", "Barrancabermeja", "Barrancas", "Barranco De Loba", "Barranco Minas", "Barranquilla", "Becerril", "Belalcázar", "Belén", "Belén De Bajirá", "Belén De Los Andaquies", "Belén De Umbría", "Bello", "Belmira", "Beltrán", "Berbeo", "Betania", "Betéitiva", "Betulia", "Bituima", "Boavita", "Bochalema", "Bogota D.C.", "Bojacá", "Bojaya", "Bolívar", "Bosconia", "Boyacá", "Briceño", "Bucaramanga", "Bucarasica", "Buenaventura", "Buenavista", "Buenos Aires", "Buesaco", "Bugalagrande", "Buriticá", "Busbanzá", "Cabrera", "Cabuyaro", "Cacahual", "Cáceres", "Cachipay", "Cachirá", "Cácota", "Caicedo", "Caicedonia", "Caimito", "Cajamarca", "Cajibío", "Cajicá", "Calamar", "Calarca", "Caldas", "Caldono", "Cali", "California", "Calima", "Caloto", "Campamento", "Campo De La Cruz", "Campoalegre", "Campohermoso", "Canalete", "Candelaria", "Cantagallo", "Cañasgordas", "Caparrapí", "Capitanejo", "Caqueza", "Caracolí", "Caramanta", "Carcasí", "Carepa", "Carmen De Apicalá", "Carmen De Carupa", "Carmen Del Darien", "Carolina", "Cartagena", "Cartagena Del Chairá", "Cartago", "Caruru", "Casabianca", "Castilla La Nueva", "Caucasia", "Cepitá", "Cereté", "Cerinza", "Cerrito", "Cerro San Antonio", "Cértegui", "Chachagüí", "Chaguaní", "Chalán", "Chameza", "Chaparral", "Charalá", "Charta", "Chía", "Chibolo", "Chigorodó", "Chima", "Chimá", "Chimichagua", "Chinácota", "Chinavita", "Chinchiná", "Chinú", "Chipaque", "Chipatá", "Chiquinquirá", "Chíquiza", "Chiriguaná", "Chiscas", "Chita", "Chitagá", "Chitaraque", "Chivatá", "Chivor", "Choachí", "Chocontá", "Cicuco", "Ciénaga", "Ciénaga De Oro", "Ciénega", "Cimitarra", "Circasia", "Cisneros", "Ciudad Bolívar", "Clemencia", "Cocorná", "Coello", "Cogua", "Colombia", "Colón", "Coloso", "Cómbita", "Concepción", "Concordia", "Condoto", "Confines", "Consaca", "Contadero", "Contratación", "Convención", "Copacabana", "Coper", "Córdoba", "Corinto", "Coromoro", "Corozal", "Corrales", "Cota", "Cotorra", "Covarachía", "Coveñas", "Coyaima", "Cravo Norte", "Cuaspud", "Cubará", "Cubarral", "Cucaita", "Cucunubá", "Cúcuta", "Cucutilla", "Cuítiva", "Cumaral", "Cumaribo", "Cumbal", "Cumbitara", "Cunday", "Curillo", "Curití", "Curumaní", "Dabeiba", "Dagua", "Dibulla", "Distracción", "Dolores", "Don Matías", "Dosquebradas", "Duitama", "Durania", "Ebéjico", "El Águila", "El Bagre", "El Banco", "El Cairo", "El Calvario", "El Cantón Del San Pablo", "El Carmen", "El Carmen De Atrato", "El Carmen De Bolívar", "El Carmen De Chucurí", "El Carmen De Viboral", "El Castillo", "El Cerrito", "El Charco", "El Cocuy", "El Colegio", "El Copey", "El Doncello", "El Dorado", "El Dovio", "El Encanto", "El Espino", "El Guacamayo", "El Guamo", "El Litoral Del San Juan", "El Molino", "El Paso", "El Paujil", "El Peñol", "El Peñón", "El Piñon", "El Playón", "El Retén", "El Retorno", "El Roble", "El Rosal", "El Rosario", "El Santuario", "El Tablón De Gómez", "El Tambo", "El Tarra", "El Zulia", "Elías", "Encino", "Enciso", "Entrerrios", "Envigado", "Espinal", "Facatativá", "Falan", "Filadelfia", "Filandia", "Firavitoba", "Flandes", "Florencia", "Floresta", "Florián", "Florida", "Floridablanca", "Fomeque", "Fonseca", "Fortul", "Fosca", "Francisco Pizarro", "Fredonia", "Fresno", "Frontino", "Fuente De Oro", "Fundación", "Funes", "Funza", "Fúquene", "Fusagasugá", "Gachala", "Gachancipá", "Gachantivá", "Gachetá", "Galán", "Galapa", "Galeras", "Gama", "Gamarra", "Gambita", "Gameza", "Garagoa", "Garzón", "Génova", "Gigante", "Ginebra", "Giraldo", "Girardot", "Girardota", "Girón", "Gómez Plata", "González", "Gramalote", "Granada", "Guaca", "Guacamayas", "Guacarí", "Guachetá", "Guachucal", "Guadalajara De Buga", "Guadalupe", "Guaduas", "Guaitarilla", "Gualmatán", "Guamal", "Guamo", "Guapi", "Guapotá", "Guaranda", "Guarne", "Guasca", "Guatape", "Guataquí", "Guatavita", "Guateque", "Guática", "Guavatá", "Guayabal De Siquima", "Guayabetal", "Guayatá", "Güepsa", "Güicán", "Gutiérrez", "Hacarí", "Hatillo De Loba", "Hato", "Hato Corozal", "Hatonuevo", "Heliconia", "Herrán", "Herveo", "Hispania", "Hobo", "Honda", "Ibagué", "Icononzo", "Iles", "Imués", "Inírida", "Inzá", "Ipiales", "Iquira", "Isnos", "Istmina", "Itagui", "Ituango", "Iza", "Jambaló", "Jamundí", "Jardín", "Jenesano", "Jericó", "Jerusalén", "Jesús María", "Jordán", "Juan De Acosta", "Junín", "Juradó", "La Apartada", "La Argentina", "La Belleza", "La Calera", "La Capilla", "La Ceja", "La Celia", "La Chorrera", "La Cruz", "La Cumbre", "La Dorada", "La Esperanza", "La Estrella", "La Florida", "La Gloria", "La Guadalupe", "La Jagua De Ibirico", "La Jagua Del Pilar", "La Llanada", "La Macarena", "La Merced", "La Mesa", "La Montañita", "La Palma", "La Paz", "La Pedrera", "La Peña", "La Pintada", "La Plata", "La Playa", "La Primavera", "La Salina", "La Sierra", "La Tebaida", "La Tola", "La Unión", "La Uvita", "La Vega", "La Victoria", "La Virginia", "Labateca", "Labranzagrande", "Landázuri", "Lebríja", "Leguízamo", "Leiva", "Lejanías", "Lenguazaque", "Lérida", "Leticia", "Líbano", "Liborina", "Linares", "Lloró", "López", "Lorica", "Los Andes", "Los Córdobas", "Los Palmitos", "Los Patios", "Los Santos", "Lourdes", "Luruaco", "Macanal", "Macaravita", "Maceo", "Macheta", "Madrid", "Magangué", "Magüi", "Mahates", "Maicao", "Majagual", "Málaga", "Malambo", "Mallama", "Manatí", "Manaure", "Maní", "Manizales", "Manta", "Manzanares", "Mapiripán", "Mapiripana", "Margarita", "María La Baja", "Marinilla", "Maripí", "Mariquita", "Marmato", "Marquetalia", "Marsella", "Marulanda", "Matanza", "Medellín", "Medina", "Medio Atrato", "Medio Baudó", "Medio San Juan", "Melgar", "Mercaderes", "Mesetas", "Milán", "Miraflores", "Miranda", "Miriti - Paraná", "Mistrató", "Mitú", "Mocoa", "Mogotes", "Molagavita", "Momil", "Mompós", "Mongua", "Monguí", "Moniquirá", "Montebello", "Montecristo", "Montelíbano", "Montenegro", "Montería", "Monterrey", "Moñitos", "Morales", "Morelia", "Morichal", "Morroa", "Mosquera", "Motavita", "Murillo", "Murindó", "Mutatá", "Mutiscua", "Muzo", "Nariño", "Nátaga", "Natagaima", "Nechí", "Necoclí", "Neira", "Neiva", "Nemocón", "Nilo", "Nimaima", "Nobsa", "Nocaima", "Norcasia", "Nóvita", "Nueva Granada", "Nuevo Colón", "Nunchía", "Nuquí", "Obando", "Ocamonte", "Ocaña", "Oiba", "Oicatá", "Olaya", "Olaya Herrera", "Onzaga", "Oporapa", "Orito", "Orocué", "Ortega", "Ospina", "Otanche", "Ovejas", "Pachavita", "Pacho", "Pacoa", "Pácora", "Padilla", "Paez", "Páez", "Paicol", "Pailitas", "Paime", "Paipa", "Pajarito", "Palermo", "Palestina", "Palmar", "Palmar De Varela", "Palmas Del Socorro", "Palmira", "Palmito", "Palocabildo", "Pamplona", "Pamplonita", "Pana Pana", "Pandi", "Panqueba", "Papunaua", "Páramo", "Paratebueno", "Pasca", "Pasto", "Patía", "Pauna", "Paya", "Paz De Ariporo", "Paz De Río", "Pedraza", "Pelaya", "Pensilvania", "Peñol", "Peque", "Pereira", "Pesca", "Piamonte", "Piedecuesta", "Piedras", "Piendamó", "Pijao", "Pijiño Del Carmen", "Pinchote", "Pinillos", "Piojó", "Pisba", "Pital", "Pitalito", "Pivijay", "Planadas", "Planeta Rica", "Plato", "Policarpa", "Polonuevo", "Ponedera", "Popayán", "Pore", "Potosí", "Pradera", "Prado", "Providencia", "Pueblo Bello", "Pueblo Nuevo", "Pueblo Rico", "Pueblorrico", "Puebloviejo", "Puente Nacional", "Puerres", "Puerto Alegría", "Puerto Arica", "Puerto Asís", "Puerto Berrío", "Puerto Boyacá", "Puerto Caicedo", "Puerto Carreño", "Puerto Colombia", "Puerto Concordia", "Puerto Escondido", "Puerto Gaitán", "Puerto Guzmán", "Puerto Libertador", "Puerto Lleras", "Puerto López", "Puerto Nare", "Puerto Nariño", "Puerto Parra", "Puerto Rico", "Puerto Rondón", "Puerto Salgar", "Puerto Santander", "Puerto Tejada", "Puerto Triunfo", "Puerto Wilches", "Pulí", "Pupiales", "Puracé", "Purificación", "Purísima", "Quebradanegra", "Quetame", "Quibdó", "Quimbaya", "Quinchía", "Quípama", "Quipile", "Ragonvalia", "Ramiriquí", "Ráquira", "Recetor", "Regidor", "Remedios", "Remolino", "Repelón", "Restrepo", "Retiro", "Ricaurte", "Río De Oro", "Río Iro", "Río Quito", "Río Viejo", "Rioblanco", "Riofrío", "Riohacha", "Rionegro", "Riosucio", "Risaralda", "Rivera", "Roberto Payán", "Roldanillo", "Roncesvalles", "Rondón", "Rosas", "Rovira", "Sabana De Torres", "Sabanagrande", "Sabanalarga", "Sabanas De San Angel", "Sabaneta", "Saboyá", "Sácama", "Sáchica", "Sahagún", "Saladoblanco", "Salamina", "Salazar", "Saldaña", "Salento", "Salgar", "Samacá", "Samaná", "Samaniego", "Sampués", "San Agustín", "San Alberto", "San Andrés", "San Andrés Sotavento", "San Antero", "San Antonio", "San Antonio Del Tequendama", "San Benito", "San Benito Abad", "San Bernardo", "San Bernardo Del Viento", "San Calixto", "San Carlos", "San Carlos De Guaroa", "San Cayetano", "San Cristóbal", "San Diego", "San Eduardo", "San Estanislao", "San Felipe", "San Fernando", "San Francisco", "San Gil", "San Jacinto", "San Jacinto Del Cauca", "San Jerónimo", "San Joaquín", "San José", "San José De La Montaña", "San José De Miranda", "San José De Pare", "San José Del Fragua", "San José Del Guaviare", "San José Del Palmar", "San Juan De Arama", "San Juan De Betulia", "San Juan De Río Seco", "San Juan De Urabá", "San Juan Del Cesar", "San Juan Nepomuceno", "San Juanito", "San Lorenzo", "San Luis", "San Luis De Gaceno", "San Luis De Palenque", "San Marcos", "San Martín", "San Martín De Loba", "San Mateo", "San Miguel", "San Miguel De Sema", "San Onofre", "San Pablo", "San Pablo De Borbur", "San Pedro", "San Pedro De Cartago", "San Pedro De Uraba", "San Pelayo", "San Rafael", "San Roque", "San Sebastián", "San Sebastián De Buenavista", "San Vicente", "San Vicente De Chucurí", "San Vicente Del Caguán", "San Zenón", "Sandoná", "Santa Ana", "Santa Bárbara", "Santa Bárbara De Pinto", "Santa Catalina", "Santa Helena Del Opón", "Santa Isabel", "Santa Lucía", "Santa María", "Santa Marta", "Santa Rosa", "Santa Rosa De Cabal", "Santa Rosa De Osos", "Santa Rosa De Viterbo", "Santa Rosa Del Sur", "Santa Rosalía", "Santa Sofía", "Santacruz", "Santafé De Antioquia", "Santana", "Santander De Quilichao", "Santiago", "Santiago De Tolú", "Santo Domingo", "Santo Tomás", "Santuario", "Sapuyes", "Saravena", "Sardinata", "Sasaima", "Sativanorte", "Sativasur", "Segovia", "Sesquilé", "Sevilla", "Siachoque", "Sibaté", "Sibundoy", "Silos", "Silvania", "Silvia", "Simacota", "Simijaca", "Simití", "Sincé", "Sincelejo", "Sipí", "Sitionuevo", "Soacha", "Soatá", "Socha", "Socorro", "Socotá", "Sogamoso", "Solano", "Soledad", "Solita", "Somondoco", "Sonson", "Sopetrán", "Soplaviento", "Sopó", "Sora", "Soracá", "Sotaquirá", "Sotara", "Suaita", "Suan", "Suárez", "Suaza", "Subachoque", "Sucre", "Suesca", "Supatá", "Supía", "Suratá", "Susa", "Susacón", "Sutamarchán", "Sutatausa", "Sutatenza", "Tabio", "Tadó", "Talaigua Nuevo", "Tamalameque", "Támara", "Tame", "Támesis", "Taminango", "Tangua", "Taraira", "Tarapacá", "Tarazá", "Tarqui", "Tarso", "Tasco", "Tauramena", "Tausa", "Tello", "Tena", "Tenerife", "Tenjo", "Tenza", "Teorama", "Teruel", "Tesalia", "Tibacuy", "Tibaná", "Tibasosa", "Tibirita", "Tibú", "Tierralta", "Timaná", "Timbío", "Timbiquí", "Tinjacá", "Tipacoque", "Tiquisio", "Titiribí", "Toca", "Tocaima", "Tocancipá", "Togüí", "Toledo", "Tolú Viejo", "Tona", "Tópaga", "Topaipí", "Toribio", "Toro", "Tota", "Totoró", "Trinidad", "Trujillo", "Tubará", "Tuluá", "Tumaco", "Tunja", "Tununguá", "Túquerres", "Turbaco", "Turbaná", "Turbo", "Turmequé", "Tuta", "Tutazá", "Ubalá", "Ubaque", "Ulloa", "Umbita", "Une", "Unguía", "Unión Panamericana", "Uramita", "Uribe", "Uribia", "Urrao", "Urumita", "Usiacurí", "Útica", "Valdivia", "Valencia", "Valle De San José", "Valle De San Juan", "Valle Del Guamuez", "Valledupar", "Valparaíso", "Vegachí", "Vélez", "Venadillo", "Venecia", "Ventaquemada", "Vergara", "Versalles", "Vetas", "Vianí", "Victoria", "Vigía Del Fuerte", "Vijes", "Villa Caro", "Villa De Leyva", "Villa De San Diego De Ubate", "Villa Del Rosario", "Villa Rica", "Villagarzón", "Villagómez", "Villahermosa", "Villamaría", "Villanueva", "Villapinzón", "Villarrica", "Villavicencio", "Villavieja", "Villeta", "Viotá", "Viracachá", "Vistahermosa", "Viterbo", "Yacopí", "Yacuanquer", "Yaguará", "Yalí", "Yarumal", "Yavaraté", "Yolombó", "Yondó", "Yopal", "Yotoco", "Yumbo", "Zambrano", "Zapatoca", "Zapayán", "Zaragoza", "Zarzal", "Zetaquira", "Zipacón", "Zipaquirá", "Zona Bananera"];

  function logroEscNormCiudad(raw){
    if(!raw)return 'Bogota D.C.';
    const s=String(raw).trim();
    const exact=LOGRO_ESC_CIUDADES.find(c=>c.toLowerCase()===s.toLowerCase());
    if(exact)return exact;
    const starts=LOGRO_ESC_CIUDADES.find(c=>c.toLowerCase().startsWith(s.toLowerCase().substring(0,5)));
    if(starts)return starts;
    const contains=LOGRO_ESC_CIUDADES.find(c=>c.toLowerCase().includes(s.toLowerCase().substring(0,5)));
    if(contains)return contains;
    return 'Bogota D.C.';
  }

  function logroEscNormTel(x){
    if(!x)return '6050000000';
    const d=String(x).replace(/\D/g,'');
    return d||'6050000000';
  }

  function logroEscNormAddr(x){
    if(!x)return 'DIRECCION NO INFORMADA';
    let s=String(x).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[#°/.,\-()"']/g,' ')
      .replace(/\s+/g,' ').trim();
    return s||'DIRECCION NO INFORMADA';
  }

  function logroEscFechaHoy(){
    const d=new Date();
    const dd=String(d.getDate()).padStart(2,'0');
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const yyyy=d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const LOGRO_ESC_COLS = [
    'Tipo Identificación','No. Identificación','Ciudad Identificación',
    '1er. Nombre o Razón Social','2do. Nombre','1re. Apellido','2do.Apellido',
    'Propiedad Activa','Activo','Propiedad Retención','Fecha Creación',
    'Plazo','Clasificación Dian','Actividad Económica','Matricula',
    'Tipos_Responsabilidades','Aplica ReteIca','% Ica','Maneja Cupo Crédito',
    'Cupo Crédito','Código','Fecha Aniversario','Forma de Pago','Lista Precios',
    'Nota','% Descuento','Vendedor','Clasificación Uno','Clasificación Dos',
    'Clasificación Tres','Zona Uno','Zona Dos',
    'Personalizado 1','Personalizado 2','Personalizado 3','Personalizado 4',
    'Personalizado 5','Personalizado 6','Personalizado 7','Personalizado 8',
    'Personalizado 9','Personalizado 10','Personalizado 11','Personalizado 12',
    'Personalizado 13','Personalizado 14','Personalizado 15',
    'Tipo Dirección','Ciudad Dirección','Dirección','Dirección Principal',
    'Teléfonos','Código Postal','Fax','Movil 1','Movil 2',
    'E_Mail','E_Mail 2','E_Mail 3','Página Web','Observaciones','Sucursal'
  ];

  function logroEscBuildWB(rows, logEntries, stats, excluded, defaults, nitExcluidos){
    const wb=XLSX.utils.book_new();

    const aoa=[LOGRO_ESC_COLS.slice()];
    rows.forEach(r=>{
      aoa.push(LOGRO_ESC_COLS.map(c=>{const v=r[c];return(v===''||v===undefined)?null:v??null;}));
    });
    const ws1=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws1,'migrar clientes proveedores');

    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Identificación','Sucursal','']]),'sucursales Clientes');

    const tsNow=new Date().toISOString();
    const logsAoa=[['timestamp','fase','nivel','mensaje']];
    (logEntries||[]).forEach(e=>logsAoa.push([e.ts||tsNow,e.fase||'',e.lvl==='e'?'ERROR':e.lvl==='w'?'WARN':'INFO',e.msg||'']));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(logsAoa),'Logs');

    const s=stats||{};
    const estAoa=[['Métrica','Valor'],
      ['archivos_entrada',s.archivos_entrada||1],
      ['registros_entrada',s.registros_entrada||0],
      ['registros_salida',rows.length],
      ['errores_validacion',s.errores||0],
      ['warnings_validacion',s.warnings||0]];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(estAoa),'Estadísticas');

    const exclAoa=[['Identificación','Nombre o Razón Social','Motivo']];
    (excluded||[]).forEach(e=>exclAoa.push([e.id,e.nombre,e.tipo]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(exclAoa),'IdentificacionesExcluidas');

    if(nitExcluidos&&nitExcluidos.length>0){
      const nitAoa=[['Identificación','Nombre o Razón Social','Motivo']];
      nitExcluidos.forEach(d=>nitAoa.push([d.id, d.nombre, 'Tercero ya existe en la base de datos — excluido de la migración']));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(nitAoa),'Terceros no tenidos en cuenta');
    }

    if(defaults&&defaults.length>0){
      const defAoa=[['Tipo Identificación Aplicado','No. Identificación','Nombre','Concepto']];
      defaults.forEach(d=>defAoa.push([d['Tipo Identificación Aplicado'],d['No. Identificación'],d['Nombre'],d['Concepto']]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(defAoa),'Campos aplicados por defecto');
    }

    return wb;
  }

  // ── Lectura de un archivo Excel de Logro (Clientes o Proveedores —
  //    ambos con la misma estructura de columnas, fila 1 = encabezados,
  //    datos desde la fila 2) ────────────────────────────────────────
  async function logroReadFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const data=new Uint8Array(e.target.result);
          const wb=XLSX.read(data,{type:'array',cellText:true,raw:false});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          const hdrs=(rows[0]||[]).map(h=>String(h||'').trim());
          const data_rows=rows.slice(1).filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined));
          resolve({hdrs,rows:data_rows});
        }catch(err){reject(err);}
      };
      reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Extrae los campos relevantes de una fila (misma estructura en
  //    Clientes y Proveedores) ───────────────────────────────────────
  function logroExtraerFila(hdrs, r){
    const g = name => { const i=logroCol(hdrs,name); return i>=0 ? r[i] : ''; };
    return {
      id: logroNormId(g('Identificación')),
      persona: String(g('Persona')||'').trim(),
      tipoIdRaw: g('Tipo de Identificación'),
      primerNombre: String(g('Primer Nombre')||'').trim(),
      segundoNombre: String(g('Segundo Nombre')||'').trim(),
      primerApellido: String(g('Primer Apellido')||'').trim(),
      segundoApellido: String(g('Segundo Apellido')||'').trim(),
      nombreComercial: String(g('Nombre Comercial')||'').trim(),
      nombreLegal: String(g('Nombre Legal')||'').trim(),
      nombreCombinado: String(g('Cliente')||g('Proveedor')||'').trim(),
      direccion: String(g('Dirección')||'').trim(),
      ciudad: String(g('Ciudad')||'').trim(),
      telefono: String(g('Teléfono')||'').trim(),
      correo: String(g('Correo Electrónico')||'').trim()
    };
  }

  // ── Combina los datos de un mismo tercero visto en ambos archivos:
  //    conserva lo que ya había y solo completa los campos vacíos con
  //    lo que traiga el otro archivo. ────────────────────────────────
  function logroMezclarCampos(base, extra){
    if(!base) return Object.assign({}, extra);
    const out = Object.assign({}, base);
    Object.keys(extra).forEach(k=>{
      if(!out[k] && extra[k]) out[k]=extra[k];
    });
    return out;
  }

  // Estado pendiente entre la fase 1 (elegir archivos + modal de
  // correo) y la fase 2 (transformación real).
  let _logroEscPending = null;

  // ══════════════════════════════════════════════════════════════
  // FASE 1: lee los archivos disponibles (Clientes y/o Proveedores) y
  // muestra el modal de configuración de correo por defecto — mismo
  // patrón ya usado en SIIMED ERP.
  // ══════════════════════════════════════════════════════════════
  async function startLogroEscETL(){
    const cFile = LOGRO_ESC_S.clientesFile || (window.__LOGRO_S && window.__LOGRO_S.clientesFile);
    const pFile = LOGRO_ESC_S.proveedoresFile || (window.__LOGRO_S && window.__LOGRO_S.proveedoresFile);
    if(!cFile && !pFile){ alert('Carga al menos un archivo: Clientes o Proveedores de Logro.'); return; }
    try{
      const clientes = cFile ? await logroReadFile(cFile) : null;
      const proveedores = pFile ? await logroReadFile(pFile) : null;
      _logroEscPending = { clientes, proveedores, t0: Date.now() };
      logroEscShowConfigModal();
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  // ── Modal de configuración: Correo por defecto para terceros sin
  //    email (mismo patrón que SIIMED ERP → Escritorio) ──────────────
  function logroEscShowConfigModal(){
    let modal = document.getElementById('logro-esc-config-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'logro-esc-config-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.logroEscCloseConfigModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:480px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto">
          <div style="text-align:center;margin-bottom:22px">
            <div style="font-size:20px;font-weight:700;color:#fff">Terceros sin correo electrónico</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">
              Indica qué hacer con los terceros que no traen correo en los archivos de Logro.
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
            <input type="radio" name="logro-esc-email-mode" id="logro-esc-email-mode-blank" value="blank" checked>
            Dejar el correo en blanco
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
            <input type="radio" name="logro-esc-email-mode" id="logro-esc-email-mode-default" value="default">
            Aplicar un correo predeterminado:
          </label>
          <input type="email" id="logro-esc-email-default" placeholder="correo@ejemplo.com"
            style="width:100%;margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
            border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:5px">
            Solo se aplica a los terceros que no traigan correo propio en el archivo.
          </div>
          <div style="display:flex;gap:12px;margin-top:24px">
            <button onclick="window.logroEscCloseConfigModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.logroEscConfirmConfigModal()" style="flex:2;padding:12px;
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

  function logroEscCloseConfigModal(){
    const modal=document.getElementById('logro-esc-config-modal');
    if(modal) modal.style.display='none';
  }
  window.logroEscCloseConfigModal = logroEscCloseConfigModal;

  async function logroEscConfirmConfigModal(){
    if(!_logroEscPending) return;
    const emailModeEl = document.getElementById('logro-esc-email-mode-default');
    const emailMode = (emailModeEl && emailModeEl.checked) ? 'default' : 'blank';
    const emailDefEl = document.getElementById('logro-esc-email-default');
    const emailDefault = emailDefEl ? String(emailDefEl.value||'').trim() : '';
    logroEscCloseConfigModal();
    await _runLogroEscETL(emailMode, emailDefault);
  }
  window.logroEscConfirmConfigModal = logroEscConfirmConfigModal;

  // ══════════════════════════════════════════════════════════════
  // FASE 2: PIPELINE real — Logro → World Office Escritorio
  // ══════════════════════════════════════════════════════════════
  async function _runLogroEscETL(emailMode, emailDefault){
    if(!_logroEscPending){ alert('Carga al menos un archivo: Clientes o Proveedores de Logro.'); return; }
    const { clientes, proveedores } = _logroEscPending;
    setStep(3);
    LOGRO_ESC_LOG.length=0;
    const panel=document.getElementById('logp'); if(panel) panel.innerHTML='';
    setPStep(0); setPct(0,'Iniciando...');
    const t0=Date.now();
    try{
      logroEscLog('📂 Leyendo archivos de Logro...','i','Lectura');
      setPStep(1); setPct(10,'Leyendo archivos...');
      await logroEscSleep(30);

      const totalEntrada = (clientes?clientes.rows.length:0) + (proveedores?proveedores.rows.length:0);
      if(clientes) logroEscLog('   Clientes: '+clientes.rows.length+' filas','i','Lectura');
      if(proveedores) logroEscLog('   Proveedores: '+proveedores.rows.length+' filas','i','Lectura');

      setPStep(2); setPct(30,'Consolidando por Identificación...');
      await logroEscSleep(30);

      const grupos = new Map(); // id -> {data, roles:Set}
      if(clientes){
        clientes.rows.forEach(r=>{
          const ex = logroExtraerFila(clientes.hdrs, r);
          if(!ex.id) return;
          const g = grupos.get(ex.id) || {data:null, roles:new Set()};
          g.data = logroMezclarCampos(g.data, ex);
          g.roles.add('Cliente');
          grupos.set(ex.id, g);
        });
      }
      if(proveedores){
        proveedores.rows.forEach(r=>{
          const ex = logroExtraerFila(proveedores.hdrs, r);
          if(!ex.id) return;
          const g = grupos.get(ex.id) || {data:null, roles:new Set()};
          g.data = logroMezclarCampos(g.data, ex);
          g.roles.add('Proveedor');
          grupos.set(ex.id, g);
        });
      }
      logroEscLog('   '+totalEntrada+' filas → '+grupos.size+' terceros únicos (tras consolidar por Identificación)','i','Consolidación');

      const out=[], defaults=[], nitExcluidos=[], excluded=[];
      let emailsDefault=0;

      for(const [id, g] of grupos){
        const d = g.data;

        if(LOGRO_ESC_NITS_EXCLUIR.has(id)){
          nitExcluidos.push({id, nombre:(d.nombreLegal||d.nombreCombinado||'').toUpperCase().trim()});
          continue;
        }

        let esJuridica = /jur[ií]dica/i.test(d.persona);
        if(!d.persona) esJuridica = /nit/i.test(logroNormKey(d.tipoIdRaw));
        const tipoId = logroMapTipoIdEsc(d.tipoIdRaw, id);

        let p1='',p2='',a1='',a2='';
        if(esJuridica){
          p1 = logroCleanTxt(d.nombreLegal || d.nombreComercial || d.nombreCombinado);
        } else {
          p1 = logroCleanTxt(d.primerNombre);
          p2 = logroCleanTxt(d.segundoNombre);
          a1 = logroCleanTxt(d.primerApellido);
          a2 = logroCleanTxt(d.segundoApellido);
          if(!p1 && !a1){
            const partes = logroEscSplitName(d.nombreCombinado || d.nombreLegal, tipoId);
            p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
          }
        }

        const ciudad = logroEscNormCiudad(d.ciudad);
        const dir = logroEscNormAddr(d.direccion);
        const tel = logroEscNormTel(d.telefono);

        const retencion = esJuridica ? 'Persona Juridica' : 'Persona Natural No Responsable del IVA';

        const esC=g.roles.has('Cliente'), esP=g.roles.has('Proveedor');
        let propActiva=(esC?'Cliente;':'')+(esP?'Proveedor;':'');
        if(!propActiva) propActiva='Cliente;Proveedor;';

        const correoOrigen = d.correo || '';
        let email;
        if(correoOrigen){
          email = correoOrigen;
        } else if(emailMode==='default' && emailDefault){
          email = emailDefault;
          emailsDefault++;
          defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Correo vacío en origen — se aplicó el correo predeterminado indicado por el usuario'});
        } else {
          email = null;
        }

        const row={
          'Tipo Identificación': tipoId,
          'No. Identificación': id,
          'Ciudad Identificación': ciudad,
          '1er. Nombre o Razón Social': p1,
          '2do. Nombre': p2||null,
          '1re. Apellido': a1||null,
          '2do.Apellido': a2||null,
          'Propiedad Activa': propActiva,
          'Activo': -1,
          'Propiedad Retención': retencion,
          'Fecha Creación': logroEscFechaHoy(),
          'Plazo': 0,
          'Clasificación Dian': 'Normal',
          'Actividad Económica': null,
          'Matricula': null,
          'Tipos_Responsabilidades': null,
          'Aplica ReteIca': null,
          '% Ica': null,
          'Maneja Cupo Crédito': null,
          'Cupo Crédito': null,
          'Código': null,
          'Fecha Aniversario': null,
          'Forma de Pago': null,
          'Lista Precios': null,
          'Nota': null,
          '% Descuento': null,
          'Vendedor': null,
          'Clasificación Uno': null,'Clasificación Dos': null,'Clasificación Tres': null,
          'Zona Uno': null,'Zona Dos': null,
          'Personalizado 1': null,'Personalizado 2': null,'Personalizado 3': null,
          'Personalizado 4': null,'Personalizado 5': null,'Personalizado 6': null,
          'Personalizado 7': null,'Personalizado 8': null,'Personalizado 9': null,
          'Personalizado 10': null,'Personalizado 11': null,'Personalizado 12': null,
          'Personalizado 13': null,'Personalizado 14': null,'Personalizado 15': null,
          'Tipo Dirección': esJuridica ? 'Empresa/Oficina' : 'Casa',
          'Ciudad Dirección': ciudad,
          'Dirección': dir,
          'Dirección Principal': -1,
          'Teléfonos': tel||null,
          'Código Postal': null,
          'Fax': null,
          'Movil 1': null,
          'Movil 2': null,
          'E_Mail': email,
          'E_Mail 2': null,
          'E_Mail 3': null,
          'Página Web': null,
          'Observaciones': null,
          'Sucursal': null
        };
        out.push(row);

        if(!d.ciudad) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Ciudad vacía en origen — se aplica Bogota D.C. por defecto'});
        if(!d.direccion || d.direccion.length<3) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Dirección vacía en origen — se aplica DIRECCION NO INFORMADA por defecto'});
        if(!d.telefono) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Teléfono vacío en origen — se aplica 6050000000 por defecto'});
        if(!d.tipoIdRaw) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Tipo de Identificación vacío en origen — se infiere '+tipoId+' por longitud del número'});
      }

      logroEscLog('✅ Consolidados: '+out.length+' registros ('+nitExcluidos.length+' NITs de lista predefinida excluidos)','o','Consolidación');
      setPStep(3); setPct(60,'Transformando...');
      await logroEscSleep(30);
      logroEscLog('🔄 Transformados: '+out.length+' registros','o','Transformación');
      if(emailsDefault>0) logroEscLog('   '+emailsDefault+' correos completados con el valor predeterminado','i','Transformación');

      setPStep(4); setPct(80,'Generando Excel...');
      await logroEscSleep(30);
      logroEscLog('📊 Construyendo archivo Excel...','i','Escritura');

      LOGRO_ESC_WB = logroEscBuildWB(out, LOGRO_ESC_LOG, {
        archivos_entrada:(clientes?1:0)+(proveedores?1:0),
        registros_entrada:totalEntrada,
        registros_salida:out.length,
        errores:0,
        warnings:0
      }, excluded, defaults, nitExcluidos);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      setPct(100,'¡Listo!'); setPStep(5);
      logroEscLog('✅ Excel generado en '+dur+'s — '+out.length+' registros','o','Escritura');

      const fn = logroEscBuildFN();
      const fnEl=document.getElementById('dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('dl-dest-label'); if(lbl) lbl.textContent='Para importar en World Office Escritorio';
      const stIn=document.getElementById('st-in'); if(stIn) stIn.textContent=totalEntrada;
      const stOk=document.getElementById('st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'Logro', dest_soft:'World Office Escritorio',
          module:'Terceros', records_in:totalEntrada, records_out:out.length,
          errors:0, warnings:0, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      setStep(4);
    }catch(err){
      logroEscLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
    }
  }

  function logroEscBuildFN(){
    const now=new Date();
    const p=x=>String(x).padStart(2,'0');
    const ts=now.getFullYear()+'_'+p(now.getMonth()+1)+'_'+p(now.getDate());
    return 'terceros_logro_wo_escritorio_'+ts+'.xlsx';
  }

  function logroEscDoDownload(){
    if(!LOGRO_ESC_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    XLSX.writeFile(LOGRO_ESC_WB, (document.getElementById('dl-fn')||{}).textContent || logroEscBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function logroEscInstall(){
    const sorigEl = document.getElementById('sorig');
    const s2card = document.querySelector('#s2 .card');
    if(!sorigEl || !s2card) return;

    // 1) Opción "Logro" en el selector de origen (comprobación para
    //    no duplicarla si el módulo Cloud hermano ya la agregó)
    if(!sorigEl.querySelector('option[value="Logro"]')){
      const opt=document.createElement('option');
      opt.value='Logro'; opt.textContent='Logro';
      sorigEl.appendChild(opt);
    }

    // 2) Dos slots de archivo (Clientes / Proveedores), compartidos
    //    con el módulo Cloud hermano vía window.__LOGRO_S — mismo
    //    patrón que ya usan los módulos de SIIMED (archivo compartido
    //    entre Escritorio y Cloud, cada uno con su propia lógica)
    window.__LOGRO_S = window.__LOGRO_S || { clientesFile:null, proveedoresFile:null };
    const siigoFslots = document.querySelector('#s2 .fslots');
    const siigoInfo = document.querySelector('#s2 .al.al-i');

    if(!document.getElementById('logro-fslots')){
      const infoHTML =
        '<div class="al al-i" id="logro-info" style="display:none;margin-bottom:14px">'+
          '<span>ℹ️</span>'+
          '<span>Logro: carga el archivo de <strong>Clientes</strong> y/o el de <strong>Proveedores</strong> de la compañía. Con al menos uno de los dos es suficiente — si un tercero aparece en ambos, se consolida en una sola fila.</span>'+
        '</div>';
      const slotsHTML =
        '<div class="fslots" id="logro-fslots" style="display:none">'+
          '<div class="fslot" id="sl-logro-clientes">'+
            '<input type="file" id="f-logro-clientes" accept=".xlsx,.xls" onchange="window.__logroOnFile(this,\'clientes\')">'+
            '<div class="fs-badge">Recomendado</div>'+
            '<div class="fs-ico">🧾</div>'+
            '<div class="fs-name">Clientes de la compañía</div>'+
            '<div class="fs-desc">Exportación de Logro (Clientes)</div>'+
            '<div class="fs-sel" id="nm-logro-clientes"></div>'+
          '</div>'+
          '<div class="fslot" id="sl-logro-proveedores">'+
            '<input type="file" id="f-logro-proveedores" accept=".xlsx,.xls" onchange="window.__logroOnFile(this,\'proveedores\')">'+
            '<div class="fs-badge">Recomendado</div>'+
            '<div class="fs-ico">📇</div>'+
            '<div class="fs-name">Proveedores de la compañía</div>'+
            '<div class="fs-desc">Exportación de Logro (Proveedores)</div>'+
            '<div class="fs-sel" id="nm-logro-proveedores"></div>'+
          '</div>'+
        '</div>';
      if(siigoInfo) siigoInfo.insertAdjacentHTML('afterend', infoHTML);
      if(siigoFslots) siigoFslots.insertAdjacentHTML('afterend', slotsHTML);
    }

    window.__logroOnFile = window.__logroOnFile || function(input, which){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-logro-'+which), nm=document.getElementById('nm-logro-'+which);
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__LOGRO_S[which+'File'] = f;
      LOGRO_ESC_S[which+'File'] = f;
    };
    // Si el módulo Cloud hermano ya cargó archivos antes que este,
    // sincronizamos la referencia local.
    if(window.__LOGRO_S.clientesFile) LOGRO_ESC_S.clientesFile = window.__LOGRO_S.clientesFile;
    if(window.__LOGRO_S.proveedoresFile) LOGRO_ESC_S.proveedoresFile = window.__LOGRO_S.proveedoresFile;

    // 3) Alternar visibilidad según origen elegido
    function logroToggle(){
      const isLogro = sorigEl.value === 'Logro';
      const logroFslots=document.getElementById('logro-fslots');
      const logroInfo=document.getElementById('logro-info');
      const algFslots=document.getElementById('alg-fslots');
      const algInfo=document.getElementById('alg-info');
      const siimedFslots=document.getElementById('siimed-fslots');
      const siimedInfo=document.getElementById('siimed-info');
      if(isLogro){
        if(siigoFslots) siigoFslots.style.display='none';
        if(siigoInfo) siigoInfo.style.display='none';
        if(algFslots) algFslots.style.display='none';
        if(algInfo) algInfo.style.display='none';
        if(siimedFslots) siimedFslots.style.display='none';
        if(siimedInfo) siimedInfo.style.display='none';
      }
      if(logroFslots) logroFslots.style.display = isLogro ? '' : 'none';
      if(logroInfo) logroInfo.style.display = isLogro ? '' : 'none';
    }
    sorigEl.addEventListener('change', logroToggle);
    logroToggle();

    // 4) routeETL(): solo intercepta Logro → World Office Escritorio.
    //    Para Logro → Cloud, deja pasar (lo maneja el archivo hermano,
    //    que debe cargarse también en index.html).
    const _origRouteETL = window.routeETL;
    window.routeETL = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'Logro' && dest === 'World Office Escritorio'){
        startLogroEscETL();
        return;
      }
      if(typeof _origRouteETL === 'function') _origRouteETL();
    };

    // 5) routeDownload(): mismo criterio
    const _origRouteDownload = window.routeDownload;
    window.routeDownload = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'Logro' && dest === 'World Office Escritorio'){ logroEscDoDownload(); return; }
      if(typeof _origRouteDownload === 'function') _origRouteDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Terceros
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'terceros'){
        LOGRO_ESC_S.clientesFile = null;
        LOGRO_ESC_S.proveedoresFile = null;
        _logroEscPending = null;
        logroEscCloseConfigModal();
        if(window.__LOGRO_S){ window.__LOGRO_S.clientesFile = null; window.__LOGRO_S.proveedoresFile = null; }
        ['clientes','proveedores'].forEach(which=>{
          const slot=document.getElementById('sl-logro-'+which); if(slot) slot.className='fslot';
          const nm=document.getElementById('nm-logro-'+which); if(nm) nm.textContent='';
          const inp=document.getElementById('f-logro-'+which); if(inp) inp.value='';
        });
        logroToggle();
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', logroEscInstall);
  } else {
    logroEscInstall();
  }

})();