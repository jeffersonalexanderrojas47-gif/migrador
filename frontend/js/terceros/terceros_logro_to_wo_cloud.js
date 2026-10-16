// ══════════════════════════════════════════════════════════════════
// ETL: Terceros — Logro → World Office Cloud
// Módulo: terceros_logro_to_wo_cloud.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Hermano de terceros_logro_to_wo_escritorio.js pero COMPLETAMENTE
// SEPARADO: no comparte código ni funciones con él, solo los Files
// subidos por el usuario (a través de window.__LOGRO_S.clientesFile /
// window.__LOGRO_S.proveedoresFile) — igual que ya ocurre entre los
// módulos Escritorio y Cloud de SIIMED ERP.
//
// AUTOCONTENIDO: este archivo NO depende de ningún helper definido en
// otro módulo de terceros (Siigo Nube, SIIMED ERP, Alegra, ni siquiera
// su propio hermano terceros_logro_to_wo_escritorio.js). Cada proceso
// debe poder ejecutarse aunque los demás archivos .js de "terceros"
// fallen al cargar. Solo depende de utilidades verdaderamente globales
// de la app (definidas en app.js / cargadas antes de todos los módulos
// de terceros): setStep, setPStep, setPct, api, AUTH.
//
// ESTRUCTURA DEL ARCHIVO DE ORIGEN: ver terceros_logro_to_wo_escritorio.js
// para el detalle completo (dos archivos — Clientes y Proveedores de
// la compañía — que se consolidan por "Identificación"; tolerancia a
// la errata "Tipo de Identiticación" del archivo de Proveedores).
//
// PLANTILLA DE SALIDA — World Office Cloud: se copia íntegra (bajo
// nombres con prefijo Logro/LOGRO_CLD) la estructura completa que usa
// terceros_siigo_nube_to_wo_cloud.js: COLS/COLS_DISPLAY (30 columnas),
// hoja "Importación Terceros" con encabezado de 2 filas (fila 0 =
// rótulos de sección fusionados "Ficha Principal"/"Ficha Dirección"),
// hoja "LISTAS" (datos de referencia para los desplegables del
// archivo), "sucursales Clientes", "Logs", "Estadísticas",
// "IdentificacionesExcluidas", "Campos por Defecto" (condicional) y
// "NITs Excluidos" (condicional). No se generan las hojas "Listas01"
// ni "Empleados" (opcionales en el hermano de SIIMED; Logro no trae
// archivo de empleados ni datos de listas adicionales).
//
// DECISIONES DOCUMENTADAS (mismo criterio que
// terceros_logro_to_wo_escritorio.js — ver ese archivo para el
// detalle; se repiten aquí en la versión Cloud):
//   • Activo: siempre "Si" (no hay columna de estado en Logro).
//   • Tipo Contribuyente: Persona Juridica si "Persona"=Jurídica, si
//     no Persona Natural No Responsable del IVA (no hay dato de
//     régimen tributario).
//   • Actividad Economica: siempre null (no hay columna en Logro).
//   • Vendedor: siempre null, aunque el archivo de Clientes trae
//     "Vendedor"/"Nombre Vendedor" (mismo criterio que SIIMED — ese
//     campo espera un código de vendedor ya existente en World
//     Office, no un nombre libre).
//   • Forma Pago / Lista Precios / Maneja Cupo Credito / Plazo Dias /
//     Porcentaje Descuento: sin dato de origen confiable en los
//     archivos de Logro → null (Plazo Dias en 0, igual que el
//     hermano de SIIMED Cloud cuando no hay columna "PERÍODO PAGO").
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const LOGRO_CLD_S = { clientesFile:null, proveedoresFile:null };
  let LOGRO_CLD_WB = null;
  const LOGRO_CLD_LOG = [];

  function logroCldLog(msg, lvl, fase){
    const ts = new Date().toISOString();
    LOGRO_CLD_LOG.push({ ts, fase: fase || '', lvl: lvl || 'i', msg });
    const panel = document.getElementById('logp');
    if(!panel) return;
    const now = new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css = {i:'li', w:'lw', o:'lo', e:'le-e'}[lvl] || 'li';
    panel.innerHTML += '<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop = panel.scrollHeight;
  }
  function logroCldSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function logroCldNormId(x){
    const s=String(x??'').replace(/[,\s]/g,'').trim();
    if(!s||s==='nan'||s==='undefined')return '';
    return s.replace(/[^0-9A-Za-z\-]/g,'');
  }
  function logroCldIdNum(id){
    if(/^[0-9]+$/.test(id) && id.length<=15) return Number(id);
    return id;
  }

  function logroCldCleanTxt(s){
    return String(s||'').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  function logroCldNormKey(s){
    return String(s||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }

  // ── Búsqueda de columna tolerante a variantes/erratas — el archivo
  //    de Proveedores de Logro trae "Tipo de Identiticación" (con
  //    errata) en vez de "Tipo de Identificación" ────────────────────
  function logroCldCol(hdrs, name){
    let idx = hdrs.findIndex(h=>String(h||'').trim().toLowerCase()===name.toLowerCase());
    if(idx>=0) return idx;
    const target = logroCldNormKey(name);
    idx = hdrs.findIndex(h=>logroCldNormKey(h)===target);
    if(idx>=0) return idx;
    // Tolerancia a la errata "Tipo de Identiticación" (Proveedores.xlsx).
    // Exige que el encabezado candidato también contenga "tipo" — si no,
    // "Identificación" (la columna del número, no del tipo) haría match
    // primero por contener "identific" y se leería la columna equivocada.
    if(target.includes('tipo') && target.includes('identific')){
      idx = hdrs.findIndex(h=>{
        const n=logroCldNormKey(h);
        return n.includes('tipo') && (n.includes('identific') || n.includes('identitic'));
      });
    }
    return idx;
  }

  // ── Mapeo "Tipo de Identificación" (texto libre de Logro) → Tipo
  //    Identificacion (World Office Cloud). El catálogo de Cloud no
  //    tiene una opción "NUIP" dedicada — se usa "Registro Civil" como
  //    la más cercana disponible (mismo criterio ya usado para
  //    SIIMED ERP → Cloud); revisar si aplica a tu caso. ─────────────
  const LOGRO_TIPO_ID_CLD = {
    'cedula de ciudadania': 'Cédula de ciudadanía',
    'nit': 'NIT',
    'tarjeta de identidad': 'Tarjeta de Identidad',
    'cedula de extranjeria': 'Cédula de Extranjería',
    'registro civil': 'Registro Civil',
    'pasaporte': 'Pasaporte',
    'tarjeta de extranjeria': 'Tarjeta de Extranjería',
    'documento de identificacion extranjero': 'Documento de Identificación Extranjero',
    'nuip': 'Registro Civil', // sin equivalente exacto de NUIP en Cloud
    'permiso especial de permanencia': 'Permiso Especial de Permanencia',
    'permiso proteccion temporal': 'Permiso Especial de Permanencia',
    'sin identificacion del exterior o uso exclusivo de la dian': 'Sin ID del exterior o para uso definido por DIAN',
    'sin identificacion del exterior o para uso definido por la dian': 'Sin ID del exterior o para uso definido por DIAN',
    'nit de otro pais': 'Documento de Identificación Extranjero',
    'salvoconducto de permanencia': 'Permiso Especial de Permanencia'
  };
  function logroCldMapTipoId(raw, idNorm){
    const k = logroCldNormKey(raw);
    if(LOGRO_TIPO_ID_CLD[k]) return LOGRO_TIPO_ID_CLD[k];
    if(!k){
      const n = String(idNorm||'').replace(/\D/g,'');
      return n.length===9 ? 'NIT' : 'Cédula de ciudadanía';
    }
    return String(raw||'').trim();
  }

  const LOGRO_CLD_TIPOS_PERSONA_NATURAL = new Set([
    'Cédula de ciudadanía','Tarjeta de Identidad','Cédula de Extranjería',
    'Registro Civil','Pasaporte','Tarjeta de Extranjería'
  ]);

  // ── Separador de nombre de respaldo — solo se usa si, siendo
  //    persona natural, las columnas Primer/Segundo Nombre y
  //    Primer/Segundo Apellido vienen vacías para una fila puntual. ──
  function logroCldSplitName(nombre, tipoId){
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
  //    datos, mismo criterio/misma lista usada en todos los demás
  //    módulos, copiada aquí para mantener el archivo autocontenido) ─
  const LOGRO_CLD_NITS_EXCLUIR = new Set(["222222222","800003122","800037800","800088702","800112806","800118954","800130907","800138188","800140949","800147502","800148514","800149496","800197268","800211025","800216278","800219488","800224808","800226175","800227940","800229739","800231969","800251440","800253055","800256161","804002105","805000427","805001157","806008394","809008362","817001773","824001398","830003564","830008686","830009783","830054904","830074184","830113831","830125132","837000084","839000495","844003392","860002183","860002503","860002964","860003020","860007335","860007336","860007379","860007738","860008645","860011153","860013570","860022137","860034313","860034594","860035827","860043186","860045904","860050750","860051135","860066942","860503617","890000381","890101994","890102002","890102044","890102257","890200106","890200756","890201578","890203088","890203183","890270275","890300279","890303093","890303208","890399010","890480023","890480110","890480123","890500516","890500675","890700148","890704737","890806490","890900840","890900841","890900842","890903790","890903937","890903938","890904996","890980040","891080005","891080031","891180008","891190047","891200337","891280008","891480000","891500182","891500319","891600091","891780093","891800213","891800330","891856000","892000146","892115006","892200015","892399989","892400320","899999001","899999034","899999061","899999063","899999107","899999284","899999734","900156264","900200960","900226715","900298372","900336004","900406150","900604350","900914254","900935126","901037916","901093846","901469580","901543761"]);

  // ── Catálogo de Ciudades — World Office Cloud ("ubicacion_ciudad"),
  //    mismo catálogo enriquecido (1035 municipios) ya usado por
  //    SIIMED ERP → Cloud, copiado aquí para mantener el archivo
  //    autocontenido. Se usa para la normalización real de cada fila.
  //    Si NO hay coincidencia, se deja la ciudad tal como viene en el
  //    Excel original (no se fuerza a Bogotá ni se deja vacía). ──────
  const LOGRO_CLD_CIUDADES = ['Abejorral','Abrego','Abriaquí','Acacías','Acandí','Acevedo','Achí','Agrado','Agua De Dios','Aguachica','Aguada','Aguadas','Aguazul','Agustín Codazzi','Aipe','Albania','Albán','Alcalá','Aldana','Alejandría','Algarrobo','Algeciras','Almaguer','Almeida','Alpujarra','Altamira','Alto Baudó','Altos Del Rosario','Alvarado','Amagá','Amalfi','Ambalema','Anapoima','Ancuyá','Andalucía','Andes','Angelópolis','Angostura','Anolaima','Anorí','Anserma','Ansermanuevo','Anzoátegui','Anzá','Apartadó','Apulo','Apía','Aquitania','Aracataca','Aranzazu','Aratoca','Arauca','Arauquita','Arbeláez','Arboleda','Arboledas','Arboletes','Arcabuco','Arenal','Argelia','Ariguaní','Arjona','Armenia','Armero','Arroyohondo','Astrea','Ataco','Atrato','Ayapel','Bagadó','Bahía Solano','Bajo Baudó','Balboa','Baranoa','Baraya','Barbacoas','Barbosa','Barichara','Barranca De Upía','Barrancabermeja','Barrancas','Barranco De Loba','Barranco Minas','Barranquilla','Becerril','Belalcázar','Bello','Belmira','Beltrán','Belén','Belén De Bajirá','Belén De Los Andaquies','Belén De Umbría','Berbeo','Betania','Betulia','Betéitiva','Bituima','Boavita','Bochalema','Bogotá, D.C.','Bojacá','Bojayá','Bolívar','Bosconia','Boyacá','Briceño','Bucaramanga','Bucarasica','Buenaventura','Buenavista','Buenos Aires','Buesaco','Bugalagrande','Buriticá','Busbanzá','Cabrera','Cabuyaro','Cacahual','Cachipay','Cachirá','Caicedo','Caicedonia','Caimito','Cajamarca','Cajibío','Cajicá','Calamar','Calarcá','Caldas','Caldono','Cali','California','Calima','Caloto','Campamento','Campo De La Cruz','Campoalegre','Campohermoso','Canalete','Candelaria','Cantagallo','Caparrapí','Capitanejo','Caracolí','Caramanta','Carcasí','Carepa','Carmen De Apicalá','Carmen De Carupa','Carmen Del Darién','Carolina','Cartagena De Indias','Cartagena Del Chairá','Cartago','Carurú','Casabianca','Castilla La Nueva','Caucasia','Cañasgordas','Cepitá','Cereté','Cerinza','Cerrito','Cerro San Antonio','Chachagüí','Chaguaní','Chalán','Chameza','Chaparral','Charalá','Charta','Chibolo','Chigorodó','Chima','Chimichagua','Chimá','Chinavita','Chinchiná','Chinácota','Chinú','Chipaque','Chipatá','Chiquinquirá','Chiriguaná','Chiscas','Chita','Chitagá','Chitaraque','Chivatá','Chivor','Choachí','Chocontá','Chía','Chíquiza','Cicuco','Cimitarra','Circasia','Cisneros','Ciudad Bolívar','Ciénaga','Ciénaga De Oro','Ciénega','Clemencia','Cocorná','Coello','Cogua','Colombia','Coloso','Colón','Concepción','Concordia','Condoto','Confines','Consaca','Contadero','Contratación','Convención','Copacabana','Coper','Corinto','Coromoro','Corozal','Corrales','Cota','Cotorra','Covarachía','Coveñas','Coyaima','Cravo Norte','Cuaspud','Cubarral','Cubará','Cucaita','Cucunubá','Cucutilla','Cumaral','Cumaribo','Cumbal','Cumbitara','Cunday','Curillo','Curití','Curumaní','Cuítiva','Cáceres','Cácota','Cáqueza','Cértegui','Cómbita','Córdoba','Cúcuta','Dabeiba','Dagua','Dibulla','Distracción','Dolores','Don Matías','Dosquebradas','Duitama','Durania','Ebéjico','El Bagre','El Banco','El Cairo','El Calvario','El Cantón Del San Pablo','El Carmen','El Carmen De Atrato','El Carmen De Bolívar','El Carmen De Chucurí','El Carmen De Viboral','El Castillo','El Cerrito','El Charco','El Cocuy','El Colegio','El Copey','El Doncello','El Dorado','El Dovio','El Encanto','El Espino','El Guacamayo','El Guamo','El Litoral Del San Juan','El Molino','El Paso','El Paujil','El Peñol','El Peñón','El Piñon','El Playón','El Retorno','El Retén','El Roble','El Rosal','El Rosario','El Santuario','El Tablón De Gómez','El Tambo','El Tarra','El Zulia','El Águila','Elías','Encino','Enciso','Entrerríos','Envigado','Espinal','Facatativá','Falan','Filadelfia','Filandia','Firavitoba','Flandes','Florencia','Floresta','Florida','Floridablanca','Florián','Fomeque','Fonseca','Fortul','Fosca','Francisco Pizarro','Fredonia','Fresno','Frontino','Fuente De Oro','Fundación','Funes','Funza','Fusagasugá','Fúquene','Gachalá','Gachancipá','Gachantivá','Gachetá','Galapa','Galeras','Galán','Gama','Gamarra','Gambita','Garagoa','Garzón','Gigante','Ginebra','Giraldo','Girardot','Girardota','Girón','González','Gramalote','Granada','Guaca','Guacamayas','Guacarí','Guachené','Guachetá','Guachucal','Guadalajara De Buga','Guadalupe','Guaduas','Guaitarilla','Gualmatán','Guamal','Guamo','Guapi','Guapotá','Guaranda','Guarne','Guasca','Guatapé','Guataquí','Guatavita','Guateque','Guavatá','Guayabal De Siquima','Guayabetal','Guayatá','Gutiérrez','Guática','Gámeza','Génova','Gómez Plata','Güepsa','Güicán','Hacarí','Hatillo De Loba','Hato','Hato Corozal','Hatonuevo','Heliconia','Herrán','Herveo','Hispania','Hobo','Honda','Ibagué','Icononzo','Iles','Imués','Inzá','Inírida','Ipiales','Iquira','Isnos','Istmina','Itagüí','Ituango','Iza','Jambaló','Jamundí','Jardín','Jenesano','Jericó','Jerusalén','Jesús María','Jordán','Juan De Acosta','Junín','Juradó','La Apartada','La Argentina','La Belleza','La Calera','La Capilla','La Ceja','La Celia','La Chorrera','La Cruz','La Cumbre','La Dorada','La Esperanza','La Estrella','La Florida','La Gloria','La Guadalupe','La Jagua De Ibirico','La Jagua Del Pilar','La Llanada','La Macarena','La Merced','La Mesa','La Montañita','La Palma','La Paz','La Pedrera','La Peña','La Pintada','La Plata','La Playa','La Primavera','La Salina','La Sierra','La Tebaida','La Tola','La Unión','La Uvita','La Vega','La Victoria','La Virginia','Labateca','Labranzagrande','Landázuri','Lebríja','Leguízamo','Leiva','Lejanías','Lenguazaque','Leticia','Liborina','Linares','Lloró','Lorica','Los Andes','Los Córdobas','Los Palmitos','Los Patios','Los Santos','Lourdes','Luruaco','Lérida','Líbano','López','Macanal','Macaravita','Maceo','Macheta','Madrid','Magangué','Magüi','Mahates','Maicao','Majagual','Malambo','Mallama','Manatí','Manaure','Manizales','Manta','Manzanares','Maní','Mapiripana','Mapiripán','Margarita','Marinilla','Maripí','Mariquita','Marmato','Marquetalia','Marsella','Marulanda','María La Baja','Matanza','Medellín','Medina','Medio Atrato','Medio Baudó','Medio San Juan','Melgar','Mercaderes','Mesetas','Milán','Miraflores','Miranda','Mirití - Paraná','Mistrató','Mitú','Mocoa','Mogotes','Molagavita','Momil','Mompós','Mongua','Monguí','Moniquirá','Montebello','Montecristo','Montelíbano','Montenegro','Monterrey','Montería','Morales','Morelia','Morichal','Morroa','Mosquera','Motavita','Moñitos','Murillo','Murindó','Mutatá','Mutiscua','Muzo','Málaga','Nariño','Natagaima','Nechí','Necoclí','Neira','Neiva','Nemocón','Nilo','Nimaima','Nobsa','Nocaima','Norcasia','Norosí','Nueva Granada','Nuevo Colón','Nunchía','Nuquí','Nátaga','Nóvita','Obando','Ocamonte','Ocaña','Oiba','Oicatá','Olaya','Olaya Herrera','Onzaga','Oporapa','Orito','Orocué','Ortega','Ospina','Otanche','Ovejas','Pachavita','Pacho','Pacoa','Padilla','Paicol','Pailitas','Paime','Paipa','Pajarito','Palermo','Palestina','Palmar','Palmar De Varela','Palmas Del Socorro','Palmira','Palmito','Palocabildo','Pamplona','Pamplonita','Pana Pana','Pandi','Panqueba','Papunaua','Paratebueno','Pasca','Pasto','Patía','Pauna','Paya','Paz De Ariporo','Paz De Río','Pedraza','Pelaya','Pensilvania','Peque','Pereira','Pesca','Peñol','Piamonte','Piedecuesta','Piedras','Piendamó','Pijao','Pijiño Del Carmen','Pinchote','Pinillos','Piojó','Pisba','Pital','Pitalito','Pivijay','Planadas','Planeta Rica','Plato','Policarpa','Polonuevo','Ponedera','Popayán','Pore','Potosí','Pradera','Prado','Providencia','Pueblo Bello','Pueblo Nuevo','Pueblo Rico','Pueblorrico','Puebloviejo','Puente Nacional','Puerres','Puerto Alegría','Puerto Arica','Puerto Asís','Puerto Berrío','Puerto Boyacá','Puerto Caicedo','Puerto Carreño','Puerto Colombia','Puerto Concordia','Puerto Escondido','Puerto Gaitán','Puerto Guzmán','Puerto Libertador','Puerto Lleras','Puerto López','Puerto Nare','Puerto Nariño','Puerto Parra','Puerto Rico','Puerto Rondón','Puerto Salgar','Puerto Santander','Puerto Tejada','Puerto Triunfo','Puerto Wilches','Pulí','Pupiales','Puracé','Purificación','Purísima','Pácora','Páez','Páramo','Quebradanegra','Quetame','Quibdó','Quimbaya','Quinchía','Quipile','Quípama','Ragonvalia','Ramiriquí','Recetor','Regidor','Remedios','Remolino','Repelón','Restrepo','Retiro','Ricaurte','Rioblanco','Riofrío','Riohacha','Rionegro','Riosucio','Risaralda','Rivera','Roberto Payán','Roldanillo','Roncesvalles','Rondón','Rosas','Rovira','Ráquira','Río De Oro','Río Iro','Río Quito','Río Viejo','Sabana De Torres','Sabanagrande','Sabanalarga','Sabanas De San Ángel','Sabaneta','Saboyá','Sahagún','Saladoblanco','Salamina','Salazar','Saldaña','Salento','Salgar','Samacá','Samaniego','Samaná','Sampués','San Agustín','San Alberto','San Andrés','San Andrés Sotavento','San Antero','San Antonio','San Antonio Del Tequendama','San Benito','San Benito Abad','San Bernardo','San Bernardo Del Viento','San Calixto','San Carlos','San Carlos De Guaroa','San Cayetano','San Cristóbal','San Diego','San Eduardo','San Estanislao','San Felipe','San Fernando','San Francisco','San Gil','San Jacinto','San Jacinto Del Cauca','San Jerónimo','San Joaquín','San José','San José De La Montaña','San José De Miranda','San José De Pare','San José Del Fragua','San José Del Guaviare','San José Del Palmar','San José de Uré','San Juan De Arama','San Juan De Betulia','San Juan De Río Seco','San Juan De Urabá','San Juan Del Cesar','San Juan Nepomuceno','San Juanito','San Lorenzo','San Luis','San Luis De Gaceno','San Luis De Palenque','San Marcos','San Martín','San Martín De Loba','San Mateo','San Miguel','San Miguel De Sema','San Onofre','San Pablo','San Pablo De Borbur','San Pedro','San Pedro De Cartago','San Pedro De Urabá','San Pelayo','San Rafael','San Roque','San Sebastián','San Sebastián De Buenavista','San Vicente','San Vicente De Chucurí','San Vicente Del Caguán','San Zenón','Sandoná','Santa Ana','Santa Bárbara','Santa Bárbara De Pinto','Santa Catalina','Santa Helena Del Opón','Santa Isabel','Santa Lucía','Santa Marta','Santa María','Santa Rosa','Santa Rosa De Cabal','Santa Rosa De Osos','Santa Rosa De Viterbo','Santa Rosa Del Sur','Santa Rosalía','Santa Sofía','Santacruz','Santafé De Antioquia','Santana','Santander De Quilichao','Santiago','Santiago De Tolú','Santo Domingo','Santo Tomás','Santuario','Sapuyes','Saravena','Sardinata','Sasaima','Sativanorte','Sativasur','Segovia','Sesquilé','Sevilla','Siachoque','Sibaté','Sibundoy','Silos','Silvania','Silvia','Simacota','Simijaca','Simití','Sincelejo','Sincé','Sipí','Sitionuevo','Soacha','Soatá','Socha','Socorro','Socotá','Sogamoso','Solano','Soledad','Solita','Somondoco','Sonsón','Sopetrán','Soplaviento','Sopó','Sora','Soracá','Sotaquirá','Sotará','Suaita','Suan','Suaza','Subachoque','Sucre','Suesca','Supatá','Supía','Suratá','Susa','Susacón','Sutamarchán','Sutatausa','Sutatenza','Suárez','Sácama','Sáchica','Tabio','Tadó','Talaigua Nuevo','Tamalameque','Tame','Taminango','Tangua','Taraira','Tarapacá','Tarazá','Tarqui','Tarso','Tasco','Tauramena','Tausa','Tello','Tena','Tenerife','Tenjo','Tenza','Teorama','Teruel','Tesalia','Tibacuy','Tibaná','Tibasosa','Tibirita','Tibú','Tierralta','Timaná','Timbiquí','Timbío','Tinjacá','Tipacoque','Tiquisio','Titiribí','Toca','Tocaima','Tocancipá','Togüí','Toledo','Tolú Viejo','Tona','Topaipí','Toribio','Toro','Tota','Totoró','Trinidad','Trujillo','Tubará','Tuchín','Tuluá','Tumaco','Tunja','Tununguá','Turbaco','Turbaná','Turbo','Turmequé','Tuta','Tutazá','Támara','Támesis','Tópaga','Túquerres','Ubalá','Ubaque','Ulloa','Umbita','Une','Unguía','Unión Panamericana','Uramita','Uribe','Uribia','Urrao','Urumita','Usiacurí','Valdivia','Valencia','Valle De San José','Valle De San Juan','Valle Del Guamuez','Valledupar','Valparaíso','Vegachí','Venadillo','Venecia','Ventaquemada','Vergara','Versalles','Vetas','Vianí','Victoria','Vigía Del Fuerte','Vijes','Villa Caro','Villa De Leyva','Villa De San Diego De Ubaté','Villa Del Rosario','Villa Rica','Villagarzón','Villagómez','Villahermosa','Villamaría','Villanueva','Villapinzón','Villarrica','Villavicencio','Villavieja','Villeta','Viotá','Viracachá','Vistahermosa','Viterbo','Vélez','Yacopí','Yacuanquer','Yaguará','Yalí','Yarumal','Yavaraté','Yolombó','Yondó','Yopal','Yotoco','Yumbo','Zambrano','Zapatoca','Zapayán','Zaragoza','Zarzal','Zetaquira','Zipacón','Zipaquirá','Zona Bananera','Útica'];

  function logroCldCiudadKey(s){
    let k = String(s||'')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^A-Z\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    k = k.replace(/\bD\s?C\b$/,'').trim(); // "Bogotá, D.C." ~ "BOGOTA"
    return k;
  }
  const LOGRO_CLD_CIUDADES_MAP = (function(){
    const m = new Map();
    LOGRO_CLD_CIUDADES.forEach(nombre=>{
      const k = logroCldCiudadKey(nombre);
      if(k && !m.has(k)) m.set(k, nombre);
    });
    return m;
  })();
  const LOGRO_CLD_CIUDADES_COMPACT = (function(){
    const m = new Map();
    LOGRO_CLD_CIUDADES_MAP.forEach((nombre,k)=>{
      const kc = k.replace(/\s+/g,'');
      if(kc && !m.has(kc)) m.set(kc, nombre);
    });
    return m;
  })();
  function logroCldNormCiudad(raw){
    const original = String(raw||'').trim();
    if(!original || original.toLowerCase()==='nan' || original==='-') return 'Bogotá, D.C.';
    const candidatos = [original];
    if(original.includes('(')) candidatos.push(original.split('(')[0].trim());
    if(original.includes(' - ')) candidatos.push(original.split(' - ')[0].trim());
    const sinArticulo = original.replace(/^(EL|LA|LOS|LAS)\s+/i,'').trim();
    if(sinArticulo && sinArticulo!==original) candidatos.push(sinArticulo);
    for(const cand of candidatos){
      const k = logroCldCiudadKey(cand);
      if(k && LOGRO_CLD_CIUDADES_MAP.has(k)) return LOGRO_CLD_CIUDADES_MAP.get(k);
    }
    for(const cand of candidatos){
      const kc = logroCldCiudadKey(cand).replace(/\s+/g,'');
      if(kc && LOGRO_CLD_CIUDADES_COMPACT.has(kc)) return LOGRO_CLD_CIUDADES_COMPACT.get(kc);
    }
    return original;
  }

  // ── Dirección / Teléfono — misma lógica que el resto de módulos ──
  const LOGRO_CLD_ADDR_REP=[[/\bcarrera\b/gi,'CR'],[/\bcra\.?\s*/gi,'CR '],[/\bcalle\b/gi,'CL'],[/\bcll\.?\s*/gi,'CL '],[/\bcl\.?\s*/gi,'CL '],[/\btransversal\b/gi,'TV'],[/\bdiagonal\b/gi,'DG'],[/\bavenida\b/gi,'AV'],[/\bav\.?\s*/gi,'AV '],[/\bnumero\b/gi,''],[/\bnum\.?\s*/gi,''],[/\bno\.?\s*/gi,' '],[/#/g,' '],[/-/g,' '],[/\./g,' '],[/,/g,' '],[/\s{2,}/g,' ']];
  function logroCldNormAddr(raw){
    const s=String(raw||'').trim();
    if(!s||s.toLowerCase()==='nan'||/^no aplica$/i.test(s)||s==='0'||s.length<3)return 'DIRECCION NO INFORMADA';
    let r=s;
    LOGRO_CLD_ADDR_REP.forEach(([p,rep])=>r=r.replace(p,rep));
    r=r.trim().replace(/\s{2,}/g,' ').toUpperCase();
    return r.replace(/\s/g,'')?r:'DIRECCION NO INFORMADA';
  }
  function logroCldNormTel(raw){
    const s=String(raw??'').trim();
    if(!s||s==='nan'||s==='-'||s==='--'||s==='---')return '3000000000';
    const d=s.replace(/^-+|-+$/g,'').replace(/[^0-9\-\s\+\(\)]/g,'').trim();
    if(!d)return '3000000000';
    const digits=d.replace(/\D/g,'');
    if(!digits||/^0+$/.test(digits))return '3000000000';
    return digits;
  }

  // ── Plantilla World Office Cloud (copia autocontenida de la usada
  //    por terceros_siigo_nube_to_wo_cloud.js) ───────────────────────
  const LOGRO_CLD_COLS=['Tipo Identificacion *','Identificacion *','Ciudad Identificacion*','Primer Nombre o Razon Social*','Segundo Nombre','Primer Apellido *','Segundo Apellido','Tipo Tercero *','Codigo','Activo','Actividad Economica','Tipo Contribuyente *','Clasi. Administrador Impuesto *','Excepcion Impuesto','Tarifa Reteica Compras','Aplica Reteica Ventas','Maneja Cupo Credito','Vendedor','Lista Precios','Forma Pago','Plazo Dias','Porcentaje Descuento','Tipo Direccion *','Nombre Direccion *','Direccion *','Telefonos *','Email *','Ciudad Direccion *','Zona','Barrio'];
  const LOGRO_CLD_COLS_DISPLAY=['Tipo Identificación *','Identificación *','Ciudad Identificación*','Primer Nombre ó Razon Social*','Segundo Nombre','Primer Apellido *','Segundo Apellido','Tipo Tercero *','Código','Activo','Actividad Económica','Tipo Contribuyente *','Clasi. Administrador Impuesto *','Excepción Impuesto','Tarifa Reteica Compras','Aplica Reteica Ventas','Maneja Cupo Crédito','Vendedor','Lista Precios','Forma Pago','Plazo Días','Porcentaje Descuento','Tipo Dirección *','Nombre Dirección *','Dirección *','Teléfonos *','Email *','Ciudad Dirección *','Zona','Barrio'];
  const LOGRO_CLD_TIPOS_ID=['Cédula de ciudadanía','Cédula de Extranjería','Documento de Identificación Extranjero','NIT','Pasaporte','Permiso Especial de Permanencia','Registro Civil','Sin ID del exterior o para uso definido por DIAN','Tarjeta de Extranjería','Tarjeta de Identidad'];
  const LOGRO_CLD_TIPOS_CONTRIB=['Persona Natural Responsable del IVA','Persona Natural No Responsable del IVA','Persona Jurídica','Grande Contribuyente No Autorretenedor','Grande Contribuyente Autorretenedor','Persona Jurídica Autorretenedor','Persona Natural Autorretenedor','Tercero del Exterior','Proveedor Sociedades de Comercio Internacional','Régimen Simple de Tributación Persona Jurídica','Régimen Simple de Tributación Persona Natural','Entidades Sin Animo De Lucro','Persona Natural Regimen Común Agente Retenedor','Persona Natural o Jurídica Ley 1429','Instituciones del Estado Publicos y Otros'];
  const LOGRO_CLD_CLASI_ADMIN=['Exportador','Importador','Importador Zona Franca','Normal','Sociedad de Comercialización Internacional','Tercero en Zona Franca','Zonas Exentas','Zonas y Terceros Excluidos'];
  const LOGRO_CLD_TIPOS_DIR=['Bodega','Casa','Empresa/Oficina','Sucursal'];
  const LOGRO_CLD_MANEJA_CUPO=['Si','No'];
  const LOGRO_CLD_EXCEPCION=['Contribuyente Exento','Zona Afectada Terremoto','Zona Franca'];
  // Lista de referencia (débil, solo para el desplegable de la hoja
  // LISTAS) — mismo catálogo de 580 ciudades usado por Siigo Nube /
  // SIIMED ERP hacia Cloud; NO es el catálogo usado para normalizar
  // (eso lo hace LOGRO_CLD_CIUDADES, más arriba, con 1035 municipios).
  const LOGRO_CLD_CIUDADES_LISTA=["Abejorral","Abrego","Abriaquí","Acacías","Acandí","Acevedo","Achí","Agrado","Agua De Dios","Aguachica","Aguada","Aguadas","Aguazul","Agustín Codazzi","Aipe","Albán","Albania","Alcalá","Aldana","Alejandría","Algarrobo","Algeciras","Almaguer","Almeida","Alpujarra","Altamira","Alto Baudó","Altos Del Rosario","Alvarado","Amagá","Amalfi","Ambalema","Anapoima","Ancuyá","Andalucía","Andes","Angelópolis","Angostura","Anolaima","Anorí","Anserma","Ansermanuevo","Anzá","Anzoátegui","Apartadó","Apía","Apulo","Aquitania","Aracataca","Aranzazu","Aratoca","Arauca","Arauquita","Arbeáez","Arboleda","Arboledas","Arboletes","Arcabuco","Arenal","Argelia","Ariguaní","Arjona","Armenia","Armero","Arroyohondo","Astrea","Ataco","Atrato","Ayapel","Bagadó","Bahía Solano","Bajo Baudó","Balboa","Baranoa","Baraya","Barbacoas","Barbosa","Barichara","Barranca De Upía","Barrancabermeja","Barrancas","Barranco De Loba","Barranco Minas","Barranquilla","Becerril","Belalcázar","Belén","Belén De Bajirá","Belén De Los Andaquies","Belén De Umbría","Bello","Belmira","Beltrán","Berbeo","Betania","Betéitiva","Betulia","Bituima","Boavita","Bochalema","Bogotá, D.C.","Bojacá","Boyayá","Bolívar","Bosconia","Boyacá","Briceño","Bucaramanga","Bucarasica","Buenaventura","Buenavista","Buenos Aires","Buesaco","Bugalagrande","Buriticá","Busbánzá","Cabrera","Cabuyaro","Cacahual","Cáceres","Cachipay","Cachirá","Cácota","Caicedo","Caicedonia","Caimito","Cajamarca","Cajibió","Cajicá","Calamar","Calarcá","Caldas","Caldono","Cali","California","Calima","Caloto","Campamento","Campo De La Cruz","Campoalegre","Campohermoso","Canalete","Candelaria","Cantagallo","Cañasgordas","Caparrapí","Capitanejo","Cáqueza","Caracolí","Caramanta","Carcaseí","Carepa","Carmen De Apicalá","Carmen De Carupa","Carmen Del Darién","Carolina","Cartagena de Indias","Cartagena Del Chairá","Cartago","Caruú","Casabianca","Castilla La Nueva","Caucasia","Cepítá","Cereté","Cerinza","Cerrito","Cerro San Antonio","Cértegui","Chachagüí","Chaguáni","Chalán","Chameza","Chaparral","Charalá","Charta","Chía","Chibolo","Chigorodó","Chima","Chimá","Chimichagua","Chinácota","Chinavita","Chinchiá","Chinú","Chipaque","Chipatá","Chiquinquirá","Chíquiza","Chiriguaná","Chiscas","Chita","Chitagá","Chitaraque","Chivatá","Chivor","Choachí","Chocontá","Cicuco","Ciénaga","Ciénaga De Oro","Ciénega","Cimitarra","Circasia","Cisneros","Ciudad Bolívar","Clemencia","Cocorná","Coello","Cogua","Colombia","Colón","Coloso","Cómbita","Concepción","Concordia","Condoto","Confines","Consaca","Contadero","Contratación","Convención","Copacabana","Coper","Córdoba","Corinto","Coromoro","Corozal","Corrales","Cota","Cotorra","Covarachía","Coveñas","Coyaima","Cravo Norte","Cuaspud","Cubará","Cubarral","Cucaita","Cucunubá","Cúcuta","Cucutilla","Cuítiva","Cumaral","Cumaribo","Cumbal","Cumbitara","Cunday","Curillo","Curítí","Curumaní","Dabeiba","Dagua","Dibulla","Distracción","Dolores","Don Matías","Dosquebradas","Duitama","Durania","Ebéjico","El Águila","El Bagre","El Banco","El Cairo","El Calvario","El Cantón Del San Pablo","El Carmen","El Carmen De Atrato","El Carmen De Bolívar","El Carmen De Chucurí","El Carmen De Viboral","El Castillo","El Cerrito","El Charco","El Cocuy","El Colegio","El Copey","El Doncello","El Dorado","El Dovio","El Encanto","El Espino","El Guacamayo","El Guamo","El Litoral Del San Juan","El Molino","El Paso","El Paujil","El Peñol","El Peñón","El Piñon","El Playón","El Retén","El Retorno","El Roble","El Rosal","El Rosario","El Santuario","El Tablón De Gómez","El Tambo","El Tarra","El Zulia","Elías","Encino","Enciso","Entrerríos","Envigado","Espinal","Facatativá","Falan","Filadelfia","Filandia","Firavitoba","Flandes","Florencia","Floresta","Florián","Florida","Floridablanca","Fomeque","Fonseca","Fortul","Fosca","Francisco Pizarro","Fredonia","Fresno","Frontino","Fuente De Oro","Fundación","Funes","Funza","Fúquene","Fusagasugá","Gachalá","Gachancipá","Gachantivá","Gachetá","Galán","Galapa","Galeras","Gama","Gamarra","Gambita","Gámeza","Garagoa","Garzón","Génova","Gigante","Ginebra","Giraldo","Girardot","Girardota","Girón","Gómez Plata","González","Gramalote","Granada","Guaca","Guacamayas","Guacarí","Guachené","Guachetá","Guachucal","Guadalajara De Buga","Guadalupe","Guaduas","Guaitarilla","Gualmatan","Guamal","Guamo","Guapi","Guapotá","Guaranda","Guarne","Guasca","Guatapé","Guataquí","Guatavita","Guateque","Guática","Guavatá","Guayabal De Siquima","Guayabetal","Guayatá","Güepsa","Güicán","Gutiérrez","Hacarí","Hatillo De Loba","Hato","Hato Corozal","Hatonuevo","Heliconia","Herrán","Herveo","Hispania","Hobo","Honda","Ibagué","Icononzo","Iles","Imués","Inírida","Inzá","Ipiales","Iquira","Isnos","Istmina","Itagüí","Ituango","Iza","Jambaló","Jamundí","Jardín","Jenesano","Jericó","Jerusalén","Jesús María","Jordán","Juan De Acosta","Junín","Juradó","La Apartada","La Argentina","La Belleza","La Calera","La Capilla","La Ceja","La Celia","La Chorrera","La Cruz","La Cumbre","La Dorada","La Esperanza","La Estrella","La Florida","La Gloria","La Guadalupe","La Jagua De Ibirico","La Jagua Del Pilar","La Llanada","La Macarena","La Merced","La Mesa","La Montañita","La Palma","La Paz","La Pedrera","La Peña","La Pintada","La Plata","La Playa","La Primavera","La Salina","La Sierra","La Tebaida","La Tola","La Unión","La Uvita","La Vega","La Victoria","La Virginia","Labateca","Labranzagrande","Landázuri","Lebríja","Leguízamo","Leiva","Lejanías","Lenguazaque","Lérida","Leticia","Líbano","Liborina","Linares","Lloró","López","Lorica","Los Andes","Los Córdobas","Los Palmitos","Los Patios","Los Santos","Lourdes","Luruaco","Macanal","Macaravita","Maceo","Macheta","Madrid","Mangané","Magüi","Mahates","Maicao","Majagual","Málaga","Malambo","Mallama","Manatí","Manaure","Maní","Manizales","Manta","Manzanares","Mapiripán","Mapiripana","Margarita","María La Baja","Marinilla","Maripí","Mariquita","Marmato","Marquetalia","Marsella","Marulanda","Matanza","Medellín","Medina","Medio Atrato","Medio Baudó","Medio San Juan","Melgar","Mercaderes","Mesetas","Milán","Miraflores","Miranda","Miratí - Paraná","Mistrató","Mitú","Mocoa","Mogotes","Molagavita","Momil","Mompós","Mongua","Mongüí","Moniquirá","Montebello","Montecristo","Montelíbano","Montenegro","Montería","Monterrey","Moñitos","Morales","Morelia","Morichal","Morroa","Mosquera","Motavita","Murillo","Murindó","Mutatá","Mutiscua","Muzo","Nariño","Nátaga","Natagaima","Nechí","Necloclí","Neira","Neiva","Nemocón","Nilo","Nimaima","Nobsa","Nocaima","Norcasia","Norosí","Nóvita","Nueva Granada","Nuevo Colón","Nunchía","Nquí","Obando","Ocamonte","Ocaña","Oiba","Oicatá","Olaya","Olaya Herrera","Onzaga","Oporapa","Orito","Orocúntre","Ortega","Ospina","Otanche","Ovejas","Pachavita","Pacho","Pacoa","Pácora","Padilla","Páez","Paicol","Pailitas","Paime","Paipa","Pajarito","Palermo","Palestina","Palmar","Palmar De Varela","Palmas Del Socorro","Palmira","Palmito","Palocabildo","Pamplona","Pamplonita","Pana Pana","Pandi","Panqueba","Papunaua","Páramo","Paratebueno","Pasca","Pasto","Patiá","Pauna","Paya","Paz De Ariporo","Paz De Río","Pedraza","Pelaya","Pensilvania","Peñol","Peque","Pereira","Pesca","Piamonte","Piedecuesta","Piedras","Piendamo","Pijao","Pijiño Del Carmen","Pinchote","Pinillos","Piojó","Pisba","Pital","Pitalito","Pivijay","Planadas","Planeta Rica","Plato","Policarpa","Polonuevo","Ponedera","Popayán","Pore","Potosí","Pradera","Prado","Providencia","Pueblo Bello","Pueblo Nuevo","Pueblo Rico","Pueblorrico","Puebloviejo","Puente Nacional","Puerres","Puerto Alegría","Puerto Arica","Puerto Asís","Puerto Berrío","Puerto Boyacá","Puerto Caicedo","Puerto Carreño","Puerto Colombia","Puerto Concordia","Puerto Escondido","Puerto Gaitán","Puerto Guzmán","Puerto Libertador","Puerto Lleras","Puerto López","Puerto Nare","Puerto Nariño","Puerto Parra","Puerto Rico","Puerto Rondón","Puerto Salgar","Puerto Santander","Puerto Tejada","Puerto Triunfo","Puerto Wilches","Pulí","Pupiales","Puracé","Purificación","Purísima","Quebradanegra","Quetame","Quibdó","Quimbaya","Quinchía","Quípama","Quipile","Ragonvalia","Ramiriquí","Ráquira","Recetor","Regidor","Remedios","Remolino","Repelón","Restrepo","Retiro","Ricaurte","Río De Oro","Río Iro","Río Quito","Río Viejo","Rioblanco","Riofrío","Riohacha","Rionegro","Riosucio","Risaralda","Rivera","Roberto Payán","Roldanillo","Roncesvalles","Rondón","Rosas","Rovira","Sabana De Torres","Sabanagrande","Sabanalarga","Sabanas De San Ángel","Sabaneta","Saboyá","Sácama","Sáchica","Sahagún","Saladoblanco","Salamina","Salazar","Saldaña","Salento","Salgar","Samacá","Samaná","Samaniego","Sampués","San Agustín","San Alberto","San Andrés","San Andrés Sotavento","San Antero","San Antonio","San Antonio Del Tequendama","San Benito","San Benito Abad","San Bernardo","San Bernardo Del Viento","San Calixto","San Carlos","San Carlos De Guaroa","San Cayetano","San Cristóbal","San Diego","San Eduardo","San Estanislao","San Felipe","San Fernando","San Francisco","San Gil","San Jacinto","San Jacinto Del Cauca","San Jerónimo","San Joaquín","San José","San José De La Montaña","San José De Miranda","San José De Pare","San José de Uré","San José Del Fragua","San José Del Guaviare","San José Del Palmar","San Juan De Arama","San Juan De Betulia","San Juan De Río Seco","San Juan De Urabá","San Juan Del Cesar","San Juan Nepomuceno","San Juanito","San Lorenzo","San Luis","San Luis De Gaceno","San Luis De Palenque","San Marcos","San Martín","San Martín De Loba","San Mateo","San Miguel","San Miguel De Sema","San Onofre","San Pablo","San Pablo De Borbur","San Pedro","San Pedro De Cartago","San Pedro De Urabá","San Pelayo","San Rafael","San Roque","San Sebastián","San Sebastián De Buenavista","San Vicente","San Vicente De Chucurí","San Vicente Del Caguán","San Zenón","Sandoná","Santa Ana","Santa Bárbara","Santa Bárbara De Pinto","Santa Catalina","Santa Helena Del Opón","Santa Isabel","Santa Lucía","Santa María","Santa Marta","Santa Rosa","Santa Rosa De Cabal","Santa Rosa De Osos","Santa Rosa De Viterbo","Santa Rosa Del Sur","Santa Rosalía","Santa Sofía","Santacruz","Santafé De Antioquia","Santana","Santander De Quilichao","Santiago","Santiago De Tolú","Santo Domingo","Santo Tomás","Santuario","Sapuyes","Saravena","Sardinata","Sasaima","Sativanorte","Sativasur","Segovia","Sesquilé","Sevilla","Siachoque","Sibaté","Sibundoy","Silos","Silvania","Silvia","Simacota","Simijaca","Simití","Sincé","Sincelejo","Sipí","Sitionuevo","Soacha","Soatá","Socha","Socorro","Socotá","Sogamoso","Solano","Soledad","Solita","Somondoco","Sonsón","Sopetrán","Soplaviento","Sopó","Sora","Soracá","Sotaquirá","Sotará","Suaita","Suan","Suárez","Suaza","Subachoque","Sucre","Suesca","Supatá","Supía","Suratá","Susa","Suscón","Sutamarchán","Sutatausa","Sutatenza","Tabio","Tadó","Talaigua Nuevo","Tamalameque","Támara","Tame","Támesis","Taminango","Tangua","Taraira","Tarapacá","Tarazá","Tarqui","Tarso","Tasco","Tauramena","Tausa","Tello","Tena","Tenerife","Tenjo","Tenza","Teorama","Teruel","Tesalia","Tibacuy","Tibaná","Tibasosa","Tibirita","Tibú","Tierralta","Timaná","Timbio","Timbiqui","Tinjacá","Tipacoque","Tiquisio","Titiribí","Toca","Tocaima","Tocancipá","Togüí","Toledo","Tolú Viejo","Tona","Tópaga","Topaipí","Toribio","Toro","Tota","Totoró","Trinidad","Trujillo","Tubará","Tuchín","Tuluá","Tumaco","Tunja","Tununguá","Túquerres","Turbaco","Turbaná","Turbo","Turmequé","Tuta","Tutazá","Ubalá","Ubaque","Ulloa","Umbita","Une","Unguía","Unión Panamericana","Uramita","Uribe","Uribia","Urrao","Urumita","Usiacurí","Útica","Valdivia","Valencia","Valle De San José","Valle De San Juan","Valle Del Guamuez","Valledupar","Valparaíso","Vegachí","Vélez","Venadillo","Venecia","Ventaquemada","Vergara","Versalles","Vetas","Vianí","Victoria","Vigía Del Fuerte","Vijes","Villa Caro","Villa De Leyva","Villa De San Diego De Ubaté","Villa Del Rosario","Villa Rica","Villagarzón","Villagómez","Villahermosa","Villamaría","Villanueva","Villapínzón","Villarrica","Villavicencio","Villavieja","Villeta","Viotá","Viracachá","Vistahermosa","Viterbo","Yacopí","Yacuanquer","Yaguára","Yalí","Yarumal","Yavaraté","Yolombó","Yondó","Yopal","Yotoco","Yumbo","Zambrano","Zapatoca","Zapayán","Zaragoza","Zarzal","Zetaquira","Zipacón","Zipaquirá","Zona Bananera"];
  const LOGRO_CLD_ACTIVIDADES=["0010",1011,1012,1020,1030,1040,1051,1052,1061,1062,1063,1071,1072,1081,1082,1083,1084,1089,1090,1101,1102,1103,1104,"0111","0112","0113","0114","0115","0119",1200,"0121","0122","0123","0124","0125","0126","0127","0128","0129","0130",1311,1312,1313,1391,1392,1393,1394,1399,"0141",1410,"0142",1420,"0143",1430,"0144","0145","0149","0150",1511,1512,1513,1521,1522,1523,"0161",1610,"0162",1620,"0163",1630,"0164",1640,1690,"0170",1701,1702,1709,1811,1812,1820,1910,1921,1922,2011,2012,2013,2014,2021,2022,2023,2029,2030,"0210",2100,"0220",2211,2212,2219,2221,2229,"0230",2310,2391,2392,2393,2394,2395,2396,2399,"0240",2410,2421,2429,2431,2432,2511,2512,2513,2520,2591,2592,2593,2599,2610,2620,2630,2640,2651,2652,2660,2670,2680,2711,2712,2720,2731,2732,2740,2750,2790,2811,2812,2813,2814,2815,2816,2817,2818,2819,2821,2822,2823,2824,2825,2826,2829,2910,2920,2930,3011,3012,3020,3030,3040,3091,3092,3099,"0311",3110,"0312",3120,"0321",3210,"0322",3220,3230,3240,3250,3290,3311,3312,3313,3314,3315,3319,3320,3511,3512,3513,3514,3520,3530,3600,3700,3811,3812,3821,3822,3830,3900,4111,4112,4210,4220,4290,4311,4312,4321,4322,4329,4330,4390,4511,4512,4520,4530,4541,4542,4610,4620,4631,4632,4641,4642,4643,4644,4645,4649,4651,4652,4653,4659,4661,4662,4663,4664,4665,4669,4690,4711,4719,4721,4722,4723,4724,4729,4731,4732,4741,4742,4751,4752,4753,4754,4755,4759,4761,4762,4769,4771,4772,4773,4774,4775,4781,4782,4789,4791,4792,4799,4911,4912,4921,4922,4923,4930,5011,5012,5021,5022,"0510",5111,5112,5121,5122,"0520",5210,5221,5222,5223,5224,5229,5310,5320,5511,5512,5513,5514,5519,5520,5530,5590,5611,5612,5613,5619,5621,5629,5630,5811,5812,5813,5819,5820,5911,5912,5913,5914,5920,6010,6020,"0610",6110,6120,6130,6190,"0620",6201,6202,6209,6311,6312,6391,6399,6411,6412,6421,6422,6423,6424,6431,6432,6491,6492,6493,6494,6495,6499,6511,6512,6513,6514,6521,6522,6531,6532,6611,6612,6613,6614,6615,6619,6621,6629,6630,6810,6820,6910,6920,7010,7020,"0710",7110,7111,7112,7120,"0721",7210,"0722",7220,"0723","0729",7310,7320,7410,7420,7490,7500,7710,7721,7722,7729,7730,7740,7810,7820,7830,7911,7912,7990,8010,8020,8030,"0081","0811",8110,"0812",8121,8129,8130,"0082","0820",8211,8219,8220,8230,8291,8292,8299,8411,8412,8413,8414,8415,8421,8422,8423,8424,8430,8511,8512,8513,8521,8522,8523,8530,8541,8542,8543,8544,8551,8552,8553,8559,8560,8610,8621,8622,8691,8692,8699,8710,8720,8730,8790,8810,8890,"0891","0892","0899","0090",9001,9002,9003,9004,9005,9006,9007,9008,"0910",9101,9102,9103,9200,9311,9312,9319,9321,9329,9411,9412,9420,9491,9492,9499,9511,9512,9521,9522,9523,9524,9529,9601,9602,9603,9609,9700,9810,9820,"0990",9900];

  function logroCldBuildWB(rows, logEntries, stats, excluded, defaultsLog, nitExcluidos){
    const wb=XLSX.utils.book_new();
    const aoa=[];
    const sec=new Array(30).fill(null); sec[0]='Ficha Principal'; sec[22]='Ficha Dirección';
    aoa.push(sec);
    aoa.push([...LOGRO_CLD_COLS_DISPLAY]);
    rows.forEach(r=>{
      const rowData=LOGRO_CLD_COLS.map(c=>{const v=r[c]; return (v==='')?null:v??null;});
      aoa.push(rowData);
    });
    const ws1=XLSX.utils.aoa_to_sheet(aoa);
    ws1['!cols']=[{wch:24},{wch:18},{wch:18},{wch:28},{wch:14},{wch:18},{wch:16},{wch:18},{wch:8},{wch:6},{wch:18},{wch:40},{wch:36},{wch:20},{wch:20},{wch:20},{wch:18},{wch:16},{wch:14},{wch:12},{wch:11},{wch:20},{wch:18},{wch:18},{wch:30},{wch:16},{wch:30},{wch:18},{wch:8},{wch:8}];
    ws1['!merges']=[{s:{r:0,c:0},e:{r:0,c:21}},{s:{r:0,c:22},e:{r:0,c:29}}];
    XLSX.utils.book_append_sheet(wb,ws1,'Importación Terceros');

    const maxL=Math.max(LOGRO_CLD_TIPOS_ID.length,LOGRO_CLD_TIPOS_CONTRIB.length,LOGRO_CLD_CLASI_ADMIN.length,LOGRO_CLD_CIUDADES_LISTA.length,LOGRO_CLD_TIPOS_DIR.length,LOGRO_CLD_ACTIVIDADES.length);
    const lAoa=[['Tipo de Identificación*','Tipo Contribuyente *','Clasi. Administrador Impuesto *','Ciudad*','Tipo Dirección *','Actividad Económica','Maneja cupo credito','Excepción Impuesto']];
    for(let i=0;i<maxL;i++){lAoa.push([LOGRO_CLD_TIPOS_ID[i]??null,LOGRO_CLD_TIPOS_CONTRIB[i]??null,LOGRO_CLD_CLASI_ADMIN[i]??null,LOGRO_CLD_CIUDADES_LISTA[i]??null,LOGRO_CLD_TIPOS_DIR[i]??null,LOGRO_CLD_ACTIVIDADES[i]??null,LOGRO_CLD_MANEJA_CUPO[i]??null,LOGRO_CLD_EXCEPCION[i]??null]);}
    const ws2=XLSX.utils.aoa_to_sheet(lAoa);
    ws2['!cols']=[{wch:34},{wch:46},{wch:38},{wch:26},{wch:18},{wch:18},{wch:18},{wch:28}];
    XLSX.utils.book_append_sheet(wb,ws2,'LISTAS');

    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Identificación','Sucursal']]),'sucursales Clientes');

    const tsNow=new Date().toISOString();
    const logsAoa=[['timestamp','fase','nivel','mensaje','tipo','detalle']];
    (logEntries||[]).forEach(e=>logsAoa.push([e.ts||tsNow,e.fase||'',e.lvl==='e'?'ERROR':e.lvl==='w'?'WARN':'INFO',e.msg||'','','']));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(logsAoa),'Logs');

    const s2=stats||{};
    const estAoa=[['Métrica','Valor'],
      ['archivos_entrada',s2.archivos_entrada||1],
      ['registros_entrada',s2.registros_entrada||0],
      ['registros_salida',rows.length],
      ['errores_validacion',s2.errores||0],
      ['warnings_validacion',s2.warnings||0]];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(estAoa),'Estadísticas');

    const exclAoa=[['Identificación','Nombre o Razón Social','Propiedad Activa']];
    (excluded||[]).forEach(e=>exclAoa.push([e.id,e.nombre,e.tipo]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(exclAoa),'IdentificacionesExcluidas');

    if(defaultsLog && defaultsLog.length>0){
      const defAoa=[['Identificación','Nombre o Razón Social','Campo','Valor Aplicado','Motivo']];
      defaultsLog.forEach(d=>defAoa.push([d.id, d.nombre, d.campo, d.valor_aplicado, d.motivo]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(defAoa), 'Campos por Defecto');
    }

    if(nitExcluidos && nitExcluidos.length>0){
      const nitAoa=[['Identificación','Nombre o Razón Social','Motivo']];
      nitExcluidos.forEach(d=>nitAoa.push([d.id, d.nombre, 'NIT excluido — lista predefinida']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nitAoa), 'NITs Excluidos');
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
  function logroCldExtraerFila(hdrs, r){
    const g = name => { const i=logroCldCol(hdrs,name); return i>=0 ? r[i] : ''; };
    return {
      id: logroCldNormId(g('Identificación')),
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
  function logroCldMezclarCampos(base, extra){
    if(!base) return Object.assign({}, extra);
    const out = Object.assign({}, base);
    Object.keys(extra).forEach(k=>{
      if(!out[k] && extra[k]) out[k]=extra[k];
    });
    return out;
  }

  // Estado pendiente entre la fase 1 (elegir archivos + modal de
  // correo) y la fase 2 (transformación real).
  let _logroCldPending = null;

  // ══════════════════════════════════════════════════════════════
  // FASE 1: lee los archivos disponibles (Clientes y/o Proveedores) y
  // muestra el modal de configuración de correo por defecto — mismo
  // patrón ya usado en SIIMED ERP y en Logro → Escritorio.
  // ══════════════════════════════════════════════════════════════
  async function startLogroCldETL(){
    const cFile = LOGRO_CLD_S.clientesFile || (window.__LOGRO_S && window.__LOGRO_S.clientesFile);
    const pFile = LOGRO_CLD_S.proveedoresFile || (window.__LOGRO_S && window.__LOGRO_S.proveedoresFile);
    if(!cFile && !pFile){ alert('Carga al menos un archivo: Clientes o Proveedores de Logro.'); return; }
    try{
      const clientes = cFile ? await logroReadFile(cFile) : null;
      const proveedores = pFile ? await logroReadFile(pFile) : null;
      _logroCldPending = { clientes, proveedores, t0: Date.now() };
      logroCldShowConfigModal();
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  function logroCldShowConfigModal(){
    let modal = document.getElementById('logro-cld-config-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'logro-cld-config-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.logroCldCloseConfigModal()"></div>
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
            <input type="radio" name="logro-cld-email-mode" id="logro-cld-email-mode-blank" value="blank" checked>
            Dejar el correo en blanco
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
            <input type="radio" name="logro-cld-email-mode" id="logro-cld-email-mode-default" value="default">
            Aplicar un correo predeterminado:
          </label>
          <input type="email" id="logro-cld-email-default" placeholder="correo@ejemplo.com"
            style="width:100%;margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
            border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:5px">
            Solo se aplica a los terceros que no traigan correo propio en el archivo.
          </div>
          <div style="display:flex;gap:12px;margin-top:24px">
            <button onclick="window.logroCldCloseConfigModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.logroCldConfirmConfigModal()" style="flex:2;padding:12px;
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

  function logroCldCloseConfigModal(){
    const modal=document.getElementById('logro-cld-config-modal');
    if(modal) modal.style.display='none';
  }
  window.logroCldCloseConfigModal = logroCldCloseConfigModal;

  async function logroCldConfirmConfigModal(){
    if(!_logroCldPending) return;
    const emailModeEl = document.getElementById('logro-cld-email-mode-default');
    const emailMode = (emailModeEl && emailModeEl.checked) ? 'default' : 'blank';
    const emailDefEl = document.getElementById('logro-cld-email-default');
    const emailDefault = emailDefEl ? String(emailDefEl.value||'').trim() : '';
    logroCldCloseConfigModal();
    await _runLogroCldETL(emailMode, emailDefault);
  }
  window.logroCldConfirmConfigModal = logroCldConfirmConfigModal;

  // ══════════════════════════════════════════════════════════════
  // FASE 2: PIPELINE real — Logro → World Office Cloud
  // ══════════════════════════════════════════════════════════════
  async function _runLogroCldETL(emailMode, emailDefault){
    if(!_logroCldPending){ alert('Carga al menos un archivo: Clientes o Proveedores de Logro.'); return; }
    const { clientes, proveedores } = _logroCldPending;
    setStep(3);
    LOGRO_CLD_LOG.length=0;
    const panel=document.getElementById('logp'); if(panel) panel.innerHTML='';
    setPStep(0); setPct(0,'Iniciando...');
    const t0=Date.now();
    try{
      logroCldLog('📂 Leyendo archivos de Logro...','i','Lectura');
      setPStep(1); setPct(10,'Leyendo archivos...');
      await logroCldSleep(30);

      const totalEntrada = (clientes?clientes.rows.length:0) + (proveedores?proveedores.rows.length:0);
      if(clientes) logroCldLog('   Clientes: '+clientes.rows.length+' filas','i','Lectura');
      if(proveedores) logroCldLog('   Proveedores: '+proveedores.rows.length+' filas','i','Lectura');

      setPStep(2); setPct(30,'Consolidando por Identificación...');
      await logroCldSleep(30);

      const grupos = new Map(); // id -> {data, roles:Set}
      if(clientes){
        clientes.rows.forEach(r=>{
          const ex = logroCldExtraerFila(clientes.hdrs, r);
          if(!ex.id) return;
          const g = grupos.get(ex.id) || {data:null, roles:new Set()};
          g.data = logroCldMezclarCampos(g.data, ex);
          g.roles.add('Cliente');
          grupos.set(ex.id, g);
        });
      }
      if(proveedores){
        proveedores.rows.forEach(r=>{
          const ex = logroCldExtraerFila(proveedores.hdrs, r);
          if(!ex.id) return;
          const g = grupos.get(ex.id) || {data:null, roles:new Set()};
          g.data = logroCldMezclarCampos(g.data, ex);
          g.roles.add('Proveedor');
          grupos.set(ex.id, g);
        });
      }
      logroCldLog('   '+totalEntrada+' filas → '+grupos.size+' terceros únicos (tras consolidar por Identificación)','i','Consolidación');

      const out=[], defaultsLog=[], nitExcluidos=[], excluded=[];
      let emailsDefault=0, warns=0;

      for(const [id, g] of grupos){
        const d = g.data;

        if(LOGRO_CLD_NITS_EXCLUIR.has(id)){
          nitExcluidos.push({id, nombre:(d.nombreLegal||d.nombreCombinado||'').toUpperCase().trim()});
          continue;
        }

        let esJuridica = /jur[ií]dica/i.test(d.persona);
        if(!d.persona) esJuridica = /nit/i.test(logroCldNormKey(d.tipoIdRaw));
        const tipoId = logroCldMapTipoId(d.tipoIdRaw, id);

        let p1='',p2='',a1='',a2='';
        if(esJuridica){
          p1 = logroCldCleanTxt(d.nombreLegal || d.nombreComercial || d.nombreCombinado);
        } else {
          p1 = logroCldCleanTxt(d.primerNombre);
          p2 = logroCldCleanTxt(d.segundoNombre);
          a1 = logroCldCleanTxt(d.primerApellido);
          a2 = logroCldCleanTxt(d.segundoApellido);
          if(!p1 && !a1){
            const partes = logroCldSplitName(d.nombreCombinado || d.nombreLegal, tipoId);
            p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
          }
          if(!a1) warns++;
        }

        const ciudad = logroCldNormCiudad(d.ciudad);
        const dir = logroCldNormAddr(d.direccion);
        const tel = logroCldNormTel(d.telefono);

        const tipoContrib = esJuridica ? 'Persona Juridica' : 'Persona Natural No Responsable del IVA';

        const esC=g.roles.has('Cliente'), esP=g.roles.has('Proveedor');
        let tipoTercero='Cliente,Proveedor';
        if(esC && esP) tipoTercero='Cliente,Proveedor';
        else if(esC) tipoTercero='Cliente';
        else if(esP) tipoTercero='Proveedor';

        const correoOrigen = d.correo || '';
        let email;
        if(correoOrigen){
          email = correoOrigen;
        } else if(emailMode==='default' && emailDefault){
          email = emailDefault;
          emailsDefault++;
          defaultsLog.push({id, nombre:p1, campo:'Email', valor_aplicado:emailDefault, motivo:'Correo vacío en origen — se aplicó el correo predeterminado indicado por el usuario'});
        } else {
          email = null;
        }

        if(!d.ciudad) defaultsLog.push({id, nombre:p1, campo:'Ciudad Identificacion / Ciudad Direccion', valor_aplicado:'Bogotá, D.C.', motivo:'Campo vacío en origen'});
        if(!d.direccion || d.direccion.length<3) defaultsLog.push({id, nombre:p1, campo:'Direccion', valor_aplicado:'DIRECCION NO INFORMADA', motivo:'Campo vacío en origen'});
        if(!d.telefono) defaultsLog.push({id, nombre:p1, campo:'Telefonos', valor_aplicado:'3000000000', motivo:'Campo vacío en origen'});
        if(!d.tipoIdRaw) defaultsLog.push({id, nombre:p1, campo:'Tipo Identificacion', valor_aplicado:tipoId, motivo:'Tipo de Identificación vacío en origen — se infiere por longitud del número'});

        out.push({
          'Tipo Identificacion *': tipoId,
          'Identificacion *': logroCldIdNum(id),
          'Ciudad Identificacion*': ciudad,
          'Primer Nombre o Razon Social*': p1,
          'Segundo Nombre': p2||null,
          'Primer Apellido *': a1||null,
          'Segundo Apellido': a2||null,
          'Tipo Tercero *': tipoTercero,
          'Codigo': null,
          'Activo': 'Si',
          'Actividad Economica': null,
          'Tipo Contribuyente *': tipoContrib,
          'Clasi. Administrador Impuesto *': 'Normal',
          'Excepcion Impuesto': null,
          'Tarifa Reteica Compras': 9.66,
          'Aplica Reteica Ventas': null,
          'Maneja Cupo Credito': null,
          'Vendedor': null,
          'Lista Precios': null,
          'Forma Pago': null,
          'Plazo Dias': 0,
          'Porcentaje Descuento': null,
          'Tipo Direccion *': esJuridica ? 'Empresa/Oficina' : 'Casa',
          'Nombre Direccion *': 'Principal',
          'Direccion *': dir,
          'Telefonos *': tel,
          'Email *': email,
          'Ciudad Direccion *': ciudad,
          'Zona': null,'Barrio': null
        });
      }

      logroCldLog('✅ Consolidados: '+out.length+' registros ('+nitExcluidos.length+' NITs de lista predefinida excluidos)','o','Consolidación');
      setPStep(3); setPct(60,'Transformando...');
      await logroCldSleep(30);
      logroCldLog('🔄 Transformados: '+out.length+' registros, 30 campos','o','Transformación');
      if(warns>0) logroCldLog('   '+warns+' personas naturales sin apellido','w','Transformación');
      if(emailsDefault>0) logroCldLog('   '+emailsDefault+' correos completados con el valor predeterminado','i','Transformación');

      setPStep(4); setPct(80,'Generando Excel...');
      await logroCldSleep(30);
      logroCldLog('📊 Construyendo archivo Excel (plantilla WO Cloud)...','i','Escritura');

      LOGRO_CLD_WB = logroCldBuildWB(out, LOGRO_CLD_LOG, {
        archivos_entrada:(clientes?1:0)+(proveedores?1:0),
        registros_entrada:totalEntrada,
        registros_salida:out.length,
        errores:0,
        warnings:warns
      }, excluded, defaultsLog, nitExcluidos);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      setPct(100,'¡Listo!'); setPStep(5);
      logroCldLog('✅ Excel generado en '+dur+'s — '+out.length+' registros','o','Escritura');

      const fn = logroCldBuildFN();
      const fnEl=document.getElementById('dl-fn'); if(fnEl) fnEl.textContent=fn;
      const lbl=document.getElementById('dl-dest-label'); if(lbl) lbl.textContent='Para importar en World Office Cloud';
      const stIn=document.getElementById('st-in'); if(stIn) stIn.textContent=totalEntrada;
      const stOk=document.getElementById('st-ok'); if(stOk) stOk.textContent=out.length;

      try{
        await api('POST','/migrations',{
          filename_out:fn, orig_soft:'Logro', dest_soft:'World Office Cloud',
          module:'Terceros', records_in:totalEntrada, records_out:out.length,
          errors:0, warnings:warns, duration_sec:parseFloat(dur), status:'completed'
        }, AUTH.token);
      }catch(e){}

      setStep(4);
    }catch(err){
      logroCldLog('❌ Error: '+err.message,'e','Pipeline');
      console.error(err);
    }
  }

  function logroCldBuildFN(){
    const now=new Date();
    const p=x=>String(x).padStart(2,'0');
    const ts=now.getFullYear()+'_'+p(now.getMonth()+1)+'_'+p(now.getDate());
    return 'terceros_logro_wo_cloud_'+ts+'.xlsx';
  }

  function logroCldDoDownload(){
    if(!LOGRO_CLD_WB){ alert('Primero ejecuta el proceso ETL'); return; }
    XLSX.writeFile(LOGRO_CLD_WB, (document.getElementById('dl-fn')||{}).textContent || logroCldBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function logroCldInstall(){
    const sorigEl = document.getElementById('sorig');
    const s2card = document.querySelector('#s2 .card');
    if(!sorigEl || !s2card) return;

    // 1) Opción "Logro" en el selector de origen (comprobación para no
    //    duplicarla si el módulo Escritorio hermano ya la agregó)
    if(!sorigEl.querySelector('option[value="Logro"]')){
      const opt=document.createElement('option');
      opt.value='Logro'; opt.textContent='Logro';
      sorigEl.appendChild(opt);
    }

    // 2) Dos slots de archivo (Clientes / Proveedores), compartidos
    //    con el módulo Escritorio hermano vía window.__LOGRO_S — mismo
    //    patrón que ya usan los módulos de SIIMED. Si el hermano
    //    Escritorio ya creó los slots en el DOM, no se duplican.
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
      LOGRO_CLD_S[which+'File'] = f;
    };
    // Sincroniza con archivos que el módulo hermano (Escritorio) ya
    // haya recibido antes de que este módulo se instalara.
    if(window.__LOGRO_S.clientesFile) LOGRO_CLD_S.clientesFile = window.__LOGRO_S.clientesFile;
    if(window.__LOGRO_S.proveedoresFile) LOGRO_CLD_S.proveedoresFile = window.__LOGRO_S.proveedoresFile;
    // Si el módulo hermano ya definió __logroOnFile, hay que asegurarnos
    // de que también actualice nuestra copia local del File.
    const _prevOnFile = window.__logroOnFile;
    window.__logroOnFile = function(input, which){
      _prevOnFile(input, which);
      if(window.__LOGRO_S && window.__LOGRO_S[which+'File']) LOGRO_CLD_S[which+'File'] = window.__LOGRO_S[which+'File'];
    };

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

    // 4) routeETL(): solo intercepta Logro → World Office Cloud. Para
    //    Logro → Escritorio, deja pasar (lo maneja el archivo hermano).
    const _origRouteETL = window.routeETL;
    window.routeETL = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'Logro' && dest === 'World Office Cloud'){
        startLogroCldETL();
        return;
      }
      if(typeof _origRouteETL === 'function') _origRouteETL();
    };

    // 5) routeDownload(): mismo criterio
    const _origRouteDownload = window.routeDownload;
    window.routeDownload = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'Logro' && dest === 'World Office Cloud'){ logroCldDoDownload(); return; }
      if(typeof _origRouteDownload === 'function') _origRouteDownload();
    };

    // 6) showPg(): limpiar estado propio al reiniciar Terceros
    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'terceros'){
        LOGRO_CLD_S.clientesFile = null;
        LOGRO_CLD_S.proveedoresFile = null;
        _logroCldPending = null;
        logroCldCloseConfigModal();
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
    document.addEventListener('DOMContentLoaded', logroCldInstall);
  } else {
    logroCldInstall();
  }

})();