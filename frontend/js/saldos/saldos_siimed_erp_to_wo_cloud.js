// ══════════════════════════════════════════════════════════════════
// ETL: Saldos Iniciales Contables — SIIMED ERP → World Office Cloud
// Módulo: saldos_siimed_erp_to_wo_cloud.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// Se conecta a la página en tiempo de ejecución (inyecta la opción
// "SIIMED ERP" en el selector de origen de Saldos, agrega sus propios
// slots de archivo, y "envuelve" routeSalETL()/routeSalDownload()/
// showPg() para interceptar el flujo solo cuando el origen elegido es
// "SIIMED ERP" y el destino "World Office Cloud". Cuando el destino
// es "World Office Escritorio" deja pasar hacia
// saldos_siimed_erp_to_wo_escritorio.js (archivo hermano, sin lógica
// compartida entre ambos salvo el Balance de Prueba por Tercero).
//
// AUTOCONTENIDO: este archivo NO depende de ningún helper definido en
// otro módulo.
//
// LÓGICA DE CLASIFICACIÓN BASE (idéntica a la versión anterior —
// ver saldos_siimed_erp_to_wo_escritorio.js para el detalle completo
// de cómo se interpreta el árbol jerárquico del Balance de Prueba por
// Tercero de SIIMED: exclusión de cuentas padre, exclusión de filas
// "header" que se desglosan por tercero, inclusión de leaves sin
// tercero con el NIT de la empresa, saldo positivo→Débito / negativo
// →Crédito). Validada contra el archivo real: Débitos = Créditos
// exacto.
//
// NUEVO EN ESTA VERSIÓN (solo World Office Cloud, a pedido explícito
// del usuario — NO se aplica a la versión Escritorio):
//
//   1) Plan de Cuentas (PUC) de destino EMBEBIDO directamente en este
//      archivo (constante SAL_SIIMED_CLD_PUC_DATA, más abajo) — NO se
//      carga como archivo cada vez que se corre una migración. Es
//      "la base" contra la que se valida todo el resultado. Para
//      actualizar el PUC, se reemplaza esa constante con una nueva
//      extracción de la tabla cuenta_contable de World Office Cloud
//      (columnas "codigo"/"nombre").
//
//   2) Antes de generar el Excel, para cada cuenta que EMPIEZA CON
//      "11" (Disponible) y que en el Balance de SIIMED viene
//      desglosada por tercero, se pregunta — una por una, no en
//      bloque — si esa cuenta requiere manejo de tercero en el
//      destino. Se abre predeterminado en "No": si se deja así, se
//      agrupan (suman) todos los movimientos de esa cuenta en un
//      solo registro a nombre del NIT de la empresa. Si se marca
//      "Sí", se conservan los registros individuales por tercero tal
//      como ya se hacía.
//
//   3) Con el resultado ya definido, se cruza cada código de cuenta
//      contra el PUC embebido. Las cuentas que SÍ existen pasan
//      igual. Las que NO existen se listan con un checkbox "Dejar
//      cuenta original" (marcado por defecto, dado que puede haber
//      muchas): si se deja marcado, la cuenta no cambia; si se
//      desmarca, se habilita un campo de texto (con sugerencias del
//      propio PUC embebido) para indicar la cuenta a usar en su
//      reemplazo.
//
//   4) El Excel final incluye una hoja adicional "Mapeo de Cuentas"
//      con: Cuenta Original, Cuenta Mapeada, y si esa cuenta Existe
//      en el PUC embebido o es Nueva.
// ══════════════════════════════════════════════════════════════════

(function(){
  'use strict';

  // ── Estado propio ──────────────────────────────────────────────
  const SAL_SIIMED_CLD_S   = { file: null };
  let   SAL_SIIMED_CLD_WB  = null;
  const SAL_SIIMED_CLD_LOG  = [];
  const SAL_SIIMED_CLD_EXCL = [];

  // ── Columnas destino (Plantilla WO Cloud — hoja Contabilidad) ─────
  const SAL_SIIMED_CLD_COLS = [
    'Cuenta *','Concepto','Tercero *','Débito *','Crédito *',
    'Centro costos','Fecha de Vencimiento *','Base Ret','% Ret','Vendedor ','Cuentas Originales'
  ];

  // ── Plan de Cuentas (PUC) de World Office Cloud — EMBEBIDO ────────
  // Extraído de la tabla cuenta_contable (columnas codigo/nombre).
  // Para actualizarlo, reemplazar este arreglo completo por una nueva
  // extracción (no se carga como archivo en cada migración).
  const SAL_SIIMED_CLD_PUC_DATA = [['1','Activo'],['11','Disponible'],['1105','Caja'],['110505','Caja general'],['11050501','Caja general'],['110510','Cajas menores'],['1110','Bancos'],['111005','Moneda nacional'],
['11100501','Banco 1'],['11100502','Banco 2'],['11100503','Banco 3'],['1120','Cuentas de ahorro'],['112005','Bancos'],['11200501','Bancos 1'],['11200502','Bancos 2'],['11200503','Bancos 3'],
['112010','Corporaciones de ahorro y vivienda'],['12','Inversiones'],['1215','Bonos'],['121595','Otros'],['1220','Cédulas'],['122005','Cédulas de capitalización'],['122010','Cédulas hipotecarias'],['122015','Cédulas de inversión'],
['122095','Otras'],['1225','Certificados'],['122505','Certificados de depósito a término (CDT)'],['122510','Certificados de depósito de ahorro'],['122515','Certificados de ahorro de valor constante (CAVC)'],['122525','Certificados cafeteros valorizables'],['122530','Certificados eléctricos valorizables (CEV)'],['122535','Certificados de reembolso tributario (CERT)'],
['122540','Certificados de desarrollo turístico'],['122545','Certificados de inversión forestal (CIF)'],['122595','Otros'],['1230','Papeles comerciales'],['123005','Empresas comerciales'],['123010','Empresas industriales'],['123015','Empresas de servicios'],['1235','Títulos'],
['123505','Títulos de desarrollo agropecuario'],['123510','Títulos canjeables por certificados de cambio'],['123515','Títulos de tesorería (TES)'],['123520','Títulos de participación'],['123525','Títulos de crédito de fomento'],['123530','Títulos financieros agroindustriales (TFA)'],['123535','Títulos de ahorro cafetero (TAC)'],['123540','Títulos de ahorro nacional (TAN)'],
['123545','Títulos energéticos de rentabilidad creciente (TER)'],['123550','Títulos de ahorro educativo (TAE)'],['123555','Títulos financieros industriales y comerciales'],['123560','Tesoros'],['123565','Títulos de devolución de impuestos nacionales (TIDIS)'],['123570','Títulos inmobiliarios'],['123595','Otros'],['1240','Aceptaciones bancarias o financieras'],
['124005','Bancos comerciales'],['124010','Compañías de financiamiento comercial'],['124015','Corporaciones financieras'],['124095','Otras'],['1245','Derechos fiduciarios'],['124505','Fideicomisos de inversión moneda nacional'],['124510','Fideicomisos de inversión moneda extranjera'],['1250','Derechos de recompra de inversiones negociadas (repos)'],
['125005','Acciones'],['125010','Cuotas o partes de interés social'],['125015','Bonos'],['125020','Cédulas'],['125025','Certificados'],['125030','Papeles comerciales'],['125035','Títulos'],['125040','Aceptaciones bancarias o financieras'],
['125099','Ajustes por inflación'],['1255','Obligatorias'],['125505','Bonos de financiamiento especial'],['125510','Bonos de financiamiento presupuestal'],['125515','Bonos para desarrollo social y seguridad interna (BDSI)'],['125595','Otras'],['1260','Cuentas en participación'],['126099','Ajustes por inflación'],
['1295','Otras inversiones'],['129505','Aportes en cooperativas'],['129510','Derechos en clubes sociales'],['129515','Acciones o derechos en clubes deportivos'],['129520','Bonos en colegios'],['129595','Diversas'],['129599','Ajustes por inflación'],['1299','Provisiones'],
['129905','Acciones'],['129910','Cuotas o partes de interés social'],['129915','Bonos'],['129920','Cédulas'],['129925','Certificados'],['129930','Papeles comerciales'],['129935','Titulos'],['129940','Aceptaciones bancarias o financieras'],
['129945','Derechos fiduciarios'],['129950','Derechos de recompra de inversiones negociadas'],['129955','Obligatorias'],['129960','Cuentas en participación'],['129995','Otras inversiones'],['13','Deudores'],['1305','Clientes'],['130505','Nacionales'],
['13050501','Deudores nacionales'],['13050502','Clientes remisiones'],['130510','Del exterior'],['13051001','Clientes del exterior'],['130515','Deudores del sistema'],['1310','Cuentas corrientes comerciales'],['131005','Casa matriz'],['131010','Compañías vinculadas'],
['131015','Accionistas o socios'],['131020','Particulares'],['131095','Otras'],['1315','Cuentas por cobrar a casa matriz'],['131505','Ventas'],['131510','Pagos a nombre de casa matriz'],['131515','Valores recibidos por casa matriz'],['131520','Préstamos'],
['1320','Cuentas por cobrar a vinculados económicos'],['132005','Filiales'],['132010','Subsidiarias'],['132015','Sucursales'],['1325','Cuentas por cobrar a socios y accionistas'],['132505','Cuentas por cobrar a socios'],['132510','A accionistas'],['1328','Aportes por cobrar'],
['1330','Anticipos y avances'],['133005','A proveedores'],['133010','A contratistas'],['133015','A trabajadores'],['133020','A agentes'],['133025','A concesionarios'],['133030','De adjudicaciones'],['133095','Otros'],
['1332','Cuentas de operación conjunta'],['1335','Depósitos'],['133505','Para importaciones'],['133510','Para servicios'],['133515','Para contratos'],['133520','Para responsabilidades'],['133525','Para juicios ejecutivos'],['133530','Para adquisición de acciones, cuotas o derechos sociales'],
['133535','En garantía'],['133595','Otros'],['1340','Promesas de compra venta'],['134005','De bienes raíces'],['134010','De maquinaria y equipo'],['134015','De flota y equipo de transporte'],['134020','De flota y equipo aéreo'],['134025','De flota y equipo férreo'],
['134030','De flota y equipo fluvial y/o marítimo'],['134035','De semovientes'],['134095','De otros bienes'],['1345','Ingresos por cobrar'],['134505','Dividendos y/o participaciones'],['134510','Intereses'],['134515','Comisiones'],['134520','Honorarios'],
['134525','Servicios'],['134530','Arrendamientos'],['134535','CERT por cobrar'],['134595','Otros'],['1350','Retención sobre contratos'],['135005','De construcción'],['135010','De prestación de servicios'],['135095','Otros'],
['1355','Anticipo de impuestos y contribuciones o saldos a favor'],['135505','Anticipo de impuestos de renta y complementarios'],['135510','Anticipo de impuestos de industria y comercio'],['135515','Retención en la fuente'],['13551501','Retención débito por ventas de productos'],['13551502','Retención débito por venta de servicios'],['13551503','Retención en la fuente por venta de servicios profesionales'],['13551504','Retención en la fuente por venta de servicios de vigilancia'],
['13551505','Retención en la fuente por venta de servicios de transporte'],['13551506','Retención en la fuente servicio de obra'],['13551507','Retención en la fuente servicio de alquiler bienes muebles 4%'],['13551508','Retención en la fuente servicios de restaurante 3,5%'],['13551509','Retención en la fuente arrendamiento bienes inmuebles'],['13551510','Retención en la fuente tarjetas crédito y débito 1,5%'],['13551511','Autorretención renta'],['135517','Impuesto a las ventas retenido'],
['13551701','Retención de IVA por venta de productos'],['13551702','Retención de IVA por venta de servicios'],['13551703','Retención de IVA venta de servicios profesionales'],['13551704','Retención de IVA venta de servicios de vigilancia'],['13551705','Retención de IVA utilidad servicios de obra'],['13551706','Retención IVA tarjetas de crédito y débito ventas'],['13551707','Retención IVA tarjetas de crédito y débito servicios'],['135518','Impuesto de industria y comercio retenido'],
['13551801','Retención de ICA por venta de productos'],['13551802','Retención de ICA por venta de servicios'],['13551803','Retención de ICA venta de servicios profesionales'],['13551804','Retención de ICA venta de servicios de vigilancia'],['13551805','Retención de ICA venta de servicios de transporte'],['13551806','Retención de ICA servicio de construcción'],['13551807','Retención ICA tarjetas de crédito y débito'],['135520','Sobrantes en liquidación privada de impuestos'],
['135525','Contribuciones'],['135530','Impuestos descontables'],['135595','Otros'],['1360','Reclamaciones'],['136005','A compañías aseguradoras'],['136010','A transportadores'],['136015','Por tiquetes aéreos'],['136095','Otras'],
['1365','Cuentas por cobrar a trabajadores'],['136505','Vivienda'],['136510','Vehiculos'],['136515','Educacion'],['136520','Médicos, odontológicos y similares'],['136525','Calamidad domestica'],['136530','Responsabilidades'],['136595','Otros'],
['1370','Préstamos a particulares'],['137005','Con garantía real'],['137010','Con garantía personal'],['1380','Deudores varios'],['138005','Depositarios'],['138010','Comisionistas de bolsas'],['138015','Fondo de inversión'],['138020','Cuentas por cobrar de terceros'],
['138025','Pagos por cuenta de terceros'],['138030','Fondos de inversión social'],['138035','Incapacidades y Licencias por Cobrar'],['13803501','Incapacidades y Licencias por Cobrar a la EPS'],['13803502','Incapacidades y Licencias por Cobrar a la ARL'],['138095','Otros'],['1385','Derechos de recompra de cartera negociada'],['1390','Deudas de difícil cobro'],
['1399','Provisiones'],['139905','Clientes'],['139910','Cuentas corrientes comerciales'],['139915','Cuentas por cobrar a casa matriz'],['139920','Cuentas por cobrar a vinculados económicos'],['139925','Cuentas por cobrar a socios y accionistas'],['139930','Anticipos y avances'],['139932','Cuentas de operación conjunta'],
['139935','Depósitos'],['139940','Promesas de compraventa'],['139945','Ingresos por cobrar'],['139950','Retención sobre contratos'],['139955','Reclamaciones'],['139960','Cuentas por cobrar a trabajadores'],['139965','Préstamos a particulares'],['139975','Deudores varios'],
['139980','Derechos de recompra de cartera negociada'],['14','Inventarios'],['1405','Materias primas'],['1410','Productos en proceso'],['141001','Productos en proceso'],['141099','Ajustes por inflación'],['1415','Obras de construcción en curso'],['141599','Ajustes por inflación'],
['1417','Obras de urbanismo'],['141799','Ajustes por inflación'],['1420','Contratos en ejecución'],['142099','Ajustes por inflación'],['1425','Cultivos en desarrollo'],['142599','Ajustes por inflación'],['1430','Productos terminados'],['1435','Mercancías no fabricadas por la empresa'],
['1440','Bienes raíces para la venta'],['144099','Ajustes por inflación'],['1445','Semovientes'],['144505','Especies mayores'],['144510','Especies menores'],['144599','Ajustes por inflación'],['1450','Terrenos'],['145005','Por urbanizar'],
['145010','Urbanizados por construir'],['145099','Ajustes por inflación'],['1455','Materiales, repuestos y accesorios'],['145505','Combustibles y lubricantes'],['145510','Abonos y fertilizantes'],['145515','Semillas terminadas'],['145520','Fungicidas y herbicidas'],['145525','Materiales y repuestos'],
['145530','Loza y cristalería'],['145535','Herramientas'],['145540','Medicinas'],['145545','Elementos hospitalarios'],['145550','Instrumental quirúrgico'],['145555','Dotación y suministro a trabajadores'],['145560','Elementos de ropería y lencería'],['145595','Otros'],
['145599','Ajustes por inflación'],['1460','Envases y empaques'],['146099','Ajustes por inflación'],['1465','Inventarios en transito'],['146520','Inventarios en transito'],['146599','Ajustes por inflación'],['1499','Provisiones'],['149905','Para obsolescencia'],
['149910','Para diferencia de inventario físico'],['149915','Para perdidas de inventarios'],['149920','Lifo'],['15','Propiedades planta y equipo'],['1504','Terrenos'],['150405','Urbanos'],['150410','Rurales'],['150499','Ajustes por inflación'],
['1506','Materiales proyectos petroleros'],['150605','Tuberías y equipo'],['150610','Costos de importación materiales'],['150615','Proyectos de construcción'],['150699','Ajustes por inflación'],['1508','Construcciones en curso'],['150805','Construcciones y edificaciones'],['150810','Acueductos plantas y redes'],
['150815','Vías de comunicación'],['150820','Pozos artesianos'],['150825','Proyectos de exploración'],['150830','Proyectos de desarrollo'],['150899','Ajustes por inflación'],['1512','Maquinaria y equipos en montaje'],['151205','Maquinaria y equipo'],['151210','Equipo de oficina'],
['151215','Equipo de computación y comunicación'],['151220','Equipo medico-científico'],['151225','Equipo de hoteles y restaurantes'],['151230','Flota y equipo de transporte'],['151235','Flota y equipo fluvial y/o marítimo'],['151240','Flota y equipo aéreo'],['151245','Flota y equipo férreo'],['151250','Plantas y redes'],
['151299','Ajustes por inflación'],['1516','Construcciones y edificaciones'],['151605','Edificios'],['151610','Oficinas'],['151615','Almacenes'],['151620','Fabricas y plantas industriales'],['151625','Salas de exhibición y ventas'],['151630','Cafetería y casinos'],
['151635','Silos'],['151640','Invernaderos'],['151645','Casetas y campamentos'],['151650','Instalaciones agropecuarias'],['151655','Viviendas para empleados y obreros'],['151660','Terminal de buses y taxis'],['151663','Terminal marítimo'],['151665','Terminal férreo'],
['151670','Parqueaderos, garajes y depósitos'],['151675','Hangares'],['151680','Bodegas'],['151695','Otros'],['151699','Ajustes por inflación'],['1520','Maquinaria y equipo'],['152005','Maquinaria y equipo'],['152099','Ajustes por inflación'],
['1524','Equipo de oficina'],['152405','Muebles y enseres'],['152410','Equipos'],['152495','Otros'],['152499','Ajustes por inflación'],['1528','Equipo de computación y comunicación'],['152805','Equipos de procesamiento de datos'],['152810','Equipos de telecomunicaciones'],
['152815','Equipos de radio'],['152820','Satélites y antenas'],['152825','Líneas telefónicas'],['152895','Otros'],['152899','Ajustes por inflación'],['1532','Equipo médico-científico'],['153205','Medico'],['153210','Odontologico'],
['153215','Laboratorio'],['153220','Instrumental'],['153295','Otros'],['153299','Ajustes por inflación'],['1536','Equipo de hoteles y restaurantes'],['153605','De habitaciones'],['153610','De comestibles y bebidas'],['153695','Otros'],
['153699','Ajustes por inflación'],['1540','Flota y equipo de transporte'],['154005','Autos, camionetas y camperos'],['154008','Camiones, volquetas y furgones'],['154010','Tractomulas y remolques'],['154015','Buses y busetas'],['154017','Recolectores y contenedores'],['154020','Montacargas'],
['154025','Palas y grúas'],['154030','Motocicletas'],['154035','Bicicletas'],['154040','Estibas y carretas'],['154045','Bandas transportadoras'],['154095','Otros'],['154099','Ajustes por inflación'],['1544','Flota y equipo fluvial y/o marítimo'],
['154405','Buques'],['154410','Lanchas'],['154415','Remolcadoras'],['154420','Botes'],['154425','Boyas'],['154430','Amarres'],['154435','Contenedores y chasises'],['154440','Gabarras'],
['154495','Otros'],['154499','Ajustes por inflación'],['1548','Flota y equipo aéreo'],['154805','Aviones'],['154810','Avionetas'],['154815','Helicópteros'],['154820','Turbinas Y motores'],['154825','Manuales de entrenamiento personal técnico'],
['154830','Equipos de vuelo'],['154895','Otros'],['154899','Ajustes por inflación'],['1552','Flota y equipo férreo'],['155205','Locomotoras'],['155210','Vagones'],['155215','Redes férreas'],['155295','Otros'],
['155299','Ajustes por inflación'],['1556','Acueductos plantas y redes'],['155605','Instalaciones para agua y energía'],['155610','Acueducto acequias y canalizaciones'],['155615','Plantas de generación hidráulica'],['155620','Plantas de generación térmica'],['155625','Plantas de generación a gas'],['155628','Plantas de generación Diesel, gasolina y petróleo'],
['155630','Plantas de distribución'],['155635','Plantas de transmisión y subestaciones'],['155640','Oleoductos'],['155645','Gasoductos'],['155647','Poliductos'],['155650','Redes de distribución'],['155655','Plantas de tratamiento'],['155660','Redes de recolección de aguas negras'],
['155665','Instalaciones y equipo de bombeo'],['155670','Redes de distribución de vapor'],['155675','Redes de aire'],['155680','Redes alimentación de gas'],['155682','Redes externas de telefonía'],['155685','Plantas deshidratadoras'],['155695','Otros'],['155699','Ajustes por inflación'],
['1560','Armamento de vigilancia'],['156005','Armamento de vigilancia'],['156099','Ajustes por inflación'],['1562','Envases y empaques'],['156205','Envases y empaques'],['156299','Ajustes por inflación'],['1564','Plantaciones agrícolas y forestales'],['156405','Cultivos en desarrollo'],
['156410','Cultivos amortizables'],['156499','Ajustes por inflación'],['1568','Vías de comunicación'],['156805','Pavimentación y patios'],['156810','Vias'],['156815','Puentes'],['156820','Calles'],['156825','Aeródromos'],
['156895','Otros'],['156899','Ajustes por inflación'],['1572','Minas y canteras'],['157205','Minas'],['157210','Canteras'],['157299','Ajustes por inflación'],['1576','Pozos artesianos'],['157699','Ajustes por inflación'],
['1580','Yacimientos'],['158099','Ajustes por inflación'],['1584','Semovientes'],['158405','Especies menores'],['158410','Especies mayores'],['158499','Ajustes por inflación'],['1588','Propiedades planta y equipo en transito'],['158805','Maquinaria y equipo'],
['158810','Equipo de oficina'],['158815','Equipo de computación y comunicación'],['158820','Equipo medico científico'],['158825','Equipo de hoteles y restaurantes'],['158830','Flota y equipo de transporte'],['158835','Flota y equipo fluvial y/o marítimo'],['158840','Flota y equipo aéreo'],['158845','Flota y equipo férreo'],
['158850','Plantas y redes'],['158855','Armamento de vigilancia'],['158860','Semovientes'],['158865','Envases y empaques'],['158899','Ajustes por inflación'],['1592','Depreciación acumulada'],['159205','Construcciones y edificaciones'],['159210','Maquinaria y equipo'],
['159215','Equipo de oficina'],['159220','Equipo de computación y comunicación'],['159225','Equipo medico científico'],['159230','Equipo de hoteles y restaurantes'],['159235','Flota y equipo de transporte'],['159240','Flota y equipo fluvial y/o marítimo'],['159245','Flota y equipo aéreo'],['159250','Flota y equipo férreo'],
['159255','Acueductos plantas y redes'],['159260','Armamento de vigilancia'],['159265','Envases y empaques'],['159299','Ajustes por inflación'],['15929901','Maquinaria y equipo'],['15929902','Construcciones y edificaciones'],['15929903','Equipo de computación y comunicación'],['15929904','Equipo de oficina'],
['15929905','Equipo de transporte'],['15929906','Equipo medico científico'],['15929907','Equipo de hoteles y restaurantes'],['15929908','Flota y equipo fluvial y marítimo'],['15929909','Flota y equipo aéreo'],['15929910','Equipo férreo'],['15929911','Acueductos plantas y redes'],['15929912','Armamento de vigilancia'],
['1596','Depreciación diferida'],['159605','Exceso fiscal sobre la contable'],['159610','Defecto fiscal sobre la contable (Cr)'],['159699','Ajustes por inflación'],['1597','Amortización acumulada'],['159705','Plantaciones agrícolas y forestales'],['159710','Vías de comunicación'],['159715','Semovientes'],
['159799','Ajustes por inflación'],['1598','Agotamiento acumulado'],['159805','Minas y canteras'],['159815','Pozos artesianos'],['159820','Yacimientos'],['159899','Ajustes por inflación'],['1599','Provisiones'],['159904','Terrenos'],
['159906','Materiales proyectos petroleros'],['159908','Construcciones en curso'],['159912','Maquinaria en montaje'],['159916','Construcciones y edificaciones'],['159920','Maquinaria y equipo'],['159924','Equipo de oficina'],['159928','Equipo de computación y comunicación'],['159932','Equipo medico científico'],
['159936','Equipo de hoteles y restaurantes'],['159940','Flota y equipo de transporte'],['159944','Flota y equipo fluvial y/o marítimo'],['159948','Flota y equipo aéreo'],['159952','Flota y equipo férreo'],['159956','Acueductos, plantas y redes'],['159960','Armamento de vigilancia'],['159962','Envases y empaques'],
['159964','Plantaciones agrícolas y forestales'],['159968','Vías de comunicación'],['159972','Minas y canteras'],['159980','Pozos artesianos'],['159984','Yacimientos'],['159988','Semovientes'],['159992','Propiedades planta y equipo en transito'],['16','Intangibles'],
['1605','Crédito mercantil'],['160505','Formado o estimado'],['160510','Adquirido o comprado'],['160599','Ajustes por inflación'],['1610','Marcas'],['161005','Adquiridas'],['161010','Formadas'],['161099','Ajustes por inflación'],
['1615','Patentes'],['161505','Adquiridas'],['161510','Formadas'],['161599','Ajustes por inflación'],['1620','Concesiones y franquicias'],['162005','Concesiones'],['162010','Franquicias'],['162099','Ajustes por inflación'],
['1625','Derechos'],['162505','Derechos de autor'],['162510','Puesto de bolsa'],['162515','En fideicomisos inmobiliarios'],['162520','En fideicomisos de garantía'],['162525','En fideicomisos de administración'],['162535','En bienes recibidos en arrendamiento financiero (leasing)'],['162595','Otros'],
['162599','Ajustes por inflación'],['1630','Know How'],['163099','Ajustes por inflación'],['1635','Licencias'],['163599','Ajustes por inflación'],['1698','Amortización acumulada'],['169805','Crédito mercantil'],['169810','Marcas'],
['169815','Patentes'],['169820','Concesiones y franquicias'],['169830','Derechos'],['169835','Know How'],['169840','Licencias'],['169899','Ajustes por inflación'],['1699','Provisiones'],['17','Diferidos'],
['1705','Gastos pagados por anticipado'],['170505','Intereses'],['170510','Honorarios'],['170515','Comisiones'],['170520','Seguros y fianzas'],['170525','Arrendamientos'],['170530','Bodegajes'],['170535','Mantenimiento equipos'],
['170540','Servicios'],['170545','Suscripciones'],['170595','Otros'],['1710','Cargos diferidos'],['171004','Organización y preoperativos'],['171008','Remodelaciones'],['171012','Estudios, investigaciones y proyectos'],['171016','Programas para computador (software)'],
['171020','Útiles y papelería'],['171024','Mejoras a propiedades ajenas'],['171028','Contribuciones y afiliaciones'],['171032','Entrenamiento de personal'],['171036','Ferias y exposiciones'],['171040','Licencias'],['171044','Publicidad, propaganda y avisos'],['171048','Elementos de aseo y cafetería'],
['171052','Moldes y troqueles'],['171056','Instrumental quirúrgico'],['171060','Dotación y suministro a trabajadores'],['171064','Elementos de ropería y lencería'],['171068','Loza y cristalería'],['171072','Descuento en colocación de bonos'],['171076','Impuesto de renta diferido? débitos?  por diferencias temporales'],['171080','Concursos y licitaciones'],
['171095','Otros'],['171099','Ajustes por inflación'],['1715','Costos de exploración por amortizar'],['171505','Pozos secos'],['171510','Pozos no comerciales'],['171515','Otros costos de exploración'],['171599','Ajustes por inflación'],['1720','Costos de explotación y desarrollo'],
['172005','Perforación y explotación'],['172010','Perforaciones campos en desarrollo'],['172015','Facilidades de producción'],['172020','Servicio a pozos'],['172099','Ajustes por inflación'],['1730','Cargos por corrección monetaria diferida'],['1798','Amortización acumulada'],['179805','Costos de exploración por amortizar'],
['179810','Costos de explotación y desarrollo'],['179899','Ajustes por inflación'],['18','Otros activos'],['1805','Bienes de arte y cultura'],['180505','Obras de arte'],['180510','Bibliotecas'],['180595','Otros'],['180599','Ajustes por inflación'],
['1895','Diversos'],['189505','Maquinas porteadoras'],['189510','Bienes entregados en comodato'],['189515','Amortización acumulada de bienes entregados en comodato (Cr)'],['189520','Bienes recibidos en pago'],['189525','Derechos sucesorales'],['189530','Estampillas'],['189595','Otros'],
['189599','Ajustes por inflación'],['1899','Provisiones'],['189905','Bienes de arte y cultura'],['189995','Diversos'],['19','Valorizaciones'],['1905','De Inversiones'],['190505','Acciones'],['190510','Cuotas o partes de interés social'],
['190515','Derechos fiduciarios'],['1910','De propiedades planta y equipo'],['191004','Terrenos'],['191006','Materiales proyectos petroleros'],['191008','Construcciones y edificaciones'],['191012','Maquinaria y equipo'],['191016','Equipo de oficina'],['191020','Equipo de computación y comunicación'],
['191024','Equipo medico científico'],['191028','Equipo de hoteles y restaurantes'],['191032','Flota y equipo de transporte'],['191036','Flota y equipo fluvial y/o marítimo'],['191040','Flota y equipo aéreo'],['191044','Flota y equipo férreo'],['191048','Acueductos plantas y redes'],['191052','Armamento de vigilancia'],
['191056','Envases y empaques'],['191060','Plantaciones agrícolas y forestales'],['191064','Vías de comunicación'],['191068','Minas y canteras'],['191072','Pozos artesianos'],['191076','Yacimientos'],['191080','Semovientes'],['1995','De otros activos'],
['199505','Bienes de arte y cultura'],['199510','Bienes entregados en comodato'],['199515','Bienes recibidos en pago'],['199520','Inventario de semovientes'],['2','Pasivo'],['21','Obligaciones financieras'],['2105','Bancos nacionales'],['210505','Sobregiros'],
['210506','Pagarés ley 550'],['210515','Cartas de crédito'],['210520','Aceptaciones bancarias'],['2110','Bancos del exterior'],['211005','Sobregiros'],['211010','Pagarés'],['211015','Cartas de crédito'],['211020','Aceptaciones bancarias'],
['2115','Corporaciones financieras'],['211505','Pagarés'],['211510','Aceptaciones financieras'],['211515','Cartas de crédito'],['211520','Contratos de arrendamiento financiero (Leasing)'],['2120','Compañías de financiamiento comercial'],['212005','Pagarés'],['212010','Aceptaciones financieras'],
['212020','Contratos de arrendamiento financiero (Leasing)'],['2125','Corporaciones de ahorro y vivienda'],['212505','Sobregiros'],['212510','Pagarés'],['212515','Hipotecarias'],['2130','Entidades financieras del exterior'],['2135','Compromisos de recompra de inversiones negociadas'],['213505','Acciones'],
['213510','Cuotas o partes de interés social'],['213515','Bonos'],['213520','Cédulas'],['213525','Certificados'],['213530','Papeles comerciales'],['213535','Títulos'],['213540','Aceptaciones bancarias o financieras'],['213595','Otros'],
['2140','Compromisos de recompra de cartera negociada'],['2145','Obligaciones gubernamentales'],['214505','Gobierno nacional'],['214510','Entidades oficiales'],['2195','Otras obligaciones'],['219506','Particulares ley 550'],['219510','Compañías vinculadas'],['219515','Casa matriz'],
['219520','Socios o accionistas'],['219525','Fondos y cooperativas'],['219595','Otras'],['22','Proveedores'],['2205','Nacionales'],['220501','Proveedores nacionales'],['2210','Del exterior'],['221001','Proveedores extranjeros'],
['2215','Cuentas corrientes comerciales'],['2220','Casa matriz'],['2225','Compañías vinculadas'],['23','Cuentas por pagar'],['2305','Cuentas corrientes comerciales'],['2310','A casa matriz'],['2315','A compañías vinculadas'],['2320','A contratistas'],
['2330','Órdenes de compra por utilizar'],['2335','Costos y gastos por pagar'],['233505','Gastos financieros'],['233510','Gastos legales'],['233515','Libros, suscripciones, periódicos y revistas'],['233520','Comisiones'],['233525','Honorarios'],['233530','Servicios técnicos'],
['233535','Servicios de mantenimiento'],['233540','Arrendamientos'],['233545','Transportes, fletes y acarreos'],['233550','Servicios públicos'],['233555','Seguros'],['233560','Gastos de viaje'],['233565','Gastos de representación y relaciones publicas'],['233570','Servicios aduaneros'],
['233595','Otros'],['2340','Instalamentos por pagar'],['2345','Acreedores oficiales'],['2350','Regalías por pagar'],['2355','Deudas con accionistas o socios'],['235505','Accionistas'],['235510','Socios'],['2360','Dividendos o participaciones por pagar'],
['236005','Dividendos'],['236010','Participaciones'],['2365','Retención en la fuente'],['236505','Salarios y pagos laborales'],['236510','Dividendos y/o participaciones'],['23651001','Dividendos y/o participaciones no residentes'],['236515','Honorarios'],['23651501','Honorarios no declarantes 10%'],
['23651502','Honorarios declarantes 11%'],['23651503','Honorarios diferidos 11%'],['23651504','Honorarios diferidos 10%'],['236520','Comisiones'],['23652001','Comisiones no declarantes 10%'],['23652002','Comisiones declarantes 11%'],['23652003','Comisiones diferidos no declarantes 10%'],['23652004','Comisiones diferidos declarantes 11%'],
['236525','Servicios'],['23652501','Servicios generales no declarantes 6%'],['23652502','Servicios generales declarantes 4%'],['23652503','Servicios transporte de carga 1%'],['23652504','Servicios empresas temporales de empleo 1%'],['23652505','Servicios de vigilancia y aseo 2%'],['23652506','Servicio hoteles y restaurantes 3,5%'],['23652507','Servicio de transporte pasajeros aéreo y marítimo'],
['23652508','Servicio de transporte pasajeros por carretera 3,5%'],['23652509','Retención en la fuente servicios mano de obra construcción 1%'],['23652510','Servicios generales diferidos no declarantes 6%'],['23652511','Servicios generales diferidos  declarantes 4%'],['236530','Arrendamientos'],['23653001','Arrendamiento bienes muebles 4%'],['23653002','Arrendamiento bienes inmuebles 3,5%'],['23653003','Arrendamientos inmuebles diferidos 3,5%'],
['23653004','Arrendamientos muebles diferidos 4%'],['236535','Rendimientos Financieros'],['236540','Compras'],['23654001','Retención por compras (declarantes) 2,5%'],['23654002','Compra de activos fijos IVA incluido'],['23654003','Compra de combustibles y derivados del petróleo 0,1%'],['23654004','Retención por compras diferidos'],['23654005','Retención por compras (no declarantes) 3,5%'],
['236545','Loterías, rifas, apuestas y similares'],['236550','Por pagos al exterior'],['236555','Por ingresos obtenidos en el exterior'],['236560','Enajenación propiedades planta y equipo personas naturales'],['236565','Por impuesto de timbre'],['236570','Otras retenciones y patrimonio'],['236575','Autorretenciones'],['23657501','Autorretención renta'],
['2367','Impuesto a las ventas retenido'],['236705','IVA retenido al régimen simplificado'],['23670501','Reteiva régimen simplificado compras 19%'],['23670502','Reteiva régimen simplificado servicios'],['23670503','Reteiva régimen simplificado honorarios'],['23670504','Reteiva régimen simplificado arrendamientos inmuebles'],['23670505','Reteiva régimen simplificado arriendo bienes muebles'],['23670506','Reteiva reg. simplificado vigilancia, aseo y temporales Aiu 19%'],
['23670507','Reteiva reg. simplificado servicios 10%'],['23670508','Reteiva régimen simplificado comisiones'],['23670509','Reteiva régimen simplificado compras 10%'],['23670511','Reteiva régimen simplificado compras 20%'],['23670512','Reteiva régimen simplificado compras 25%'],['23670513','Reteiva régimen simplificado compras 35%'],['23670514','Reteiva régimen simplificado honorarios diferidos 19%'],['23670515','Retención de IVA reg. simplificado arrendamiento diferidos'],
['23670516','Reteiva régimen simplificado servicios diferidos 19%'],['23670517','Reteiva régimen simplificado compras diferidos'],['23670518','Reteiva régimen simplificado comisiones diferidos 19%'],['23670519','Reteiva régimen simplificado compras 5%'],['236710','IVA retenido al régimen común'],['2368','Impuesto de industria y comercio retenido'],['236801','ICA retenido'],['23680101','Retención de ICA compras'],
['23680102','Retención de ICA servicios'],['23680103','Retención de ICA honorarios'],['23680104','Retención de ICA por comisiones'],['2370','Retenciones y aportes de nomina'],['237005','Aportes EPS'],['23700501','Cafesalud EPS'],['237006','Aportes  A.R.P.'],['237010','Aportes al I.C.B.F., Sena y cajas de compensación'],
['237015','Aportes al F.I.C.'],['237025','Embargos judiciales'],['237030','Libranzas'],['237035','Sindicatos'],['237040','Cooperativas'],['237045','Fondos'],['237095','Otros'],['2375','Cuotas por devolver'],
['2380','Acreedores varios'],['238005','Depositarios'],['238010','Comisionistas de bolsas'],['238015','Sociedad administradora - fondos de inversión'],['238020','Reintegros por pagar'],['238025','Fondo de perseverancia'],['238030','Fondos de cesantías y/o pensiones'],['238035','Donaciones asignadas por pagar'],
['238095','Otros'],['24','Impuestos, gravámenes y tasas'],['2404','De renta y complementarios'],['240405','Vigencia fiscal corriente'],['240410','Vigencias fiscales anteriores'],['2408','Impuesto sobre las ventas por pagar'],['240801','Iva Generado'],['24080101','Iva generado ventas 19%'],
['24080103','Iva generado por ventas 5%'],['24080104','Iva generado por ventas 10%'],['24080105','Iva por devoluciones en compras 19%'],['24080108','Iva transitorio remisiones'],['24080109','Iva por devoluciones en compras 10%'],['24080110','Iva generado Aiu 19%'],['24080111','Iva por ventas 1,6%'],['24080113','Iva generado ventas 20%'],
['24080114','Iva generado ventas 25%'],['24080115','Iva generado ventas 35%'],['24080116','Iva por devoluciones en compras 20%'],['24080117','Iva por devoluciones en compras 25%'],['24080118','Iva por devoluciones en compras 35%'],['24080119','Iva por devoluciones en compras 5%'],['240802','Iva descontable'],['24080201','Iva por compras 19%'],
['24080202','Iva por compras 10%'],['24080203','Iva por servicios 19%'],['24080204','Iva por servicios 10%'],['24080205','Iva por honorarios 19%'],['24080206','Iva por arrendamientos'],['24080207','Iva servicio de vigilancia, aseo y temporales 19%/Aiu'],['24080208','Iva servicio de alojamiento 10%'],['24080209','Iva por importaciones'],
['24080210','Iva por devoluciones en ventas 19%'],['24080211','Iva descontable por comisiones 19%'],['24080213','Devoluciones en ventas 1,6%'],['24080215','Iva por compras 20%'],['24080216','Iva por devoluciones en ventas 20%'],['24080217','Iva por devoluciones en ventas 25%'],['24080218','Iva por devoluciones en ventas 35%'],['24080219','Iva por compras 25%'],
['24080220','Iva por compras 35%'],['24080221','Iva por compras 5%'],['24080222','Iva por devolución en ventas del 5%'],['240890','Iva retenido régimen simplificado'],['24089001','Reteiva régimen simplificado compras 19%'],['24089002','Reteiva régimen simplificado servicios 19%'],['24089003','Reteiva régimen simplificado honorarios'],['24089004','Reteiva régimen simplificado arrendamientos inmuebles'],
['24089005','Reteiva régimen simplificado arriendo bienes muebles'],['24089006','Reteiva reg. simplificado vigilancia, aseo y temporales Aiu 19%'],['24089007','Reteiva reg. simplificado servicios 10%'],['24089008','Reteiva régimen simplificado comisiones'],['24089009','Reteiva régimen simplificado compras 10%'],['24089011','Reteiva régimen simplificado compras 20%'],['24089012','Reteiva régimen simplificado compras 25%'],['24089013','Reteiva régimen simplificado compras 35%'],
['24089014','Reteiva régimen simplificado compras 5%'],['2412','De industria y comercio'],['241205','Vigencia fiscal corriente'],['241210','Vigencias fiscales anteriores'],['2416','A la propiedad raíz'],['241605','Impuesto a la propiedad raíz'],['2420','Derechos sobre instrumentos públicos'],['242005','Derechos sobre instrumentos públicos'],
['2424','De valorización'],['242405','Vigencia fiscal corriente'],['242410','Vigencias fiscales anteriores'],['2428','De turismo'],['242805','De turismo'],['2432','Tasa por utilización de puertos'],['243205','Tasa por utilización de puertos'],['2436','De vehículos'],
['243605','Vigencia fiscal corriente'],['243610','Vigencias fiscales anteriores'],['2440','De espectáculos públicos'],['244005','De espectáculos públicos'],['2444','De hidrocarburos y minas'],['244405','De hidrocarburos'],['244410','De minas'],['2448','Regalías e impuestos a la pequeña y mediana minería'],
['2452','A las exportaciones cafeteras'],['2456','A las importaciones'],['2460','Cuotas de fomento'],['246005','Cuotas de fomento'],['2464','De licores, cervezas y cigarrillos'],['246405','De licores'],['246410','De cervezas'],['246415','De cigarrillos'],
['2468','Al sacrificio de ganado'],['2472','Al azar y juegos'],['2476','Gravámenes y regalías por utilización del suelo'],['2495','Otros'],['249501','Otros'],['24950101','Impuesto nacional al consumo'],['24950102','Impuesto al Consumo Advalorem Valor'],['24950103','Impuesto al Consumo Advalorem Porcentaje'],
['24950104','Impuesto al Consumo Bolsas'],['24950105','Impuesto al Consumo Distrital'],['24950106','Impuesto Nacional a la Gasolina y ACPM'],['249510','Impuesto Saludable'],['24951001','Bebidas Azucaradas'],['24951002','Alimentos Ultraprocesados'],['25','Obligaciones laborales'],['2505','Salarios por pagar'],
['250501','Sueldos'],['2510','Cesantías consolidadas'],['251005','Ley laboral anterior'],['251010','Ley 50 de 1990 y normas posteriores'],['2515','Intereses sobre cesantías'],['251501','Intereses sobre cesantías'],['2520','Prima de servicios'],['252001','Prima de servicios'],
['2525','Vacaciones consolidadas'],['252501','Vacaciones'],['2530','Prestaciones extralegales'],['253005','Primas'],['253010','Auxilios'],['253015','Dotación y suministro a trabajadores'],['253020','Bonificaciones'],['253025','Seguros'],
['253095','Otras'],['2532','Pensiones por pagar'],['2535','Cuotas partes pensiones de jubilación'],['2540','Indemnizaciones laborales'],['26','Pasivos estimados y provisiones'],['2605','PPara costos y gastos'],['260505','Intereses'],['260510','Comisiones'],
['260515','Honorarios'],['260520','Servicios técnicos'],['260525','Transportes, fletes y acarreos'],['260530','Gastos de viaje'],['260535','Servicios públicos'],['260540','Regalías'],['260545','Garantías'],['260550','Materiales y repuestos'],
['260595','Otros'],['2610','Para obligaciones laborales'],['261005','Cesantías'],['261010','Intereses sobre cesantías'],['261015','Vacaciones'],['261020','Prima de servicios'],['261025','Prestaciones extralegales'],['261030','Viáticos'],
['261095','Otras'],['2615','Para obligaciones fiscales'],['261505','De renta y complementarios'],['261510','De industria y comercio'],['261515','Tasa por utilización de puertos'],['261520','De vehículos'],['261525','De hidrocarburos y minas'],['261595','Otros'],
['2620','Pensiones de jubilación'],['262005','Calculo actuarial pensiones de jubilación'],['262010','Pensiones de jubilación por amortizar (Db)'],['2625','Para obras de urbanismo'],['262505','Acueducto y alcantarillado'],['262510','Energía eléctrica'],['262515','Teléfonos'],['262595','Otros'],
['2630','Para mantenimiento y reparaciones'],['263005','Terrenos'],['263010','Construcciones y edificaciones'],['263015','Maquinaria y equipo'],['263020','Equipo de oficina'],['263025','Equipo de computación y comunicación'],['263030','Equipo médico-científico'],['263035','Equipo de hoteles y restaurantes'],
['263040','Flota y equipo de transporte'],['263045','Flota y equipo fluvial y/o marítimo'],['263050','Flota y equipo aéreo'],['263055','Flota y equipo férreo'],['263060','Acueductos plantas y redes'],['263065','Armamento de vigilancia'],['263070','Envases y empaques'],['263075','Plantaciones agrícolas y forestales'],
['263080','Vías de comunicación'],['263085','Pozos artesianos'],['263095','Otros'],['2635','Para contingencias'],['263505','Multas y sanciones autoridades administrativas'],['263510','Intereses por multas y sanciones'],['263515','Reclamos'],['263520','Laborales'],
['263525','Civiles'],['263530','Penales'],['263535','Administrativos'],['263540','Comerciales'],['263595','Otras'],['2640','Para obligaciones de garantías'],['2695','Provisiones diversas'],['269505','Para beneficencia'],
['269510','Para comunicaciones'],['269515','Para perdida en transporte'],['269520','Para operación'],['269525','Para protección de bienes agotables'],['269530','Para ajustes en redención de unidades'],['269535','Autoseguro'],['269540','Planes y programas de reforestación y electrificación'],['269595','Otras'],
['27','Diferidos'],['2705','Ingresos recibidos por anticipado'],['270505','Intereses'],['270510','Comisiones'],['270515','Arrendamientos'],['270520','Honorarios'],['270525','Servicios técnicos'],['270530','De suscriptores'],
['270535','Transportes, fletes y acarreos'],['270540','Mercancía en transito ya vendida'],['270545','Matriculas y pensiones'],['270550','Cuotas de administración'],['2710','Abonos diferidos'],['271005','Reajuste del sistema'],['2715','Utilidad diferida en ventas a plazos'],['2720','Crédito por corrección monetaria diferida'],
['2725','Impuestos diferidos'],['272505','Por depreciación flexible'],['272595','Diversos'],['272599','Ajustes por inflación'],['28','Otros pasivos'],['2805','Anticipos y avances recibidos'],['280505','De clientes'],['280510','Sobre contratos'],
['280515','Para obras en proceso'],['280595','Otros'],['2810','Depósitos recibidos'],['281005','Para futura suscripción de acciones'],['281010','Para futuro pago de cuotas o derechos sociales'],['281015','Para garantía en la prestación de servicios'],['281020','Para garantía de contratos'],['281025','De licitaciones'],
['281030','De manejo de bienes'],['281035','Fondo de reserva'],['281095','Otros'],['2815','Ingresos recibidos para terceros'],['281506','Valores recibidos para terceros ley 550'],['281510','Venta por cuenta de terceros'],['2820','Cuentas de operación conjunta'],['2825','Retenciones a terceros sobre contratos'],
['282505','Cumplimiento obligaciones laborales'],['282510','Para estabilidad de obra'],['282515','Garantía cumplimiento de contratos'],['2830','Embargos judiciales'],['283005','Indemnizaciones'],['283010','Depósitos judiciales'],['2835','Acreedores del sistema'],['283505','Cuotas netas'],
['283510','Grupos en formación'],['2840','Cuentas en participación'],['2895','Diversos'],['289505','Préstamos de productos'],['289510','Reembolso de costos exploratorios'],['289515','Programa de extensión agropecuaria'],['29','Bonos y papeles comerciales'],['2905','Bonos en circulación'],
['290505','Garantía general'],['290510','Garantía especifica'],['2910','Bonos obligatoriamente convertibles en acciones'],['2915','Papeles comerciales'],['3','Patrimonio'],['31','Capital social'],['3105','Capital suscrito y pagado'],['310505','Capital autorizado'],
['310510','Capital por suscribir (Db)'],['310515','Capital suscrito por cobrar (Db)'],['3110','Acciones, cuotas o partes de interés social propias readquiridas (Db)'],['311005','Acciones propias readquiridas (Db)'],['311010','Cuotas o partes de interés social propias readquiridas (Db)'],['3115','Aportes sociales'],['311505','Cuotas o partes de interés social'],['311510','Aportes de socios - fondo mutuo de inversión'],
['311515','Contribución de la empresa - fondo mutuo de inversión'],['311520','Suscripciones del publico'],['3120','Capital asignado'],['3125','Inversión suplementaria al capital asignado'],['3130','Capital de personas naturales'],['3135','Aportes del estado'],['3140','Fondo social'],['32','Superávit de capital'],
['3205','Prima en colocación de acciones, cuotas o partes de interés social'],['320505','Prima en colocación de acciones'],['320510','Prima en colocación de acciones por cobrar (Db)'],['320515','Prima en colocación de cuotas o partes de interés social'],['3210','Donaciones'],['321005','En dinero'],['321010','En valores mobiliarios'],['321015','En bienes muebles'],
['321020','En bienes inmuebles'],['321025','En intangibles'],['3215','Crédito mercantil'],['3220','Know How'],['3225','Superávit método de participación'],['322505','De acciones'],['322510','De cuotas o partes de interés social'],['33','Reservas'],
['3305','Reservas obligatorias'],['330505','Reserva legal'],['330510','Reservas por disposiciones fiscales'],['330515','Reserva para readquisición de acciones'],['330517','Reserva para readquisición de cuotas o partes de interés social'],['330520','Reserva para extensión agropecuaria'],['330525','Reserva ley 7a. de 1990'],['330530','Reserva para reposición de semovientes'],
['330535','Reserva ley 4A de 1980'],['330595','Otras'],['3310','Reservas estatutarias'],['331005','Para futuras capitalizaciones'],['331010','Para reposición de activos'],['331015','Para futuros ensanches'],['331095','Otras'],['3315','Reservas ocasionales'],
['331505','Para beneficencia y civismo'],['331510','Para futuras capitalizaciones'],['331515','Para futuros ensanches'],['331520','Para adquisición o reposición de propiedades planta y equipo'],['331525','Para investigaciones y desarrollo'],['331530','Para fomento económico'],['331535','Para capital de trabajo'],['331540','Para estabilización de rendimientos'],
['331545','A disposición del máximo órgano social'],['331595','Otras'],['34','Revalorización del patrimonio'],['3405','Ajustes por inflación'],['340505','De capital social'],['340510','De superávit de capital'],['340515','De reservas'],['340520','De resultados de ejercicios anteriores'],
['340525','De activos en periodo improductivo'],['340545','Superávit método de participación'],['340546','Ajuste por inflación revalorización del patrimonio'],['3410','Saneamiento fiscal'],['3415','Ajustes por inflación decreto 3019 de 1989'],['35','Dividendos o participaciones decretados en acciones, cuotas o partes de interés social'],['3505','Dividendos decretados en acciones'],['3510','Participaciones decretadas en cuotas o partes de interés social'],
['36','Resultados del ejercicio'],['3605','Utilidad del ejercicio'],['360505','Utilidad del ejercicio'],['360510','Utilidad por exposición a la inflación'],['3610','Perdida del ejercicio'],['361005','Perdida del ejercicio'],['361010','Perdida por exposición a la inflación'],['37','Resultados de ejercicios anteriores'],
['3705','Utilidades o excedentes acumulados'],['370505','Utilidades acumuladas'],['3710','Perdidas acumuladas'],['371005','Perdidas acumuladas'],['38','Superávit por valorizaciones'],['3805','De inversiones'],['380505','Acciones'],['380510','Cuotas o partes de interés social'],
['380515','Derechos fiduciarios'],['3810','De propiedades planta y equipo'],['381004','Terrenos'],['381006','Materiales proyectos petroleros'],['381008','Construcciones y edificaciones'],['381012','Maquinaria y equipo'],['381016','Equipo de oficina'],['381020','Equipo de computación y comunicación'],
['381024','Equipo medico científico'],['381028','Equipo de hoteles y restaurantes'],['381032','Flota y equipo de transporte'],['381036','Flota y equipo fluvial y/o marítimo'],['381040','Flota y equipo aéreo'],['381044','Flota y equipo férreo'],['381048','Acueductos plantas y redes'],['381052','Armamento de vigilancia'],
['381056','Envases y empaques'],['381060','Plantaciones agrícolas y forestales'],['381064','Vías de comunicación'],['381068','Minas y canteras'],['381072','Pozos artesianos'],['381076','Yacimientos'],['381080','Semovientes'],['3895','De otros activos'],
['389505','Bienes de arte y cultura'],['389510','Bienes entregados en comodato'],['389515','Bienes recibidos en pago'],['389520','Inventario de semovientes'],['4','Ingresos'],['41','Operacionales'],['4105','Agricultura, ganadería, caza y silvicultura'],['410510','Cultivos de hortalizas, legumbres y plantas ornamentales'],
['410515','Cultivos de frutas, nueces y plantas aromáticas'],['410520','Cultivo de café'],['410525','Cultivo de flores'],['410530','Cultivo de caña de azúcar'],['410545','Otros cultivos agrícolas'],['410550','Cría de ovejas, cabras, asnos, mulas y burdéganos'],['410555','Cría de ganado caballar y vacuno.'],['410560','Producción avícola'],
['410565','Cría de otros animales'],['410570','Servicios agrícolas y ganaderos'],['410575','Actividad de caza'],['410580','Actividad de silvicultura'],['410599','Ajustes por inflación'],['4110','Pesca'],['411005','Actividad de pesca'],['411010','Explotación de criaderos de peces'],
['411095','Actividades conexas'],['411099','Ajustes por inflación'],['4115','Explotación de minas y canteras'],['411505','Carbón'],['411510','Petróleo crudo'],['411512','Gas natural'],['411514','Servicios relacionados con extracción de petróleo y gas'],['411515','Minerales de hierro'],
['411520','Minerales metalíferos no ferrosos'],['411525','Piedra, arena y arcilla'],['411527','Piedras preciosas'],['411528','Oro'],['411530','Otras minas y canteras'],['411532','Prestación de servicios sector minero'],['411595','Actividades conexas'],['411599','Ajustes por inflación'],
['4120','Industrias manufactureras'],['412001','Producción y procesamiento de carnes y productos cárnicos'],['412002','Productos de pescado'],['412003','Productos de frutas, legumbres y hortalizas'],['412004','Elaboración de aceites y grasas'],['412005','Elaboración de productos lácteos'],['412006','Elaboración de productos de molinería'],['412007','Elaboración de almidones y derivados'],
['412008','Elaboración de alimentos para animales'],['412009','Elaboración de productos para panadería'],['412010','Elaboración de azúcar y melazas'],['412011','Elaboración de cacao, chocolate y confitería'],['412012','Elaboración de pastas y productos farináceos'],['412013','Elaboración de productos de café'],['412014','Elaboración de otros productos alimenticios'],['412015','Elaboración de bebidas alcohólicas y alcohol etílico'],
['412016','Elaboración de vinos'],['412017','Elaboración de bebidas malteadas y de malta'],['412018','Elaboración de bebidas no alcohólicas'],['412019','Elaboración de productos de tabaco'],['412020','Preparación e hilatura de fibras textiles y tejeduría'],['412021','Acabado de productos textiles'],['412022','Elaboración de artículos de materiales textiles'],['412023','Elaboración de tapices y alfombras'],
['412024','Elaboración de cuerdas, cordeles, bramantes y redes'],['412025','Elaboración de otros productos textiles'],['412026','Elaboración de tejidos'],['412027','Elaboración de prendas de vestir'],['412028','Preparación, adobo y teñido de pieles'],['412029','Curtido, adobo o preparación de cuero'],['412030','Elaboración de maletas, bolsos y similares'],['412031','Elaboración de calzado'],
['412032','Producción de madera, artículos de madera y corcho'],['412033','Elaboración de pasta y productos de madera, papel y cartón'],['412034','Ediciones y publicaciones'],['412035','Impresion'],['412036','Servicios relacionados con la edición y la impresión'],['412037','Reproducción de grabaciones'],['412038','Elaboración de productos de horno de coque'],['412039','Elaboración de productos de la refinación de petróleo'],
['412040','Elaboración de sustancias químicas básicas'],['412041','Elaboración de abonos y compuestos de nitrógeno'],['412042','Elaboración de plástico y caucho sintético'],['412043','Elaboración de productos químicos de uso agropecuario'],['412044','Elaboración de pinturas, tintas y masillas'],['412045','Elaboración de productos farmacéuticos y botánicos'],['412046','Elaboración de jabones, detergentes y preparados de tocador'],['412047','Elaboración de otros productos químicos'],
['412048','Elaboración de fibras'],['412049','Elaboración de otros productos de caucho'],['412050','Elaboración de productos de plástico'],['412051','Elaboración de vidrio y productos de vidrio'],['412052','Elaboración de productos de cerámica, loza, piedra, arcilla y porcelana'],['412053','Elaboración de cemento, cal y yeso'],['412054','Elaboración de artículos de hormigón, cemento y yeso'],['412055','Corte, tallado y acabado de la piedra'],
['412056','Elaboración de otros productos minerales no metálicos'],['412057','Industrias básicas y fundición de hierro y acero'],['412058','Productos primarios de metales preciosos y de metales no ferrosos'],['412059','Fundición de metales no ferrosos'],['412060','Fabricación de productos metálicos para uso estructural'],['412061','Forja, prensado, estampado, laminado de metal y pulvimetalurgia'],['412062','Revestimiento de metales y obras de ingeniería mecánica'],['412063','Fabricación de artículos de ferretería'],
['412064','Elaboración de otros productos de metal'],['412065','Fabricación de maquinaria y equipo'],['412066','Fabricación de equipos de elevación y manipulación'],['412067','Elaboración de aparatos de uso domestico'],['412068','Elaboración de equipo de oficina'],['412069','Elaboración de pilas y baterías primarias'],['412070','Elaboración de equipo de iluminación'],['412071','Elaboración de otros tipos de equipo eléctrico'],
['412072','Fabricación de equipos de radio, televisión y comunicaciones'],['412073','Fabricación de aparatos e instrumentos médicos'],['412074','Fabricación de instrumentos de medición y control'],['412075','Fabricación de instrumentos de óptica y equipo fotográfico'],['412076','Fabricación de relojes'],['412077','Fabricación de vehículos automotores'],['412078','Fabricación de carrocerías para automotores'],['412079','Fabricación de partes piezas y accesorios para automotores'],
['412080','Fabricación y reparación de buques y otras embarcaciones'],['412081','Fabricación de locomotoras y material rodante para ferrocarriles'],['412082','Fabricación de aeronaves'],['412083','Fabricación de motocicletas'],['412084','Fabricación de bicicletas y sillas de ruedas'],['412085','Fabricación de otros tipos de transporte'],['412086','Fabricación de muebles'],['412087','Fabricación de joyas y artículos conexos'],
['412088','Fabricación de instrumentos de música'],['412089','Fabricación de artículos y equipo para deporte'],['412090','Fabricación de juegos y juguetes'],['412091','Reciclamiento de desperdicios'],['412095','Productos de otras industrias manufactureras'],['412099','Ajustes por inflación'],['4125','Suministro de electricidad, gas y agua'],['412505','Generación, captación y distribución de energía eléctrica'],
['412510','Fabricación de gas y distribución de combustibles gaseosos'],['412515','Captación, depuración y distribución de agua'],['412595','Actividades conexas'],['412599','Ajustes por inflación'],['4130','Construccion'],['413005','Preparación de terrenos'],['413010','Construcción de edificios y obras de ingeniería civil'],['413015','Acondicionamiento de edificios'],
['413020','Terminación de edificaciones'],['413025','Alquiler de equipo con operarios'],['413095','Actividades conexas'],['41309501','Servicio de obra'],['41309502','Administracion'],['41309503','Imprevistos'],['41309504','Utilidad'],['413099','Ajustes por inflación'],
['4135','Comercio al por mayor y al por menor'],['413502','Venta de vehículos automotores'],['413504','Mantenimiento, reparación y lavado de vehículos automotores'],['413506','Venta de partes, piezas y accesorios de vehículos automotores'],['413508','Venta de combustibles sólidos, líquidos, gaseosos'],['413510','Venta de lubricantes, aditivos, llantas y lujos para automotores'],['413512','Venta a cambio de retribución o por contrata'],['413514','Venta de insumos, materias primas agropecuarias y flores'],
['413516','Venta de otros insumos y materias primas no agropecuarias'],['413518','Venta de animales vivos y cueros'],['413520','Venta de productos en almacenes no especializados'],['413522','Venta de productos agropecuarios'],['413524','Venta de productos textiles, de vestir, de cuero y calzado'],['413526','Venta de papel y cartón'],['413528','Venta de libros, revistas, elementos de papelería, útiles y textos escolares'],['413530','Tienda'],
['413532','Venta de instrumentos quirúrgicos y ortopédicos'],['413534','Venta de artículos en relojerías y joyerías'],['413536','Venta de electrodomésticos y muebles'],['413538','Venta de productos de aseo, farmacéuticos, medicinales, y artículos de tocador'],['413540','Venta de cubiertos, vajillas, cristalería, porcelanas, cerámicas y otros artículos de uso domestico'],['413542','Venta de materiales de construcción, fontanería y calefacción'],['413544','Venta de pinturas, lacas y ferretería'],['413546','Venta de productos de vidrios y marquetería'],
['413548','Venta de herramientas y artículos de ferretería'],['413550','Venta de químicos'],['413552','Venta de productos intermedios, desperdicios y desechos'],['413554','Venta de maquinaria, equipo de oficina y programas de computador'],['413556','Venta de artículos en cacharrerías y misceláneas'],['413558','Venta de instrumentos musicales'],['413560','Venta de artículos en casas de empeño y prenderías'],['413562','Venta de equipo fotográfico'],
['413564','Venta de equipo óptico y de precisión'],['413566','Venta de empaques'],['413568','Venta de equipo profesional y científico'],['413570','Venta de loterías, rifas, chance, apuestas y similares'],['413572','Reparación de efectos personales y electrodomésticos'],['413595','Venta de otros productos'],['413599','Ajustes por inflación'],['4140','Hoteles y restaurantes'],
['414005','Hotelería'],['414010','Campamento y otros tipos de hospedaje'],['414015','Restaurantes'],['414020','Bares y cantinas'],['414095','Actividades conexas'],['414099','Ajustes por inflación'],['4145','Transporte, almacenamiento y comunicaciones'],['414505','Servicio de transporte por carretera'],
['414510','Servicio de transporte por vía férrea'],['414515','Servicio de transporte por vía acuática'],['414520','Servicio de transporte por vía aérea'],['414525','Servicio de transporte por tuberías'],['414530','Manipulación de carga'],['414535','Almacenamiento y deposito'],['414540','Servicios complementarios para el transporte'],['414545','Agencias de viaje'],
['414550','Otras agencias de transporte'],['414555','Servicio postal y de correo'],['414560','Servicio telefónico'],['414565','Servicio de telégrafo'],['414570','Servicio de transmisión de datos'],['414575','Servicio de radio y televisión por cable'],['414580','Transmisión de sonido e imágenes por contrato'],['414595','Actividades conexas'],
['414599','Ajustes por inflación'],['4150','Actividad financiera'],['415005','Venta de inversiones'],['415010','Dividendos de sociedades anónimas y/o asimiladas'],['415015','Participaciones de sociedades limitadas y/o asimiladas'],['415020','Intereses'],['415025','Reajuste monetario - Upac'],['415030','Comisiones'],
['415035','Operaciones de descuento'],['415040','Cuotas de inscripción - consorcios'],['415045','Cuotas de administración - consorcios'],['415050','Reajuste del sistema - consorcios'],['415055','Eliminación de suscriptores - consorcios'],['415060','Cuotas de ingreso o retiro - sociedad administradora'],['415065','Servicios a comisionistas'],['415070','Inscripciones y cuotas'],
['415075','Recuperación de garantías'],['415080','Ingresos método de participación'],['415095','Actividades conexas'],['415099','Ajustes por inflación'],['4155','Actividades inmobiliarias, empresariales y de alquiler'],['415505','Arrendamientos de bienes inmuebles'],['415510','Inmobiliarias por retribución o contrata'],['415515','Alquiler equipo de transporte'],
['415520','Alquiler maquinaria y equipo'],['415525','Alquiler de efectos personales y enseres domésticos'],['415530','Consultoría en equipo y programas de informática'],['415535','Procesamiento de datos'],['415540','Mantenimiento y reparación de maquinaria de oficina'],['415545','Investigaciones científicas y de desarrollo'],['415550','Actividades empresariales de consultoría'],['415555','Publicidad'],
['415560','Dotación de personal'],['415565','Investigación y seguridad'],['415570','Limpieza de inmuebles'],['415575','Fotografia'],['415580','Envase y empaque'],['415585','Fotocopiado'],['415590','Mantenimiento y reparación de maquinaria y equipo'],['415595','Actividades conexas'],
['415599','Ajustes por inflación'],['4160','Enseñanza'],['416005','Actividades relacionadas con la educación'],['416095','Actividades conexas'],['416099','Ajustes por inflación'],['4165','Servicios sociales y de salud'],['416505','SServicio hospitalario'],['416510','Servicio medico'],
['416515','Servicio odontológico'],['416520','Servicio de laboratorio'],['416525','Actividades veterinarias'],['416530','Actividades de servicios sociales'],['416595','Actividades conexas'],['416599','Ajustes por inflación'],['4170','Otras actividades de servicios comunitarios, sociales y personales'],['417005','Eliminación de desperdicios y aguas residuales'],
['417010','Actividades de asociación'],['417015','Producción y distribución de filmes y videocintas'],['417020','Exhibición de filmes y videocintas'],['417025','Actividad de radio y televisión'],['417030','Actividad teatral, musical y artística'],['417035','Grabación y producción de discos'],['417040','Entretenimiento y esparcimiento (eventos)'],['417045','Agencias de noticias'],
['417050','Lavanderías y similares'],['417055','Peluquerías y similares'],['417060','Servicios funerarios'],['417065','Zonas francas'],['417095','Actividades conexas'],['417099','Ajustes por inflación'],['4175','Devoluciones, rebajas y descuentos en ventas (Db)'],['42','No operacionales'],
['4205','Otras ventas'],['420505','Materia prima'],['420510','Material de desecho'],['420515','Materiales varios'],['420520','Productos de diversificación'],['420525','Excedentes de exportación'],['420530','Envases y empaques'],['420535','Productos agrícolas'],
['420540','De propaganda'],['420545','Productos en remate'],['420550','Combustibles y lubricantes'],['420599','Ajustes por inflación'],['4210','Financieros'],['421005','Intereses'],['421010','Reajuste monetario - Upac'],['421015','Descuentos amortizados'],
['421020','Diferencia en cambio'],['421025','Financiación vehículos'],['421030','Financiación sistemas de viajes'],['421035','Aceptaciones bancarias'],['421040','Descuentos comerciales condicionados'],['421045','Descuentos bancarios'],['421050','Comisiones cheques de otras plazas'],['421055','Multas y recargos'],
['421060','Sanciones cheques devueltos'],['421095','Otros'],['421099','Ajustes por inflación'],['4215','Dividendos y participaciones'],['421505','De sociedades anónimas y/o asimiladas'],['421510','De sociedades limitadas y/o asimiladas'],['421599','Ajustes por inflación'],['4218','Ingresos método de participación'],
['421805','De sociedades anónimas y/o asimiladas'],['421810','De sociedades limitadas y/o asimiladas'],['4220','Arrendamientos'],['422005','Terrenos'],['422010','Construcciones y edificios'],['422015','Maquinaria y equipo'],['422020','Equipo de oficina'],['422025','Equipo de computación y comunicación'],
['422030','Equipo médico-científico'],['422035','Equipo de hoteles y restaurantes'],['422040','Flota y equipo de transporte'],['422045','Flota y equipo fluvial y/o marítimo'],['422050','Flota y equipo aéreo'],['422055','Flota y equipo férreo'],['422060','Acueductos plantas y redes'],['422062','Envases y empaques'],
['422065','Plantaciones agrícolas y forestales'],['422070','Aeródromos'],['422075','Semovientes'],['422099','Ajustes por inflación'],['4225','Comisiones'],['422505','Sobre inversiones'],['422510','De concesionarios'],['422515','De actividades financieras'],
['422520','Por venta de servicios de taller'],['422525','Por venta de seguros'],['422530','Por ingresos para terceros'],['422535','Por distribución de películas'],['422540','Derechos de autor'],['422545','Derechos de programación'],['422599','Ajustes por inflación'],['4230','Honorarios'],
['423005','Asesorías'],['423010','Asistencia técnica'],['423015','Administración de vinculadas'],['423099','Ajustes por inflación'],['4235','Servicios'],['423505','De bascula'],['423510','De transporte'],['423515','De prensa'],
['423520','Administrativos'],['423525','Técnicos'],['423530','De computación'],['423535','De telefax'],['423540','Taller de vehículos'],['423545','De recepción de aeronaves'],['423550','De transporte programa gas natural'],['423555','Por contratos'],
['423560','De trilla'],['423565','De mantenimiento'],['423570','Al personal'],['423575','De casino'],['423580','Fletes'],['423585','Entre compañías'],['423595','Otros'],['423599','Ajustes por inflación'],
['4240','Utilidad en venta de inversiones'],['424005','Acciones'],['424010','Cuotas o partes de interés social'],['424015','Bonos'],['424020','Cédulas'],['424025','Certificados'],['424030','Papeles comerciales'],['424035','Títulos'],
['424045','Derechos fiduciarios'],['424050','Obligatorias'],['424095','Otras'],['424099','Ajustes por inflación'],['4245','Utilidad en venta de propiedades planta y equipo'],['424504','Terrenos'],['424506','Materiales industria petrolera'],['424508','Construcciones en curso'],
['424512','Maquinaria en montaje'],['424516','Construcciones y edificaciones'],['424520','Maquinaria y equipo'],['424524','Equipo de oficina'],['424528','Equipo de computación y comunicación'],['424532','Equipo médico-científico'],['424536','Equipo de hoteles y restaurantes'],['424540','Flota y equipo de transporte'],
['424544','Flota y equipo fluvial y/o marítimo'],['424548','Flota y equipo aéreo'],['424552','Flota y equipo férreo'],['424556','Acueductos plantas y redes'],['424560','Armamento de vigilancia'],['424562','Envases y empaques'],['424564','Plantaciones agrícolas y forestales'],['424568','Vías de comunicación'],
['424572','Minas y canteras'],['424580','Pozos artesianos'],['424584','Yacimientos'],['424588','Semovientes'],['424599','Ajustes por inflación'],['4248','Utilidad en venta de otros bienes'],['424805','Intangibles'],['424810','Otros Activos'],
['424899','Ajustes por inflación'],['4250','Recuperaciones'],['425005','Deudas Malas'],['425010','Seguros'],['425015','Reclamos'],['425020','Reintegro por personal en comisión'],['425025','Reintegro garantías'],['425030','Descuentos concedidos'],
['425035','Reintegro provisiones'],['425040','Gastos bancarios'],['425045','De depreciación'],['425050','Reintegro de otros costos y gastos'],['425099','Ajustes por inflación'],['4255','Indemnizaciones'],['425505','Por siniestro'],['425510','Por suministros'],
['425515','Lucro cesante compañías de seguros'],['425520','Daño emergente compañías de seguros'],['425525','Por perdida de mercancía'],['425530','Por incumplimiento de contratos'],['425535','De terceros'],['425540','Por incapacidades I.S.S.'],['425595','Otras'],['425599','Ajustes por inflación'],
['4260','Participaciones en concesiones'],['426099','Ajustes por inflación'],['4265','Ingresos de ejercicios anteriores'],['426599','Ajustes por inflación'],['4275','Devoluciones, rebajas y descuentos en otras ventas (Db)'],['427599','Ajustes por inflación'],['4295','Diversos'],['429503','CERT'],
['429505','Aprovechamientos'],['429507','Auxilios'],['429509','Donaciones'],['429511','Ingresos por investigación y desarrollo'],['429513','Por trabajos ejecutados'],['429515','Regalías'],['429517','Derivados de las exportaciones'],['429519','Otros ingresos de explotación'],
['429521','De la actividad ganadera'],['429525','Derechos y licitaciones'],['429530','Ingresos por elementos perdidos'],['429533','Multas y recargos'],['429535','Preavisos descontados'],['429537','Reclamos'],['429540','Recobro de daños'],['429543','Premios'],
['429545','Bonificaciones'],['429547','Productos descontados'],['429549','Reconocimientos I.S.S.'],['429551','Excedentes'],['429553','Sobrantes de caja menor'],['429555','Sobrantes en liquidación fletes'],['429557','Subsidios estatales'],['429559','Capacitación distribuidores'],
['429561','De escrituración'],['429563','Registro promesas de venta'],['429567','Útiles, papelería y fotocopias'],['429571','Resultados matriculas y traspasos'],['429573','Decoraciones'],['429575','Manejo de carga'],['429579','Historia clínica'],['429581','Ajuste al peso'],
['429583','Llamadas telefónicas'],['429599','Ajustes por inflación'],['47','Ajustes por inflación'],['4705','Corrección monetaria'],['470505','Inversiones (Cr)'],['470510','Inventarios (Cr)'],['470515','Propiedades, planta y equipo (Cr))'],['470520','Intangibles (Cr)'],
['470525','Activos diferidos'],['470530','Otros Activos (Cr)'],['470535','Pasivos sujetos de ajuste'],['470540','Patrimonio'],['470545','Depreciación acumulada (Db)'],['470550','Depreciación diferida (Cr)'],['470555','Agotamiento acumulado (Db)'],['470560','Agotamiento acumulado (Db)'],
['470565','Ingresos operacionales (Db)'],['470570','Ingresos no operacionales (Db)'],['470575','Gastos operacionales de administración (Cr)'],['470580','Gastos operacionales de ventas (Cr)'],['470585','Gastos operacionales de ventas (Cr)'],['470590','Compras (Cr)'],['470592','Costo de ventas (Cr)'],['470594','Costos de producción o de operación (Db)'],
['5','Gastos'],['51','Operacionales de administración'],['5105','Gastos de personal'],['510503','Salario integral'],['510506','Sueldos'],['510507','Cuota de Sostenimiento'],['510512','Jornales'],['510515','Horas extras y recargos'],
['510518','Comisiones'],['510521','Viáticos'],['510524','Incapacidades'],['510525','Licencias'],['510527','Auxilio de transporte'],['510530','Cesantías'],['510533','Intereses sobre cesantías'],['510536','Prima de servicios'],
['510539','Vacaciones'],['510542','Primas extralegales'],['510543','Bonificación Extralegal'],['510545','Auxilios'],['510548','Bonificaciones'],['510551','Dotación y suministro a trabajadores'],['510554','Seguros'],['510557','Cuotas partes pensiones de jubilación'],
['510558','Amortización calculo actuarial pensiones de jubilación'],['510559','Pensiones de jubilación'],['510560','Indemnizaciones laborales'],['510563','Capacitación al personal'],['510566','Gastos deportivos y de recreación'],['510568','Aportes a administradoras de riesgos profesionales A.R.P.'],['510569','Aportes Eps'],['510570','Aportes a fondos de pensiones y/o cesantías'],
['510572','Aportes cajas de compensación familiar'],['510575','Aportes I.C.B.F.'],['510578','Sena'],['510581','Aportes sindicales'],['510584','Gastos médicos y drogas'],['510595','Otros'],['510599','Ajustes por inflación'],['5110','Honorarios'],
['511005','Junta directiva'],['511010','Revisoría fiscal'],['511015','Auditoria externa'],['511020','Avalúos'],['511025','Asesoría jurídica'],['511030','Asesoría financiera'],['511035','Asesoría técnica'],['511095','Otros'],
['511099','Ajustes por inflación'],['5115','Impuestos'],['511505','Industria y comercio'],['511510','De timbres'],['511515','A la propiedad raíz'],['511520','Derechos sobre instrumentos públicos'],['511525','De valorización'],['511530','De turismo'],
['511535','Tasa por utilización de puertos'],['511540','De vehículos'],['511545','De espectáculos públicos'],['511550','Cuotas de fomento'],['511570','Iva descontable'],['511595','Otros'],['51159501','Gravamen a los Movimientos Financieros (GMF)'],['511599','Ajustes por inflación'],
['5120','Arrendamientos'],['512005','Terrenos'],['512010','Construcciones y edificaciones'],['512015','Maquinaria y equipo'],['512020','Equipo de oficina'],['512025','Equipo de computación y comunicación'],['512030','Equipo médico-científico'],['512035','Equipo de hoteles y restaurantes'],
['512040','Flota y equipo de transporte'],['512045','Flota y equipo fluvial y/o marítimo'],['512050','Flota y equipo aéreo'],['512055','Flota y equipo férreo'],['512060','Acueductos plantas y redes'],['512065','Aeródromos'],['512070','Semovientes'],['512095','Otros'],
['512099','Ajustes por inflación'],['5125','Contribuciones y afiliaciones'],['512505','Contribuciones'],['512510','Afiliaciones y sostenimiento'],['512599','Ajustes por inflación'],['5130','Seguros'],['513005','Manejo'],['513010','Cumplimiento'],
['513015','Corriente Débil'],['513020','Vida Colectiva'],['513025','Incendio'],['513030','Terremoto'],['513035','Sustracción y hurto'],['513040','Flota y equipo de transporte'],['513045','Flota y equipo fluvial y/o marítimo'],['513050','Flota y equipo aéreo'],
['513055','Flota y equipo férreo'],['513060','Responsabilidad civil y extracontractual'],['513065','Vuelo'],['513070','Rotura de maquinaria'],['513075','Obligatorio accidente de transito'],['513080','Lucro cesante'],['513085','Transporte de mercancía'],['513095','Otros'],
['513099','Ajustes por inflación'],['5135','Servicios'],['513505','Aseo y vigilancia'],['513510','Temporales'],['513515','Asistencia técnica'],['513520','Procesamiento electrónico de datos'],['513525','Acueducto y alcantarillado'],['513530','Energía eléctrica'],
['513535','Telefono'],['51353501','Teléfono gravado'],['51353502','Teléfono no gravado'],['513540','Correo, portes y telegramas'],['513545','Fax y télex'],['513550','Transporte, fletes y acarreos'],['513555','Gas'],['513595','Otros'],
['513599','Ajustes por inflación'],['5140','Gastos legales'],['514005','Notariales'],['514010','Registro mercantil'],['514015','Tramites y licencias'],['514020','Aduaneros'],['514025','Consulares'],['514095','Otros'],
['514099','Ajustes por inflación'],['5145','Mantenimiento y reparaciones'],['514505','Terrenos'],['514510','Construcciones y edificaciones'],['514515','Maquinaria y equipo'],['514520','Equipo de oficina'],['514525','Equipo de computación y comunicación'],['514530','Equipo medico-científico'],
['514535','Equipo de hoteles y restaurantes'],['514540','Flota y equipo de transporte'],['514545','Flota y equipo fluvial y/o marítimo'],['514550','Flota y equipo aéreo'],['514555','Flota y equipo férreo'],['514560','Acueductos plantas y redes'],['514565','Armamento de vigilancia'],['514570','Vías de comunicación'],
['514599','Ajustes por inflación'],['5150','Adecuación e instalación'],['515005','Instalaciones eléctricas'],['515010','Arreglos ornamentales'],['515015','Reparaciones locativas'],['515095','Otros'],['515099','Ajustes por inflación'],['5155','Gastos de viaje'],
['515505','Alojamiento y manutención'],['515510','Pasajes fluviales y/o marítimos'],['515515','Pasajes aéreos'],['515520','Pasajes terrestres'],['515525','Pasajes férreos'],['515595','Otros'],['515599','Ajustes por inflación'],['5160','Depreciaciones'],
['516005','Construcciones y edificaciones'],['516010','Maquinaria y equipo'],['516015','Equipo de oficina'],['516020','Equipo de computación y comunicación'],['516025','Equipo médico-científico'],['516030','Equipo de hoteles y restaurantes'],['516035','Flota y equipo de transporte'],['516040','Flota y equipo fluvial y/o marítimo'],
['516045','Flota y equipo aéreo'],['516050','Flota y equipo férreo'],['516055','Acueductos, plantas y redes'],['516060','Armamento de vigilancia'],['516099','Ajustes por inflación'],['5165','Amortizaciones'],['516505','Vías de comunicación'],['516510','Intangibles'],
['516515','Cargos diferidos'],['516595','Otras'],['516599','Ajustes por inflación'],['5195','Diversos'],['519505','Comisiones'],['519510','Libros, suscripciones, periódicos y revistas'],['519515','Música ambiental'],['519520','Gastos de representación y relaciones publicas'],
['519525','Elementos de aseo y cafetería'],['519530','Útiles, papelería y fotocopias'],['51953001','Papelería'],['519535','Combustibles y lubricantes'],['519540','Envases y empaques'],['519545','Taxis y buses'],['519550','Estampillas'],['519555','Microfilmación'],
['519560','Casino y restaurante'],['519565','Parqueaderos'],['519570','Indemnización por daños a terceros'],['519575','Pólvora y similares'],['519595','Otros'],['519599','Ajustes por inflación'],['5199','Provisiones'],['519905','Inversiones'],
['519910','Deudores'],['519915','Propiedades, planta y equipo'],['519995','Otros Activos'],['519999','Ajustes por inflación'],['52','Operacionales de ventas'],['5205','Gastos de personal'],['520503','Salario integral'],['520506','Sueldos'],
['520507','Cuota de Sostenimiento'],['520512','Jornales'],['520515','Horas extras y recargos'],['520518','Comisiones'],['520521','Viáticos'],['520524','Incapacidades'],['520525','Licencias'],['520527','Auxilio de transporte'],
['520530','Cesantías'],['520533','Intereses sobre cesantías'],['520536','Prima de servicios'],['520539','Vacaciones'],['520542','Primas extralegales'],['520543','Bonificación Extralegal'],['520545','Auxilios'],['520548','Bonificaciones'],
['520551','Dotación y suministro a trabajadores'],['520554','Seguros'],['520557','Cuotas partes pensiones de jubilación'],['520558','Amortización calculo actuarial pensiones de jubilación'],['520559','Pensiones de jubilación'],['520560','Indemnizaciones laborales'],['520563','Capacitación al personal'],['520566','Gastos deportivos y de recreación'],
['520568','Aportes a administradoras de riesgos profesionales A.R.P.'],['520569','Aportes a entidades promotoras de salud, EPS'],['520570','Pensiones'],['520572','Aportes cajas de compensación familiar'],['520575','Aportes I.C.B.F.'],['520578','Sena'],['520581','Aportes sindicales'],['520584','Gastos médicos y drogas'],
['520595','Otros'],['520599','Ajustes por inflación'],['5210','Honorarios'],['521005','Junta directiva'],['521010','Revisoría fiscal'],['521015','Auditoria externa'],['521020','Avalúos'],['521025','Asesoría jurídica'],
['521030','Asesoría financiera'],['521035','Asesoría técnica'],['521095','Otros'],['521099','Ajustes por inflación'],['5215','Impuestos'],['521505','Industria y comercio'],['521510','De timbres'],['521515','A la propiedad raíz'],
['521520','Derechos sobre instrumentos públicos'],['521525','De valorización'],['521530','De turismo'],['521535','Tasa por utilización de puertos'],['521540','De vehículos'],['521545','De espectáculos públicos'],['521550','Cuotas de fomento'],['521555','Licores'],
['521560','Cervezas'],['521565','Cigarrillos'],['521570','Iva descontable'],['521595','Otros impuesto sobretasa 2003'],['521599','Ajustes por inflación'],['5220','Arrendamientos'],['522005','Terrenos'],['522010','Construcciones y edificaciones'],
['522015','Maquinaria y equipo'],['522020','Equipo de oficina'],['522025','Equipo de computación y comunicación'],['522030','Equipo médico-científico'],['522035','Equipo de hoteles y restaurantes'],['522040','Flota y equipo de transporte'],['522045','Flota y equipo fluvial y/o marítimo'],['522050','Flota y equipo aéreo'],
['522055','Flota y equipo férreo'],['522060','Acueductos plantas y redes'],['522065','Aeródromos'],['522070','Semovientes'],['522095','Otros'],['522099','Ajustes por inflación'],['5225','Contribuciones y afiliaciones'],['522505','Contribuciones'],
['522510','Afiliaciones y sostenimiento'],['522599','Ajustes por inflación'],['5230','Seguros'],['523005','Manejo'],['523010','Cumplimiento'],['523015','Corriente débil'],['523020','Vida colectiva'],['523025','Incendio'],
['523030','Terremoto'],['523035','Sustracción y hurto'],['523040','Flota y equipo de transporte'],['523045','Flota y equipo fluvial y/o marítimo'],['523050','Flota y equipo aéreo'],['523055','Flota y equipo férreo'],['523060','Responsabilidad civil y extracontractual'],['523065','Vuelo'],
['523070','Rotura de maquinaria'],['523075','Obligatorio accidente de transito'],['523080','Lucro cesante'],['523085','Transporte de mercancía'],['523095','Otros'],['523099','Ajustes por inflación'],['5235','Servicios'],['523505','Aseo y vigilancia'],
['523510','Temporales'],['523515','Asistencia técnica'],['523520','Procesamiento electrónico de datos'],['523525','Acueducto y alcantarillado'],['523530','Energía eléctrica'],['523535','Telefono'],['523540','Correo, portes y telegramas'],['523545','Fax y télex'],
['523550','Transporte, fletes y acarreos'],['523555','Gas'],['523560','Propaganda y publicidad'],['523595','Otros'],['523599','Ajustes por inflación'],['5240','Gastos legales'],['524005','Notariales'],['524010','Registro mercantil'],
['524015','Tramites y licencias'],['524020','Aduaneros'],['524025','Consulares'],['524095','Otros'],['524099','Ajustes por inflación'],['5245','Mantenimiento y reparaciones'],['524505','Terrenos'],['524510','Construcciones y edificaciones'],
['524515','Maquinaria y equipo'],['524520','Equipo de oficina'],['524525','Equipo de computación y comunicación'],['524530','Equipo médico-científico'],['524535','Equipo de hoteles y restaurantes'],['524540','Flota y equipo de transporte - mantenimiento de vehículo'],['524545','Flota y equipo fluvial y/o marítimo'],['524550','Flota y equipo aéreo'],
['524555','Flota y equipo férreo'],['524560','Acueductos plantas y redes'],['524565','Armamento de vigilancia'],['524570','Vías de comunicación'],['524599','Ajustes por inflación'],['5250','Adecuación e instalación'],['525005','Instalaciones eléctricas'],['525010','Arreglos ornamentales'],
['525015','Reparaciones locativas'],['525095','Otros'],['525099','Ajustes por inflación'],['5255','Gastos de viaje'],['525505','Alojamiento y manutención'],['525510','Pasajes fluviales y/o marítimos'],['525515','Pasajes aéreos'],['525520','Pasajes terrestres'],
['525525','Pasajes férreos'],['525595','Otros'],['525599','Ajustes por inflación'],['5260','Depreciaciones'],['526005','Construcciones y edificaciones'],['526010','Maquinaria y equipo'],['526015','Equipo de oficina'],['526020','Equipo de computación y comunicación'],
['526025','Equipo médico-científico'],['526030','Equipo de hoteles y restaurantes'],['526035','Flota y equipo de transporte'],['526040','Flota y equipo fluvial y/o marítimo'],['526045','Flota y equipo aéreo'],['526050','Flota y equipo férreo'],['526055','Acueductos, plantas y redes'],['526060','Armamento de vigilancia'],
['526065','Envases y empaques'],['526099','Ajustes por inflación'],['5265','Amortizaciones'],['526505','Vías de comunicación'],['526510','Intangibles'],['526515','Cargos diferidos'],['526595','Otras'],['526599','Ajustes por inflación'],
['5270','Financieros - reajuste del sistema'],['527099','Ajustes por inflación'],['5275','Pérdidas método de participación'],['527505','De sociedades anónimas y/o asimiladas'],['527510','De sociedades limitadas y/o asimiladas'],['5295','Diversos'],['529505','Comisiones'],['529510','Libros, suscripciones, periódicos y revistas'],
['529515','Música ambiental'],['529520','Gastos de representación y relaciones publicas'],['529525','Elementos de aseo y cafetería'],['529530','Útiles, papelería y fotocopias'],['529535','Combustibles y lubricantes'],['529540','Envases y empaques'],['529545','Taxis y buses'],['529550','Estampillas'],
['529555','Microfilmacion'],['529560','Casino y restaurante'],['529565','Parqueaderos'],['529566','Peajes'],['529570','Indemnización por daños a terceros'],['529575','Pólvora y similares'],['529595','Otros'],['529599','Ajustes por inflación'],
['5299','Provisiones'],['529905','Inversiones'],['529910','Deudores'],['529915','Inventarios'],['529920','Propiedades, planta y equipo'],['529995','Otros activos'],['529999','Ajustes por inflación'],['53','No operacionales'],
['5305','Financieros'],['530505','Gastos bancarios'],['530510','Reajuste monetario - Upac'],['530515','Comisiones'],['53051501','Comisiones bancarias'],['53051502','Comisiones tarjetas de crédito'],['530520','Intereses'],['530525','Diferencia en cambio'],
['530530','Gastos en negociación certificados de cambio'],['530535','Descuentos comerciales condicionados'],['530540','Gastos manejo y emisión de bonos'],['530545','Prima amortizada'],['530595','Otros'],['530599','Ajustes por inflación'],['5310','Perdida en venta y retiro de bienes'],['531005','Venta de inversiones'],
['531010','Venta de cartera'],['531015','Venta de propiedades planta y equipo'],['531020','Venta de intangibles'],['531025','Venta de otros activos'],['531030','Retiro de propiedades planta y equipo'],['531035','Retiro de otros activos'],['531040','Perdidas por siniestros'],['531095','Otros'],
['531099','Ajustes por inflación'],['5313','Pérdidas método de participación'],['531305','De sociedades anónimas y/o asimiladas'],['531310','De sociedades limitadas y/o asimiladas'],['5315','Gastos extraordinarios'],['531505','Costas y procesos judiciales'],['531510','Actividades culturales y cívicas'],['531515','Costos y gastos de ejercicios anteriores'],
['531520','Impuestos asumidos'],['531595','Otros'],['531599','Ajustes por inflación'],['5395','Gastos diversos'],['539505','Demandas laborales'],['539510','Demandas por incumplimiento de contratos'],['539515','Indemnizaciones'],['539520','Multas, sanciones y litigios'],
['539525','Donaciones'],['539530','Constitución de garantías'],['539535','Amortización de bienes entregados en comodato'],['539595','Otros'],['539599','Ajustes por inflación'],['54','Impuesto de renta y complementarios'],['5405','Impuesto de renta y complementarios'],['540505','Impuesto de renta y complementarios'],
['59','Ganancias y perdidas'],['5905','Ganancias y perdidas'],['590505','Ganancias y perdidas'],['6','Costos de ventas'],['61','Costo de ventas y de prestación de servicios'],['6105','Agricultura, ganadería, caza y silvicultura'],['610505','Cultivo de cereales'],['610510','Cultivos de hortalizas, legumbres y plantas ornamentales'],
['610515','Cultivos de frutas, nueces y plantas aromáticas'],['610520','Cultivo de café'],['610525','Cultivo de flores'],['610530','Cultivo de caña de azúcar'],['610535','Cultivo de algodón y plantas para material textil'],['610540','Cultivo de banano'],['610545','Otros cultivos agrícolas'],['610550','Cría de ovejas, cabras, asnos, mulas y burdéganos'],
['610555','Cría de ganado caballar y vacuno.'],['610560','Producción avícola'],['610565','Cría de otros animales'],['610570','Servicios agrícolas y ganaderos'],['610575','Actividad de caza'],['610580','Actividad de silvicultura'],['610595','Actividades conexas'],['610599','Ajustes por inflación'],
['6110','Pesca'],['611005','Actividad de pesca'],['611010','Explotación de criaderos de peces'],['611095','Actividades conexas'],['611099','Ajustes por inflación'],['6115','Explotación de minas y canteras'],['611505','Carbón'],['611510','Petróleo crudo'],
['611512','Gas natural'],['611514','Servicios relacionados con extracción de petróleo y gas'],['611515','Minerales de hierro'],['611520','Minerales metalíferos no ferrosos'],['611525','Piedra, arena y arcilla'],['611527','Piedras preciosas'],['611528','Oro'],['611530','Otras minas y canteras'],
['611532','Prestación de servicios sector minero'],['611595','Actividades conexas'],['611599','Ajustes por inflación'],['6120','Industrias manufactureras'],['612001','Producción y procesamiento de carnes y productos cárnicos'],['612002','Productos de pescado'],['612003','Productos de frutas, legumbres y hortalizas'],['612004','Elaboración de aceites y grasas'],
['612005','Elaboración de productos lácteos'],['612006','Elaboración de productos de molinería'],['612007','Elaboración de almidones y derivados'],['612008','Elaboración de alimentos para animales'],['612009','Elaboración de productos para panadería'],['612010','Elaboración de azúcar y melazas'],['612011','Elaboración de cacao, chocolate y confitería'],['612012','Elaboración de pastas y productos farináceos'],
['612013','Elaboración de productos de café'],['612014','Elaboración de otros productos alimenticios'],['612015','Elaboración de bebidas alcohólicas y alcohol etílico'],['612016','Elaboración de vinos'],['612017','Elaboración de bebidas malteadas y de malta'],['612018','Elaboración de bebidas no alcohólicas'],['612019','Elaboración de productos de tabaco'],['612020','Preparación e hilatura de fibras textiles y tejeduría'],
['612021','Acabado de productos textiles'],['612022','Elaboración de artículos de materiales textiles'],['612023','Elaboración de tapices y alfombras'],['612024','Elaboración de cuerdas, cordeles, bramantes y redes'],['612025','Elaboración de otros productos textiles'],['612026','Elaboración de tejidos'],['612027','Elaboración de prendas de vestir'],['612028','Preparación, adobo y teñido de pieles'],
['612029','Curtido, adobo o preparación de cuero'],['612030','Elaboración de maletas, bolsos y similares'],['612031','Elaboración de calzado'],['612032','Producción de madera, artículos de madera y corcho'],['612033','Elaboración de pasta y productos de madera, papel y cartón'],['612034','Ediciones y publicaciones'],['612035','Impresión'],['612036','Servicios relacionados con la edición y la impresión'],
['612037','Reproducción de grabaciones'],['612038','Elaboración de productos de horno de coque'],['612039','Elaboración de productos de la refinación de petróleo'],['612040','Elaboración de sustancias químicas básicas'],['612041','Elaboración de abonos y compuestos de nitrógeno'],['612042','Elaboración de plástico y caucho sintético'],['612043','Elaboración de productos químicos de uso agropecuario'],['612044','Elaboración de pinturas, tintas y masillas'],
['612045','Elaboración de productos farmacéuticos y botánicos'],['612046','Elaboración de jabones, detergentes y preparados de tocador'],['612047','Elaboración de otros productos químicos'],['612048','Elaboración de fibras'],['612049','Elaboración de otros productos de caucho'],['612050','Elaboración de productos de plástico'],['612051','Elaboración de vidrio y productos de vidrio'],['612052','Elaboración de productos de cerámica, loza, piedra, arcilla y porcelana'],
['612053','Elaboración de cemento, cal y yeso'],['612054','Elaboración de artículos de hormigón, cemento y yeso'],['612055','Corte, tallado y acabado de la piedra'],['612056','Elaboración de otros productos minerales no metálicos'],['612057','Industrias básicas y fundición de hierro y acero'],['612058','Productos primarios de metales preciosos y de metales no ferrosos'],['612059','Fundición de metales no ferrosos'],['612060','Fabricación de productos metálicos para uso estructural'],
['612061','Forja, prensado, estampado, laminado de metal y'],['612062','Revestimiento de metales y obras de ingeniería mecánica'],['612063','Fabricación de artículos de ferretería'],['612064','Elaboración de otros productos de metal'],['612065','Fabricación de maquinaria y equipo'],['612066','Fabricación de equipos de elevación y manipulación'],['612067','Elaboración de aparatos de uso domestico'],['612068','Elaboración de equipo de oficina'],
['612069','Elaboración de pilas y baterías primarias'],['612070','Elaboración de equipo de iluminación'],['612071','Elaboración de otros tipos de equipo eléctrico'],['612072','Fabricación de equipos de radio, televisión y comunicaciones'],['612073','Fabricación de aparatos e instrumentos médicos'],['612074','Fabricación de instrumentos de medición y control'],['612075','Fabricación de instrumentos de óptica y equipo fotográfico'],['612076','Fabricación de relojes'],
['612077','Fabricación de vehículos automotores'],['612078','Fabricación de carrocerías para automotores'],['612079','Fabricación de partes piezas y accesorios para automotores'],['612080','Fabricación y reparación de buques y otras embarcaciones'],['612081','Fabricación de locomotoras y material rodante para ferrocarriles'],['612082','Fabricación de aeronaves'],['612083','Fabricación de motocicletas'],['612084','Fabricación de bicicletas y sillas de ruedas'],
['612085','Fabricación de otros tipos de transporte'],['612086','Fabricación de muebles'],['612087','Fabricación de joyas y artículos conexos'],['612088','Fabricación de instrumentos de música'],['612089','Fabricación de artículos y equipo para deporte'],['612090','Fabricación de juegos y juguetes'],['612091','Reciclamiento de desperdicios'],['612095','Productos de otras industrias manufactureras'],
['612099','Ajustes por inflación'],['6125','Suministro de electricidad, gas y agua'],['612505','Generación, captación y distribución de energía eléctrica'],['612510','Fabricación de gas y distribución de combustibles gaseosos'],['612515','Captación, depuración y distribución de agua'],['612595','Actividades conexas'],['612599','Ajustes por inflación'],['6130','Construcción'],
['613005','Preparación de terrenos'],['613010','Construcción de edificios y obras de ingeniería civil'],['613015','Acondicionamiento de edificios'],['613020','Terminación de edificaciones'],['613025','Alquiler de equipo con operario'],['613095','Actividades conexas'],['613099','Ajustes por inflación'],['6135','Comercio al por mayor y al por menor'],
['613502','Venta de vehículos automotores'],['613504','Mantenimiento, reparación y lavado de vehículos automotores'],['613506','Venta de partes, piezas y accesorios de vehículos automotores'],['613508','Venta de combustibles solidos, líquidos, gaseosos'],['613510','Venta de lubricantes, aditivos, llantas y lujos para automotores'],['613512','Venta a cambio de retribución o por contrata'],['613514','Venta de insumos, materias primas agropecuarias y flores'],['613516','Venta de otros insumos y materias primas no agropecuarias'],
['613518','Venta de animales vivos y cueros'],['613520','Venta de productos en almacenes no especializados'],['613522','Venta de productos agropecuarios'],['613524','Venta de productos textiles, de vestir, de cuero y calzado'],['613526','Venta de papel y cartón'],['613528','Venta de libros, revistas, elementos de papelería, útiles y textos escolares'],['613530','Venta de juegos, juguetes y artículos deportivos'],['613532','Venta de instrumentos quirúrgicos y ortopédicos'],
['613534','Venta de artículos en relojerías y joyerías'],['613536','Venta de electrodomésticos y muebles'],['61353601','Venta de electrodomésticos'],['61353680','Venta de electrodomésticos'],['613538','Venta de productos de aseo, farmacéuticos, medicinales, y artículos de tocador'],['613540','Venta de cubiertos, vajillas, cristalería, porcelanas, cerámicas y otros artículos de uso domestico'],['613542','Venta de materiales de construcción, fontanería y calefacción'],['613544','Venta de pinturas y lacas'],
['613546','Venta de productos de vidrios y marquetería'],['613548','Venta de herramientas y artículos de ferretería'],['613550','Venta de químicos'],['613552','Venta de productos intermedios, desperdicios y desechos'],['613554','Venta de maquinaria, equipo de oficina y programas de computador'],['613556','Venta de artículos en cacharrerías y misceláneas'],['613558','Venta de instrumentos musicales'],['613560','Venta de artículos en casas de empeño y prenderías'],
['613562','Venta de equipo fotográfico'],['613564','Venta de equipo óptico y de precisión'],['613566','Venta de empaques'],['613568','Venta de equipo profesional y científico'],['613570','Venta de loterías, rifas, chance, apuestas y similares'],['613572','Reparación de efectos personales y electrodomésticos'],['613595','Venta de otros productos'],['613599','Ajustes por inflación'],
['6140','Hoteles y restaurantes'],['614005','Hotelería'],['614010','Campamento y otros tipos de hospedaje'],['614015','Restaurantes'],['614020','Bares y cantinas'],['614095','Actividades conexas'],['614099','Ajustes por inflación'],['6145','Transporte, almacenamiento y comunicaciones'],
['614505','Servicio de transporte por carretera'],['614510','Servicio de transporte por vía férrea'],['614515','Servicio de transporte por vía acuática'],['614520','Servicio de transporte por vía aérea'],['614525','Servicio de transporte por tuberías'],['614530','Manipulación de carga'],['614535','Almacenamiento y deposito'],['614540','Servicios complementarios para el transporte'],
['614545','Agencias de viaje'],['614550','Otras agencias de transporte'],['614555','Servicio postal y de correo'],['614560','Servicio telefónico'],['614565','Servicio de telégrafo'],['614570','Servicio de transmisión de datos'],['614575','Servicio de radio y televisión por cable'],['614580','Transmisión de sonido e imágenes por contrato'],
['614595','Actividades conexas'],['614599','Ajustes por inflación'],['6150','Actividad financiera'],['615005','De inversiones'],['615010','De servicio de bolsa'],['615099','Ajustes por inflación'],['6155','Actividades inmobiliarias, empresariales y de alquiler'],['615505','Arrendamientos de bienes inmuebles'],
['615510','Inmobiliarias por retribución o contrata'],['615515','Alquiler equipo de transporte'],['615520','Alquiler maquinaria y equipo'],['615525','Alquiler de efectos personales y enseres domésticos'],['615530','Consultoría en equipo y programas de informática'],['615535','Procesamiento de datos'],['615540','Mantenimiento y reparación de maquinaria de oficina'],['615545','Investigaciones científicas y de desarrollo'],
['615550','Actividades empresariales de consultoría'],['615555','Publicidad'],['615560','Dotación de personal'],['615565','Investigación y seguridad'],['615570','Limpieza de inmuebles'],['615575','Fotografía'],['615580','Envase y empaque'],['615585','Fotocopiado'],
['615590','Mantenimiento y reparación de maquinaria y equipo'],['615595','Actividades conexas'],['615599','Ajustes por inflación'],['6160','Enseñanza'],['616005','Actividades relacionadas con la educación'],['616099','Ajustes por inflación'],['6165','Servicios sociales y de salud'],['616505','Servicio hospitalario'],
['616510','Servicio medico'],['616515','Servicio odontológico'],['616520','Servicio de laboratorio'],['616525','Actividades veterinarias'],['616530','Actividades de servicios sociales'],['616595','Actividades conexas'],['616599','Ajustes por inflación'],['6170','Otras actividades de servicios comunitarios, sociales y personales'],
['617005','Eliminación de desperdicios y aguas residuales'],['617010','Actividades de asociación'],['617015','Producción y distribución de filmes y videocintas'],['617020','Exhibición de filmes y videocintas'],['617025','Actividad de radio y televisión'],['617030','Actividad teatral, musical y artística'],['617035','Grabación y producción de discos'],['617040','Entretenimiento y esparcimiento (Eventos)'],
['617045','Agencias de noticias'],['617050','Lavanderías y similares'],['617055','Peluquerías y similares'],['617060','Servicios funerarios'],['617065','Zonas francas'],['617095','Actividades conexas'],['617099','Ajustes por inflación'],['62','Compras'],
['6205','De mercancías'],['620599','Ajustes por inflación'],['6210','De materias primas'],['621099','Ajustes por inflación'],['6215','De materiales indirectos'],['621599','Ajustes por inflación'],['6220','Compra de energía'],['622099','Ajustes por inflación'],
['6225','Devoluciones rebajas y descuentos en compras (Cr)'],['622501','Devoluciones, rebajas y descuentos en compras'],['622599','Ajustes por inflación'],['7','Costos de producción o de operación'],['71','Materia prima'],['7105','Materias primas'],['710501','Materias primas utilizadas'],['72','Mano de obra directa'],
['7205','Gastos de personal'],['720503','Salario integral'],['720506','Sueldos'],['720507','Cuota de Sostenimiento'],['720512','Jornales'],['720515','Horas extras y recargos'],['720518','Comisiones'],['720521','Viáticos'],
['720524','Incapacidades'],['720525','Licencias'],['720527','Auxilio de transporte'],['720530','Cesantías'],['720533','Intereses sobre cesantías'],['720536','Prima de servicios'],['720539','Vacaciones'],['720542','Primas extralegales'],
['720543','Bonificación Extralegal'],['720545','Auxilios'],['720548','Bonificaciones'],['720551','Dotación y suministro a trabajadores'],['720554','Seguros'],['720557','Cuotas partes pensiones de jubilación'],['720558','Amortización calculo actuarial pensiones de jubilación'],['720559','Pensiones de jubilación'],
['720560','Indemnizaciones laborales'],['720563','Capacitación al personal'],['720566','Gastos deportivos y de recreación'],['720568','Aportes a administradoras de riesgos profesionales A.R.P.'],['720569','Aportes Eps'],['720570','Aportes a fondos de pensiones y/o cesantías'],['720572','Aportes cajas de compensación familiar'],['720575','Aportes I.C.B.F.'],
['720578','Sena'],['720581','Aportes sindicales'],['720584','Gastos médicos y drogas'],['720595','Otros'],['720599','Ajustes por inflación'],['73','Costos indirectos'],['7305','Gastos de personal'],['730503','Salario integral'],
['730506','Sueldos'],['730507','Cuota de Sostenimiento'],['730512','Jornales'],['730515','Horas extras y recargos'],['730518','Comisiones'],['730521','Viáticos'],['730524','Incapacidades'],['730525','Licencias'],
['730527','Auxilio de transporte'],['730530','Cesantías'],['730533','Intereses sobre cesantías'],['730536','Prima de servicios'],['730539','Vacaciones'],['730542','Primas extralegales'],['730543','Bonificación Extralegal'],['730545','Auxilios'],
['730548','Bonificaciones'],['730551','Dotación y suministro a trabajadores'],['730554','Seguros'],['730557','Cuotas partes pensiones de jubilación'],['730558','Amortización calculo actuarial pensiones de jubilación'],['730559','Pensiones de jubilación'],['730560','Indemnizaciones laborales'],['730563','Capacitación al personal'],
['730566','Gastos deportivos y de recreación'],['730568','Aportes a administradoras de riesgos profesionales A.R.P.'],['730569','Aportes Eps'],['730570','Aportes a fondos de pensiones y/o cesantías'],['730572','Aportes cajas de compensación familiar'],['730575','Aportes I.C.B.F.'],['730578','Sena'],['730581','Aportes sindicales'],
['730584','Gastos médicos y drogas'],['730595','Otros'],['730599','Ajustes por inflación'],['7310','Honorarios'],['731005','Junta directiva'],['731010','Revisoría fiscal'],['731015','Auditoria externa'],['731020','Avalúos'],
['731025','Asesoría jurídica'],['731030','Asesoría financiera'],['731035','Asesoría técnica'],['731095','Otros'],['731099','Ajustes por inflación'],['7315','Impuestos'],['731505','Industria y comercio'],['731510','De timbres'],
['731515','A la propiedad raíz'],['731520','Derechos sobre instrumentos públicos'],['731525','De valorización'],['731530','De turismo'],['731535','Tasa por utilización de puertos'],['731540','De vehículos'],['731545','De espectáculos públicos'],['731550','Cuotas de fomento'],
['731570','Iva descontable'],['731595','Otros'],['731599','Ajustes por inflación'],['7320','Arrendamientos'],['732005','Terrenos'],['732010','Construcciones y edificaciones'],['732015','Maquinaria y equipo'],['732020','Equipo de oficina'],
['732025','Equipo de computación y comunicación'],['732030','Equipo médico-científico'],['732035','Equipo de hoteles y restaurantes'],['732040','Flota y equipo de transporte'],['732045','Flota y equipo fluvial y/o marítimo'],['732050','Flota y equipo aéreo'],['732055','Flota y equipo férreo'],['732060','Acueductos plantas y redes'],
['732065','Aeródromos'],['732070','Semovientes'],['732095','Otros'],['732099','Ajustes por inflación'],['7325','Contribuciones y afiliaciones'],['732505','Contribuciones'],['732510','Afiliaciones y sostenimiento'],['732599','Ajustes por inflación'],
['7330','Seguros'],['733005','Manejo'],['733010','Cumplimiento'],['733015','Corriente débil'],['733020','Vida colectiva'],['733025','Incendio'],['733030','Terremoto'],['733035','Sustracción y hurto'],
['733040','Flota y equipo de transporte'],['733045','Flota y equipo fluvial y/o marítimo'],['733050','Flota y equipo aéreo'],['733055','Flota y equipo férreo'],['733060','Responsabilidad civil y extracontractual'],['733065','Vuelo'],['733070','Rotura de maquinaria'],['733075','Obligatorio accidente de transito'],
['733080','Lucro Cesante'],['733085','Transporte de mercancía'],['733095','Otros'],['733099','Ajustes por inflación'],['7335','Servicios'],['733505','Aseo y vigilancia'],['733510','Temporales'],['733515','Asistencia técnica'],
['733520','Procesamiento electrónico de datos'],['733525','Acueducto y alcantarillado'],['733530','Energía eléctrica'],['733535','Teléfono'],['73353501','Teléfono gravado'],['73353502','Teléfono no gravado'],['733540','Correo, portes y telegramas'],['733545','Fax y télex'],
['733550','Transporte, fletes y acarreos'],['733555','Gas'],['733595','Otros'],['733599','Ajustes por inflación'],['7340','Gastos legales'],['734005','Notariales'],['734010','Registro mercantil'],['734015','Tramites y licencias'],
['734020','Aduaneros'],['734025','Consulares'],['734095','Otros'],['734099','Ajustes por inflación'],['7345','Mantenimiento y reparaciones'],['734505','Terrenos'],['734510','Construcciones y edificaciones'],['734515','Maquinaria y equipo'],
['734520','Equipo de oficina'],['734525','Equipo de computación y comunicación'],['734530','Equipo medico-científico'],['734535','Equipo de hoteles y restaurantes'],['734540','Flota y equipo de transporte'],['734545','Flota y equipo fluvial y/o marítimo'],['734550','Flota y equipo aéreo'],['734555','Flota y equipo férreo'],
['734560','Acueductos plantas y redes'],['734565','Armamento de vigilancia'],['734570','Vías de comunicación'],['734599','Ajustes por inflación'],['7350','Adecuación e instalación'],['735005','Instalaciones eléctricas'],['735010','Arreglos ornamentales'],['735015','Reparaciones locativas'],
['735095','Otros'],['735099','Ajustes por inflación'],['7355','Gastos de viaje'],['735505','Alojamiento y manutención'],['735510','Pasajes fluviales y marítimos'],['735515','Pasajes aéreos'],['735520','Pasajes terrestres'],['735525','Pasajes férreos'],
['735595','Otros'],['735599','Ajustes por inflación'],['7360','Depreciaciones'],['736005','Construcciones y edificaciones'],['736010','Maquinaria y equipo'],['736015','Equipo de oficina'],['736020','Equipo de computación y comunicación'],['736025','Equipo médico-científico'],
['736030','Equipo de hoteles y restaurantes'],['736035','Flota y equipo de transporte'],['736040','Flota y equipo fluvial y/o marítimo'],['736045','Flota y equipo aéreo'],['736050','Flota y equipo férreo'],['736055','Acueductos, plantas y redes'],['736060','Armamento de vigilancia'],['736099','Ajustes por inflación'],
['7365','Amortizaciones'],['736505','Vías de comunicación'],['736510','Intangibles'],['736515','Cargos diferidos'],['736595','Otras'],['736599','Ajustes por inflación'],['7395','Diversos'],['739505','Comisiones'],
['739510','Libros, suscripciones, periódicos y revistas'],['739515','Música ambiental'],['739520','Gastos de representación y relaciones publicas'],['739525','Elementos de aseo y cafetería'],['739530','Útiles, papelería y fotocopias'],['73953001','Papelería'],['739535','Combustibles y lubricantes'],['739540','Envases y empaques'],
['739545','Taxis y buses'],['739550','Estampillas'],['739555','Microfilmacion'],['739560','Casino y restaurante'],['739565','Parqueaderos'],['739570','Indemnización por daños a terceros'],['739575','Pólvora y similares'],['739595','Otros'],
['739599','Ajustes por inflación'],['7399','Provisiones'],['739905','Inversiones'],['739910','Deudores'],['739915','Propiedades, planta y equipo'],['739995','Otros activos'],['739999','Cif por aplicar'],['74','Contratos de servicios'],
['7435','Servicios'],['743595','Otros servicios'],['8','Cuentas de orden deudoras'],['81','Derechos contingentes'],['8105','Bienes y valores entregados en custodia'],['810505','Valores mobiliarios'],['810510','Bienes muebles'],['810599','Ajustes por inflación'],
['8110','Bienes y valores entregados en garantía'],['811005','Valores mobiliarios'],['811010','Bienes muebles'],['811015','Bienes inmuebles'],['811020','Contratos de ganado en participación'],['811099','Ajustes por inflación'],['8115','Bienes y valores en poder de terceros'],['811505','En arrendamiento'],
['811510','En préstamo'],['811515','En deposito'],['811520','En consignación'],['811599','Ajustes por inflación'],['8120','Litigios y/o demandas'],['812005','Ejecutivos'],['812010','Incumplimiento de contratos'],['8125','Promesas de compraventa'],
['8195','Diversas'],['819505','Valores adquiridos por recibir'],['819595','Otras'],['819599','Ajustes por inflación'],['82','Deudoras fiscales'],['83','Deudoras de control'],['8305','Bienes recibidos en arrendamiento financiero'],['830505','Bienes muebles'],
['830510','Bienes inmuebles'],['830599','Ajustes por inflación'],['8310','Títulos de inversión no colocados'],['831005','Acciones'],['831010','Bonos'],['831095','Otros'],['8315','Propiedades planta y equipo totalmente depreciados, agotados y/o amortizados'],['831506','Materiales proyectos petroleros'],
['831516','Construcciones y edificaciones'],['831520','Maquinaria y equipo'],['831524','Equipo de oficina'],['831528','Equipo de computación y comunicación'],['831532','Equipo médico-científico'],['831536','Equipo de hoteles y restaurantes'],['831540','Flota y equipo de transporte'],['831544','Flota y equipo fluvial y/o marítimo'],
['831548','Flota y equipo aéreo'],['831552','Flota y equipo férreo'],['831556','Acueductos, plantas y redes'],['831560','Armamento de vigilancia'],['831562','Envases y empaques'],['831564','Plantaciones agrícolas y forestales'],['831568','Vías de comunicación'],['831572','Minas y canteras'],
['831576','Pozos artesianos'],['831580','Yacimientos'],['831584','Semovientes'],['831599','Ajustes por inflación'],['8320','Créditos a favor no utilizados'],['832005','Pais'],['832010','Exterior'],['8325','Activos castigados'],
['832505','Inversiones'],['832510','Deudores'],['832595','Otros Activos'],['8330','Títulos de inversión amortizados'],['833005','Bonos'],['833095','Otros'],['8335','Capitalización por revalorización de patrimonio'],['8395','Otras cuentas deudoras de control'],
['839505','Cheques posfechados'],['839510','Certificados de deposito a termino'],['839515','Cheques devueltos'],['839520','Bienes y valores en fideicomiso'],['839525','Intereses sobre deudas vencidas'],['839595','Diversas'],['839599','Ajustes por inflación'],['8399','Ajustes por inflación activos'],
['839905','Inversiones'],['839910','Inventarios'],['839915','Propiedades planta y equipo'],['839920','Intangibles'],['839925','Cargos diferidos'],['839995','Otros Activos'],['84','Derechos contingentes por contra (Cr)'],['85','Deudoras fiscales por contra (Cr)'],
['86','Deudoras de control por contra (Cr)'],['9','Cuentas de orden acreedoras'],['91','Responsabilidades contingentes'],['9105','Bienes y valores recibidos en custodia'],['910505','Valores mobiliarios'],['910510','Bienes muebles'],['910599','Ajustes por inflación'],['9110','Bienes y valores recibidos en garantía'],
['911005','Valores mobiliarios'],['911010','Bienes muebles'],['911015','Bienes inmuebles'],['911020','Contratos de ganado en participación'],['911099','Ajustes por inflación'],['9115','Bienes y valores recibidos de terceros'],['911505','En arrendamiento'],['911510','En préstamo'],
['911515','En deposito'],['911520','En consignación'],['911525','En comodato'],['911599','Ajustes por inflación'],['9120','Litigios y/o demandas'],['912005','Laborales'],['912010','Civiles'],['912015','Administrativos o arbitrales'],
['912020','Tributarios'],['9125','Promesas de compraventa'],['9130','Contratos de administración delegada'],['9135','Cuentas en participación'],['9195','Otras responsabilidades contingentes'],['92','Acreedoras fiscales'],['93','Acreedoras de control'],['9305','Contratos de arrendamiento financiero'],
['930505','Bienes muebles'],['930510','Bienes inmuebles'],['9395','Otras cuentas de orden acreedoras de control'],['939505','Documentos por cobrar descontados'],['939510','Convenios de pago'],['939515','Contratos de construcciones e instalaciones por ejecutar'],['939520','Pedidos colocados'],['939525','Adjudicaciones pendientes de legalizar'],
['939530','Reserva articulo 3o. ley 4/80'],['939535','Reserva costo reposición semovientes'],['939595','Diversas'],['939599','Ajustes por inflación'],['9399','Ajustes por inflación patrimonio'],['939905','Capital social'],['939910','Superávit de capital'],['939915','Reservas'],
['939925','Dividendos o participaciones decretadas en acciones, cuotas o partes de interés social'],['939930','Resultados de ejercicios anteriores'],['94','Responsabilidades contingentes por contra (Db))'],['95','Acreedoras fiscales por contra (Db)'],['96','Acreedoras de control por contra (Db)']];

  // ── Meses español → número (para leer "AGO/31/2026") ─────────────
  const SAL_SIIMED_CLD_MESES = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};

  // ── Helpers ───────────────────────────────────────────────────────
  function salSiimedCldNorm(h){
    return String(h||'').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function salSiimedCldLog(msg,lvl='i',fase=''){
    const ts=new Date().toISOString();
    SAL_SIIMED_CLD_LOG.push({ts,fase,lvl,msg});
    const panel=document.getElementById('sal-logp');
    if(!panel)return;
    const now=new Date().toLocaleTimeString('es-CO',{hour12:false});
    const css={i:'li',w:'lw',o:'lo',e:'le-e'}[lvl]||'li';
    panel.innerHTML+=`<div class="le"><span class="lt">${now}</span><span class="${css}">${msg}</span></div>`;
    panel.scrollTop=panel.scrollHeight;
  }
  function salSiimedCldSleep(ms){return new Promise(r=>setTimeout(r,ms));}

  function salSiimedCldSetStep(n){
    for(let i=1;i<=4;i++){
      const wz=document.getElementById('sal-wt'+i);
      if(wz)wz.className='wz'+(i<n?' done':i===n?' on':'');
      const sec=document.getElementById('sal-s'+i);
      if(sec)sec.style.display=(i===n)?'block':'none';
    }
  }
  function salSiimedCldSetPStep(n){
    for(let i=0;i<=5;i++){
      const el=document.getElementById('sal-ps'+i);
      if(!el)continue;
      el.classList.toggle('act',i===n);
      el.classList.toggle('don',i<n);
    }
  }
  function salSiimedCldSetPct(pct,msg){
    const pb=document.getElementById('sal-pbar');
    const pp=document.getElementById('sal-ppct');
    const ph=document.getElementById('sal-pph');
    if(pb)pb.style.width=pct+'%';
    if(pp)pp.textContent=pct+'%';
    if(ph&&msg)ph.textContent=msg;
  }

  function salSiimedCldLimpiarCuenta(v){
    if(v===null||v===undefined||v==='')return '';
    return String(v).split('.')[0].replace(/\D/g,'');
  }
  function salSiimedCldLimpiarId(v){
    if(v===null||v===undefined||v==='')return '';
    return String(v).split('.')[0].replace(/\D/g,'');
  }
  function salSiimedCldDebitoCred(saldo){
    const s=parseFloat(saldo)||0;
    const abs=Math.abs(s);
    if(s>=0) return {deb:abs, cred:0};
    return {deb:0, cred:abs};
  }
  function salSiimedCldEsc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Leer Excel: Balance de Prueba por Tercero (SIIMED) ────────────
  async function salSiimedCldReadFile(file){
    return new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',raw:false,cellText:true});
          const wsName = wb.SheetNames.find(n=>salSiimedCldNorm(n)==='datos')||wb.SheetNames[0];
          const ws=wb.Sheets[wsName];
          const all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

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
                const mes=SAL_SIIMED_CLD_MESES[m[1].toLowerCase()];
                if(mes) fechaCorte=`${String(m[2]).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${m[3]}`;
              }
            });
          }

          let hdrIdx=-1;
          for(let i=0;i<Math.min(all.length,15);i++){
            const rn=(all[i]||[]).map(v=>salSiimedCldNorm(v));
            if(rn.includes('grupo') && rn.some(v=>v==='identificacion')){
              hdrIdx=i; break;
            }
          }
          if(hdrIdx<0) throw new Error('No se encontró la fila de encabezados (GRUPO / IDENTIFICACION) en el Balance.');

          const hdrsRaw=(all[hdrIdx]||[]).map(v=>String(v||'').trim());
          const HN=hdrsRaw.map(salSiimedCldNorm);

          const cGrupo   = HN.indexOf('grupo');
          const cDesc    = HN.indexOf('descripcion');
          const cIdent   = HN.indexOf('identificacion');
          const cSaldo   = HN.indexOf('nuevosaldo');
          let cCuentaFull=-1;
          HN.forEach((h,idx)=>{ if(h==='cuenta') cCuentaFull=idx; });

          if(cCuentaFull<0||cSaldo<0||cGrupo<0){
            throw new Error('No se encontraron columnas requeridas: CUENTA (completa) / NUEVOSALDO / GRUPO.');
          }

          const rows=all.slice(hdrIdx+1).filter(r=>{
            if(!r || r.every(v=>v===''||v===null||v===undefined)) return false;
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

  // ── Construir el mapa del Plan de Cuentas (PUC) EMBEBIDO ──────────
  // Ya no se lee de un archivo cargado por el usuario: se arma en
  // memoria, de forma síncrona, a partir de la constante
  // SAL_SIIMED_CLD_PUC_DATA definida arriba.
  function salSiimedCldBuildPucMap(){
    const map=new Map(); // codigo limpio -> nombre
    SAL_SIIMED_CLD_PUC_DATA.forEach(([codigo,nombre])=>{
      const cod=salSiimedCldLimpiarCuenta(codigo);
      if(!cod) return;
      if(!map.has(cod)) map.set(cod, String(nombre||'').trim());
    });
    return map;
  }

  // ── ETL principal: lee el balance y arranca la secuencia de modales ──
  async function startSiimedSalCldETL(){
    const file = SAL_SIIMED_CLD_S.file || (window.__SIIMED_SAL_S && window.__SIIMED_SAL_S.file);
    if(!file){ alert('Carga el archivo Balance de Prueba por Tercero de SIIMED.'); return; }
    try{
      const data = await salSiimedCldReadFile(file);
      const pucMap = salSiimedCldBuildPucMap();
      _siimedSalCldPending = { data, pucMap };
      salSiimedCldShowParamModal(data);
    }catch(err){
      alert('No se pudo leer el archivo: '+err.message);
      console.error(err);
    }
  }

  let _siimedSalCldPending = null;   // {data, pucMap}
  let _siimedSalCldClasif  = null;   // resultado de clasificar el balance
  let _siimedSalCldParams  = null;   // {empresa,nit,fecha}
  let _siimedSalCldTercero11Decisions = null; // {codigo: true/false}
  let _siimedSalCldMapeo   = null;   // Map(codigoOriginal -> {mapeada, estado})

  // ── Paso 1: clasificar el balance (misma lógica ya validada) ─────
  function salSiimedCldClasificar(data){
    const {rows,cCuentaFull,cDesc,cIdent,cSaldo}=data;
    const totalOrigen=rows.length;

    const registros=rows.map(r=>({
      cuenta: salSiimedCldLimpiarCuenta(r[cCuentaFull]),
      desc: cDesc>=0?String(r[cDesc]||'').trim():'',
      id: cIdent>=0?salSiimedCldLimpiarId(r[cIdent]):'',
      saldo: parseFloat(String(r[cSaldo]).replace(/[^0-9.\-]/g,''))||0
    })).filter(r=>r.cuenta);

    const todosLosCodigos = new Set(registros.map(r=>r.cuenta));
    const codigosConTercero = new Set(registros.filter(r=>r.id).map(r=>r.cuenta));

    // Nombre "oficial" de cada cuenta: preferimos la fila header/placeholder
    // (sin tercero) cuando existe; si no, cualquier fila de esa cuenta.
    const nombreCuenta = {};
    registros.forEach(r=>{
      if(!r.id && !nombreCuenta[r.cuenta]) nombreCuenta[r.cuenta]=r.desc;
    });
    registros.forEach(r=>{
      if(!nombreCuenta[r.cuenta]) nombreCuenta[r.cuenta]=r.desc;
    });

    const esPadre = (cuenta)=>{
      for(const other of todosLosCodigos){
        if(other!==cuenta && other.startsWith(cuenta)) return true;
      }
      return false;
    };

    const conTercero=[]; // mezcla: filas individuales por tercero + leaves sin tercero
    const excl=[];
    let excluidosPadre=0, excluidosHeader=0, excluidosCero=0;

    registros.forEach(r=>{
      if(r.id){
        if(Math.abs(r.saldo)<=0.001){ excluidosCero++; return; }
        conTercero.push(r);
      } else {
        if(codigosConTercero.has(r.cuenta)){ excluidosHeader++; return; }
        if(esPadre(r.cuenta)){
          excluidosPadre++;
          excl.push({cuenta:r.cuenta,desc:r.desc,motivo:'Cuenta padre (tiene auxiliares)',saldo:r.saldo});
          return;
        }
        if(Math.abs(r.saldo)<=0.001){ excluidosCero++; return; }
        conTercero.push(r);
      }
    });

    // Cuentas del grupo 11 que vienen desglosadas por tercero: son las
    // únicas candidatas a la pregunta "¿requiere manejo de tercero?".
    const codigos11ConTercero=[...new Set(
      conTercero.filter(r=>r.id && r.cuenta.startsWith('11')).map(r=>r.cuenta)
    )].sort();

    return {
      totalOrigen, conTercero, excl,
      excluidosPadre, excluidosHeader, excluidosCero,
      codigos11ConTercero, nombreCuenta, todosLosCodigos
    };
  }

  // ── Paso 2: aplicar decisiones de tercero (grupo 11) ──────────────
  // decisions: {codigo: true(requiere tercero) | false(agrupar a NIT)}
  //
  // Devuelve {registros, grupo11Info}. grupo11Info trae, por cada cuenta
  // agrupada al NIT, cuántos terceros se combinaron y el saldo neto
  // resultante — incluyendo las que dan exactamente $0 (por ejemplo una
  // cuenta con cientos de terceros cuyos saldos positivos y negativos se
  // cancelan entre sí). ANTES esas cuentas con saldo neto $0 se excluían
  // en silencio y desaparecían del Excel sin dejar rastro; ahora se
  // conservan siempre (con Débito=0 y Crédito=0) y además quedan
  // registradas en los logs y en la hoja "Cuentas Grupo 11 Agrupadas".
  function salSiimedCldAplicarDecisionesTercero(conTercero, decisions, nit, nombreCuenta){
    const porAgrupar = new Set(Object.keys(decisions).filter(c=>decisions[c]===false));
    const grupo11Info = [];
    if(porAgrupar.size===0) return { registros: conTercero.slice(), grupo11Info };

    const grupos = {}; // codigo -> {cuenta, desc, saldo, id:nit, n}
    const resto = [];
    conTercero.forEach(r=>{
      if(r.id && porAgrupar.has(r.cuenta)){
        // Se prefiere el nombre "oficial" de la cuenta (fila header /
        // placeholder del Balance) en vez del nombre del primer tercero
        // encontrado, para que la hoja de transparencia muestre el
        // nombre de la cuenta y no el de una persona al azar.
        if(!grupos[r.cuenta]) grupos[r.cuenta]={cuenta:r.cuenta, desc:(nombreCuenta&&nombreCuenta[r.cuenta])||r.desc, saldo:0, id:nit, n:0};
        grupos[r.cuenta].saldo += r.saldo;
        grupos[r.cuenta].n++;
      } else {
        resto.push(r);
      }
    });
    const agrupados = Object.values(grupos).map(g=>{
      const saldoNeto = Math.round(g.saldo*100)/100;
      const esCero = Math.abs(saldoNeto)<=0.001;
      grupo11Info.push({cuenta:g.cuenta, desc:g.desc, nTerceros:g.n, saldoNeto, esCero});
      return {cuenta:g.cuenta, desc:g.desc, saldo:saldoNeto, id:g.id};
    });
    return { registros: resto.concat(agrupados), grupo11Info };
  }

  // ── Paso 3: cruzar cuentas finales contra el PUC ──────────────────
  function salSiimedCldCruzarPuc(registrosFinal, pucMap){
    const codigos=[...new Set(registrosFinal.map(r=>r.cuenta))].sort();
    const existen=[], nuevas=[];
    codigos.forEach(c=>{
      if(pucMap.has(c)) existen.push(c); else nuevas.push(c);
    });
    return {codigos, existen, nuevas};
  }

  // ── Orquestación: tras el modal de parámetros, decide qué modal sigue ──
  async function salSiimedCldDespuesDeParametros(params){
    _siimedSalCldParams = params;
    _siimedSalCldClasif = salSiimedCldClasificar(_siimedSalCldPending.data);

    if(_siimedSalCldClasif.codigos11ConTercero.length>0){
      salSiimedCldShowTercero11Modal(_siimedSalCldClasif);
    } else {
      _siimedSalCldTercero11Decisions = {};
      await salSiimedCldDespuesDeTercero11();
    }
  }

  async function salSiimedCldDespuesDeTercero11(){
    const { registros: registrosFinal, grupo11Info } = salSiimedCldAplicarDecisionesTercero(
      _siimedSalCldClasif.conTercero, _siimedSalCldTercero11Decisions, _siimedSalCldParams.nit,
      _siimedSalCldClasif.nombreCuenta
    );
    _siimedSalCldClasif.registrosFinal = registrosFinal;
    _siimedSalCldClasif.grupo11Info = grupo11Info;

    const cruce = salSiimedCldCruzarPuc(registrosFinal, _siimedSalCldPending.pucMap);
    _siimedSalCldClasif.cruce = cruce;

    if(cruce.nuevas.length>0){
      salSiimedCldShowMappingModal(cruce.nuevas, _siimedSalCldClasif.nombreCuenta, _siimedSalCldPending.pucMap);
    } else {
      _siimedSalCldMapeo = new Map(cruce.existen.map(c=>[c,{mapeada:c,estado:'Existe en PUC'}]));
      await _runSiimedSalCldETL();
    }
  }

  // ── Motor final: genera filas destino + Excel ─────────────────────
  async function _runSiimedSalCldETL(){
    const t0=Date.now();
    salSiimedCldSetStep(3);
    SAL_SIIMED_CLD_LOG.length=0; SAL_SIIMED_CLD_EXCL.length=0;
    const panel=document.getElementById('sal-logp');
    if(panel)panel.innerHTML='';
    salSiimedCldSetPStep(0); salSiimedCldSetPct(0,'Iniciando...');
    await salSiimedCldSleep(50);

    try{
      const {empresa,nit,fecha} = _siimedSalCldParams;
      const clasif = _siimedSalCldClasif;
      const mapeo = _siimedSalCldMapeo;

      salSiimedCldSetPStep(1); salSiimedCldSetPct(15,'Leyendo archivo...');
      salSiimedCldLog('📂 Balance de Prueba por Tercero (SIIMED) y PUC de destino ya leídos.','i','Lectura');
      salSiimedCldLog(`   ${clasif.totalOrigen} filas encontradas en el Balance`,'i','Lectura');
      salSiimedCldLog(`   Empresa: ${empresa} | NIT: ${nit} | Fecha: ${fecha}`,'i','Lectura');
      await salSiimedCldSleep(30);

      salSiimedCldSetPStep(2); salSiimedCldSetPct(30,'Clasificando cuentas...');
      const nAgrupadas = Object.keys(_siimedSalCldTercero11Decisions||{}).filter(c=>_siimedSalCldTercero11Decisions[c]===false).length;
      const nMantTercero = Object.keys(_siimedSalCldTercero11Decisions||{}).filter(c=>_siimedSalCldTercero11Decisions[c]===true).length;
      salSiimedCldLog(`🔗 Cuentas grupo 11 agrupadas a NIT de la empresa: ${nAgrupadas}`,'i','Clasificación');
      salSiimedCldLog(`   Cuentas grupo 11 que conservan manejo de tercero: ${nMantTercero}`,'i','Clasificación');
      salSiimedCldLog(`   Excluidas (subtotal con desglose por tercero): ${clasif.excluidosHeader}`,'i','Clasificación');
      salSiimedCldLog(`   Excluidas (cuentas padre / con auxiliares): ${clasif.excluidosPadre}`,'w','Clasificación');
      salSiimedCldLog(`   Saldos en cero eliminados: ${clasif.excluidosCero}`,'w','Clasificación');
      const grupo11Info = clasif.grupo11Info || [];
      const grupo11Cero = grupo11Info.filter(g=>g.esCero);
      if(grupo11Cero.length>0){
        grupo11Cero.forEach(g=>{
          salSiimedCldLog(`   ℹ Cuenta ${g.cuenta}${g.desc?' ('+g.desc+')':''} agrupada a NIT: saldo neto = $0.00 tras combinar ${g.nTerceros} terceros — se incluye igual en 'Contabilidad' (Débito=0, Crédito=0) para que no desaparezca sin rastro`,'i','Clasificación');
        });
      }
      await salSiimedCldSleep(30);

      salSiimedCldSetPStep(3); salSiimedCldSetPct(50,'Cruzando contra el PUC...');
      salSiimedCldLog('🔧 Cruzando cuentas contra el Plan de Cuentas cargado...','i','Mapeo');
      const nExisten = clasif.cruce.existen.length;
      const nNuevasMapeadas = [...mapeo.values()].filter(v=>v.estado==='Nueva (mapeada)').length;
      const nNuevasOriginal = [...mapeo.values()].filter(v=>v.estado==='Nueva (se deja original)').length;
      salSiimedCldLog(`   Cuentas que ya existen en el PUC: ${nExisten}`,'i','Mapeo');
      salSiimedCldLog(`   Cuentas nuevas mapeadas a otra cuenta: ${nNuevasMapeadas}`,'i','Mapeo');
      salSiimedCldLog(`   Cuentas nuevas dejadas con su código original: ${nNuevasOriginal}`,'i','Mapeo');
      await salSiimedCldSleep(30);

      salSiimedCldSetPStep(4); salSiimedCldSetPct(72,'Generando registros destino...');
      await salSiimedCldSleep(30);

      const out=[];
      const nota=`SALDOS INICIALES A ${fecha}`;
      clasif.registrosFinal.forEach(({cuenta,id,saldo})=>{
        const {deb,cred}=salSiimedCldDebitoCred(saldo);
        const mapeada = (mapeo.get(cuenta)||{}).mapeada || cuenta;
        out.push({
          'Cuenta *':                mapeada,
          'Concepto':                nota,
          'Tercero *':               id||nit,
          'Débito *':                deb,
          'Crédito *':               cred,
          'Centro costos':           '',
          'Fecha de Vencimiento *':  fecha,
          'Base Ret':                '',
          '% Ret':                   '',
          'Vendedor ':               '',
          'Cuentas Originales':      cuenta,
        });
      });

      const sumDeb=out.reduce((a,r)=>a+(r['Débito *']||0),0);
      const sumCred=out.reduce((a,r)=>a+(r['Crédito *']||0),0);
      salSiimedCldLog(`✅ ${out.length} registros generados`,'o','Transformación');
      salSiimedCldLog(`   Débitos:  $${sumDeb.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'i','Estadísticas');
      salSiimedCldLog(`   Créditos: $${sumCred.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'i','Estadísticas');
      const dif=Math.abs(sumDeb-sumCred);
      if(dif>0.01) salSiimedCldLog(`   ⚠ Diferencia D-C: $${dif.toLocaleString('es-CO',{minimumFractionDigits:2})}`,'w','Estadísticas');
      else         salSiimedCldLog(`   ✓ Débitos = Créditos (cuadrado)`,'o','Estadísticas');

      salSiimedCldSetPStep(5); salSiimedCldSetPct(92,'Generando Excel...');
      salSiimedCldLog('📊 Construyendo archivo Excel...','i','Escritura');
      await salSiimedCldSleep(30);

      SAL_SIIMED_CLD_WB=salSiimedCldBuildWB(out,SAL_SIIMED_CLD_LOG,clasif.excl,mapeo,{
        registros_entrada:clasif.totalOrigen,
        registros_salida:out.length,
        suma_debitos:sumDeb,
        suma_creditos:sumCred,
        diferencia:dif
      },grupo11Info);

      const dur=((Date.now()-t0)/1000).toFixed(1);
      salSiimedCldSetPct(100,'¡Listo!');
      salSiimedCldLog(`✅ Excel listo en ${dur}s`,'o','Escritura');

      const fn=salSiimedCldBuildFN();
      const fnEl=document.getElementById('sal-dl-fn'); if(fnEl)fnEl.textContent=fn;
      const stIn=document.getElementById('sal-st-in'); if(stIn)stIn.textContent=clasif.totalOrigen;
      const stOk=document.getElementById('sal-st-ok'); if(stOk)stOk.textContent=out.length;
      const stD=document.getElementById('sal-st-deb');
      if(stD)stD.textContent='$'+Math.round(sumDeb).toLocaleString('es-CO');

      try{
        if(typeof api==='function' && typeof AUTH!=='undefined'){
          await api('POST','/migrations',{
            filename_out:fn,orig_soft:'SIIMED ERP',dest_soft:'World Office Cloud',
            module:'Saldos Iniciales Cloud',records_in:clasif.totalOrigen,records_out:out.length,
            errors:0,warnings:dif>0.01?1:0,duration_sec:parseFloat(dur),status:'completed'
          },AUTH.token);
        }
      }catch(e){}

      salSiimedCldSetStep(4);

    }catch(err){
      salSiimedCldLog(`❌ Error: ${err.message}`,'e','Pipeline');
      salSiimedCldSetPct(0,'Error');
      console.error('SAL_SIIMED_CLD ETL Error:', err);
      alert('Error en migración: ' + err.message);
    }
  }

  // ── Modal 1: parámetros (empresa / nit / fecha) ───────────────────
  function salSiimedCldShowParamModal(data){
    let modal=document.getElementById('sal-siimed-cld-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='sal-siimed-cld-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }
    modal.innerHTML=`
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.salSiimedCldCloseModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:480px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5)">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:20px;font-weight:700;color:#fff">Parámetros de Migración</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">Paso 1 de ${_siimedSalCldTotalPasosEstimado()} — Datos para el encabezado del documento</div>
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Nombre Empresa *</div>
            <input id="sal-siimed-cld-p-empresa" type="text" placeholder="Nombre de la empresa"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">NIT Empresa *</div>
            <input id="sal-siimed-cld-p-nit" type="text" placeholder="NIT sin dígito de verificación"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div style="margin-bottom:24px">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Fecha de Corte *</div>
            <input id="sal-siimed-cld-p-fecha" type="date"
              style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:10px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">
          </div>
          <div id="sal-siimed-cld-p-err" style="color:#fca5a5;font-size:12px;margin-bottom:12px;display:none">⚠ Completa los campos requeridos</div>
          <div style="display:flex;gap:12px">
            <button id="sal-siimed-cld-btn-cancel" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">Cancelar</button>
            <button id="sal-siimed-cld-btn-confirm" style="flex:2;padding:12px;
              background:linear-gradient(135deg,#5b4fcf,#7c6ef0);
              border:1px solid rgba(255,255,255,.15);border-radius:10px;
              color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:0 4px 16px rgba(91,79,207,.4)">Continuar →</button>
          </div>
        </div>
      </div>`;

    modal.style.display='block';
    setTimeout(()=>{
      const de=document.getElementById('sal-siimed-cld-p-empresa');
      if(de) de.value = (data&&data.nombreEmpresa) || '';
      const df=document.getElementById('sal-siimed-cld-p-fecha');
      if(df){
        if(data&&data.fechaCorte){
          const [d,m,y]=data.fechaCorte.split('/');
          if(d&&m&&y) df.value=`${y}-${m}-${d}`;
        }
        if(!df.value) df.value=new Date().toISOString().split('T')[0];
      }
      const btnCancel=document.getElementById('sal-siimed-cld-btn-cancel');
      const btnConfirm=document.getElementById('sal-siimed-cld-btn-confirm');
      if(btnCancel)btnCancel.onclick=window.salSiimedCldCloseModal;
      if(btnConfirm)btnConfirm.onclick=window.salSiimedCldConfirmParamModal;
    },50);
  }

  function _siimedSalCldTotalPasosEstimado(){
    // Solo informativo para el usuario; no afecta la lógica.
    return 3;
  }

  window.salSiimedCldCloseModal=function(){
    const modal=document.getElementById('sal-siimed-cld-modal');
    if(modal)modal.style.display='none';
  };

  window.salSiimedCldConfirmParamModal=async function(){
    const empresa=(document.getElementById('sal-siimed-cld-p-empresa')?.value||'').trim();
    const nit=(document.getElementById('sal-siimed-cld-p-nit')?.value||'').trim();
    const fechaRaw=(document.getElementById('sal-siimed-cld-p-fecha')?.value||'').trim();
    const errEl=document.getElementById('sal-siimed-cld-p-err');

    if(!empresa||!nit||!fechaRaw){
      if(errEl)errEl.style.display='block';
      return;
    }
    if(errEl)errEl.style.display='none';

    const [y,m,d]=fechaRaw.split('-');
    const fecha=`${d}/${m}/${y}`;

    await salSiimedCldDespuesDeParametros({empresa,nit,fecha});
  };

  // ── Modal 2: ¿requiere manejo de tercero? (solo cuentas grupo 11) ──
  function salSiimedCldShowTercero11Modal(clasif){
    let modal=document.getElementById('sal-siimed-cld-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='sal-siimed-cld-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }

    const filas = clasif.codigos11ConTercero.map(cod=>{
      const nombre = salSiimedCldEsc(clasif.nombreCuenta[cod]||'');
      const n = clasif.conTercero.filter(r=>r.id && r.cuenta===cod).length;
      const neto = clasif.conTercero.filter(r=>r.id && r.cuenta===cod).reduce((a,r)=>a+r.saldo,0);
      return `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1);cursor:pointer">
          <input type="checkbox" class="sal-siimed-cld-t11-chk" data-cuenta="${salSiimedCldEsc(cod)}" style="margin-top:3px">
          <span style="font-size:12.5px;color:rgba(255,255,255,.9)">
            <strong>${salSiimedCldEsc(cod)}</strong> — ${nombre || '(sin nombre)'}<br>
            <span style="color:rgba(255,255,255,.5);font-size:11.5px">${n} terceros · saldo neto $${neto.toLocaleString('es-CO',{minimumFractionDigits:2})} → ¿Requiere manejo de tercero en el destino?</span>
          </span>
        </label>`;
    }).join('');

    modal.innerHTML=`
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.salSiimedCldCloseModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:560px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;display:flex;flex-direction:column">
          <div style="text-align:center;margin-bottom:16px">
            <div style="font-size:20px;font-weight:700;color:#fff">Cuentas del grupo 11 (Disponible)</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">Paso 2 de ${_siimedSalCldTotalPasosEstimado()} — Por defecto NO requieren tercero: sus movimientos se agrupan y se envían al NIT de la empresa. Marca las que sí deban conservar el desglose por tercero.</div>
          </div>
          <div style="overflow-y:auto;flex:1;margin-bottom:16px;padding-right:4px">
            ${filas}
          </div>
          <div style="display:flex;gap:12px">
            <button id="sal-siimed-cld-t11-btn-back" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">← Volver</button>
            <button id="sal-siimed-cld-t11-btn-confirm" style="flex:2;padding:12px;
              background:linear-gradient(135deg,#5b4fcf,#7c6ef0);
              border:1px solid rgba(255,255,255,.15);border-radius:10px;
              color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:0 4px 16px rgba(91,79,207,.4)">Continuar →</button>
          </div>
        </div>
      </div>`;

    modal.style.display='block';
    setTimeout(()=>{
      const back=document.getElementById('sal-siimed-cld-t11-btn-back');
      const conf=document.getElementById('sal-siimed-cld-t11-btn-confirm');
      if(back) back.onclick=()=>salSiimedCldShowParamModal(_siimedSalCldPending.data);
      if(conf) conf.onclick=window.salSiimedCldConfirmTercero11Modal;
    },50);
  }

  window.salSiimedCldConfirmTercero11Modal=async function(){
    const decisions={};
    document.querySelectorAll('.sal-siimed-cld-t11-chk').forEach(chk=>{
      decisions[chk.dataset ? chk.dataset.cuenta : chk.getAttribute('data-cuenta')] = !!chk.checked;
    });
    _siimedSalCldTercero11Decisions = decisions;
    await salSiimedCldDespuesDeTercero11();
  };

  // ── Modal 3: mapeo de cuentas nuevas (no encontradas en el PUC) ──
  function salSiimedCldShowMappingModal(codigosNuevos, nombreCuenta, pucMap){
    let modal=document.getElementById('sal-siimed-cld-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='sal-siimed-cld-modal';
      modal.style.cssText='position:fixed;inset:0;z-index:9500;overflow:auto;display:none';
      document.body.appendChild(modal);
    }

    const datalistOpts=[...pucMap.entries()].map(([cod,nom])=>
      `<option value="${salSiimedCldEsc(cod)}">${salSiimedCldEsc(nom)}</option>`
    ).join('');

    const filas = codigosNuevos.map(cod=>{
      const nombre = salSiimedCldEsc(nombreCuenta[cod]||'');
      return `
        <div class="sal-siimed-cld-map-row" data-buscar="${salSiimedCldEsc((cod+' '+nombre).toLowerCase())}"
          style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)">
          <div style="flex:1;min-width:0;font-size:12px;color:rgba(255,255,255,.9)">
            <strong>${salSiimedCldEsc(cod)}</strong><br>
            <span style="color:rgba(255,255,255,.5);font-size:11px">${nombre || '(sin nombre)'}</span>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,.8);white-space:nowrap;cursor:pointer">
            <input type="checkbox" class="sal-siimed-cld-map-chk" data-cuenta="${salSiimedCldEsc(cod)}" checked>
            Dejar original
          </label>
          <input type="text" class="sal-siimed-cld-map-input" data-cuenta="${salSiimedCldEsc(cod)}"
            list="sal-siimed-cld-puc-datalist" placeholder="Cuenta a usar..." disabled
            style="width:150px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
            border-radius:6px;padding:6px 8px;color:#fff;font-size:12px;outline:none">
        </div>`;
    }).join('');

    modal.innerHTML=`
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:0" onclick="window.salSiimedCldCloseModal()"></div>
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px">
        <div style="width:100%;max-width:680px;background:linear-gradient(135deg,#1a1060,#2d1b8e,#4a2db8);
          border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:32px;
          box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;display:flex;flex-direction:column">
          <div style="text-align:center;margin-bottom:12px">
            <div style="font-size:20px;font-weight:700;color:#fff">Cuentas que no están en el PUC</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:6px">Paso 3 de ${_siimedSalCldTotalPasosEstimado()} — Se encontraron ${codigosNuevos.length} cuentas que no existen en el Plan de Cuentas cargado. "Dejar original" viene marcado por defecto; desmárcalo para indicar con qué cuenta reemplazarla.</div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input id="sal-siimed-cld-map-buscar" type="text" placeholder="Buscar por código o nombre..."
              style="flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);
              border-radius:8px;padding:8px 12px;color:#fff;font-size:12.5px;outline:none">
            <button id="sal-siimed-cld-map-marcar" style="padding:8px 12px;background:rgba(255,255,255,.1);
              border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;font-size:11.5px;cursor:pointer;white-space:nowrap">Marcar todas</button>
            <button id="sal-siimed-cld-map-desmarcar" style="padding:8px 12px;background:rgba(255,255,255,.1);
              border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;font-size:11.5px;cursor:pointer;white-space:nowrap">Desmarcar todas</button>
          </div>
          <datalist id="sal-siimed-cld-puc-datalist">${datalistOpts}</datalist>
          <div id="sal-siimed-cld-map-list" style="overflow-y:auto;flex:1;margin-bottom:16px;padding-right:4px">
            ${filas}
          </div>
          <div style="display:flex;gap:12px">
            <button id="sal-siimed-cld-map-btn-back" style="flex:1;padding:12px;
              background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
              border-radius:10px;color:#fff;font-size:14px;cursor:pointer">← Volver</button>
            <button id="sal-siimed-cld-map-btn-confirm" style="flex:2;padding:12px;
              background:linear-gradient(135deg,#5b4fcf,#7c6ef0);
              border:1px solid rgba(255,255,255,.15);border-radius:10px;
              color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:0 4px 16px rgba(91,79,207,.4)">✅ Ejecutar Migración</button>
          </div>
        </div>
      </div>`;

    modal.style.display='block';
    setTimeout(()=>{
      document.querySelectorAll('.sal-siimed-cld-map-chk').forEach(chk=>{
        chk.addEventListener('change', ()=>{
          const cuenta=chk.dataset?chk.dataset.cuenta:chk.getAttribute('data-cuenta');
          const inp=document.querySelector('.sal-siimed-cld-map-input[data-cuenta="'+cuenta+'"]');
          if(inp) inp.disabled = chk.checked;
        });
      });
      const buscar=document.getElementById('sal-siimed-cld-map-buscar');
      if(buscar) buscar.addEventListener('input', ()=>{
        const q=(buscar.value||'').toLowerCase().trim();
        document.querySelectorAll('.sal-siimed-cld-map-row').forEach(row=>{
          const hay = !q || (row.dataset?row.dataset.buscar:row.getAttribute('data-buscar')||'').includes(q);
          row.style.display = hay ? 'flex' : 'none';
        });
      });
      const marcar=document.getElementById('sal-siimed-cld-map-marcar');
      if(marcar) marcar.onclick=()=>{
        document.querySelectorAll('.sal-siimed-cld-map-chk').forEach(chk=>{
          chk.checked=true;
          const cuenta=chk.dataset?chk.dataset.cuenta:chk.getAttribute('data-cuenta');
          const inp=document.querySelector('.sal-siimed-cld-map-input[data-cuenta="'+cuenta+'"]');
          if(inp) inp.disabled=true;
        });
      };
      const desmarcar=document.getElementById('sal-siimed-cld-map-desmarcar');
      if(desmarcar) desmarcar.onclick=()=>{
        document.querySelectorAll('.sal-siimed-cld-map-chk').forEach(chk=>{
          chk.checked=false;
          const cuenta=chk.dataset?chk.dataset.cuenta:chk.getAttribute('data-cuenta');
          const inp=document.querySelector('.sal-siimed-cld-map-input[data-cuenta="'+cuenta+'"]');
          if(inp) inp.disabled=false;
        });
      };
      const back=document.getElementById('sal-siimed-cld-map-btn-back');
      if(back) back.onclick=()=>{
        if(_siimedSalCldClasif.codigos11ConTercero.length>0) salSiimedCldShowTercero11Modal(_siimedSalCldClasif);
        else salSiimedCldShowParamModal(_siimedSalCldPending.data);
      };
      const conf=document.getElementById('sal-siimed-cld-map-btn-confirm');
      if(conf) conf.onclick=window.salSiimedCldConfirmMappingModal;
    },50);
  }

  window.salSiimedCldConfirmMappingModal=async function(){
    const mapeo = new Map(_siimedSalCldClasif.cruce.existen.map(c=>[c,{mapeada:c,estado:'Existe en PUC'}]));
    document.querySelectorAll('.sal-siimed-cld-map-chk').forEach(chk=>{
      const cuenta = chk.dataset ? chk.dataset.cuenta : chk.getAttribute('data-cuenta');
      const dejarOriginal = !!chk.checked;
      if(dejarOriginal){
        mapeo.set(cuenta, {mapeada:cuenta, estado:'Nueva (se deja original)'});
      } else {
        const inp=document.querySelector('.sal-siimed-cld-map-input[data-cuenta="'+cuenta+'"]');
        const val=(inp && inp.value ? String(inp.value).trim() : '');
        if(val){
          mapeo.set(cuenta, {mapeada:val, estado:'Nueva (mapeada)'});
        } else {
          mapeo.set(cuenta, {mapeada:cuenta, estado:'Nueva (sin código indicado, se dejó original)'});
        }
      }
    });
    _siimedSalCldMapeo = mapeo;
    window.salSiimedCldCloseModal();
    await _runSiimedSalCldETL();
  };

  // ── Nombre archivo ────────────────────────────────────────────────
  function salSiimedCldBuildFN(){
    const d=new Date();
    return `saldos_iniciales_siimed_erp_wo_cloud_${d.getFullYear()}_${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getDate()).padStart(2,'0')}.xlsx`;
  }

  // ── Construir Workbook ────────────────────────────────────────────
  function salSiimedCldBuildWB(rows,logEntries,exclEntries,mapeo,stats,grupo11Info){
    const wb=XLSX.utils.book_new();

    const aoa=[SAL_SIIMED_CLD_COLS.slice()];
    rows.forEach(r=>aoa.push(SAL_SIIMED_CLD_COLS.map(c=>{
      const v=r[c]; return (v===undefined)?'':v??'';
    })));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Contabilidad');

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

    // ── Hoja nueva: Mapeo de Cuentas ─────────────────────────────
    const mapAoa=[['Cuenta Original','Cuenta Mapeada','Estado']];
    [...mapeo.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([orig,info])=>{
      mapAoa.push([orig, info.mapeada, info.estado]);
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(mapAoa),'Mapeo de Cuentas');

    // ── Hoja nueva: Cuentas Grupo 11 Agrupadas ────────────────────
    // Transparencia total sobre cada cuenta del grupo 11 que el usuario
    // decidió agrupar al NIT de la empresa (en vez de conservar el
    // desglose por tercero): cuántos terceros se combinaron y el saldo
    // neto resultante, incluyendo las que dan exactamente $0 — estas
    // últimas SÍ se incluyen en la hoja "Contabilidad" (con Débito=0 y
    // Crédito=0) en vez de desaparecer sin dejar rastro, como ocurría
    // antes.
    if(grupo11Info && grupo11Info.length){
      const g11Aoa=[['Cuenta','Descripción','Terceros combinados','Saldo Neto','Saldo en $0']];
      grupo11Info.slice().sort((a,b)=>a.cuenta.localeCompare(b.cuenta)).forEach(g=>{
        g11Aoa.push([g.cuenta, g.desc||'', g.nTerceros, g.saldoNeto, g.esCero?'Sí':'No']);
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(g11Aoa),'Cuentas Grupo 11 Agrupadas');
    }

    return wb;
  }

  // ── Descarga ──────────────────────────────────────────────────────
  function siimedCldSalDoDownload(){
    if(!SAL_SIIMED_CLD_WB){alert('Primero ejecuta el proceso ETL');return;}
    XLSX.writeFile(SAL_SIIMED_CLD_WB,salSiimedCldBuildFN());
  }

  // ── Instalación (opciones de origen + slots de archivo + wrapping) ──
  function siimedSalCldInstall(){
    const sorigEl = document.getElementById('sal-sorig');
    const s2card = document.querySelector('#sal-s2 .card');
    if(!sorigEl || !s2card) return;

    if(!sorigEl.querySelector('option[value="SIIMED ERP"]')){
      const opt=document.createElement('option');
      opt.value='SIIMED ERP'; opt.textContent='SIIMED ERP';
      sorigEl.appendChild(opt);
    }

    // Slot compartido (Balance de Prueba por Tercero) — mismo patrón
    // que ya usa el hermano Escritorio, para que ambos lean el mismo
    // archivo subido por el usuario.
    window.__SIIMED_SAL_S = window.__SIIMED_SAL_S || { file:null };
    const siigoFslots = document.querySelector('#sal-s2 .fslots');
    const siigoInfo = document.querySelector('#sal-s2 .al.al-i');

    if(!document.getElementById('siimed-sal-fslots')){
      const infoHTML =
        '<div class="al al-i" id="siimed-sal-info" style="display:none;margin-bottom:14px">'+
          '<span>ℹ️</span>'+
          '<span>SIIMED ERP: el Balance de Prueba por Tercero sirve para migrar tanto a World Office Escritorio como a World Office Cloud. Para Cloud, la migración cruza automáticamente las cuentas contra el Plan de Cuentas (PUC) de destino ya guardado en el sistema.</span>'+
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
    };
    const _prevSiimedSalOnFile = window.__siimedSalOnFile;
    window.__siimedSalOnFile = function(input){
      _prevSiimedSalOnFile(input);
      SAL_SIIMED_CLD_S.file = window.__SIIMED_SAL_S.file;
    };
    if(window.__SIIMED_SAL_S.file) SAL_SIIMED_CLD_S.file = window.__SIIMED_SAL_S.file;

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

    // routeSalETL(): solo intercepta SIIMED ERP → World Office Cloud.
    const _origRouteSalETL = window.routeSalETL;
    window.routeSalETL = function(){
      const orig = (document.getElementById('sal-sorig')||{}).value;
      const dest = (document.getElementById('sal-sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Cloud'){
        startSiimedSalCldETL();
        return;
      }
      if(typeof _origRouteSalETL === 'function') _origRouteSalETL();
    };

    const _origRouteSalDownload = window.routeSalDownload;
    window.routeSalDownload = function(){
      const orig = (document.getElementById('sal-sorig')||{}).value;
      const dest = (document.getElementById('sal-sdest')||{}).value;
      if(orig === 'SIIMED ERP' && dest === 'World Office Cloud'){ siimedCldSalDoDownload(); return; }
      if(typeof _origRouteSalDownload === 'function') _origRouteSalDownload();
    };

    const _origShowPg = window.showPg;
    window.showPg = function(name){
      if(typeof _origShowPg === 'function') _origShowPg(name);
      if(name === 'saldos'){
        SAL_SIIMED_CLD_S.file = null;
        _siimedSalCldPending = null;
        _siimedSalCldClasif = null;
        _siimedSalCldParams = null;
        _siimedSalCldTercero11Decisions = null;
        _siimedSalCldMapeo = null;
        window.salSiimedCldCloseModal();
        if(window.__SIIMED_SAL_S) window.__SIIMED_SAL_S.file = null;
        const slot=document.getElementById('sl-siimed-sal'); if(slot) slot.className='fslot';
        const nm=document.getElementById('nm-siimed-sal'); if(nm) nm.textContent='';
        const inp=document.getElementById('f-siimed-sal'); if(inp) inp.value='';
        siimedSalToggle();
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', siimedSalCldInstall);
  } else {
    siimedSalCldInstall();
  }

})();