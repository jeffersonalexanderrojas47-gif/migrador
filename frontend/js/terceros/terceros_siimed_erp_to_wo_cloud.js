// ══════════════════════════════════════════════════════════════════
// ETL: Terceros — SIIMED ERP → World Office Cloud
// Módulo: terceros_siimed_erp_to_wo_cloud.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Hermano de terceros_siimed_erp_to_wo_escritorio.js pero
// COMPLETAMENTE SEPARADO: no comparte código ni funciones con él,
// solo el File subido por el usuario (a través de
// window.__SIIMED_S.file) — igual que ya ocurre entre los módulos de
// Siigo Nube (Escritorio y Cloud comparten el mismo archivo maestro
// subido en el mismo slot, cada uno con su propia lógica de
// transformación independiente).
//
// Reutiliza, SIN TOCARLOS, helpers ya definidos por
// terceros_siigo_nube_to_wo_cloud.js (se carga antes que este
// archivo): COLS, NITS_EXCLUIR, normAddr, normTel, tercSplitName,
// buildWB, setStep, setPStep, setPct, logMigrationToBackend.
// La ciudad usa su propio catálogo local (SIIMED_CIUDADES_CLOUD /
// siimedNormCiudadCloud) en vez de normCiudad().
// NO reutiliza nada del módulo Escritorio de Siigo ni del módulo
// Escritorio de SIIMED (evita el mismo error de dependencia cruzada
// que causó el bug "escNormId is not defined" en Alegra → Cloud).
//
// Ver terceros_siimed_erp_to_wo_escritorio.js para el detalle de la
// estructura del archivo de origen (una fila por combinación
// Identificación × Tipo; se agrupa por Identificación antes de
// generar la salida).
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const SIIMED_CLD_S = { file:null };
  let SIIMED_CLD_WB = null;
  const SIIMED_CLD_LOG = [];

  function siimedCldLog(msg, lvl, fase){
    const ts = new Date().toISOString();
    SIIMED_CLD_LOG.push({ ts, fase: fase || '', lvl: lvl || 'i', msg });
    const panel = document.getElementById('logp');
    if(!panel) return;
    const now = new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css = {i:'li', w:'lw', o:'lo', e:'le-e'}[lvl] || 'li';
    panel.innerHTML += '<div class="le"><span class="lt">'+now+'</span><span class="'+css+'">'+msg+'</span></div>';
    panel.scrollTop = panel.scrollHeight;
  }
  function siimedCldSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // ── Normalización de ID propia (independiente del módulo Escritorio) ──
  function siimedNormId(x){
    const s=String(x??'').replace(/[,\s]/g,'').trim();
    if(!s||s==='nan'||s==='undefined')return '';
    return s.replace(/[^0-9A-Za-z\-]/g,'');
  }
  function siimedIdNum(id){
    if(/^[0-9]+$/.test(id) && id.length<=15) return Number(id);
    return id;
  }

  // ── Mapeo "IDENTIFICACIÓN TRIBUTARIA" (SIIMED ERP) → Tipo
  //    Identificación (World Office Cloud). El catálogo de Cloud no
  //    tiene una opción "NUIP" dedicada — se usa "Registro Civil" como
  //    la más cercana disponible; revisar si aplica a tu caso. ───────
  const SIIMED_TIPO_ID_CLD = {
    'cedula':'Cédula de ciudadanía',
    'nit':'NIT',
    'tarjetaid':'Tarjeta de Identidad',
    'cedulaext':'Cédula de Extranjería',
    'regcivil':'Registro Civil',
    'pas':'Pasaporte',
    'tarjetaext':'Tarjeta de Extranjería',
    'tipodocumentoextranjero':'Documento de Identificación Extranjero',
    'permisoprotecciontemporal':'Permiso Especial de Permanencia',
    'numunicoidpers':'Registro Civil', // sin equivalente exacto de NUIP en Cloud
    'nitdeotropais':'Documento de Identificación Extranjero',
    // Valor visto en datos reales sin significado documentado ('Pe');
    // tratado como Permiso Especial de Permanencia por ser el más
    // cercano. REVISAR MANUALMENTE si aparece en tu base.
    'pe':'Permiso Especial de Permanencia'
  };
  function siimedMapTipoIdCld(raw, idNorm){
    const k = String(raw||'').toLowerCase().trim().replace(/[^a-z]/g,'');
    if(SIIMED_TIPO_ID_CLD[k]) return SIIMED_TIPO_ID_CLD[k];
    if(!k){
      const n = String(idNorm||'').replace(/\D/g,'');
      return n.length===9 ? 'NIT' : 'Cédula de ciudadanía';
    }
    return String(raw||'').trim();
  }

  // ── Tipos de identificación de PERSONA NATURAL — para estos, el
  //    nombre se separa en Nombre/Apellidos (columnas PRIMER NOMBRE /
  //    SEGUNDO NOMBRE / PRIMER APELLIDO / SEGUNDO APELLIDO). Para NIT
  //    se toma la columna NOMBRE completa como Razón Social. ────────
  const SIIMED_TIPOS_PERSONA_NATURAL_CLD = new Set([
    'Cédula de ciudadanía','Tarjeta de Identidad','Cédula de Extranjería',
    'Registro Civil','Pasaporte','Tarjeta de Extranjería'
  ]);

  // ── Tipo Contribuyente — usa "TIPO PERSONA JURIDICA" (confiable) +
  //    "CLASIFICACIÓN TRIBUTARIA". Categorías poco frecuentes (Gran
  //    Contribuyente, Régimen Simple, No Residente, etc. — ~1.5% de
  //    los registros) usan el valor más cercano del catálogo de
  //    Cloud; revísalas si tu base tiene muchos de estos casos. ──────
  function siimedTipoContribCld(clasifTrib, esJuridica){
    const k = String(clasifTrib||'').toLowerCase().trim();
    if(k==='gran contribuyente') return 'Grande Contribuyente No Autorretenedor';
    if(k==='régimen simple' || k==='regimen simple') return esJuridica ? 'Régimen Simple de Tributación Persona Jurídica' : 'Régimen Simple de Tributación Persona Natural';
    if(k==='no residente en el país' || k==='no residente en el pais' || k==='régimen simplificado no residente en el país') return 'Tercero del Exterior';
    if(k==='empresa del estado') return 'Instituciones del Estado Publicos y Otros';
    if(esJuridica) return 'Persona Juridica';
    if(k==='responsable de iva') return 'Persona Natural Responsable del IVA';
    return 'Persona Natural No Responsable del IVA';
  }

  function siimedCleanTxt(s){
    return String(s||'').trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  function siimedCol(hdrs, name){
    return hdrs.findIndex(h=>String(h||'').trim().toLowerCase()===name.toLowerCase());
  }

  // ── Lectura del Excel — misma detección automática de fila de
  //    encabezados que el módulo hermano de Escritorio ─────────────
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
          if(headerRow<0) headerRow=5;
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

  function siimedAgrupar(hdrs, rows){
    const cId=siimedCol(hdrs,'IDENTIFICACION');
    const cTipo=siimedCol(hdrs,'TIPO');
    const grupos=new Map();
    rows.forEach(r=>{
      const id=siimedNormId(r[cId]);
      if(!id) return;
      const tipo=String(r[cTipo]||'').trim();
      if(!grupos.has(id)) grupos.set(id, {row:r, roles:new Set()});
      if(tipo) grupos.get(id).roles.add(tipo);
    });
    return grupos;
  }

  // ── Normalización de "Forma de Pago" (para modal + hoja nueva) ────
  function siimedNormFormaPago(raw){
    return String(raw||'').replace(/\s+/g,' ').trim();
  }

  // ── "Actividad Economica" — fuente: columna numérica "CODIGO DE
  //    ACTIVIDAD ECONOMICA" (distinta de la columna de texto libre
  //    "ACTIVIDAD ECONOMICA"). Solo se acepta el valor si está en el
  //    listado de códigos CIIU válidos proporcionado por el usuario
  //    (508 códigos únicos); si no está en el listado, queda null. Se
  //    conserva como texto para no perder ceros a la izquierda. ─────
  const SIIMED_ACTIVIDADES_CLOUD = new Set(['0010','0020','0081','0082','0090','0111','0112','0113','0114','0115','0119','0121','0122','0123','0124','0125','0126','0127','0128','0129','0130','0141','0142','0143','0144','0145','0149','0150','0161','0162','0163','0164','0170','0210','0220','0230','0240','0311','0312','0321','0322','0510','0520','0610','0620','0710','0721','0722','0723','0729','0811','0812','0820','0891','0892','0899','0910','0990','1011','1012','1020','1030','1031','1032','1033','1040','1051','1052','1061','1062','1063','1071','1072','1081','1082','1083','1084','1089','1090','1101','1102','1103','1104','1200','1311','1312','1313','1391','1392','1393','1394','1399','1410','1420','1430','1511','1512','1513','1521','1522','1523','1610','1620','1630','1640','1690','1701','1702','1709','1811','1812','1820','1910','1921','1922','2011','2012','2013','2014','2021','2022','2023','2029','2030','2100','2211','2212','2219','2221','2229','2310','2391','2392','2393','2394','2395','2396','2399','2410','2421','2429','2431','2432','2511','2512','2513','2520','2591','2592','2593','2599','2610','2620','2630','2640','2651','2652','2660','2670','2680','2711','2712','2720','2731','2732','2740','2750','2790','2811','2812','2813','2814','2815','2816','2817','2818','2819','2821','2822','2823','2824','2825','2826','2829','2910','2920','2930','3011','3012','3020','3030','3040','3091','3092','3099','3110','3120','3210','3220','3230','3240','3250','3290','3311','3312','3313','3314','3315','3319','3320','3511','3512','3513','3514','3520','3530','3600','3700','3811','3812','3821','3822','3830','3900','4111','4112','4210','4220','4290','4311','4312','4321','4322','4329','4330','4390','4511','4512','4520','4530','4541','4542','4610','4620','4631','4632','4641','4642','4643','4644','4645','4649','4651','4652','4653','4659','4661','4662','4663','4664','4665','4669','4690','4711','4719','4721','4722','4723','4724','4729','4731','4732','4741','4742','4751','4752','4753','4754','4755','4759','4761','4762','4769','4771','4772','4773','4774','4775','4781','4782','4789','4791','4792','4799','4911','4912','4921','4922','4923','4930','5011','5012','5021','5022','5111','5112','5121','5122','5210','5221','5222','5223','5224','5229','5310','5320','5511','5512','5513','5514','5519','5520','5530','5590','5611','5612','5613','5619','5621','5629','5630','5811','5812','5813','5819','5820','5911','5912','5913','5914','5920','6010','6020','6110','6120','6130','6190','6201','6202','6209','6311','6312','6391','6399','6411','6412','6421','6422','6423','6424','6431','6432','6491','6492','6493','6494','6495','6499','6511','6512','6513','6514','6515','6521','6522','6531','6532','6611','6612','6613','6614','6615','6619','6621','6629','6630','6810','6820','6910','6920','7010','7020','7110','7111','7112','7120','7210','7220','7310','7320','7410','7420','7490','7500','7710','7721','7722','7729','7730','7740','7810','7820','7830','7911','7912','7990','8010','8020','8030','8110','8121','8129','8130','8211','8219','8220','8230','8291','8292','8299','8411','8412','8413','8414','8415','8421','8422','8423','8424','8430','8511','8512','8513','8521','8522','8523','8530','8541','8542','8543','8544','8551','8552','8553','8559','8560','8610','8621','8622','8691','8692','8699','8710','8720','8730','8790','8810','8890','8891','8899','9001','9002','9003','9004','9005','9006','9007','9008','9101','9102','9103','9200','9311','9312','9319','9321','9329','9411','9412','9420','9491','9492','9499','9511','9512','9521','9522','9523','9524','9529','9601','9602','9603','9609','9700','9810','9820','9900']);

  function siimedActEconCld(raw){
    if(raw===undefined || raw===null || raw==='') return null;
    let s = String(raw).trim();
    if(!/^\d+$/.test(s)) return null; // solo acepta valores numéricos
    // El Excel de origen suele traer esta columna como número (ej. 111
    // en vez de "0111"), perdiendo el cero a la izquierda a nivel de
    // celda; se rellena a 4 dígitos antes de comparar contra el listado
    // (todos los códigos CIIU del listado tienen 4 dígitos).
    if(s.length < 4) s = s.padStart(4,'0');
    return SIIMED_ACTIVIDADES_CLOUD.has(s) ? s : null;
  }

  // ── Catálogo de Ciudades — World Office Cloud ("ubicacion_ciudad"),
  //    proporcionado por el usuario (1035 municipios reales de
  //    Colombia). Se usa EXCLUSIVAMENTE en este archivo (SIIMED ERP →
  //    Cloud) — NO reemplaza el normCiudad() del módulo Siigo Nube
  //    Cloud, que otros pipelines (Siigo Nube, Alegra) siguen usando
  //    sin cambios. Si la ciudad del Excel coincide (con variantes de
  //    formato: acentos, mayúsculas, sufijo de departamento entre
  //    paréntesis o con guión, artículo inicial "El/La/Los/Las") con
  //    este catálogo, se deja el nombre oficial; si NO hay
  //    coincidencia, se deja la ciudad tal como viene en el Excel
  //    original (no se fuerza a Bogotá ni se deja vacía). ───────────
  const SIIMED_CIUDADES_CLOUD = ['Abejorral','Abrego','Abriaquí','Acacías','Acandí','Acevedo','Achí','Agrado','Agua De Dios','Aguachica','Aguada','Aguadas','Aguazul','Agustín Codazzi','Aipe','Albania','Albán','Alcalá','Aldana','Alejandría','Algarrobo','Algeciras','Almaguer','Almeida','Alpujarra','Altamira','Alto Baudó','Altos Del Rosario','Alvarado','Amagá','Amalfi','Ambalema','Anapoima','Ancuyá','Andalucía','Andes','Angelópolis','Angostura','Anolaima','Anorí','Anserma','Ansermanuevo','Anzoátegui','Anzá','Apartadó','Apulo','Apía','Aquitania','Aracataca','Aranzazu','Aratoca','Arauca','Arauquita','Arbeláez','Arboleda','Arboledas','Arboletes','Arcabuco','Arenal','Argelia','Ariguaní','Arjona','Armenia','Armero','Arroyohondo','Astrea','Ataco','Atrato','Ayapel','Bagadó','Bahía Solano','Bajo Baudó','Balboa','Baranoa','Baraya','Barbacoas','Barbosa','Barichara','Barranca De Upía','Barrancabermeja','Barrancas','Barranco De Loba','Barranco Minas','Barranquilla','Becerril','Belalcázar','Bello','Belmira','Beltrán','Belén','Belén De Bajirá','Belén De Los Andaquies','Belén De Umbría','Berbeo','Betania','Betulia','Betéitiva','Bituima','Boavita','Bochalema','Bogotá, D.C.','Bojacá','Bojayá','Bolívar','Bosconia','Boyacá','Briceño','Bucaramanga','Bucarasica','Buenaventura','Buenavista','Buenos Aires','Buesaco','Bugalagrande','Buriticá','Busbanzá','Cabrera','Cabuyaro','Cacahual','Cachipay','Cachirá','Caicedo','Caicedonia','Caimito','Cajamarca','Cajibío','Cajicá','Calamar','Calarcá','Caldas','Caldono','Cali','California','Calima','Caloto','Campamento','Campo De La Cruz','Campoalegre','Campohermoso','Canalete','Candelaria','Cantagallo','Caparrapí','Capitanejo','Caracolí','Caramanta','Carcasí','Carepa','Carmen De Apicalá','Carmen De Carupa','Carmen Del Darién','Carolina','Cartagena De Indias','Cartagena Del Chairá','Cartago','Carurú','Casabianca','Castilla La Nueva','Caucasia','Cañasgordas','Cepitá','Cereté','Cerinza','Cerrito','Cerro San Antonio','Chachagüí','Chaguaní','Chalán','Chameza','Chaparral','Charalá','Charta','Chibolo','Chigorodó','Chima','Chimichagua','Chimá','Chinavita','Chinchiná','Chinácota','Chinú','Chipaque','Chipatá','Chiquinquirá','Chiriguaná','Chiscas','Chita','Chitagá','Chitaraque','Chivatá','Chivor','Choachí','Chocontá','Chía','Chíquiza','Cicuco','Cimitarra','Circasia','Cisneros','Ciudad Bolívar','Ciénaga','Ciénaga De Oro','Ciénega','Clemencia','Cocorná','Coello','Cogua','Colombia','Coloso','Colón','Concepción','Concordia','Condoto','Confines','Consaca','Contadero','Contratación','Convención','Copacabana','Coper','Corinto','Coromoro','Corozal','Corrales','Cota','Cotorra','Covarachía','Coveñas','Coyaima','Cravo Norte','Cuaspud','Cubarral','Cubará','Cucaita','Cucunubá','Cucutilla','Cumaral','Cumaribo','Cumbal','Cumbitara','Cunday','Curillo','Curití','Curumaní','Cuítiva','Cáceres','Cácota','Cáqueza','Cértegui','Cómbita','Córdoba','Cúcuta','Dabeiba','Dagua','Dibulla','Distracción','Dolores','Don Matías','Dosquebradas','Duitama','Durania','Ebéjico','El Bagre','El Banco','El Cairo','El Calvario','El Cantón Del San Pablo','El Carmen','El Carmen De Atrato','El Carmen De Bolívar','El Carmen De Chucurí','El Carmen De Viboral','El Castillo','El Cerrito','El Charco','El Cocuy','El Colegio','El Copey','El Doncello','El Dorado','El Dovio','El Encanto','El Espino','El Guacamayo','El Guamo','El Litoral Del San Juan','El Molino','El Paso','El Paujil','El Peñol','El Peñón','El Piñon','El Playón','El Retorno','El Retén','El Roble','El Rosal','El Rosario','El Santuario','El Tablón De Gómez','El Tambo','El Tarra','El Zulia','El Águila','Elías','Encino','Enciso','Entrerríos','Envigado','Espinal','Facatativá','Falan','Filadelfia','Filandia','Firavitoba','Flandes','Florencia','Floresta','Florida','Floridablanca','Florián','Fomeque','Fonseca','Fortul','Fosca','Francisco Pizarro','Fredonia','Fresno','Frontino','Fuente De Oro','Fundación','Funes','Funza','Fusagasugá','Fúquene','Gachalá','Gachancipá','Gachantivá','Gachetá','Galapa','Galeras','Galán','Gama','Gamarra','Gambita','Garagoa','Garzón','Gigante','Ginebra','Giraldo','Girardot','Girardota','Girón','González','Gramalote','Granada','Guaca','Guacamayas','Guacarí','Guachené','Guachetá','Guachucal','Guadalajara De Buga','Guadalupe','Guaduas','Guaitarilla','Gualmatán','Guamal','Guamo','Guapi','Guapotá','Guaranda','Guarne','Guasca','Guatapé','Guataquí','Guatavita','Guateque','Guavatá','Guayabal De Siquima','Guayabetal','Guayatá','Gutiérrez','Guática','Gámeza','Génova','Gómez Plata','Güepsa','Güicán','Hacarí','Hatillo De Loba','Hato','Hato Corozal','Hatonuevo','Heliconia','Herrán','Herveo','Hispania','Hobo','Honda','Ibagué','Icononzo','Iles','Imués','Inzá','Inírida','Ipiales','Iquira','Isnos','Istmina','Itagüí','Ituango','Iza','Jambaló','Jamundí','Jardín','Jenesano','Jericó','Jerusalén','Jesús María','Jordán','Juan De Acosta','Junín','Juradó','La Apartada','La Argentina','La Belleza','La Calera','La Capilla','La Ceja','La Celia','La Chorrera','La Cruz','La Cumbre','La Dorada','La Esperanza','La Estrella','La Florida','La Gloria','La Guadalupe','La Jagua De Ibirico','La Jagua Del Pilar','La Llanada','La Macarena','La Merced','La Mesa','La Montañita','La Palma','La Paz','La Pedrera','La Peña','La Pintada','La Plata','La Playa','La Primavera','La Salina','La Sierra','La Tebaida','La Tola','La Unión','La Uvita','La Vega','La Victoria','La Virginia','Labateca','Labranzagrande','Landázuri','Lebríja','Leguízamo','Leiva','Lejanías','Lenguazaque','Leticia','Liborina','Linares','Lloró','Lorica','Los Andes','Los Córdobas','Los Palmitos','Los Patios','Los Santos','Lourdes','Luruaco','Lérida','Líbano','López','Macanal','Macaravita','Maceo','Macheta','Madrid','Magangué','Magüi','Mahates','Maicao','Majagual','Malambo','Mallama','Manatí','Manaure','Manizales','Manta','Manzanares','Maní','Mapiripana','Mapiripán','Margarita','Marinilla','Maripí','Mariquita','Marmato','Marquetalia','Marsella','Marulanda','María La Baja','Matanza','Medellín','Medina','Medio Atrato','Medio Baudó','Medio San Juan','Melgar','Mercaderes','Mesetas','Milán','Miraflores','Miranda','Mirití - Paraná','Mistrató','Mitú','Mocoa','Mogotes','Molagavita','Momil','Mompós','Mongua','Monguí','Moniquirá','Montebello','Montecristo','Montelíbano','Montenegro','Monterrey','Montería','Morales','Morelia','Morichal','Morroa','Mosquera','Motavita','Moñitos','Murillo','Murindó','Mutatá','Mutiscua','Muzo','Málaga','Nariño','Natagaima','Nechí','Necoclí','Neira','Neiva','Nemocón','Nilo','Nimaima','Nobsa','Nocaima','Norcasia','Norosí','Nueva Granada','Nuevo Colón','Nunchía','Nuquí','Nátaga','Nóvita','Obando','Ocamonte','Ocaña','Oiba','Oicatá','Olaya','Olaya Herrera','Onzaga','Oporapa','Orito','Orocué','Ortega','Ospina','Otanche','Ovejas','Pachavita','Pacho','Pacoa','Padilla','Paicol','Pailitas','Paime','Paipa','Pajarito','Palermo','Palestina','Palmar','Palmar De Varela','Palmas Del Socorro','Palmira','Palmito','Palocabildo','Pamplona','Pamplonita','Pana Pana','Pandi','Panqueba','Papunaua','Paratebueno','Pasca','Pasto','Patía','Pauna','Paya','Paz De Ariporo','Paz De Río','Pedraza','Pelaya','Pensilvania','Peque','Pereira','Pesca','Peñol','Piamonte','Piedecuesta','Piedras','Piendamó','Pijao','Pijiño Del Carmen','Pinchote','Pinillos','Piojó','Pisba','Pital','Pitalito','Pivijay','Planadas','Planeta Rica','Plato','Policarpa','Polonuevo','Ponedera','Popayán','Pore','Potosí','Pradera','Prado','Providencia','Pueblo Bello','Pueblo Nuevo','Pueblo Rico','Pueblorrico','Puebloviejo','Puente Nacional','Puerres','Puerto Alegría','Puerto Arica','Puerto Asís','Puerto Berrío','Puerto Boyacá','Puerto Caicedo','Puerto Carreño','Puerto Colombia','Puerto Concordia','Puerto Escondido','Puerto Gaitán','Puerto Guzmán','Puerto Libertador','Puerto Lleras','Puerto López','Puerto Nare','Puerto Nariño','Puerto Parra','Puerto Rico','Puerto Rondón','Puerto Salgar','Puerto Santander','Puerto Tejada','Puerto Triunfo','Puerto Wilches','Pulí','Pupiales','Puracé','Purificación','Purísima','Pácora','Páez','Páramo','Quebradanegra','Quetame','Quibdó','Quimbaya','Quinchía','Quipile','Quípama','Ragonvalia','Ramiriquí','Recetor','Regidor','Remedios','Remolino','Repelón','Restrepo','Retiro','Ricaurte','Rioblanco','Riofrío','Riohacha','Rionegro','Riosucio','Risaralda','Rivera','Roberto Payán','Roldanillo','Roncesvalles','Rondón','Rosas','Rovira','Ráquira','Río De Oro','Río Iro','Río Quito','Río Viejo','Sabana De Torres','Sabanagrande','Sabanalarga','Sabanas De San Ángel','Sabaneta','Saboyá','Sahagún','Saladoblanco','Salamina','Salazar','Saldaña','Salento','Salgar','Samacá','Samaniego','Samaná','Sampués','San Agustín','San Alberto','San Andrés','San Andrés Sotavento','San Antero','San Antonio','San Antonio Del Tequendama','San Benito','San Benito Abad','San Bernardo','San Bernardo Del Viento','San Calixto','San Carlos','San Carlos De Guaroa','San Cayetano','San Cristóbal','San Diego','San Eduardo','San Estanislao','San Felipe','San Fernando','San Francisco','San Gil','San Jacinto','San Jacinto Del Cauca','San Jerónimo','San Joaquín','San José','San José De La Montaña','San José De Miranda','San José De Pare','San José Del Fragua','San José Del Guaviare','San José Del Palmar','San José de Uré','San Juan De Arama','San Juan De Betulia','San Juan De Río Seco','San Juan De Urabá','San Juan Del Cesar','San Juan Nepomuceno','San Juanito','San Lorenzo','San Luis','San Luis De Gaceno','San Luis De Palenque','San Marcos','San Martín','San Martín De Loba','San Mateo','San Miguel','San Miguel De Sema','San Onofre','San Pablo','San Pablo De Borbur','San Pedro','San Pedro De Cartago','San Pedro De Urabá','San Pelayo','San Rafael','San Roque','San Sebastián','San Sebastián De Buenavista','San Vicente','San Vicente De Chucurí','San Vicente Del Caguán','San Zenón','Sandoná','Santa Ana','Santa Bárbara','Santa Bárbara De Pinto','Santa Catalina','Santa Helena Del Opón','Santa Isabel','Santa Lucía','Santa Marta','Santa María','Santa Rosa','Santa Rosa De Cabal','Santa Rosa De Osos','Santa Rosa De Viterbo','Santa Rosa Del Sur','Santa Rosalía','Santa Sofía','Santacruz','Santafé De Antioquia','Santana','Santander De Quilichao','Santiago','Santiago De Tolú','Santo Domingo','Santo Tomás','Santuario','Sapuyes','Saravena','Sardinata','Sasaima','Sativanorte','Sativasur','Segovia','Sesquilé','Sevilla','Siachoque','Sibaté','Sibundoy','Silos','Silvania','Silvia','Simacota','Simijaca','Simití','Sincelejo','Sincé','Sipí','Sitionuevo','Soacha','Soatá','Socha','Socorro','Socotá','Sogamoso','Solano','Soledad','Solita','Somondoco','Sonsón','Sopetrán','Soplaviento','Sopó','Sora','Soracá','Sotaquirá','Sotará','Suaita','Suan','Suaza','Subachoque','Sucre','Suesca','Supatá','Supía','Suratá','Susa','Susacón','Sutamarchán','Sutatausa','Sutatenza','Suárez','Sácama','Sáchica','Tabio','Tadó','Talaigua Nuevo','Tamalameque','Tame','Taminango','Tangua','Taraira','Tarapacá','Tarazá','Tarqui','Tarso','Tasco','Tauramena','Tausa','Tello','Tena','Tenerife','Tenjo','Tenza','Teorama','Teruel','Tesalia','Tibacuy','Tibaná','Tibasosa','Tibirita','Tibú','Tierralta','Timaná','Timbiquí','Timbío','Tinjacá','Tipacoque','Tiquisio','Titiribí','Toca','Tocaima','Tocancipá','Togüí','Toledo','Tolú Viejo','Tona','Topaipí','Toribio','Toro','Tota','Totoró','Trinidad','Trujillo','Tubará','Tuchín','Tuluá','Tumaco','Tunja','Tununguá','Turbaco','Turbaná','Turbo','Turmequé','Tuta','Tutazá','Támara','Támesis','Tópaga','Túquerres','Ubalá','Ubaque','Ulloa','Umbita','Une','Unguía','Unión Panamericana','Uramita','Uribe','Uribia','Urrao','Urumita','Usiacurí','Valdivia','Valencia','Valle De San José','Valle De San Juan','Valle Del Guamuez','Valledupar','Valparaíso','Vegachí','Venadillo','Venecia','Ventaquemada','Vergara','Versalles','Vetas','Vianí','Victoria','Vigía Del Fuerte','Vijes','Villa Caro','Villa De Leyva','Villa De San Diego De Ubaté','Villa Del Rosario','Villa Rica','Villagarzón','Villagómez','Villahermosa','Villamaría','Villanueva','Villapinzón','Villarrica','Villavicencio','Villavieja','Villeta','Viotá','Viracachá','Vistahermosa','Viterbo','Vélez','Yacopí','Yacuanquer','Yaguará','Yalí','Yarumal','Yavaraté','Yolombó','Yondó','Yopal','Yotoco','Yumbo','Zambrano','Zapatoca','Zapayán','Zaragoza','Zarzal','Zetaquira','Zipacón','Zipaquirá','Zona Bananera','Útica'];

  function siimedCiudadKey(s){
    let k = String(s||'')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^A-Z\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    k = k.replace(/\bD\s?C\b$/,'').trim(); // "Bogotá, D.C." ~ "BOGOTA"
    return k;
  }

  const SIIMED_CIUDADES_CLOUD_MAP = (function(){
    const m = new Map();
    SIIMED_CIUDADES_CLOUD.forEach(nombre=>{
      const k = siimedCiudadKey(nombre);
      if(k && !m.has(k)) m.set(k, nombre);
    });
    return m;
  })();
  const SIIMED_CIUDADES_CLOUD_COMPACT = (function(){
    const m = new Map();
    SIIMED_CIUDADES_CLOUD_MAP.forEach((nombre,k)=>{
      const kc = k.replace(/\s+/g,'');
      if(kc && !m.has(kc)) m.set(kc, nombre);
    });
    return m;
  })();

  function siimedNormCiudadCloud(raw){
    const original = String(raw||'').trim();
    if(!original || original.toLowerCase()==='nan' || original==='-') return 'Bogotá, D.C.';

    const candidatos = [original];
    if(original.includes('(')) candidatos.push(original.split('(')[0].trim());
    if(original.includes(' - ')) candidatos.push(original.split(' - ')[0].trim());
    const sinArticulo = original.replace(/^(EL|LA|LOS|LAS)\s+/i,'').trim();
    if(sinArticulo && sinArticulo!==original) candidatos.push(sinArticulo);

    for(const cand of candidatos){
      const k = siimedCiudadKey(cand);
      if(k && SIIMED_CIUDADES_CLOUD_MAP.has(k)) return SIIMED_CIUDADES_CLOUD_MAP.get(k);
    }
    // último intento: comparar sin espacios (ej. "DOS QUEBRADAS" ~ "Dosquebradas")
    for(const cand of candidatos){
      const kc = siimedCiudadKey(cand).replace(/\s+/g,'');
      if(kc && SIIMED_CIUDADES_CLOUD_COMPACT.has(kc)) return SIIMED_CIUDADES_CLOUD_COMPACT.get(kc);
    }
    return original; // sin coincidencia: se deja la ciudad del Excel original
  }
    function siimedNormCiudadCloudExtra(raw){
    const original = String(raw||'').trim();

    if(!original || original.toLowerCase()==='nan' || original==='-')
      return 'Bogotá, D.C.';

    const primeros5 = original.toLowerCase().substring(0,5);

    const encontrada = SIIMED_CIUDADES_CLOUD.find(c =>
      c.toLowerCase().startsWith(primeros5)
    );

    if(encontrada) return encontrada;

    return original;
  }

  // Estado pendiente entre la fase 1 (lectura + modal de config.) y
  // la fase 2 (transformación real), para no releer el archivo.
  let _siimedCldPending = null;

  // ══════════════════════════════════════════════════════════════
  // FASE 1: lee el archivo, detecta las Formas de Pago presentes y
  // muestra el modal de configuración ANTES de iniciar el pipeline
  // (Grupo / Maneja Cupo Crédito por Forma de Pago, y la opción de
  // correo por defecto para terceros sin email).
  // ══════════════════════════════════════════════════════════════
  async function startSiimedCldETL(){
    const file = SIIMED_CLD_S.file || (window.__SIIMED_S && window.__SIIMED_S.file);
    if(!file){ alert('Carga el archivo de SIIMED ERP (Exportación Catálogo de Terceros).'); return; }
    try{
      const maestro = await siimedReadMaestro(file);
      const hdrs = maestro.hdrs;
      const cForma = siimedCol(hdrs,'FORMA DE PAGO');
      const formaCount = new Map();
      maestro.rows.forEach(r=>{
        const name = siimedNormFormaPago(cForma>=0 ? r[cForma] : '');
        if(!name) return;
        formaCount.set(name, (formaCount.get(name)||0)+1);
      });
      const formaList = [...formaCount.keys()].sort((a,b)=>a.localeCompare(b,'es'));

      _siimedCldPending = { maestro, formaList, t0: Date.now() };
      window.__siimedCldPending = _siimedCldPending;

      if(formaList.length){
        siimedCldShowConfigModal(formaList, formaCount);
      } else {
        await siimedCldConfirmConfigModal();
      }
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  // ── Modal de configuración: Formas de Pago + Correo por defecto ──
  function siimedCldShowConfigModal(formaList, formaCount){
    const rowsHTML = formaList.map((name,i)=>`
      <tr>
        <td style="padding:8px 10px;font-size:12.5px;color:#fff;border-bottom:1px solid rgba(255,255,255,.1)">
          ${name}<div style="font-size:10.5px;color:rgba(255,255,255,.4)">${(formaCount.get(name)||0)} registro(s)</div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1)">
          <input list="siimed-grupo-opts" id="siimed-fp-grupo-${i}" placeholder="Ej: Efectivo, Crédito"
            style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
            border-radius:6px;padding:6px 8px;color:#fff;font-size:12.5px;outline:none">
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1)">
          <select id="siimed-fp-maneja-${i}" style="width:100%;background:rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:6px 8px;color:#fff;font-size:12.5px;outline:none">
            <option value="" style="background:#1a1060;color:#fff">—</option>
            <option value="Si" style="background:#1a1060;color:#fff">Si</option>
            <option value="No" style="background:#1a1060;color:#fff">No</option>
          </select>
        </td>
      </tr>`).join('');

    let modal = document.getElementById('siimed-cld-config-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'siimed-cld-config-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.siimedCldCloseConfigModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:640px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto">
          <div style="text-align:center;margin-bottom:22px">
            <div style="font-size:20px;font-weight:700;color:#fff">Configurar Formas de Pago</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">
              Se encontraron ${formaList.length} forma(s) de pago en el archivo. Indica el Grupo y si
              maneja Cupo Crédito para cada una (opcional — puedes dejarlo en blanco).
            </div>
          </div>
          <datalist id="siimed-grupo-opts">
            <option value="Efectivo"></option>
            <option value="Crédito"></option>
          </datalist>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 10px;font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase">Forma de Pago</th>
                <th style="text-align:left;padding:6px 10px;font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase">Grupo</th>
                <th style="text-align:left;padding:6px 10px;font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase">Maneja Cupo Crédito</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>

          <div style="border-top:1px solid rgba(255,255,255,.15);padding-top:18px;margin-bottom:24px">
            <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:10px">
              Terceros sin correo electrónico
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
              <input type="radio" name="siimed-email-mode" id="siimed-email-mode-blank" value="blank" checked>
              Dejar el correo en blanco
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(255,255,255,.85);cursor:pointer">
              <input type="radio" name="siimed-email-mode" id="siimed-email-mode-default" value="default">
              Aplicar un correo predeterminado:
            </label>
            <input type="email" id="siimed-email-default" placeholder="correo@ejemplo.com"
              style="width:100%;margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none">
            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:5px">
              Solo se aplica a los terceros que no traigan correo propio en el archivo.
            </div>
          </div>

          <div style="display:flex;gap:12px">
            <button onclick="window.siimedCldCloseConfigModal()" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">
              Cancelar
            </button>
            <button onclick="window.siimedCldConfirmConfigModal()" style="flex:2;padding:12px;
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

  function siimedCldCloseConfigModal(){
    const modal=document.getElementById('siimed-cld-config-modal');
    if(modal) modal.style.display='none';
  }
  window.siimedCldCloseConfigModal = siimedCldCloseConfigModal;

  async function siimedCldConfirmConfigModal(){
    if(!_siimedCldPending) return;
    const formaList = _siimedCldPending.formaList || [];
    const formaPagoCfg = new Map();
    formaList.forEach((name,i)=>{
      const grupoEl = document.getElementById('siimed-fp-grupo-'+i);
      const manejaEl = document.getElementById('siimed-fp-maneja-'+i);
      formaPagoCfg.set(name, {
        grupo: grupoEl ? String(grupoEl.value||'').trim() : '',
        maneja: manejaEl ? String(manejaEl.value||'').trim() : ''
      });
    });
    const emailModeEl = document.getElementById('siimed-email-mode-default');
    const emailMode = (emailModeEl && emailModeEl.checked) ? 'default' : 'blank';
    const emailDefEl = document.getElementById('siimed-email-default');
    const emailDefault = emailDefEl ? String(emailDefEl.value||'').trim() : '';

    siimedCldCloseConfigModal();
    await _runSiimedCldETL(formaPagoCfg, emailMode, emailDefault);
  }
  window.siimedCldConfirmConfigModal = siimedCldConfirmConfigModal;

  // ── Hoja "forma de pago" — catálogo con Código consecutivo desde 15
  function siimedCldAppendFormaPagoSheet(wb, formaList, formaPagoCfg){
    const aoa=[['Código','Nombre','Documentos','Grupo','Maneja Cupo Crédito']];
    let codigo=15;
    (formaList||[]).forEach(name=>{
      const cfg=(formaPagoCfg && formaPagoCfg.get(name)) || {grupo:'',maneja:''};
      aoa.push([codigo, name, 'FC;FV', cfg.grupo||'', cfg.maneja||'']);
      codigo++;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'forma de pago');
  }

  // ══════════════════════════════════════════════════════════════
  // FASE 2: pipeline real de transformación (igual que antes, ahora
  // recibe la configuración definida por el usuario en el modal de
  // la fase 1: Forma de Pago → Grupo/Maneja Cupo Crédito, y el modo
  // de correo por defecto).
  // ══════════════════════════════════════════════════════════════
  async function _runSiimedCldETL(formaPagoCfg, emailMode, emailDefault){
    const { maestro, formaList, t0 } = _siimedCldPending;
    setStep(3);
    SIIMED_CLD_LOG.length=0;
    const panel=document.getElementById('logp'); if(panel) panel.innerHTML='';
    setPStep('ps0','ps act'); setPct(5,'Cargando configuración...');
    try{
      siimedCldLog('INICIANDO PIPELINE ETL (SIIMED ERP → World Office Cloud)','o',null);
      await siimedCldSleep(150); setPStep('ps0','ps don');

      setPStep('ps1','ps act'); setPct(15,'Leyendo archivo...');
      siimedCldLog('   Filas leídas: '+maestro.rows.length,'i','Lectura de archivos');
      const totalEntrada = maestro.rows.length;
      await siimedCldSleep(150); setPStep('ps1','ps don');

      setPStep('ps2','ps act'); setPct(35,'Consolidando...');
      const grupos = siimedAgrupar(maestro.hdrs, maestro.rows);
      siimedCldLog('Consolidación: '+totalEntrada+' filas -> '+grupos.size+' terceros únicos','o','Consolidación de datos');

      const hdrs=maestro.hdrs;
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
      const cCorreo=siimedCol(hdrs,'CORREO ELECTRONICO');
      const cEstado=siimedCol(hdrs,'ESTADO');
      const cForma=siimedCol(hdrs,'FORMA DE PAGO');
      const cLista=siimedCol(hdrs,'LISTA DE PRECIOS');
      const cDescuento=siimedCol(hdrs,'PORCENTAJE DESCUENTO');
      const cCupo=siimedCol(hdrs,'CUPO CREDITO');
      const cPeriodo=siimedCol(hdrs,'PERÍODO PAGO');
      const cCodAct=siimedCol(hdrs,'CODIGO DE ACTIVIDAD ECONOMICA');
      // Si el archivo NO trae ninguna de las 4 columnas de nombre
      // separado, se usa como respaldo la separación automática de
      // NOMBRE (misma lógica que terceros_siigo_nube_to_wo_cloud.js).
      const tieneColsNombreSep = (cP1>=0 || cP2>=0 || cA1>=0 || cA2>=0);

      const filtered=[], nitExcluidos=[]; let empleadosExcluidos=0;
      for(const [id, g] of grupos){
        const r=g.row;
        if(NITS_EXCLUIR.has(id)){
          nitExcluidos.push({id, nombre:String(r[cNom]||'').trim()});
          continue;
        }
        if(g.roles.has('Empleado')){ empleadosExcluidos++; continue; }
        filtered.push({id, row:r, roles:g.roles});
      }
      if(nitExcluidos.length>0) siimedCldLog('   '+nitExcluidos.length+' NITs excluidos (lista predefinida)','w','Consolidación de datos');
      if(empleadosExcluidos>0) siimedCldLog('   '+empleadosExcluidos+' empleados excluidos (no se migran)','w','Consolidación de datos');
      await siimedCldSleep(150); setPStep('ps2','ps don');

      setPStep('ps3','ps act'); setPct(58,'Transformando...');
      const out=[]; let warns=0, errCount=0; const defaultsLog=[]; let emailsDefault=0;
      filtered.forEach(({id, row:r, roles})=>{
        let tipoId = siimedMapTipoIdCld(r[cTribu], id);

        // ── Validación NIT: si el Tipo Identificación resuelve a NIT,
        //    solo se conserva como NIT cuando el número de identificación
        //    tiene EXACTAMENTE 9 dígitos (regla del usuario). Si no
        //    cumple, se reclasifica como Cédula de ciudadanía. ────────
        let nitReclasificado = false;
        if(tipoId === 'NIT'){
          const idDigitos = String(id).replace(/\D/g,'');
          if(idDigitos.length !== 9){
            tipoId = 'Cédula de ciudadanía';
            nitReclasificado = true;
          }
        }

        // ── esJuridica decide cómo se arma el nombre: NIT → Razón
        //    Social completa (columna NOMBRE); los 6 tipos de persona
        //    natural (CC, TI, CE, Registro Civil, Pasaporte, TE) →
        //    nombre separado. Cualquier otro tipo (Documento de
        //    Identificación Extranjero, Permiso Especial de
        //    Permanencia, etc.) usa "TIPO PERSONA JURIDICA" como
        //    respaldo, igual que antes. ───────────────────────────────
        let esJuridica;
        if(tipoId === 'NIT'){
          esJuridica = true;
        } else if(SIIMED_TIPOS_PERSONA_NATURAL_CLD.has(tipoId)){
          esJuridica = false;
        } else {
          esJuridica = String(r[cPersJur]||'').trim().toLowerCase()==='juridica';
        }

        const municipioRaw=r[cCiudad], direccionRaw=r[cDireccion];
        const tel1=r[cTel1], tel2=r[cTel2], tel3=r[cTel3];
        const telPrincipal = tel1 || tel2 || tel3;
        const ciudad = siimedNormCiudadCloud(municipioRaw);
        const dir = normAddr(direccionRaw);
        const telefono = normTel(telPrincipal) || '3000000000';

        const estadoNum = Number(r[cEstado]);
        const activo = estadoNum===0 ? 'No' : 'Si';

        let p1='',p2='',a1='',a2='';
        if(esJuridica){
          p1 = siimedCleanTxt(r[cNom]);
        } else if(tieneColsNombreSep){
          p1 = siimedCleanTxt(r[cP1]);
          p2 = siimedCleanTxt(r[cP2]);
          a1 = siimedCleanTxt(r[cA1]);
          a2 = siimedCleanTxt(r[cA2]);
          if(!p1 && !a1){
            // Columnas de nombre separado vacías en esta fila puntual:
            // se separa NOMBRE con la misma lógica de Siigo Cloud.
            const partes = tercSplitName(r[cNom], tipoId);
            p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
          }
        } else {
          // El archivo no trae columnas de nombre separado — se separa
          // NOMBRE con tercSplitName() (misma lógica que
          // terceros_siigo_nube_to_wo_cloud.js usa para dividir un
          // nombre completo en Nombre/Apellidos).
          const partes = tercSplitName(r[cNom], tipoId);
          p1=partes.p1; p2=partes.p2; a1=partes.a1; a2=partes.a2;
        }

        if(!municipioRaw) defaultsLog.push({id,nombre:p1,campo:'Ciudad Identificacion / Ciudad Direccion',valor_aplicado:'Bogotá, D.C.',motivo:'Campo vacío en origen'});
        if(!direccionRaw || String(direccionRaw).length<3) defaultsLog.push({id,nombre:p1,campo:'Direccion',valor_aplicado:'DIRECCION NO INFORMADA',motivo:'Campo vacío en origen'});
        if(!telPrincipal) defaultsLog.push({id,nombre:p1,campo:'Telefonos',valor_aplicado:'3000000000',motivo:'Campo vacío en origen'});
        if(!r[cTribu]) defaultsLog.push({id,nombre:p1,campo:'Tipo Identificacion',valor_aplicado:tipoId,motivo:'Identificación Tributaria vacía en origen — se infiere por longitud del número'});
        if(nitReclasificado) defaultsLog.push({id,nombre:p1,campo:'Tipo Identificacion',valor_aplicado:'Cédula de ciudadanía',motivo:'Venía como NIT pero el número de identificación no tiene 9 dígitos — se reclasificó como Cédula de ciudadanía'});
        if(!esJuridica && !a1) warns++;

        let esC=roles.has('Cliente'), esP=roles.has('Proveedor');
        if(!esC && !esP){ esC=true; esP=true; }
        let tipoTercero='Cliente,Proveedor';
        if(esC && esP) tipoTercero='Cliente,Proveedor';
        else if(esC) tipoTercero='Cliente';
        else if(esP) tipoTercero='Proveedor';

        const cupoNum = Number(r[cCupo])||0;

        const correoOrigen = (cCorreo>=0 && r[cCorreo]) ? String(r[cCorreo]).trim() : '';
        let email;
        if(correoOrigen){
          email = correoOrigen;
        } else if(emailMode==='default' && emailDefault){
          email = emailDefault;
          emailsDefault++;
          defaultsLog.push({id,nombre:p1,campo:'Email',valor_aplicado:emailDefault,motivo:'Correo vacío en origen — se aplicó el correo predeterminado indicado por el usuario'});
        } else {
          email = null;
        }

        const formaPagoNombre = siimedNormFormaPago(cForma>=0 ? r[cForma] : '');
        const periodoMatch = cPeriodo>=0 ? String(r[cPeriodo]??'').match(/\d+/) : null;
        const ciudadFinal = siimedNormCiudadCloudExtra(ciudad);
        const plazoDias = periodoMatch ? Number(periodoMatch[0]) : 0;

        out.push({
          'Tipo Identificacion *': tipoId,
          'Identificacion *': siimedIdNum(id),
          'Ciudad Identificacion*': ciudadFinal,
          'Primer Nombre o Razon Social*': p1,
          'Segundo Nombre': p2||null,
          'Primer Apellido *': a1||null,
          'Segundo Apellido': a2||null,
          'Tipo Tercero *': tipoTercero,
          'Codigo': null,
          'Activo': activo,
          'Actividad Economica': siimedActEconCld(cCodAct>=0 ? r[cCodAct] : null),
          'Tipo Contribuyente *': siimedTipoContribCld(r[cClasifTrib], esJuridica),
          'Clasi. Administrador Impuesto *': 'Normal',
          'Excepcion Impuesto': null,
          'Tarifa Reteica Compras': 9.66,
          'Aplica Reteica Ventas': null,
          'Maneja Cupo Credito': cupoNum>0 ? 'Si' : null,
          'Vendedor': null,
          'Lista Precios': (cLista>=0 && r[cLista] && String(r[cLista]).trim()) ? String(r[cLista]).trim() : null,
          'Forma Pago': formaPagoNombre || null,
          'Plazo Dias': plazoDias,
          'Porcentaje Descuento': (cDescuento>=0 && r[cDescuento]) ? Number(r[cDescuento])||null : null,
          'Tipo Direccion *': esJuridica ? 'Empresa/Oficina' : 'Casa',
          'Nombre Direccion *': 'Principal',
          'Direccion *': dir,
          'Telefonos *': telefono,
          'Email *': email,
          'Ciudad Direccion *': ciudadFinal,
          'Zona': null,'Barrio': null
        });
      });
      siimedCldLog('Transformación: '+out.length+' registros, 30 campos','o','Transformación de datos');
      if(warns>0) siimedCldLog('   '+warns+' personas naturales sin apellido','w','Transformación de datos');
      if(emailsDefault>0) siimedCldLog('   '+emailsDefault+' correos completados con el valor predeterminado','i','Transformación de datos');
      await siimedCldSleep(150); setPStep('ps3','ps don');

      setPStep('ps4','ps act'); setPct(74,'Validando...');
      out.forEach(r=>{ if(!r['Tipo Identificacion *']||!r['Identificacion *']||!r['Primer Nombre o Razon Social*']) errCount++; });
      siimedCldLog('Validación: '+errCount+' errores, '+warns+' advertencias','o','Validación de datos');
      await siimedCldSleep(120); setPStep('ps4','ps don');

      setPStep('ps5','ps act'); setPct(88,'Generando Excel...');
      siimedCldLog('Generando Excel con plantilla WO Cloud','i','Escritura de archivo');
      const _stats={archivos_entrada:1, registros_entrada:totalEntrada, registros_consolidados:filtered.length,
        registros_transformados:out.length, errores:errCount, warnings:warns};
      SIIMED_CLD_WB = buildWB(out, SIIMED_CLD_LOG, _stats, [], new Set(), defaultsLog, nitExcluidos);
      siimedCldAppendFormaPagoSheet(SIIMED_CLD_WB, formaList, formaPagoCfg);
      const dur=((Date.now()-t0)/1000).toFixed(1);
      siimedCldLog('Excel generado en '+dur+'s','o','Escritura de archivo');
      siimedCldLog('PIPELINE COMPLETADO | '+out.length+' terceros migrados','o',null);
      setPStep('ps5','ps don'); setPct(100,'Completado');
      await siimedCldSleep(300);

      const fn = siimedCldBuildFN();
      const dlFnEl=document.getElementById('dl-fn'); if(dlFnEl) dlFnEl.textContent=fn;
      const dlMeta=document.getElementById('dl-meta'); if(dlMeta) dlMeta.textContent='Excel - '+out.length+' registros - WO Cloud';
      const lbl=document.getElementById('dl-dest-label'); if(lbl) lbl.textContent='Para importar en World Office Cloud';
      const rsub=document.getElementById('rsub'); if(rsub) rsub.textContent='SIIMED ERP -> World Office Cloud - Terceros - '+dur+'s';
      const stIn=document.getElementById('st-in'); if(stIn) stIn.textContent=out.length.toLocaleString('es-CO');
      const stOk=document.getElementById('st-ok'); if(stOk) stOk.textContent=(out.length-errCount).toLocaleString('es-CO');
      const stW=document.getElementById('st-w'); if(stW) stW.textContent=(warns+errCount);
      const stT=document.getElementById('st-t'); if(stT) stT.textContent=dur;
      const rlog=document.getElementById('rlog'); const logp=document.getElementById('logp');
      if(rlog && logp) rlog.innerHTML=logp.innerHTML;
      setStep(4);

      try{
        await logMigrationToBackend({
          filename_out:fn, orig_soft:'SIIMED ERP', dest_soft:'World Office Cloud',
          module:'Terceros', records_in:totalEntrada, records_out:out.length,
          errors:errCount, warnings:warns, duration_sec:parseFloat(dur), status:'completed'
        });
      }catch(e){}
    }catch(err){
      siimedCldLog('ERROR: '+err.message,'e',null);
      console.error(err);
      setStep(2);
      const a2m=document.getElementById('a2m'); const a2=document.getElementById('a2');
      if(a2m) a2m.textContent='Error en pipeline: '+err.message;
      if(a2) a2.classList.remove('hide');
    }
  }

  function siimedCldBuildFN(){
    const now=new Date();
    const p=x=>String(x).padStart(2,'0');
    const ts=now.getFullYear()+'_'+p(now.getMonth()+1)+'_'+p(now.getDate());
    return 'terceros_siimed_erp_wo_cloud_'+ts+'.xlsx';
  }

  function siimedCldDoDownload(){
    if(!SIIMED_CLD_WB){ alert('Primero ejecuta la migracion.'); return; }
    XLSX.writeFile(SIIMED_CLD_WB, (document.getElementById('dl-fn')||{}).textContent || siimedCldBuildFN());
  }

  // ══════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════
  function siimedCldInstall(){
    const sorigEl = document.getElementById('sorig');
    const s2card = document.querySelector('#s2 .card');
    if(!sorigEl || !s2card) return;

    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

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
      SIIMED_CLD_S.file = f;
    };
    if(window.__SIIMED_S.file) SIIMED_CLD_S.file = window.__SIIMED_S.file;

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

    // routeETL(): solo intercepta SIIMED ERP → World Office Cloud
    const _origRouteETL = window.routeETL;
    window.routeETL = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Cloud'){
        startSiimedCldETL();
        return;
      }
      if(typeof _origRouteETL === 'function') _origRouteETL();
    };

    const _origRouteDownload = window.routeDownload;
    window.routeDownload = function(){
      const orig = (document.getElementById('sorig')||{}).value;
      const dest = (document.getElementById('sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Cloud'){ siimedCldDoDownload(); return; }
      if(typeof _origRouteDownload === 'function') _origRouteDownload();
    };

    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'terceros'){
        SIIMED_CLD_S.file = null;
        if(window.__SIIMED_S) window.__SIIMED_S.file = null;
        const slot=document.getElementById('sl-siimed'); if(slot) slot.className='fslot';
        const nm=document.getElementById('nm-siimed'); if(nm) nm.textContent='';
        const inp=document.getElementById('f-siimed'); if(inp) inp.value='';
        siimedToggle();
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', siimedCldInstall);
  } else {
    siimedCldInstall();
  }

})();