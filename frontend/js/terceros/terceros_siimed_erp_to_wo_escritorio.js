// ══════════════════════════════════════════════════════════════════
// ETL: Terceros — SIIMED ERP → World Office Escritorio
// Módulo: terceros_siimed_erp_to_wo_escritorio.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución (inyecta la opción
// "SIIMED ERP" en el selector de origen, agrega su propio slot de
// archivo — único y OBLIGATORIO — y "envuelve" routeETL()/
// routeDownload()/showPg() para interceptar el flujo solo cuando el
// origen elegido es "SIIMED ERP" y el destino "World Office
// Escritorio". Cuando el destino es "World Office Cloud" deja pasar
// hacia terceros_siimed_erp_to_wo_cloud.js (archivo hermano,
// completamente separado, sin lógica compartida entre ambos salvo
// el File subido — igual que ya ocurre entre los módulos de Siigo
// Nube, que comparten el mismo slot de archivo maestro).
//
// AUTOCONTENIDO: este archivo NO depende de ningún helper definido en
// terceros_siigo_nube_to_wo_escritorio.js ni en ningún otro módulo de
// origen/destino. Cada proceso (SIIMED ERP, Siigo Nube, Alegra, ...)
// debe poder ejecutarse aunque los demás archivos .js de "terceros"
// fallen al cargar — por eso ESC_COLS, ESC_NITS_EXCLUIR, ESC_CIUDADES,
// escNormCiudad, escNormAddr, escNormTel, escFechaHoy y escBuildWB se
// reimplementan aquí mismo con prefijo "siimedEsc"/"SIIMED_ESC_"
// (copia funcional de los de Siigo Nube Escritorio, sin importarlos).
// Este archivo solo depende de utilidades verdaderamente globales de
// la app (definidas en app.js / cargadas antes de todos los módulos
// de terceros): setStep, setPStep, setPct, api, AUTH.
// (Este es el mismo criterio ya usado por terceros_siimed_erp_to_wo_cloud.js,
// que tampoco depende de otro módulo salvo esas utilidades de la app.)
//
// NOTA SOBRE EL ARCHIVO DE ORIGEN:
// El archivo Excel que sirvió de referencia para este mapeo
// ("Exportación Catálogo de Terceros.xlsx") trae en su propio
// encabezado interno el texto "IyG.SIIGO" — es el formato de
// exportación clásico de SIIGO escritorio/ERP (distinto de "Siigo
// Nube", que ya se migra con otro módulo). Se deja documentado por si
// en el futuro hace falta diferenciarlo.
//
// ESTRUCTURA DEL ARCHIVO DE ORIGEN (fila de encabezados detectada
// automáticamente, normalmente fila 6; datos desde la fila 7):
// hay UNA FILA POR CADA COMBINACIÓN (Identificación × Tipo) — el
// mismo tercero puede aparecer repetido con TIPO='Cliente',
// TIPO='Proveedor', TIPO='Otro' y/o TIPO='Empleado' en filas
// distintas, con el resto de los datos idénticos. Este módulo agrupa
// por "IDENTIFICACION" y consolida los roles antes de generar la
// fila de salida (una sola fila por tercero).
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const SIIMED_ESC_S = { file:null };
  let SIIMED_ESC_WB = null;
  const SIIMED_ESC_LOG = [];

  function siimedEscLog(msg, lvl, fase){
    const ts = new Date().toISOString();
    SIIMED_ESC_LOG.push({ ts, fase: fase || '', lvl: lvl || 'i', msg });
    const panel = document.getElementById('logp');
    if(!panel) return;
    const now = new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css = {i:'li', w:'lw', o:'lo', e:'le-e'}[lvl] || 'li';
    panel.innerHTML += '<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop = panel.scrollHeight;
  }
  function siimedEscSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // ── Normalización de ID propia (independiente del módulo Cloud) ───
  function siimedNormId(x){
    const s=String(x??'').replace(/[,\s]/g,'').trim();
    if(!s||s==='nan'||s==='undefined')return '';
    return s.replace(/[^0-9A-Za-z\-]/g,'');
  }

  // ── Mapeo "IDENTIFICACIÓN TRIBUTARIA" (SIIMED ERP) → Tipo
  //    Identificación (World Office Escritorio) ─────────────────────
  // NOTA: ~51% de las filas traen este campo VACÍO en el archivo de
  // referencia. Para esos casos se usa el mismo criterio de respaldo
  // que ya usa Siigo Nube: 9 dígitos → NIT, cualquier otra longitud
  // → CC.
  const SIIMED_TIPO_ID_ESC = {
    'cedula':'CC',
    'nit':'NIT',
    'tarjetaid':'TI',
    'cedulaext':'Cédula de extranjería',
    'regcivil':'REGISTRO CIVIL',
    'pas':'PASAPORTE',
    'tarjetaext':'TE',
    'tipodocumentoextranjero':'Documento de identificación extranjero',
    'permisoprotecciontemporal':'Permiso especial de permanencia',
    'numunicoidpers':'NUIP',
    'nitdeotropais':'Documento de Identificación extranjero Persona Jurídica',
    // Valor visto en datos reales cuyo significado exacto SIIGO no
    // documenta ('Pe'); se trata como Permiso Especial de Permanencia
    // por ser el valor más cercano disponible. REVISAR MANUALMENTE
    // si en tu base aparecen filas con este tipo.
    'pe':'Permiso especial de permanencia'
  };
  function siimedMapTipoIdEsc(raw, idNorm){
    const k = String(raw||'').toLowerCase().trim().replace(/[^a-z]/g,'');
    if(SIIMED_TIPO_ID_ESC[k]) return SIIMED_TIPO_ID_ESC[k];
    if(!k){
      const n = String(idNorm||'').replace(/\D/g,'');
      return n.length===9 ? 'NIT' : 'CC';
    }
    return String(raw||'').trim();
  }

  // ── Propiedad Retención — usa "TIPO PERSONA JURIDICA" (confiable)
  //    en vez de adivinar por el tipo de identificación, y
  //    "CLASIFICACIÓN TRIBUTARIA" para Natural. Categorías poco
  //    frecuentes (Gran Contribuyente, Régimen Simple, No Residente,
  //    etc. — ~1.5% de los registros) se agrupan como "No responsable"
  //    por no tener un valor dedicado en la plantilla de Escritorio;
  //    revísalas manualmente si tu base tiene muchos de estos casos. ─
  function siimedRetencionEsc(clasifTrib, esJuridica){
    if(esJuridica) return 'Persona Juridica';
    const k = String(clasifTrib||'').toLowerCase().trim();
    if(k==='responsable de iva') return 'Persona Natural Responsable del IVA';
    if(k==='no responsable de iva') return 'Persona Natural No Responsable del IVA';
    if(k==='gran contribuyente') return 'Persona Natural Responsable del IVA';
    return 'Persona Natural No Responsable del IVA';
  }

  // ── Nombre: SIIMED ERP ya trae Primer/Segundo Nombre y Primer/
  //    Segundo Apellido separados para personas naturales; para
  //    persona jurídica usa el NOMBRE completo tal cual (razón
  //    social). No se reimplementa el separador de nombres de Siigo
  //    porque no hace falta con estos datos. ────────────────────────
  function siimedCleanTxt(s){
    return String(s||'').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  function siimedCol(hdrs, name){
    const idx = hdrs.findIndex(h=>String(h||'').trim().toLowerCase()===name.toLowerCase());
    return idx;
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS PROPIOS — copia funcional de terceros_siigo_nube_to_wo_
  // escritorio.js, con prefijo propio, para que este archivo NO
  // dependa de que ese otro módulo se cargue/ejecute correctamente.
  // ══════════════════════════════════════════════════════════════

  const SIIMED_ESC_NITS_EXCLUIR = new Set(["222222222","800003122","800037800","800088702","800112806","800118954","800130907","800138188","800140949","800147502","800148514","800149496","800197268","800211025","800216278","800219488","800224808","800226175","800227940","800229739","800231969","800251440","800253055","800256161","804002105","805000427","805001157","806008394","809008362","817001773","824001398","830003564","830008686","830009783","830054904","830074184","830113831","830125132","837000084","839000495","844003392","860002183","860002503","860002964","860003020","860007335","860007336","860007379","860007738","860008645","860011153","860013570","860022137","860034313","860034594","860035827","860043186","860045904","860050750","860051135","860066942","860503617","890000381","890101994","890102002","890102044","890102257","890200106","890200756","890201578","890203088","890203183","890270275","890300279","890303093","890303208","890399010","890480023","890480110","890480123","890500516","890500675","890700148","890704737","890806490","890900840","890900841","890900842","890903790","890903937","890903938","890904996","890980040","891080005","891080031","891180008","891190047","891200337","891280008","891480000","891500182","891500319","891600091","891780093","891800213","891800330","891856000","892000146","892115006","892200015","892399989","892400320","899999001","899999034","899999061","899999063","899999107","899999284","899999734","900156264","900200960","900226715","900298372","900336004","900406150","900604350","900914254","900935126","901037916","901093846","901469580","901543761"]);

  const SIIMED_ESC_CIUDADES = ["Abejorral", "Abrego", "Abriaquí", "Acacías", "Acandí", "Acevedo", "Achí", "Agrado", "Agua De Dios", "Aguachica", "Aguada", "Aguadas", "Aguazul", "Agustín Codazzi", "Aipe", "Albán", "Albania", "Alcalá", "Aldana", "Alejandría", "Algarrobo", "Algeciras", "Almaguer", "Almeida", "Alpujarra", "Altamira", "Alto Baudo", "Altos Del Rosario", "Alvarado", "Amagá", "Amalfi", "Ambalema", "Anapoima", "Ancuyá", "Andalucía", "Andes", "Angelópolis", "Angostura", "Anolaima", "Anorí", "Anserma", "Ansermanuevo", "Anza", "Anzoátegui", "Apartadó", "Apía", "Apulo", "Aquitania", "Aracataca", "Aranzazu", "Aratoca", "Arauca", "Arauquita", "Arbeláez", "Arboleda", "Arboledas", "Arboletes", "Arcabuco", "Arenal", "Argelia", "Ariguaní", "Arjona", "Armenia", "Armero", "Arroyohondo", "Astrea", "Ataco", "Atrato", "Ayapel", "Bagadó", "Bahía Solano", "Bajo Baudó", "Balboa", "Baranoa", "Baraya", "Barbacoas", "Barbosa", "Barichara", "Barranca De Upía", "Barrancabermeja", "Barrancas", "Barranco De Loba", "Barranco Minas", "Barranquilla", "Becerril", "Belalcázar", "Belén", "Belén De Bajirá", "Belén De Los Andaquies", "Belén De Umbría", "Bello", "Belmira", "Beltrán", "Berbeo", "Betania", "Betéitiva", "Betulia", "Bituima", "Boavita", "Bochalema", "Bogota D.C.", "Bojacá", "Bojaya", "Bolívar", "Bosconia", "Boyacá", "Briceño", "Bucaramanga", "Bucarasica", "Buenaventura", "Buenavista", "Buenos Aires", "Buesaco", "Bugalagrande", "Buriticá", "Busbanzá", "Cabrera", "Cabuyaro", "Cacahual", "Cáceres", "Cachipay", "Cachirá", "Cácota", "Caicedo", "Caicedonia", "Caimito", "Cajamarca", "Cajibío", "Cajicá", "Calamar", "Calarca", "Caldas", "Caldono", "Cali", "California", "Calima", "Caloto", "Campamento", "Campo De La Cruz", "Campoalegre", "Campohermoso", "Canalete", "Candelaria", "Cantagallo", "Cañasgordas", "Caparrapí", "Capitanejo", "Caqueza", "Caracolí", "Caramanta", "Carcasí", "Carepa", "Carmen De Apicalá", "Carmen De Carupa", "Carmen Del Darien", "Carolina", "Cartagena", "Cartagena Del Chairá", "Cartago", "Caruru", "Casabianca", "Castilla La Nueva", "Caucasia", "Cepitá", "Cereté", "Cerinza", "Cerrito", "Cerro San Antonio", "Cértegui", "Chachagüí", "Chaguaní", "Chalán", "Chameza", "Chaparral", "Charalá", "Charta", "Chía", "Chibolo", "Chigorodó", "Chima", "Chimá", "Chimichagua", "Chinácota", "Chinavita", "Chinchiná", "Chinú", "Chipaque", "Chipatá", "Chiquinquirá", "Chíquiza", "Chiriguaná", "Chiscas", "Chita", "Chitagá", "Chitaraque", "Chivatá", "Chivor", "Choachí", "Chocontá", "Cicuco", "Ciénaga", "Ciénaga De Oro", "Ciénega", "Cimitarra", "Circasia", "Cisneros", "Ciudad Bolívar", "Clemencia", "Cocorná", "Coello", "Cogua", "Colombia", "Colón", "Coloso", "Cómbita", "Concepción", "Concordia", "Condoto", "Confines", "Consaca", "Contadero", "Contratación", "Convención", "Copacabana", "Coper", "Córdoba", "Corinto", "Coromoro", "Corozal", "Corrales", "Cota", "Cotorra", "Covarachía", "Coveñas", "Coyaima", "Cravo Norte", "Cuaspud", "Cubará", "Cubarral", "Cucaita", "Cucunubá", "Cúcuta", "Cucutilla", "Cuítiva", "Cumaral", "Cumaribo", "Cumbal", "Cumbitara", "Cunday", "Curillo", "Curití", "Curumaní", "Dabeiba", "Dagua", "Dibulla", "Distracción", "Dolores", "Don Matías", "Dosquebradas", "Duitama", "Durania", "Ebéjico", "El Águila", "El Bagre", "El Banco", "El Cairo", "El Calvario", "El Cantón Del San Pablo", "El Carmen", "El Carmen De Atrato", "El Carmen De Bolívar", "El Carmen De Chucurí", "El Carmen De Viboral", "El Castillo", "El Cerrito", "El Charco", "El Cocuy", "El Colegio", "El Copey", "El Doncello", "El Dorado", "El Dovio", "El Encanto", "El Espino", "El Guacamayo", "El Guamo", "El Litoral Del San Juan", "El Molino", "El Paso", "El Paujil", "El Peñol", "El Peñón", "El Piñon", "El Playón", "El Retén", "El Retorno", "El Roble", "El Rosal", "El Rosario", "El Santuario", "El Tablón De Gómez", "El Tambo", "El Tarra", "El Zulia", "Elías", "Encino", "Enciso", "Entrerrios", "Envigado", "Espinal", "Facatativá", "Falan", "Filadelfia", "Filandia", "Firavitoba", "Flandes", "Florencia", "Floresta", "Florián", "Florida", "Floridablanca", "Fomeque", "Fonseca", "Fortul", "Fosca", "Francisco Pizarro", "Fredonia", "Fresno", "Frontino", "Fuente De Oro", "Fundación", "Funes", "Funza", "Fúquene", "Fusagasugá", "Gachala", "Gachancipá", "Gachantivá", "Gachetá", "Galán", "Galapa", "Galeras", "Gama", "Gamarra", "Gambita", "Gameza", "Garagoa", "Garzón", "Génova", "Gigante", "Ginebra", "Giraldo", "Girardot", "Girardota", "Girón", "Gómez Plata", "González", "Gramalote", "Granada", "Guaca", "Guacamayas", "Guacarí", "Guachetá", "Guachucal", "Guadalajara De Buga", "Guadalupe", "Guaduas", "Guaitarilla", "Gualmatán", "Guamal", "Guamo", "Guapi", "Guapotá", "Guaranda", "Guarne", "Guasca", "Guatape", "Guataquí", "Guatavita", "Guateque", "Guática", "Guavatá", "Guayabal De Siquima", "Guayabetal", "Guayatá", "Güepsa", "Güicán", "Gutiérrez", "Hacarí", "Hatillo De Loba", "Hato", "Hato Corozal", "Hatonuevo", "Heliconia", "Herrán", "Herveo", "Hispania", "Hobo", "Honda", "Ibagué", "Icononzo", "Iles", "Imués", "Inírida", "Inzá", "Ipiales", "Iquira", "Isnos", "Istmina", "Itagui", "Ituango", "Iza", "Jambaló", "Jamundí", "Jardín", "Jenesano", "Jericó", "Jerusalén", "Jesús María", "Jordán", "Juan De Acosta", "Junín", "Juradó", "La Apartada", "La Argentina", "La Belleza", "La Calera", "La Capilla", "La Ceja", "La Celia", "La Chorrera", "La Cruz", "La Cumbre", "La Dorada", "La Esperanza", "La Estrella", "La Florida", "La Gloria", "La Guadalupe", "La Jagua De Ibirico", "La Jagua Del Pilar", "La Llanada", "La Macarena", "La Merced", "La Mesa", "La Montañita", "La Palma", "La Paz", "La Pedrera", "La Peña", "La Pintada", "La Plata", "La Playa", "La Primavera", "La Salina", "La Sierra", "La Tebaida", "La Tola", "La Unión", "La Uvita", "La Vega", "La Victoria", "La Virginia", "Labateca", "Labranzagrande", "Landázuri", "Lebríja", "Leguízamo", "Leiva", "Lejanías", "Lenguazaque", "Lérida", "Leticia", "Líbano", "Liborina", "Linares", "Lloró", "López", "Lorica", "Los Andes", "Los Córdobas", "Los Palmitos", "Los Patios", "Los Santos", "Lourdes", "Luruaco", "Macanal", "Macaravita", "Maceo", "Macheta", "Madrid", "Magangué", "Magüi", "Mahates", "Maicao", "Majagual", "Málaga", "Malambo", "Mallama", "Manatí", "Manaure", "Maní", "Manizales", "Manta", "Manzanares", "Mapiripán", "Mapiripana", "Margarita", "María La Baja", "Marinilla", "Maripí", "Mariquita", "Marmato", "Marquetalia", "Marsella", "Marulanda", "Matanza", "Medellín", "Medina", "Medio Atrato", "Medio Baudó", "Medio San Juan", "Melgar", "Mercaderes", "Mesetas", "Milán", "Miraflores", "Miranda", "Miriti - Paraná", "Mistrató", "Mitú", "Mocoa", "Mogotes", "Molagavita", "Momil", "Mompós", "Mongua", "Monguí", "Moniquirá", "Montebello", "Montecristo", "Montelíbano", "Montenegro", "Montería", "Monterrey", "Moñitos", "Morales", "Morelia", "Morichal", "Morroa", "Mosquera", "Motavita", "Murillo", "Murindó", "Mutatá", "Mutiscua", "Muzo", "Nariño", "Nátaga", "Natagaima", "Nechí", "Necoclí", "Neira", "Neiva", "Nemocón", "Nilo", "Nimaima", "Nobsa", "Nocaima", "Norcasia", "Nóvita", "Nueva Granada", "Nuevo Colón", "Nunchía", "Nuquí", "Obando", "Ocamonte", "Ocaña", "Oiba", "Oicatá", "Olaya", "Olaya Herrera", "Onzaga", "Oporapa", "Orito", "Orocué", "Ortega", "Ospina", "Otanche", "Ovejas", "Pachavita", "Pacho", "Pacoa", "Pácora", "Padilla", "Paez", "Páez", "Paicol", "Pailitas", "Paime", "Paipa", "Pajarito", "Palermo", "Palestina", "Palmar", "Palmar De Varela", "Palmas Del Socorro", "Palmira", "Palmito", "Palocabildo", "Pamplona", "Pamplonita", "Pana Pana", "Pandi", "Panqueba", "Papunaua", "Páramo", "Paratebueno", "Pasca", "Pasto", "Patía", "Pauna", "Paya", "Paz De Ariporo", "Paz De Río", "Pedraza", "Pelaya", "Pensilvania", "Peñol", "Peque", "Pereira", "Pesca", "Piamonte", "Piedecuesta", "Piedras", "Piendamó", "Pijao", "Pijiño Del Carmen", "Pinchote", "Pinillos", "Piojó", "Pisba", "Pital", "Pitalito", "Pivijay", "Planadas", "Planeta Rica", "Plato", "Policarpa", "Polonuevo", "Ponedera", "Popayán", "Pore", "Potosí", "Pradera", "Prado", "Providencia", "Pueblo Bello", "Pueblo Nuevo", "Pueblo Rico", "Pueblorrico", "Puebloviejo", "Puente Nacional", "Puerres", "Puerto Alegría", "Puerto Arica", "Puerto Asís", "Puerto Berrío", "Puerto Boyacá", "Puerto Caicedo", "Puerto Carreño", "Puerto Colombia", "Puerto Concordia", "Puerto Escondido", "Puerto Gaitán", "Puerto Guzmán", "Puerto Libertador", "Puerto Lleras", "Puerto López", "Puerto Nare", "Puerto Nariño", "Puerto Parra", "Puerto Rico", "Puerto Rondón", "Puerto Salgar", "Puerto Santander", "Puerto Tejada", "Puerto Triunfo", "Puerto Wilches", "Pulí", "Pupiales", "Puracé", "Purificación", "Purísima", "Quebradanegra", "Quetame", "Quibdó", "Quimbaya", "Quinchía", "Quípama", "Quipile", "Ragonvalia", "Ramiriquí", "Ráquira", "Recetor", "Regidor", "Remedios", "Remolino", "Repelón", "Restrepo", "Retiro", "Ricaurte", "Río De Oro", "Río Iro", "Río Quito", "Río Viejo", "Rioblanco", "Riofrío", "Riohacha", "Rionegro", "Riosucio", "Risaralda", "Rivera", "Roberto Payán", "Roldanillo", "Roncesvalles", "Rondón", "Rosas", "Rovira", "Sabana De Torres", "Sabanagrande", "Sabanalarga", "Sabanas De San Angel", "Sabaneta", "Saboyá", "Sácama", "Sáchica", "Sahagún", "Saladoblanco", "Salamina", "Salazar", "Saldaña", "Salento", "Salgar", "Samacá", "Samaná", "Samaniego", "Sampués", "San Agustín", "San Alberto", "San Andrés", "San Andrés Sotavento", "San Antero", "San Antonio", "San Antonio Del Tequendama", "San Benito", "San Benito Abad", "San Bernardo", "San Bernardo Del Viento", "San Calixto", "San Carlos", "San Carlos De Guaroa", "San Cayetano", "San Cristóbal", "San Diego", "San Eduardo", "San Estanislao", "San Felipe", "San Fernando", "San Francisco", "San Gil", "San Jacinto", "San Jacinto Del Cauca", "San Jerónimo", "San Joaquín", "San José", "San José De La Montaña", "San José De Miranda", "San José De Pare", "San José Del Fragua", "San José Del Guaviare", "San José Del Palmar", "San Juan De Arama", "San Juan De Betulia", "San Juan De Río Seco", "San Juan De Urabá", "San Juan Del Cesar", "San Juan Nepomuceno", "San Juanito", "San Lorenzo", "San Luis", "San Luis De Gaceno", "San Luis De Palenque", "San Marcos", "San Martín", "San Martín De Loba", "San Mateo", "San Miguel", "San Miguel De Sema", "San Onofre", "San Pablo", "San Pablo De Borbur", "San Pedro", "San Pedro De Cartago", "San Pedro De Uraba", "San Pelayo", "San Rafael", "San Roque", "San Sebastián", "San Sebastián De Buenavista", "San Vicente", "San Vicente De Chucurí", "San Vicente Del Caguán", "San Zenón", "Sandoná", "Santa Ana", "Santa Bárbara", "Santa Bárbara De Pinto", "Santa Catalina", "Santa Helena Del Opón", "Santa Isabel", "Santa Lucía", "Santa María", "Santa Marta", "Santa Rosa", "Santa Rosa De Cabal", "Santa Rosa De Osos", "Santa Rosa De Viterbo", "Santa Rosa Del Sur", "Santa Rosalía", "Santa Sofía", "Santacruz", "Santafé De Antioquia", "Santana", "Santander De Quilichao", "Santiago", "Santiago De Tolú", "Santo Domingo", "Santo Tomás", "Santuario", "Sapuyes", "Saravena", "Sardinata", "Sasaima", "Sativanorte", "Sativasur", "Segovia", "Sesquilé", "Sevilla", "Siachoque", "Sibaté", "Sibundoy", "Silos", "Silvania", "Silvia", "Simacota", "Simijaca", "Simití", "Sincé", "Sincelejo", "Sipí", "Sitionuevo", "Soacha", "Soatá", "Socha", "Socorro", "Socotá", "Sogamoso", "Solano", "Soledad", "Solita", "Somondoco", "Sonson", "Sopetrán", "Soplaviento", "Sopó", "Sora", "Soracá", "Sotaquirá", "Sotara", "Suaita", "Suan", "Suárez", "Suaza", "Subachoque", "Sucre", "Suesca", "Supatá", "Supía", "Suratá", "Susa", "Susacón", "Sutamarchán", "Sutatausa", "Sutatenza", "Tabio", "Tadó", "Talaigua Nuevo", "Tamalameque", "Támara", "Tame", "Támesis", "Taminango", "Tangua", "Taraira", "Tarapacá", "Tarazá", "Tarqui", "Tarso", "Tasco", "Tauramena", "Tausa", "Tello", "Tena", "Tenerife", "Tenjo", "Tenza", "Teorama", "Teruel", "Tesalia", "Tibacuy", "Tibaná", "Tibasosa", "Tibirita", "Tibú", "Tierralta", "Timaná", "Timbío", "Timbiquí", "Tinjacá", "Tipacoque", "Tiquisio", "Titiribí", "Toca", "Tocaima", "Tocancipá", "Togüí", "Toledo", "Tolú Viejo", "Tona", "Tópaga", "Topaipí", "Toribio", "Toro", "Tota", "Totoró", "Trinidad", "Trujillo", "Tubará", "Tuluá", "Tumaco", "Tunja", "Tununguá", "Túquerres", "Turbaco", "Turbaná", "Turbo", "Turmequé", "Tuta", "Tutazá", "Ubalá", "Ubaque", "Ulloa", "Umbita", "Une", "Unguía", "Unión Panamericana", "Uramita", "Uribe", "Uribia", "Urrao", "Urumita", "Usiacurí", "Útica", "Valdivia", "Valencia", "Valle De San José", "Valle De San Juan", "Valle Del Guamuez", "Valledupar", "Valparaíso", "Vegachí", "Vélez", "Venadillo", "Venecia", "Ventaquemada", "Vergara", "Versalles", "Vetas", "Vianí", "Victoria", "Vigía Del Fuerte", "Vijes", "Villa Caro", "Villa De Leyva", "Villa De San Diego De Ubate", "Villa Del Rosario", "Villa Rica", "Villagarzón", "Villagómez", "Villahermosa", "Villamaría", "Villanueva", "Villapinzón", "Villarrica", "Villavicencio", "Villavieja", "Villeta", "Viotá", "Viracachá", "Vistahermosa", "Viterbo", "Yacopí", "Yacuanquer", "Yaguará", "Yalí", "Yarumal", "Yavaraté", "Yolombó", "Yondó", "Yopal", "Yotoco", "Yumbo", "Zambrano", "Zapatoca", "Zapayán", "Zaragoza", "Zarzal", "Zetaquira", "Zipacón", "Zipaquirá", "Zona Bananera"];

  function siimedEscNormCiudad(raw){
    if(!raw)return 'Bogota D.C.';
    const s=String(raw).trim();
    const exact=SIIMED_ESC_CIUDADES.find(c=>c.toLowerCase()===s.toLowerCase());
    if(exact)return exact;
    const starts=SIIMED_ESC_CIUDADES.find(c=>c.toLowerCase().startsWith(s.toLowerCase().substring(0,5)));
    if(starts)return starts;
    const contains=SIIMED_ESC_CIUDADES.find(c=>c.toLowerCase().includes(s.toLowerCase().substring(0,5)));
    if(contains)return contains;
    return 'Bogota D.C.';
  }

  function siimedEscNormTel(x){
    if(!x)return '6050000000';
    const d=String(x).replace(/\D/g,'');
    return d||'6050000000';
  }

  function siimedEscNormAddr(x){
    if(!x)return 'DIRECCION NO INFORMADA';
    let s=String(x).toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[#°/.,\-()"']/g,' ')
      .replace(/\s+/g,' ').trim();
    return s||'DIRECCION NO INFORMADA';
  }

  function siimedEscFechaHoy(){
    const d=new Date();
    const dd=String(d.getDate()).padStart(2,'0');
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const yyyy=d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const SIIMED_ESC_COLS = [
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

  function siimedEscBuildWB(rows, logEntries, stats, excluded, defaults, nitExcluidos){
    const wb=XLSX.utils.book_new();

    const aoa=[SIIMED_ESC_COLS.slice()];
    rows.forEach(r=>{
      aoa.push(SIIMED_ESC_COLS.map(c=>{const v=r[c];return(v===''||v===undefined)?null:v??null;}));
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

  // ══════════════════════════════════════════════════════════════
  // VALIDACIONES ADICIONALES — misma lógica ya aprobada en
  // terceros_siimed_erp_to_wo_cloud.js, copiada aquí (con prefijo
  // propio) para que este archivo siga sin depender de ningún otro
  // módulo. Cubre: Actividad Económica (whitelist CIIU), validación
  // de NIT y separación de nombre de respaldo.
  // ══════════════════════════════════════════════════════════════

  // ── "Actividad Económica" — fuente: columna numérica "CODIGO DE
  //    ACTIVIDAD ECONOMICA" (distinta de la columna de texto libre
  //    "ACTIVIDAD ECONOMICA"). Solo se acepta el valor si está en el
  //    listado de códigos CIIU válidos (508 códigos únicos, mismo
  //    listado usado en el módulo Cloud). Se conserva como texto para
  //    no perder ceros a la izquierda. ────────────────────────────────
  const SIIMED_ESC_ACTIVIDADES = new Set(['0010','0020','0081','0082','0090','0111','0112','0113','0114','0115','0119','0121','0122','0123','0124','0125','0126','0127','0128','0129','0130','0141','0142','0143','0144','0145','0149','0150','0161','0162','0163','0164','0170','0210','0220','0230','0240','0311','0312','0321','0322','0510','0520','0610','0620','0710','0721','0722','0723','0729','0811','0812','0820','0891','0892','0899','0910','0990','1011','1012','1020','1030','1031','1032','1033','1040','1051','1052','1061','1062','1063','1071','1072','1081','1082','1083','1084','1089','1090','1101','1102','1103','1104','1200','1311','1312','1313','1391','1392','1393','1394','1399','1410','1420','1430','1511','1512','1513','1521','1522','1523','1610','1620','1630','1640','1690','1701','1702','1709','1811','1812','1820','1910','1921','1922','2011','2012','2013','2014','2021','2022','2023','2029','2030','2100','2211','2212','2219','2221','2229','2310','2391','2392','2393','2394','2395','2396','2399','2410','2421','2429','2431','2432','2511','2512','2513','2520','2591','2592','2593','2599','2610','2620','2630','2640','2651','2652','2660','2670','2680','2711','2712','2720','2731','2732','2740','2750','2790','2811','2812','2813','2814','2815','2816','2817','2818','2819','2821','2822','2823','2824','2825','2826','2829','2910','2920','2930','3011','3012','3020','3030','3040','3091','3092','3099','3110','3120','3210','3220','3230','3240','3250','3290','3311','3312','3313','3314','3315','3319','3320','3511','3512','3513','3514','3520','3530','3600','3700','3811','3812','3821','3822','3830','3900','4111','4112','4210','4220','4290','4311','4312','4321','4322','4329','4330','4390','4511','4512','4520','4530','4541','4542','4610','4620','4631','4632','4641','4642','4643','4644','4645','4649','4651','4652','4653','4659','4661','4662','4663','4664','4665','4669','4690','4711','4719','4721','4722','4723','4724','4729','4731','4732','4741','4742','4751','4752','4753','4754','4755','4759','4761','4762','4769','4771','4772','4773','4774','4775','4781','4782','4789','4791','4792','4799','4911','4912','4921','4922','4923','4930','5011','5012','5021','5022','5111','5112','5121','5122','5210','5221','5222','5223','5224','5229','5310','5320','5511','5512','5513','5514','5519','5520','5530','5590','5611','5612','5613','5619','5621','5629','5630','5811','5812','5813','5819','5820','5911','5912','5913','5914','5920','6010','6020','6110','6120','6130','6190','6201','6202','6209','6311','6312','6391','6399','6411','6412','6421','6422','6423','6424','6431','6432','6491','6492','6493','6494','6495','6499','6511','6512','6513','6514','6515','6521','6522','6531','6532','6611','6612','6613','6614','6615','6619','6621','6629','6630','6810','6820','6910','6920','7010','7020','7110','7111','7112','7120','7210','7220','7310','7320','7410','7420','7490','7500','7710','7721','7722','7729','7730','7740','7810','7820','7830','7911','7912','7990','8010','8020','8030','8110','8121','8129','8130','8211','8219','8220','8230','8291','8292','8299','8411','8412','8413','8414','8415','8421','8422','8423','8424','8430','8511','8512','8513','8521','8522','8523','8530','8541','8542','8543','8544','8551','8552','8553','8559','8560','8610','8621','8622','8691','8692','8699','8710','8720','8730','8790','8810','8890','8891','8899','9001','9002','9003','9004','9005','9006','9007','9008','9101','9102','9103','9200','9311','9312','9319','9321','9329','9411','9412','9420','9491','9492','9499','9511','9512','9521','9522','9523','9524','9529','9601','9602','9603','9609','9700','9810','9820','9900']);

  function siimedEscActEcon(raw){
    if(raw===undefined || raw===null || raw==='') return null;
    let s = String(raw).trim();
    if(!/^\d+$/.test(s)) return null; // solo acepta valores numéricos
    // El Excel de origen suele traer esta columna como número (ej. 111
    // en vez de "0111"), perdiendo el cero a la izquierda a nivel de
    // celda; se rellena a 4 dígitos antes de comparar contra el listado.
    if(s.length < 4) s = s.padStart(4,'0');
    return SIIMED_ESC_ACTIVIDADES.has(s) ? s : null;
  }

  // ── Tipos de identificación de PERSONA NATURAL (mismo criterio que
  //    el módulo Cloud) — para estos se separa el nombre en Nombre(s)/
  //    Apellido(s); para NIT se usa la Razón Social completa. ─────────
  const SIIMED_TIPOS_PERSONA_NATURAL_ESC = new Set([
    'CC','TI','Cédula de extranjería','REGISTRO CIVIL','PASAPORTE','TE'
  ]);

  // ── Separador de nombre de respaldo — copia funcional de
  //    tercSplitName() (terceros_siigo_nube_to_wo_escritorio.js), con
  //    prefijo propio. Se usa solo si el archivo no trae las columnas
  //    de nombre separado, o si vienen vacías para una fila puntual. ─
  function siimedEscSplitName(nombre, tipoId){
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

  // ── Lectura del Excel (XLSX) — detecta automáticamente la fila de
  //    encabezados (normalmente la 6, pero se busca por contenido
  //    para no depender de un número fijo de filas de título) ───────
  async function siimedReadMaestro(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const data=new Uint8Array(e.target.result);
          const wb=XLSX.read(data,{type:'array',cellText:true,raw:false});
          const ws=wb.Sheets[wb.SheetNames[0]];
          let headerRow=-1;
          const probe=XLSX.utils.sheet_to_json(ws,{header:1,range:0,defval:'',blankrows:true});
          for(let r=0;r<Math.min(20,probe.length);r++){
            const row=probe[r]||[];
            if(row.some(v=>String(v||'').trim().toLowerCase()==='identificacion')){
              headerRow=r; break;
            }
          }
          if(headerRow<0) headerRow=5; // respaldo: fila 6 (índice 5), como en el archivo de referencia
          const rows=XLSX.utils.sheet_to_json(ws,{header:1,range:headerRow,defval:''});
          const hdrs=(rows[0]||[]).map(h=>String(h||'').trim());
          const data_rows=rows.slice(1).filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined));
          resolve({hdrs,rows:data_rows});
        }catch(err){reject(err);}
      };
      reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Agrupa las filas por IDENTIFICACION (el mismo tercero puede
  //    aparecer varias veces con distinto TIPO) ──────────────────────
  function siimedAgrupar(hdrs, rows){
    const cId=siimedCol(hdrs,'IDENTIFICACION');
    const cTipo=siimedCol(hdrs,'TIPO');
    const grupos=new Map(); // id -> {row, roles:Set}
    rows.forEach(r=>{
      const id=siimedNormId(r[cId]);
      if(!id) return;
      const tipo=String(r[cTipo]||'').trim();
      if(!grupos.has(id)) grupos.set(id, {row:r, roles:new Set()});
      if(tipo) grupos.get(id).roles.add(tipo);
    });
    return grupos;
  }

  // Estado pendiente entre la fase 1 (elegir archivo + modal de correo
  // por defecto) y la fase 2 (transformación real).
  let _siimedEscPendingFile = null;

  // ══════════════════════════════════════════════════════════════
  // FASE 1: solo muestra el modal de configuración de correo — igual
  // que hace el módulo Cloud (siimedCldShowConfigModal) — antes de
  // arrancar el pipeline real.
  // ══════════════════════════════════════════════════════════════
  async function startSiimedEscETL(){
    const file = SIIMED_ESC_S.file || (window.__SIIMED_S && window.__SIIMED_S.file);
    if(!file){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Terceros).'); return; }
    _siimedEscPendingFile = file;
    siimedEscShowConfigModal();
  }

  // ── Modal de configuración: Correo por defecto para terceros sin
  //    email (misma opción que ofrece el módulo Cloud) ───────────────
  function siimedEscShowConfigModal(){
    let modal = document.getElementById('siimed-esc-config-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'siimed-esc-config-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.siimedEscCloseConfigModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:480px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto">
          <div style="text-align:center;margin-bottom:22px">
            <div style="font-size:20px;font-weight:700;color:#fff">Terceros sin correo electrónico</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">
              Indica qué hacer con los terceros que no traen correo en el archivo de SIIMED ERP.
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
            <input type="radio" name="siimed-esc-email-mode" id="siimed-esc-email-mode-blank" value="blank" checked>
            Dejar el correo en blanco
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
            <input type="radio" name="siimed-esc-email-mode" id="siimed-esc-email-mode-default" value="default">
            Aplicar un correo predeterminado:
          </label>
          <input type="email" id="siimed-esc-email-default" placeholder="correo@ejemplo.com"
            style="width:100%;margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
            border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:5px">
            Solo se aplica a los terceros que no traigan correo propio en el archivo.
          </div>
          <div style="display:flex;gap:12px;margin-top:24px">
            <button onclick="window.siimedEscCloseConfigModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.siimedEscConfirmConfigModal()" style="flex:2;padding:12px;
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

  function siimedEscCloseConfigModal(){
    const modal=document.getElementById('siimed-esc-config-modal');
    if(modal) modal.style.display='none';
  }
  window.siimedEscCloseConfigModal = siimedEscCloseConfigModal;

  async function siimedEscConfirmConfigModal(){
    if(!_siimedEscPendingFile) return;
    const emailModeEl = document.getElementById('siimed-esc-email-mode-default');
    const emailMode = (emailModeEl && emailModeEl.checked) ? 'default' : 'blank';
    const emailDefEl = document.getElementById('siimed-esc-email-default');
    const emailDefault = emailDefEl ? String(emailDefEl.value||'').trim() : '';
    siimedEscCloseConfigModal();
    await _runSiimedEscETL(emailMode, emailDefault);
  }
  window.siimedEscConfirmConfigModal = siimedEscConfirmConfigModal;

  // ══════════════════════════════════════════════════════════════
  // FASE 2: PIPELINE real — SIIMED ERP → World Office Escritorio
  // ══════════════════════════════════════════════════════════════
  async function _runSiimedEscETL(emailMode, emailDefault){
    const file = _siimedEscPendingFile;
    if(!file){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Terceros).'); return; }
    setStep(3);
    SIIMED_ESC_LOG.length=0;
    const panel=document.getElementById('logp'); if(panel) panel.innerHTML='';
    setPStep(0); setPct(0,'Iniciando...');
    const t0=Date.now();
    try{
      siimedEscLog('📂 Leyendo archivo de SIIMED ERP...','i','Lectura');
      setPStep(1); setPct(10,'Leyendo archivo...');
      await siimedEscSleep(30);

      const maestro = await siimedReadMaestro(file);
      siimedEscLog('   Filas leídas: '+maestro.rows.length,'i','Lectura');

      const hdrs=maestro.hdrs;
      const cId=siimedCol(hdrs,'IDENTIFICACION');
      const cNom=siimedCol(hdrs,'NOMBRE');
      const cP1=siimedCol(hdrs,'PRIMER NOMBRE');
      const cP2=siimedCol(hdrs,'SEGUNDO NOMBRE');
      const cA1=siimedCol(hdrs,'PRIMER APELLIDO');
      const cA2=siimedCol(hdrs,'SEGUNDO APELLIDO');
      const cTribu=siimedCol(hdrs,'IDENTIFICACIÓN TRIBUTARIA');
      const cPersJur=siimedCol(hdrs,'TIPO PERSONA JURIDICA');
      const cClasifTrib=siimedCol(hdrs,'CLASIFICACIÓN TRIBUTARIA');
      const cCiudad=siimedCol(hdrs,'CIUDAD');
      const cDireccion=siimedCol(hdrs,'DIRECCION');
      const cTel1=siimedCol(hdrs,'TELEFONO 1');
      const cTel2=siimedCol(hdrs,'TELEFONO 2');
      const cTel3=siimedCol(hdrs,'TELEFONO 3');
      const cFax=siimedCol(hdrs,'FAX');
      const cCorreo=siimedCol(hdrs,'CORREO ELECTRONICO');
      const cCorreoFact=siimedCol(hdrs,'CORREO FACTURACION');
      const cEstado=siimedCol(hdrs,'ESTADO');
      const cForma=siimedCol(hdrs,'FORMA DE PAGO');
      const cLista=siimedCol(hdrs,'LISTA DE PRECIOS');
      const cDescuento=siimedCol(hdrs,'PORCENTAJE DESCUENTO');
      const cCupo=siimedCol(hdrs,'CUPO CREDITO');
      const cObs=siimedCol(hdrs,'OBSERVACIONES');
      const cCodAct=siimedCol(hdrs,'CODIGO DE ACTIVIDAD ECONOMICA');
      // Si el archivo NO trae ninguna de las 4 columnas de nombre
      // separado, se usa como respaldo la separación automática de
      // NOMBRE (mismo criterio que el módulo Cloud).
      const tieneColsNombreSep = (cP1>=0 || cP2>=0 || cA1>=0 || cA2>=0);

      setPStep(2); setPct(30,'Agrupando por tercero...');
      await siimedEscSleep(30);
      const grupos = siimedAgrupar(hdrs, maestro.rows);
      siimedEscLog('   '+maestro.rows.length+' filas → '+grupos.size+' terceros únicos (tras agrupar por Identificación)','i','Consolidación');

      const out=[], defaults=[], nitExcluidos=[], excluded=[];
      let empleadosExcluidos=0, emailsDefault=0;
      const totalEntrada = maestro.rows.length;

      for(const [id, g] of grupos){
        const r=g.row, roles=g.roles;

        if(SIIMED_ESC_NITS_EXCLUIR.has(id)){
          nitExcluidos.push({id, nombre:String(r[cNom]||'').toUpperCase().trim()});
          continue;
        }

        let tipoId = siimedMapTipoIdEsc(r[cTribu], id);

        // ── Validación NIT (mismo criterio que el módulo Cloud): solo
        //    se conserva como NIT si el número de identificación tiene
        //    EXACTAMENTE 9 dígitos; si no, se reclasifica a Cédula de
        //    ciudadanía (CC). ─────────────────────────────────────────
        let nitReclasificado = false;
        if(tipoId === 'NIT'){
          const idDigitos = String(id).replace(/\D/g,'');
          if(idDigitos.length !== 9){
            tipoId = 'CC';
            nitReclasificado = true;
          }
        }

        // ── esJuridica (mismo criterio que el módulo Cloud): NIT →
        //    jurídica; los 6 tipos de persona natural → natural;
        //    cualquier otro tipo usa "TIPO PERSONA JURIDICA" como
        //    respaldo. ─────────────────────────────────────────────
        let esJuridica;
        if(tipoId === 'NIT'){
          esJuridica = true;
        } else if(SIIMED_TIPOS_PERSONA_NATURAL_ESC.has(tipoId)){
          esJuridica = false;
        } else {
          esJuridica = String(r[cPersJur]||'').trim().toLowerCase()==='juridica';
        }

        // Empleado → no se migra (igual que Siigo Nube con su archivo
        // opcional de empleados, pero aquí el propio archivo ya trae
        // el rol "Empleado" para esas filas)
        if(roles.has('Empleado')){
          defaults.push({
            'Tipo Identificación Aplicado': tipoId,
            'No. Identificación': id,
            'Nombre': String(r[cNom]||'').trim(),
            'Concepto': 'Tercero no se tiene en cuenta ya que es empleado'
          });
          empleadosExcluidos++;
          continue;
        }

        const municipioRaw = r[cCiudad];
        const direccionRaw = r[cDireccion];
        const tel1=r[cTel1], tel2=r[cTel2], tel3=r[cTel3];
        const telPrincipal = tel1 || tel2 || tel3;

        const ciudad = siimedEscNormCiudad(municipioRaw);
        const dir = siimedEscNormAddr(direccionRaw);
        const tel = siimedEscNormTel(telPrincipal);
        const movil1 = tel2 ? siimedEscNormTel(tel2) : null;

        const estadoNum = Number(r[cEstado]);
        const activo = estadoNum===0 ? 0 : -1;

        const retencion = siimedRetencionEsc(r[cClasifTrib], esJuridica);

        let esC=roles.has('Cliente'), esP=roles.has('Proveedor');
        if(!esC && !esP){ esC=true; esP=true; } // solo "Otro" u otro rol no reconocido → se asume ambos
        let propActiva=(esC?'Cliente;':'')+(esP?'Proveedor;':'');
        if(!propActiva) propActiva='Cliente;Proveedor;';

        // Nombre: persona jurídica → NOMBRE completo (Razón Social);
        // natural → columnas ya separadas si el archivo las trae; si no
        // existen o vienen vacías en esta fila puntual, se separa
        // NOMBRE con siimedEscSplitName() (mismo criterio que el
        // módulo Cloud). ────────────────────────────────────────────
        let p1='',p2='',a1='',a2='';
        if(esJuridica){
          p1 = siimedCleanTxt(r[cNom]);
        } else if(tieneColsNombreSep){
          p1 = siimedCleanTxt(r[cP1]);
          p2 = siimedCleanTxt(r[cP2]);
          a1 = siimedCleanTxt(r[cA1]);
          a2 = siimedCleanTxt(r[cA2]);
          if(!p1 && !a1){
            const partes = siimedEscSplitName(r[cNom], tipoId);
            p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
          }
        } else {
          const partes = siimedEscSplitName(r[cNom], tipoId);
          p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
        }

        // ── Correo: si el archivo no trae correo, se aplica lo que el
        //    usuario eligió en el modal (dejar en blanco o correo
        //    predeterminado) — mismo criterio que el módulo Cloud. ────
        const correoOrigen = (cCorreo>=0 && r[cCorreo]) ? String(r[cCorreo]).trim() : '';
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

        const cupoNum = Number(r[cCupo])||0;

        const row={
          'Tipo Identificación': tipoId,
          'No. Identificación': id,
          'Ciudad Identificación': ciudad,
          '1er. Nombre o Razón Social': p1,
          '2do. Nombre': p2||null,
          '1re. Apellido': a1||null,
          '2do.Apellido': a2||null,
          'Propiedad Activa': propActiva,
          'Activo': activo,
          'Propiedad Retención': retencion,
          'Fecha Creación': siimedEscFechaHoy(),
          'Plazo': 0,
          'Clasificación Dian': 'Normal',
          'Actividad Económica': siimedEscActEcon(cCodAct>=0 ? r[cCodAct] : null),
          'Matricula': null,
          'Tipos_Responsabilidades': null,
          'Aplica ReteIca': null,
          '% Ica': null,
          'Maneja Cupo Crédito': cupoNum>0 ? 'Si' : null,
          'Cupo Crédito': cupoNum>0 ? cupoNum : null,
          'Código': null,
          'Fecha Aniversario': null,
          'Forma de Pago': (cForma>=0 && r[cForma]) ? String(r[cForma]).trim() : null,
          'Lista Precios': (cLista>=0 && r[cLista] && String(r[cLista]).trim()) ? String(r[cLista]).trim() : null,
          'Nota': null,
          '% Descuento': (cDescuento>=0 && r[cDescuento]) ? Number(r[cDescuento])||null : null,
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
          'Fax': (cFax>=0 && r[cFax]) ? String(r[cFax]).trim() : null,
          'Movil 1': movil1,
          'Movil 2': null,
          'E_Mail': email,
          'E_Mail 2': (cCorreoFact>=0 && r[cCorreoFact]) ? String(r[cCorreoFact]).trim() : null,
          'E_Mail 3': null,
          'Página Web': null,
          'Observaciones': (cObs>=0 && r[cObs]) ? String(r[cObs]).trim() : null,
          'Sucursal': null
        };
        out.push(row);

        if(!municipioRaw) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Ciudad vacía en origen — se aplica Bogota D.C. por defecto'});
        if(!direccionRaw || String(direccionRaw).length<3) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Dirección vacía en origen — se aplica DIRECCION NO INFORMADA por defecto'});
        if(!telPrincipal) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Teléfono vacío en origen — se aplica 6050000000 por defecto'});
        if(!r[cTribu]) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Identificación Tributaria vacía en origen — se infiere '+tipoId+' por longitud del número'});
        if(nitReclasificado) defaults.push({'Tipo Identificación Aplicado':tipoId,'No. Identificación':id,'Nombre':p1,'Concepto':'Venía como NIT pero el número de identificación no tiene 9 dígitos — se reclasificó como Cédula de ciudadanía (CC)'});
      }

      siimedEscLog('✅ Consolidados: '+out.length+' registros ('+empleadosExcluidos+' empleados excluidos, '+nitExcluidos.length+' NITs de lista predefinida excluidos)','o','Consolidación');
      setPStep(3); setPct(60,'Transformando...');
      await siimedEscSleep(30);
      siimedEscLog('🔄 Transformados: '+out.length+' registros','o','Transformación');
      if(emailsDefault>0) siimedEscLog('   '+emailsDefault+' correos completados con el valor predeterminado','i','Transformación');

      setPStep(4); setPct(80,'Generando Excel...');
      await siimedEscSleep(30);
      siimedEscLog('📊 Construyendo archivo Excel...','i','Escritura');

      SIIMED_ESC_WB = siimedEscBuildWB(out, SIIMED_ESC_LOG, {
        archivos_entrada:1,
        registros_entrada:totalEntrada,
        registros_salida:out.length,
        errores:0,
        warnings:0
      }, excluded, defaults, nitExcluidos);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      setPct(100,'¡Listo!'); setPStep(5);
      siimedEscLog('✅ Excel generado en '+dur+'s — '+out.length+' registros','o','Escritura');

      const fn = siimedEscBuildFN();
      const fnEl=document.getElementById('dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('dl-dest-label'); if(lbl) lbl.textContent='Para importar en World Office Escritorio';
      const stIn=document.getElementById('st-in'); if(stIn) stIn.textContent=totalEntrada;
      const stOk=document.getElementById('st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'SIIMED ERP', dest_soft:'World Office Escritorio',
          module:'Terceros', records_in:totalEntrada, records_out:out.length,
          errors:0, warnings:0, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      setStep(4);
    }catch(err){
      siimedEscLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
    }
  }

  function siimedEscBuildFN(){
    const now=new Date();
    const p=x=>String(x).padStart(2,'0');
    const ts=now.getFullYear()+'_'+p(now.getMonth()+1)+'_'+p(now.getDate());
    return 'terceros_siimed_erp_wo_escritorio_'+ts+'.xlsx';
  }

  function siimedEscDoDownload(){
    if(!SIIMED_ESC_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    XLSX.writeFile(SIIMED_ESC_WB, (document.getElementById('dl-fn')||{}).textContent || siimedEscBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function siimedEscInstall(){
    const sorigEl = document.getElementById('sorig');
    const s2card = document.querySelector('#s2 .card');
    if(!sorigEl || !s2card) return;

    // 1) Opción "SIIMED ERP" en el selector de origen (comprobación
    //    para no duplicarla si el módulo Cloud hermano ya la agregó)
    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

    // 2) Slot único y obligatorio de archivo (compartido con el
    //    módulo Cloud hermano vía window.__SIIMED_S — mismo patrón
    //    que ya usan los módulos de Siigo Nube, que comparten un solo
    //    archivo maestro entre Escritorio y Cloud)
    window.__SIIMED_S = window.__SIIMED_S || { file:null };
    const siigoFslots = document.querySelector('#s2 .fslots');
    const siigoInfo = document.querySelector('#s2 .al.al-i');

    if(!document.getElementById('siimed-fslots')){
      const infoHTML =
        '<div class="al al-i" id="siimed-info" style="display:none;margin-bottom:14px">'+
          '<span>ℹ️</span>'+
          '<span>SIIMED ERP: exporta el <strong>Catálogo de Terceros</strong> completo. Es el único archivo requerido — sirve para migrar tanto a World Office Escritorio como a World Office Cloud.</span>'+
        '</div>';
      const slotsHTML =
        '<div class="fslots" id="siimed-fslots" style="display:none">'+
          '<div class="fslot" id="sl-siimed">'+
            '<input type="file" id="f-siimed" accept=".xlsx,.xls" onchange="window.__siimedOnFile(this)">'+
            '<div class="fs-badge">Obligatorio</div>'+
            '<div class="fs-ico">📇</div>'+
            '<div class="fs-name">Catálogo de Terceros</div>'+
            '<div class="fs-desc">Exportación de SIIMED ERP (Catálogo de Terceros)</div>'+
            '<div class="fs-sel" id="nm-siimed"></div>'+
          '</div>'+
        '</div>';
      if(siigoInfo) siigoInfo.insertAdjacentHTML('afterend', infoHTML);
      if(siigoFslots) siigoFslots.insertAdjacentHTML('afterend', slotsHTML);
    }

    window.__siimedOnFile = window.__siimedOnFile || function(input){
      const f=input.files[0]; if(!f) return;
      const slot=document.getElementById('sl-siimed'), nm=document.getElementById('nm-siimed');
      if(slot) slot.className='fslot ok';
      if(nm) nm.textContent=f.name;
      window.__SIIMED_S.file = f;
      SIIMED_ESC_S.file = f;
    };
    // Si el módulo Cloud hermano ya cargó el archivo antes que este,
    // sincronizamos la referencia local.
    if(window.__SIIMED_S.file) SIIMED_ESC_S.file = window.__SIIMED_S.file;

    // 3) Alternar visibilidad según origen elegido
    function siimedToggle(){
      const isSiimed = sorigEl.value === 'SIIMED ERP';
      const siimedFslots=document.getElementById('siimed-fslots');
      const siimedInfo=document.getElementById('siimed-info');
      const algFslots=document.getElementById('alg-fslots');
      const algInfo=document.getElementById('alg-info');
      if(isSiimed){
        if(siigoFslots) siigoFslots.style.display='none';
        if(siigoInfo) siigoInfo.style.display='none';
        if(algFslots) algFslots.style.display='none';
        if(algInfo) algInfo.style.display='none';
      }
      if(siimedFslots) siimedFslots.style.display = isSiimed ? '' : 'none';
      if(siimedInfo) siimedInfo.style.display = isSiimed ? '' : 'none';
    }
    sorigEl.addEventListener('change', siimedToggle);
    siimedToggle();

    // 4) routeETL(): solo intercepta SIIMED ERP → World Office
    //    Escritorio. Para SIIMED ERP → Cloud, deja pasar (lo maneja
    //    el archivo hermano, que debe cargarse también en index.html).
    const _origRouteETL = window.routeETL;
    window.routeETL = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Escritorio'){
        startSiimedEscETL();
        return;
      }
      if(typeof _origRouteETL === 'function') _origRouteETL();
    };

    // 5) routeDownload(): mismo criterio
    const _origRouteDownload = window.routeDownload;
    window.routeDownload = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Escritorio'){ siimedEscDoDownload(); return; }
      if(typeof _origRouteDownload === 'function') _origRouteDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Terceros
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'terceros'){
        SIIMED_ESC_S.file = null;
        _siimedEscPendingFile = null;
        siimedEscCloseConfigModal();
        if(window.__SIIMED_S) window.__SIIMED_S.file = null;
        const slot=document.getElementById('sl-siimed'); if(slot) slot.className='fslot';
        const nm=document.getElementById('nm-siimed'); if(nm) nm.textContent='';
        const inp=document.getElementById('f-siimed'); if(inp) inp.value='';
        siimedToggle();
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', siimedEscInstall);
  } else {
    siimedEscInstall();
  }

})();