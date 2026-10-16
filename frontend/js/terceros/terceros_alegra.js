// ══════════════════════════════════════════════════════════════════
// ETL: Terceros — Alegra → World Office (Cloud y Escritorio)
// Módulo: terceros_alegra.js
//
// ARCHIVO NUEVO — NO MODIFICA NINGÚN ARCHIVO EXISTENTE.
// ══════════════════════════════════════════════════════════════════

(function(){

  'use strict';

  const ALG_NITS_BLOQUEADOS = new Set([
  "222222222",
  "800003122",
  "800037800",
  "800088702",
  "800112806",
  "800118954",
  "800130907",
  "800138188",
  "800140949",
  "800147502",
  "800148514",
  "800149496",
  "800197268",
  "800211025",
  "800216278",
  "800219488",
  "800224808",
  "800226175",
  "800229739",
  "800231969",
  "800251440",
  "800253055",
  "800256161",
  "804002105",
  "805000427",
  "805001157",
  "806008394",
  "809008362",
  "817001773",
  "824001398",
  "830003564",
  "830008686",
  "830009783",
  "830054904",
  "830074184",
  "830113831",
  "830125132",
  "837000084",
  "839000495",
  "844003392",
  "860002183",
  "860002503",
  "860002964",
  "860003020",
  "860007335",
  "860007336",
  "860007379",
  "860007738",
  "860008645",
  "860011153",
  "860013570",
  "860022137",
  "860034313",
  "860034594",
  "860035827",
  "860043186",
  "860045904",
  "860050750",
  "860051135",
  "860066942",
  "890000381",
  "890101994",
  "890102002",
  "890102044",
  "890102257",
  "890200106",
  "890200756",
  "890201578",
  "890203088",
  "890203183",
  "890270275",
  "890300279",
  "890303093",
  "890303208",
  "890399010",
  "890480023",
  "890480110",
  "890480123",
  "890500516",
  "890500675",
  "890700148",
  "890704737",
  "890806490",
  "890900840",
  "890900841",
  "890900842",
  "890903790",
  "890903937",
  "890903938",
  "890904996",
  "890980040",
  "891080005",
  "891080031",
  "891180008",
  "891190047",
  "891200337",
  "891280008",
  "891480000",
  "891500182",
  "891500319",
  "891600091",
  "891780093",
  "891800213",
  "891800330",
  "891856000",
  "892000146",
  "892115006",
  "892200015",
  "892399989",
  "892400320",
  "899999001",
  "899999034",
  "899999061",
  "899999063",
  "899999107",
  "899999284",
  "899999734",
  "900156264",
  "900200960",
  "900226715",
  "900298372",
  "900336004",
  "900406150",
  "900604350",
  "900914254",
  "901037916",
  "901093846",
  "901469580",
  "901543761"
]);
  const ALG_ESC_NITS_EXCLUIR = ALG_NITS_BLOQUEADOS;
const ALG_CLD_NITS_EXCLUIR = ALG_NITS_BLOQUEADOS;

function algNitEstaBloqueado(valor){

    const nit = String(valor ?? '')
      .trim()
      .replace(/[,\s.-]/g, '');

    if(!nit) return false;

    return ALG_NITS_BLOQUEADOS.has(nit);
}
  // ── Estado propio ────────────────────────────────────────────────

  const ALG_S = { files:{} };

  let ALG_ESC_WB = null;
  let ALG_CLD_WB = null;

  const ALG_LOG = [];

  // ══════════════════════════════════════════════════════════════════
  // CIUDADES CANÓNICAS PARA ALEGRA → WORLD OFFICE CLOUD
  // ══════════════════════════════════════════════════════════════════

  const ALG_CIUDADES = [

    "Tesalia", "Tibacuy", "Tibaná", "Bogotá, D.C.", "Tibasosa", "Tibirita",
"Tibú", "Tierralta", "Timaná", "Timbío", "Timbiquí", "Tinjacá",
"Tipacoque", "Tiquisio", "Titiribí", "Toca", "Tocaima", "Tocancipá",
"Togüí", "Toledo", "Toledo", "Tolú Viejo", "Tona", "Tópaga",
"Topaipí", "Toribio", "Toro", "Tota", "Totoró", "Trinidad",
"Trujillo", "Tubará", "Tuluá", "Tumaco", "Tunja", "Tununguá",
"Túquerres", "Turbaco", "Turbaná", "Turbo", "Turmequé", "Tuta",
"Tutazá", "Ubalá", "Ubaque", "Ulloa", "Umbita", "Une", "Unguía",
"Unión Panamericana", "Uramita", "Uribe", "Uribia", "Urrao",
"Urumita", "Usiacurí", "Útica", "Valdivia", "Valencia",
"Valle De San José", "Valle De San Juan", "Valle Del Guamuez",
"Valledupar", "Valparaíso", "Valparaíso", "Vegachí", "Vélez",
"Venadillo", "Venecia", "Venecia", "Ventaquemada", "Vergara",
"Versalles", "Vetas", "Vianí", "Victoria", "Vigía Del Fuerte",
"Vijes", "Villa Caro", "Villa De Leyva", "Villa De San Diego De Ubate",
"Villa Del Rosario", "Villa Rica", "Villagarzón", "Villagómez",
"Villahermosa", "Villamaría", "Villanueva", "Villanueva",
"Villanueva", "Villanueva", "Villapinzón", "Villarrica",
"Villavicencio", "Villavieja", "Villeta", "Viotá", "Viracachá",
"Vistahermosa", "Viterbo", "Yacopí", "Yacuanquer", "Yaguará",
"Yalí", "Yarumal", "Yavaraté", "Yolombó", "Yondó", "Yopal",
"Yotoco", "Yumbo", "Zambrano", "Zapatoca", "Zapayán", "Zaragoza",
"Zarzal", "Zetaquira", "Zipacón", "Zipaquirá", "Zona Bananera",
"San Benito", "San Benito Abad", "San Bernardo", "San Bernardo",
"San Bernardo Del Viento", "San Calixto", "San Carlos", "San Carlos",
"San Carlos De Guaroa", "San Cayetano", "San Cayetano", "San Cristóbal",
"San Diego", "San Eduardo", "San Estanislao", "San Felipe",
"San Fernando", "San Francisco", "San Francisco", "San Francisco",
"San Gil", "San Jacinto", "San Jacinto Del Cauca", "San Jerónimo",
"San Joaquín", "San José", "San José De La Montaña", "San José De Miranda",
"San José De Pare", "San José Del Fragua", "San José Del Guaviare",
"San José Del Palmar", "San Juan De Arama", "San Juan De Betulia",
"San Juan De Río Seco", "San Juan De Urabá", "San Juan Del Cesar",
"San Juan Nepomuceno", "San Juanito", "San Lorenzo", "San Luis",
"San Luis", "San Luis De Gaceno", "San Luis De Palenque", "San Marcos",
"San Martín", "San Martín", "San Martín De Loba", "San Mateo",
"San Miguel", "San Miguel", "San Miguel De Sema", "San Onofre",
"San Pablo", "San Pablo", "San Pablo De Borbur", "San Pedro",
"San Pedro", "San Pedro", "San Pedro De Cartago", "San Pedro De Uraba",
"San Pelayo", "San Rafael", "San Roque", "San Sebastián",
"San Sebastián De Buenavista", "San Vicente", "San Vicente De Chucurí",
"San Vicente Del Caguán", "San Zenón", "Sandoná", "Santa Ana",
"Santa Bárbara", "Santa Bárbara", "Santa Bárbara",
"Santa Bárbara De Pinto", "Santa Catalina", "Santa Helena Del Opón",
"Santa Isabel", "Santa Lucía", "Santa María", "Santa María",
"Santa Marta", "Santa Rosa", "Santa Rosa", "Santa Rosa De Cabal",
"Santa Rosa De Osos", "Santa Rosa De Viterbo", "Santa Rosa Del Sur",
"Santa Rosalía", "Santa Sofía", "Santacruz", "Santafé De Antioquia",
"Santana", "Santander De Quilichao", "Santiago", "Santiago",
"Santiago De Tolú", "Santo Domingo", "Santo Tomás", "Santuario",
"Sapuyes", "Saravena", "Sardinata", "Sasaima", "Sativanorte",
"Sativasur", "Segovia", "Sesquilé", "Sevilla", "Siachoque", "Sibaté",
"Sibundoy", "Silos", "Silvania", "Silvia", "Simacota", "Simijaca",
"Simití", "Sincé", "Sincelejo", "Sipí", "Sitionuevo", "Soacha",
"Soatá", "Socha", "Socorro", "Socotá", "Sogamoso", "Solano",
"Soledad", "Solita", "Somondoco", "Sonson", "Sopetrán", "Soplaviento",
"Sopó", "Sora", "Soracá", "Sotaquirá", "Sotara", "Suaita", "Suan",
"Suárez", "Suárez", "Suaza", "Subachoque", "Sucre", "Sucre", "Sucre",
"Suesca", "Supatá", "Supía", "Suratá", "Susa", "Susacón",
"Sutamarchán", "Sutatausa", "Sutatenza", "Tabio", "Tadó",
"Talaigua Nuevo", "Tamalameque", "Támara", "Tame", "Támesis",
"Taminango", "Tangua", "Taraira", "Tarapacá", "Tarazá", "Tarqui",
"Tarso", "Tasco", "Tauramena", "Tausa", "Tello", "Tena", "Tenerife",
"Tenjo", "Tenza", "Teorama", "Teruel", "Nóvita", "Nueva Granada",
"Nuevo Colón", "Nunchía", "Nuquí", "Obando", "Ocamonte", "Ocaña",
"Oiba", "Oicatá", "Olaya", "Olaya Herrera", "Onzaga", "Oporapa",
"Orito", "Orocué", "Ortega", "Ospina", "Otanche", "Ovejas",
"Pachavita", "Pacho", "Pacoa", "Pácora", "Padilla", "Paez", "Páez",
"Paicol", "Pailitas", "Paime", "Paipa", "Pajarito", "Palermo",
"Palestina", "Palestina", "Palmar", "Palmar De Varela",
"Palmas Del Socorro", "Palmira", "Palmito", "Palocabildo", "Pamplona",
"Pamplonita", "Pana Pana", "Pandi", "Panqueba", "Papunaua", "Páramo",
"Paratebueno", "Pasca", "Pasto", "Patía", "Pauna", "Paya",
"Paz De Ariporo", "Paz De Río", "Pedraza", "Pelaya", "Pensilvania",
"Peñol", "Peque", "Pereira", "Pesca", "Piamonte", "Piedecuesta",
"Piedras", "Piendamó", "Pijao", "Pijiño Del Carmen", "Pinchote",
"Pinillos", "Piojó", "Pisba", "Pital", "Pitalito", "Pivijay",
"Planadas", "Planeta Rica", "Plato", "Policarpa", "Polonuevo",
"Ponedera", "Popayán", "Pore", "Potosí", "Pradera", "Prado",
"Providencia", "Providencia", "Pueblo Bello", "Pueblo Nuevo",
"Pueblo Rico", "Pueblorrico", "Puebloviejo", "Puente Nacional",
"Puerres", "Puerto Alegría", "Puerto Arica", "Puerto Asís",
"Puerto Berrío", "Puerto Boyacá", "Puerto Caicedo", "Puerto Carreño",
"Puerto Colombia", "Puerto Colombia", "Puerto Concordia",
"Puerto Escondido", "Puerto Gaitán", "Puerto Guzmán",
"Puerto Libertador", "Puerto Lleras", "Puerto López", "Puerto Nare",
"Puerto Nariño", "Puerto Parra", "Puerto Rico", "Puerto Rico",
"Puerto Rondón", "Puerto Salgar", "Puerto Santander", "Puerto Santander",
"Puerto Tejada", "Puerto Triunfo", "Puerto Wilches", "Pulí", "Pupiales",
"Puracé", "Purificación", "Purísima", "Quebradanegra", "Quetame",
"Quibdó", "Quimbaya", "Quinchía", "Quípama", "Quipile", "Ragonvalia",
"Ramiriquí", "Ráquira", "Recetor", "Regidor", "Remedios", "Remolino",
"Repelón", "Restrepo", "Restrepo", "Retiro", "Ricaurte", "Ricaurte",
"Río De Oro", "Río Iro", "Río Quito", "Río Viejo", "Rioblanco",
"Riofrío", "Riohacha", "Rionegro", "Rionegro", "Riosucio", "Riosucio",
"Risaralda", "Rivera", "Roberto Payán", "Roldanillo", "Roncesvalles",
"Rondón", "Rosas", "Rovira", "Sabana De Torres", "Sabanagrande",
"Sabanalarga", "Sabanalarga", "Sabanalarga", "Sabanas De San Angel",
"Sabaneta", "Saboyá", "Sácama", "Sáchica", "Sahagún", "Saladoblanco",
"Salamina", "Salamina", "Salazar", "Saldaña", "Salento", "Salgar",
"Samacá", "Samaná", "Samaniego", "Sampués", "San Agustín",
"San Alberto", "San Andrés", "San Andrés", "San Andrés",
"San Andrés Sotavento", "San Antero", "San Antonio",
"San Antonio Del Tequendama", "Guatape", "Guataquí", "Guatavita",
"Guateque", "Guática", "Guavatá", "Guayabal De Siquima",
"Guayabetal", "Guayatá", "Güepsa", "Güicán", "Gutiérrez", "Hacarí",
"Hatillo De Loba", "Hato", "Hato Corozal", "Hatonuevo", "Heliconia",
"Herrán", "Herveo", "Hispania", "Hobo", "Honda", "Ibagué", "Icononzo",
"Iles", "Imués", "Inírida", "Inzá", "Ipiales", "Iquira", "Isnos",
"Istmina", "Itagui", "Ituango", "Iza", "Jambaló", "Jamundí", "Jardín",
"Jenesano", "Jericó", "Jericó", "Jerusalén", "Jesús María", "Jordán",
"Juan De Acosta", "Junín", "Juradó", "La Apartada", "La Argentina",
"La Belleza", "La Calera", "La Capilla", "La Ceja", "La Celia",
"La Chorrera", "La Cruz", "La Cumbre", "La Dorada", "La Esperanza",
"La Estrella", "La Florida", "La Gloria", "La Guadalupe",
"La Jagua De Ibirico", "La Jagua Del Pilar", "La Llanada", "La Macarena",
"La Merced", "La Mesa", "La Montañita", "La Palma", "La Paz", "La Paz",
"La Pedrera", "La Peña", "La Pintada", "La Plata", "La Playa",
"La Primavera", "La Salina", "La Sierra", "La Tebaida", "La Tola",
"La Unión", "La Unión", "La Unión", "La Unión", "La Uvita", "La Vega",
"La Vega", "La Victoria", "La Victoria", "La Victoria", "La Virginia",
"Labateca", "Labranzagrande", "Landázuri", "Lebríja", "Leguízamo",
"Leiva", "Lejanías", "Lenguazaque", "Lérida", "Leticia", "Líbano",
"Liborina", "Linares", "Lloró", "López", "Lorica", "Los Andes",
"Los Córdobas", "Los Palmitos", "Los Patios", "Los Santos", "Lourdes",
"Luruaco", "Macanal", "Macaravita", "Maceo", "Macheta", "Madrid",
"Magangué", "Magüi", "Mahates", "Maicao", "Majagual", "Málaga",
"Malambo", "Mallama", "Manatí", "Manaure", "Manaure", "Maní",
"Manizales", "Manta", "Manzanares", "Mapiripán", "Mapiripana",
"Margarita", "María La Baja", "Marinilla", "Maripí", "Mariquita",
"Marmato", "Marquetalia", "Marsella", "Marulanda", "Matanza", "Medellín",
"Medina", "Medio Atrato", "Medio Baudó", "Medio San Juan", "Melgar",
"Mercaderes", "Mesetas", "Milán", "Miraflores", "Miraflores", "Miranda",
"Miriti - Paraná", "Mistrató", "Mitú", "Mocoa", "Mogotes", "Molagavita",
"Momil", "Mompós", "Mongua", "Monguí", "Moniquirá", "Montebello",
"Montecristo", "Montelíbano", "Montenegro", "Montería", "Monterrey",
"Moñitos", "Morales", "Morales", "Morelia", "Morroa", "Mosquera",
"Mosquera", "Motavita", "Murillo", "Murindó", "Mutatá", "Mutiscua",
"Muzo", "Nariño", "Nariño", "Nariño", "Nátaga", "Natagaima", "Nechí",
"Necoclí", "Neira", "Neiva", "Nemocón", "Nilo", "Nimaima", "Nobsa",
"Nocaima", "Norcasia", "Chipaque", "Chipatá", "Chiquinquirá", "Chíquiza",
"Chiriguaná", "Chiscas", "Chita", "Chitagá", "Chitaraque", "Chivatá",
"Chivor", "Choachí", "Chocontá", "Cicuco", "Ciénaga", "Ciénaga De Oro",
"Ciénega", "Cimitarra", "Circasia", "Cisneros", "Ciudad Bolívar",
"Clemencia", "Cocorná", "Coello", "Cogua", "Colombia", "Colón", "Colón",
"Coloso", "Cómbita", "Concepción", "Concepción", "Concordia",
"Concordia", "Condoto", "Confines", "Consaca", "Contadero",
"Contratación", "Convención", "Copacabana", "Coper", "Córdoba",
"Córdoba", "Córdoba", "Corinto", "Coromoro", "Corozal", "Corrales",
"Cota", "Cotorra", "Covarachía", "Coveñas", "Coyaima", "Cravo Norte",
"Cuaspud", "Cubará", "Cubarral", "Cucaita", "Cucunubá", "Cúcuta",
"Cucutilla", "Cuítiva", "Cumaral", "Cumaribo", "Cumbal", "Cumbitara",
"Cunday", "Curillo", "Curití", "Curumaní", "Dabeiba", "Dagua",
"Dibulla", "Distracción", "Dolores", "Don Matías", "Dosquebradas",
"Duitama", "Durania", "Ebéjico", "El Águila", "El Bagre", "El Banco",
"El Cairo", "El Calvario", "El Cantón Del San Pablo", "El Carmen",
"El Carmen De Atrato", "El Carmen De Bolívar", "El Carmen De Chucurí",
"El Carmen De Viboral", "El Castillo", "El Cerrito", "El Charco",
"El Cocuy", "El Colegio", "El Copey", "El Doncello", "El Dorado",
"El Dovio", "El Encanto", "El Espino", "El Guacamayo", "El Guamo",
"El Litoral Del San Juan", "El Molino", "El Paso", "El Paujil",
"El Peñol", "El Peñón", "El Peñón", "El Peñón", "El Piñon",
"El Playón", "El Retén", "El Retorno", "El Roble", "El Rosal",
"El Rosario", "El Santuario", "El Tablón De Gómez", "El Tambo",
"El Tambo", "El Tarra", "El Zulia", "Elías", "Encino", "Enciso",
"Entrerrios", "Envigado", "Espinal", "Facatativá", "Falan", "Filadelfia",
"Filandia", "Firavitoba", "Flandes", "Florencia", "Florencia",
"Floresta", "Florián", "Florida", "Floridablanca", "Fomeque", "Fonseca",
"Fortul", "Fosca", "Francisco Pizarro", "Fredonia", "Fresno", "Frontino",
"Fuente De Oro", "Fundación", "Funes", "Funza", "Fúquene", "Fusagasugá",
"Gachala", "Gachancipá", "Gachantivá", "Gachetá", "Galán", "Galapa",
"Galeras", "Gama", "Gamarra", "Gambita", "Gameza", "Garagoa", "Garzón",
"Génova", "Gigante", "Ginebra", "Giraldo", "Girardot", "Girardota",
"Girón", "Gómez Plata", "González", "Gramalote", "Granada", "Granada",
"Granada", "Guaca", "Guacamayas", "Guacarí", "Guachetá", "Guachucal",
"Guadalajara De Buga", "Guadalupe", "Guadalupe", "Guadalupe", "Guaduas",
"Guaitarilla", "Gualmatán", "Guamal", "Guamal", "Guamo", "Guapi",
"Guapotá", "Guaranda", "Guarne", "Guasca",
"Abejorral", "Abrego", "Abriaquí", "Acacías", "Acandí", "Acevedo",
"Achí", "Agrado", "Agua De Dios", "Aguachica", "Aguada", "Aguadas",
"Aguazul", "Agustín Codazzi", "Aipe", "Albán", "Albán", "Albania",
"Albania", "Albania", "Alcalá", "Aldana", "Alejandría", "Algarrobo",
"Algeciras", "Almaguer", "Almeida", "Alpujarra", "Altamira",
"Alto Baudo", "Altos Del Rosario", "Alvarado", "Amagá", "Amalfi",
"Ambalema", "Anapoima", "Ancuyá", "Andalucía", "Andes", "Angelópolis",
"Angostura", "Anolaima", "Anorí", "Anserma", "Ansermanuevo", "Anza",
"Anzoátegui", "Apartadó", "Apía", "Apulo", "Aquitania", "Aracataca",
"Aranzazu", "Aratoca", "Arauca", "Arauquita", "Arbeláez", "Arboleda",
"Arboledas", "Arboletes", "Arcabuco", "Arenal", "Argelia", "Argelia",
"Argelia", "Ariguaní", "Arjona", "Armenia", "Armenia", "Armero",
"Arroyohondo", "Astrea", "Ataco", "Atrato", "Ayapel", "Bagadó",
"Bahía Solano", "Bajo Baudó", "Balboa", "Balboa", "Baranoa", "Baraya",
"Barbacoas", "Barbosa", "Barbosa", "Barichara", "Barranca De Upía",
"Barrancabermeja", "Barrancas", "Barranco De Loba", "Barranco Minas",
"Barranquilla", "Becerril", "Belalcázar", "Belén", "Belén",
"Belén De Bajirá", "Belén De Los Andaquies", "Belén De Umbría", "Bello",
"Belmira", "Beltrán", "Berbeo", "Betania", "Betéitiva", "Betulia",
"Betulia", "Bituima", "Boavita", "Bochalema", "Bojacá", "Bojaya",
"Bolívar", "Bolívar", "Bolívar", "Bosconia", "Boyacá", "Briceño",
"Briceño", "Bucaramanga", "Bucarasica", "Buenaventura", "Buenavista",
"Buenavista", "Buenavista", "Buenavista", "Buenos Aires", "Buesaco",
"Bugalagrande", "Buriticá", "Busbanzá", "Cabrera", "Cabrera", "Cabuyaro",
"Cacahual", "Cáceres", "Cachipay", "Cachirá", "Cácota", "Caicedo",
"Caicedonia", "Caimito", "Cajamarca", "Cajibío", "Cajicá", "Calamar",
"Calamar", "Calarca", "Caldas", "Caldas", "Caldono", "Cali",
"California", "Calima", "Caloto", "Campamento", "Campo De La Cruz",
"Campoalegre", "Campohermoso", "Canalete", "Candelaria", "Candelaria",
"Cantagallo", "Cañasgordas", "Caparrapí", "Capitanejo", "Caqueza",
"Caracolí", "Caramanta", "Carcasí", "Carepa", "Carmen De Apicalá",
"Carmen De Carupa", "Carmen Del Darien", "Carolina", "Cartagena",
"Cartagena Del Chairá", "Cartago", "Caruru", "Casabianca",
"Castilla La Nueva", "Caucasia", "Cepitá", "Cereté", "Cerinza",
"Cerrito", "Cerro San Antonio", "Cértegui", "Chachagüí", "Chaguaní",
"Chalán", "Chameza", "Chaparral", "Charalá", "Charta", "Chía",
"Chibolo", "Chigorodó", "Chima", "Chimá", "Chimichagua", "Chinácota",
"Chinavita", "Chinchiná", "Chinú", "MEXICO", "Miami", "Salinas",
"Sao Paulo", "Quito", "Tampa", "DALLA TX", "Curazao"

  ];


  // ══════════════════════════════════════════════════════════════════
  // NORMALIZACIÓN DE CIUDADES (ÚNICA PARA ESCRITORIO Y CLOUD)
  //
  // 1. Vacío                      → "Bogotá, D.C."
  // 2. Cualquier variante Bogotá  → "Bogotá, D.C."
  //    (BOGOTA, Bogota DC, BOGOTÁ D.C., Santa Fe de Bogotá...)
  // 3. Existe en ALG_CIUDADES     → nombre canónico de la lista
  //    (IBAGUE → Ibagué, Medellin → Medellín)
  // 4. No existe en la lista      → texto original limpio
  // ══════════════════════════════════════════════════════════════════

  const ALG_BOGOTA = 'Bogotá, D.C.';

  // Clave de comparación: sin tildes, sin signos, minúsculas, un espacio
  function algClaveCiudad(valor){
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function algEsBogota(valor){
    return algClaveCiudad(valor).includes('bogot');
  }

  // Índice de la lista: clave → nombre canónico (primera aparición)
  const ALG_INDICE_CIUDADES = new Map();
  ALG_CIUDADES.forEach(ciudad => {
    const clave = algClaveCiudad(ciudad);
    if(clave && !ALG_INDICE_CIUDADES.has(clave)){
      ALG_INDICE_CIUDADES.set(clave, ciudad.trim());
    }
  });

  function algNormalizarCiudad(valor){

    const texto = String(valor ?? '').replace(/\s+/g,' ').trim();

    if(!texto) return ALG_BOGOTA;

    if(algEsBogota(texto)) return ALG_BOGOTA;

    const canonica = ALG_INDICE_CIUDADES.get(algClaveCiudad(texto));
    if(canonica) return canonica;

    console.warn('Municipio de Alegra no encontrado en la lista de ciudades: ' + texto);
    return texto;
  }


  // Verificación final sobre el Excel que se descarga:
  // en las columnas cuyo encabezado empiece por "Ciudad",
  // cualquier variante de Bogotá queda como "Bogotá, D.C.".
  function algCorregirBogotaEnWB(wb){

    if(!wb || !wb.SheetNames || typeof XLSX === 'undefined') return 0;

    let cambios = 0;

    wb.SheetNames.forEach(nombre => {

      const ws = wb.Sheets[nombre];
      if(!ws || !ws['!ref']) return;

      const rango = XLSX.utils.decode_range(ws['!ref']);
      const filaMaxEnc = Math.min(rango.e.r, rango.s.r + 15);
      const columnas = [];

      for(let r = rango.s.r; r <= filaMaxEnc; r++){
        for(let c = rango.s.c; c <= rango.e.c; c++){
          const cel = ws[XLSX.utils.encode_cell({r, c})];
          if(cel && cel.v != null && /^ciudad/.test(algClaveCiudad(cel.v))
             && !columnas.some(x => x.c === c)){
            columnas.push({ c, fila: r });
          }
        }
      }

      columnas.forEach(({ c, fila }) => {
        for(let r = fila + 1; r <= rango.e.r; r++){
          const ref = XLSX.utils.encode_cell({r, c});
          const cel = ws[ref];
          if(cel && cel.v != null && cel.v !== ALG_BOGOTA && algEsBogota(cel.v)){
            ws[ref] = { t:'s', v:ALG_BOGOTA, w:ALG_BOGOTA };
            cambios++;
          }
        }
      });
    });

    console.log('[terceros_alegra v4] Celdas de Bogotá corregidas en el Excel: ' + cambios);
    return cambios;
  }


  // ── Log propio ───────────────────────────────────────────────────

  function algLog(msg, lvl, fase){

    const ts = new Date().toISOString();

    ALG_LOG.push({
      ts,
      fase: fase || '',
      lvl: lvl || 'i',
      msg
    });

    const panel = document.getElementById('logp');

    if(!panel) return;

    const now = new Date().toLocaleTimeString('es-CO',{
      hour12:false
    });

    const css = {
      i:'li',
      w:'lw',
      o:'lo',
      e:'le-e'
    }[lvl] || 'li';

    panel.innerHTML +=
      '<div class="le">' +
        '<span class="lt">'+now+'</span>' +
        '<span class="'+css+'">'+msg+'</span>' +
      '</div>';

    panel.scrollTop = panel.scrollHeight;
  }


  function algSleep(ms){
    return new Promise(r=>setTimeout(r,ms));
  }

  // ── Normalización de ID ──────────────────────────────────────────

  function algNormId(x){

    const s = String(x ?? '')
      .replace(/[,\s]/g,'')
      .trim();

    if(!s || s==='nan' || s==='undefined'){
      return '';
    }

    return s.replace(/[^0-9A-Za-z\-]/g,'');
  }


  // ── Mapeo Tipo de identificación ─────────────────────────────────

  const ALG_TIPO_ID_ESC = {

    'número de identificación tributaria':'NIT',
    'numero de identificacion tributaria':'NIT',

    'cédula de ciudadanía':'CC',
    'cedula de ciudadania':'CC',

    'tarjeta de identidad':'TI',

    'cédula de extranjería':'Cédula de extranjería',
    'cedula de extranjeria':'Cédula de extranjería',

    'pasaporte':'PASAPORTE',
    'registro civil':'REGISTRO CIVIL',
    'nuip':'NUIP',

    'nit de otro país':
      'Documento de Identificación extranjero',

    'nit de otro pais':
      'Documento de Identificación extranjero',

    'documento de identificación extranjero':
      'Documento de identificación extranjero',

    'documento de identificacion extranjero':
      'Documento de identificación extranjero'
  };


  const ALG_TIPO_ID_CLD = {

    'número de identificación tributaria':'NIT',
    'numero de identificacion tributaria':'NIT',

    'cédula de ciudadanía':'Cédula de ciudadanía',
    'cedula de ciudadania':'Cédula de ciudadanía',

    'tarjeta de identidad':'Tarjeta de Identidad',

    'cédula de extranjería':'Cédula de Extranjería',
    'cedula de extranjeria':'Cédula de Extranjería',

    'pasaporte':'Pasaporte',
    'registro civil':'Registro Civil',

    'nit de otro país':
      'Documento de Identificación Extranjero',

    'nit de otro pais':
      'Documento de Identificación Extranjero',

    'documento de identificación extranjero':
      'Documento de Identificación Extranjero',

    'documento de identificacion extranjero':
      'Documento de Identificación Extranjero'
  };


  function algEsNIT(tipo){
    const t = String(tipo || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');

    return (
      t === 'NIT' ||
      t === 'N.I.T' ||
      t === 'N.I.T.' ||
      t === 'NUMERO DE IDENTIFICACION TRIBUTARIA'
    );
  }


  function algValidarNIT9Digitos(valor){
    const nit = String(valor ?? '')
      .replace(/[,\s.-]/g,'')
      .trim();

    return /^\d{9}$/.test(nit);
  }


  function algNormalizarIdPorTipo(tipoId, valor){
    const raw = String(valor ?? '').trim();

    if(!raw || raw.toLowerCase()==='nan' || raw.toLowerCase()==='undefined'){
      return '';
    }

    if(algEsNIT(tipoId)){
      const nit = raw.replace(/[,\s.-]/g,'');
      return algValidarNIT9Digitos(nit) ? nit : '';
    }

    return algNormId(raw);
  }


  function algMapTipoId(map,raw,esJuridica){

    const k = String(raw||'')
      .toLowerCase()
      .trim();

    if(map[k]){
      return map[k];
    }

    if(!k){
      return esJuridica ? 'NIT' : 'CC';
    }

    return String(raw||'').trim();
  }


  // ── Régimen / Responsabilidad Tributaria Escritorio ──────────────

  function algRetencionEsc(respRaw,esJuridica){

    if(esJuridica){
      return 'Persona Juridica';
    }

    const k = String(respRaw||'')
      .toLowerCase()
      .trim();

    if(k.startsWith('no responsable')){
      return 'Persona Natural No Responsable del IVA';
    }

    if(k.startsWith('responsable')){
      return 'Persona Natural Responsable del IVA';
    }

    return 'Persona Natural No Responsable del IVA';
  }


  // ── Régimen / Responsabilidad Tributaria Cloud ──────────────────

  function algTipoContribCld(esJuridica,respRaw){

    if(esJuridica){
      return 'Persona Juridica';
    }

    const rv = String(respRaw||'').toLowerCase();

    if(
      rv.includes('responsable') &&
      !rv.includes('no responsable')
    ){
      return 'Persona Natural Responsable del IVA';
    }

    return 'Persona Natural No Responsable del IVA';
  }


  // ── Limpieza de nombres ──────────────────────────────────────────

  function algCleanName(s){

    return String(s||'')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');
  }


  // ══════════════════════════════════════════════════════════════════
  // FUNCIÓN NIT
  //
  // Si el Tipo de Identificación es NIT,
  // une los 4 campos del nombre en Razón Social.
  // ══════════════════════════════════════════════════════════════════

  function algAjustarNombreNIT(
    tipoId,
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido
  ){

    const tipo = String(tipoId || '')
      .trim()
      .toUpperCase();

    if(algEsNIT(tipo)){

      return [
        primerNombre,
        segundoNombre,
        primerApellido,
        segundoApellido
      ]
      .filter(v =>
        v !== null &&
        v !== undefined &&
        String(v).trim() !== ''
      )
      .map(v =>
        String(v).trim()
      )
      .join(' ');
    }

    return String(primerNombre || '').trim();
  }


  // ══════════════════════════════════════════════════════════════════
  // NORMALIZACIÓN DE FORMA DE PAGO Y PLAZO DÍAS
  //
  // 30 días       → Credito / 30
  // 60 dias       → Credito / 60
  // 90 DÍAS       → Credito / 90
  // 30            → Credito / 30
  // Contado       → Contado / 0
  // Inmediato     → Contado / 0
  // ══════════════════════════════════════════════════════════════════

  function algNormalizarFormaPago(valor){

    const raw = String(valor || '')
      .trim();

    if(!raw){

      return {
        formaPago: null,
        plazoDias: 0
      };
    }

    const texto = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .trim();

    // Si contiene un número, se considera crédito
    const matchDias = texto.match(/(\d+)/);

    if(matchDias){

      const dias = parseInt(
        matchDias[1],
        10
      );

      return {
        formaPago: 'Credito',
        plazoDias: dias
      };
    }

    // Formas de pago de contado
    if(
      texto.includes('contado') ||
      texto.includes('inmediato') ||
      texto.includes('efectivo')
    ){

      return {
        formaPago: 'Contado',
        plazoDias: 0
      };
    }

    // Si no se reconoce, conserva el valor original
    return {
      formaPago: raw,
      plazoDias: 0
    };
  }


  // ══════════════════════════════════════════════════════════════════
  // VALIDACIÓN DE CORREO
  // ══════════════════════════════════════════════════════════════════

  function algValidarEmail(email){

    const regex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return regex.test(
      String(email || '').trim()
    );
  }


  // ══════════════════════════════════════════════════════════════════
  // MODAL PARA CORREO PREDETERMINADO
  //
  // Busca los registros que tengan Email vacío.
  //
  // Si existen:
  //
  //     Sí  → permite escribir correo predeterminado
  //     No  → deja los campos vacíos
  //
  // Los correos existentes nunca se modifican.
  // ══════════════════════════════════════════════════════════════════

  function algSolicitarEmailPredeterminado(filas){

    return new Promise((resolve) => {

      const filasConEmailVacio = filas.filter(f => {

        const email = f.correo;

        return (
          !email ||
          String(email).trim() === ''
        );
      });


      // No hay correos vacíos.
      // Continuar automáticamente.
      if(filasConEmailVacio.length === 0){

        resolve({
          aplicar:false,
          email:null
        });

        return;
      }


      // Eliminar modal anterior si existe
      const anterior =
        document.getElementById(
          'algModalEmailPredeterminado'
        );

      if(anterior){
        anterior.remove();
      }


      const modal =
        document.createElement('div');

      modal.id =
        'algModalEmailPredeterminado';


      modal.innerHTML = `

        <div style="
          position:fixed;
          inset:0;
          background:rgba(4,12,30,.72);
          backdrop-filter:blur(4px);
          display:flex;
          align-items:center;
          justify-content:center;
          z-index:99999;
          font-family:Arial,sans-serif;
        ">

          <div style="
            width:500px;
            max-width:92%;
            background:#0d172b;
            border:1px solid rgba(93,128,190,.32);
            border-radius:12px;
            padding:0;
            overflow:hidden;
            box-shadow:0 24px 70px rgba(0,0,0,.55);
            color:#e8eef8;
          ">

            <div style="
              padding:20px 24px;
              border-bottom:1px solid rgba(120,150,205,.15);
              background:#101c33;
              display:flex;
              align-items:center;
              gap:13px;
            ">
              <div style="
                width:600px;
                height:38px;
                border-radius:9px;
                display:flex;
                align-items:center;
                justify-content:center;
                background:rgba(53,125,245,.15);
                border:1px solid rgba(72,137,245,.35);
                color:#62a0ff;
                font-size:18px;
              >✉</div>
              <div>
                <h2 style="margin:0;color:#f2f6fc;font-size:18px;font-weight:700;">Correos electrónicos vacíos</h2>
              </div>
            </div>

            <div style="padding:24px;">
              <div style="
                display:inline-flex;
                align-items:center;
                gap:7px;
                padding:6px 10px;
                border-radius:6px;
                background:rgba(38,115,238,.12);
                border:1px solid rgba(63,135,244,.25);
                color:#62a0ff;
                font-size:12px;
                font-weight:600;
                margin-bottom:15px;
              ">
                <span>●</span> ${filasConEmailVacio.length} registros sin correo
              </div>

              <p style="margin:0 0 10px 0;color:#d9e2f1;line-height:1.55;font-size:14px;">
                Se encontraron <strong style="color:#fff;">${filasConEmailVacio.length}</strong> registros sin correo electrónico.
              </p>

              <p style="margin:0 0 20px 0;color:#8fa1bd;line-height:1.55;font-size:13px;">
                ¿Desea reemplazar los campos vacíos por un correo electrónico predeterminado?
              </p>

              <div id="algEmailPredeterminadoContainer" style="display:none;margin-bottom:18px;">
                <label style="display:block;margin-bottom:7px;font-weight:600;color:#b9c7dc;font-size:12px;">
                  Correo electrónico predeterminado
                </label>
                <input type="email" id="algEmailPredeterminado" placeholder="ejemplo@empresa.com" autocomplete="off" style="width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #30415f;border-radius:7px;background:#091224;color:#edf3fb;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;">
                <div id="algEmailError" style="display:none;margin-top:7px;color:#ff6b75;font-size:12px;">
                  Ingrese un correo electrónico válido.
                </div>
              </div>

              <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:10px;">
                <button type="button" id="algBtnEmailNo" style="padding:10px 18px;border:1px solid #344766;background:#18253d;color:#cbd6e6;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;transition:.2s;">
                  No
                </button>
                <button type="button" id="algBtnEmailSi" style="padding:10px 19px;border:1px solid #4388f5;background:#347ff0;color:#fff;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;box-shadow:0 4px 14px rgba(52,127,240,.22);transition:.2s;">
                  Sí
                </button>
                <button type="button" id="algBtnEmailConfirmar" style="display:none;padding:10px 19px;border:1px solid #4388f5;background:#347ff0;color:#fff;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;box-shadow:0 4px 14px rgba(52,127,240,.22);transition:.2s;">
                  Confirmar
                </button>
              </div>
            </div>

          </div>
        </div>
      `;


      document.body.appendChild(modal);


      const btnNo =
        document.getElementById(
          'algBtnEmailNo'
        );

      const btnSi =
        document.getElementById(
          'algBtnEmailSi'
        );

      const btnConfirmar =
        document.getElementById(
          'algBtnEmailConfirmar'
        );

      const contenedor =
        document.getElementById(
          'algEmailPredeterminadoContainer'
        );

      const inputEmail =
        document.getElementById(
          'algEmailPredeterminado'
        );

      const error =
        document.getElementById(
          'algEmailError'
        );


      // ── NO ───────────────────────────────────────────────────────

      btnNo.addEventListener('click', () => {

        modal.remove();

        resolve({
          aplicar:false,
          email:null
        });

      });


      // ── SÍ ───────────────────────────────────────────────────────

      btnSi.addEventListener('click', () => {

        contenedor.style.display =
          'block';

        btnSi.style.display =
          'none';

        btnConfirmar.style.display =
          'inline-block';

        inputEmail.focus();

      });


      // ── CONFIRMAR ───────────────────────────────────────────────

      btnConfirmar.addEventListener(
        'click',
        () => {

          const email =
            inputEmail.value.trim();


          if(
            !email ||
            !algValidarEmail(email)
          ){

            error.style.display =
              'block';

            inputEmail.focus();

            return;
          }


          modal.remove();


          resolve({
            aplicar:true,
            email:email
          });

        }
      );


      // ── Enter para confirmar ────────────────────────────────────

      inputEmail.addEventListener(
        'keydown',
        (event) => {

          if(event.key === 'Enter'){
            btnConfirmar.click();
          }

        }
      );

    });
  }


  // ── Localizar columna ────────────────────────────────────────────

  function algCol(hdrs,re,fallback){

    return (hdrs||[])
      .find(h =>
        re.test(String(h||''))
      ) || fallback;
  }


  // ── Parser CSV ───────────────────────────────────────────────────

  function algParseCSVLine(line){

    const out=[];
    let cur='';
    let inQ=false;

    for(let i=0;i<line.length;i++){

      const ch=line[i];

      if(ch==='"'){

        if(
          inQ &&
          line[i+1]==='"'
        ){

          cur+='"';
          i++;

        }else{

          inQ=!inQ;
        }

      }else if(
        ch===',' &&
        !inQ
      ){

        out.push(cur);
        cur='';

      }else{

        cur+=ch;
      }
    }

    out.push(cur);

    return out;
  }


  function algReadCSV(file){

    return new Promise((resolve,reject)=>{

      const reader =
        new FileReader();


      reader.onload=e=>{

        try{

          let text =
            String(
              e.target.result || ''
            );


          if(
            text.charCodeAt(0)===0xFEFF
          ){

            text=text.slice(1);
          }


          const lines =
            text
              .split(/\r?\n/)
              .filter(
                l=>l.length>0
              );


          if(!lines.length){

            resolve({
              hdrs:[],
              rows:[]
            });

            return;
          }


          const hdrs =
            algParseCSVLine(
              lines[0]
            ).map(
              h=>h.trim()
            );


          const rows=[];


          for(
            let i=1;
            i<lines.length;
            i++
          ){

            const vals =
              algParseCSVLine(
                lines[i]
              );


            if(
              vals.every(
                v=>v===''
              )
            ){

              continue;
            }


            const o={};


            hdrs.forEach(
              (h,idx)=>{

                o[h] =
                  (
                    vals[idx] !== undefined
                      ? vals[idx]
                      : ''
                  ).trim();

              }
            );


            rows.push(o);
          }


          resolve({
            hdrs,
            rows
          });


        }catch(err){

          reject(err);
        }
      };


      reader.onerror=()=>{

        reject(
          new Error(
            'No se pudo leer '+file.name
          )
        );
      };


      reader.readAsText(
        file,
        'utf-8'
      );

    });
  }


  // ── Lectura XLSX / XLS ──────────────────────────────────────────

  function algReadXLSX(file){

    return new Promise((resolve,reject)=>{

      const reader =
        new FileReader();


      reader.onload=e=>{

        try{

          const wb =
            XLSX.read(
              new Uint8Array(
                e.target.result
              ),
              {
                type:'array',
                cellText:true,
                raw:false
              }
            );


          const ws =
            wb.Sheets[
              wb.SheetNames[0]
            ];


          const rowsAoa =
            XLSX.utils.sheet_to_json(
              ws,
              {
                header:1,
                defval:''
              }
            );


          if(!rowsAoa.length){

            resolve({
              hdrs:[],
              rows:[]
            });

            return;
          }


          const hdrs =
            rowsAoa[0]
              .map(
                h=>String(h||'').trim()
              );


          const rows=[];


          for(
            let i=1;
            i<rowsAoa.length;
            i++
          ){

            const vals =
              rowsAoa[i];


            if(
              !vals ||
              vals.every(
                v =>
                  v==='' ||
                  v===null ||
                  v===undefined
              )
            ){

              continue;
            }


            const o={};


            hdrs.forEach(
              (h,idx)=>{

                o[h] =
                  String(
                    vals[idx] !== undefined &&
                    vals[idx] !== null
                      ? vals[idx]
                      : ''
                  ).trim();

              }
            );


            rows.push(o);
          }


          resolve({
            hdrs,
            rows
          });


        }catch(err){

          reject(err);
        }
      };


      reader.onerror=()=>{

        reject(
          new Error(
            'No se pudo leer '+file.name
          )
        );
      };


      reader.readAsArrayBuffer(file);

    });
  }


  // ══════════════════════════════════════════════════════════════════
  // ELIMINAR COLUMNAS NO REQUERIDAS
  //
  // Se eliminan del resultado final las columnas Código, Zona Uno
  // y Zona Dos. La eliminación se realiza sobre una copia de cada
  // registro para no alterar el arreglo original del proceso ETL.
  // ══════════════════════════════════════════════════════════════════

  function algEliminarColumnas(filas){

    const columnasAEliminar = [
      'Código',
      'Zona Uno',
      'Zona Dos'
    ];

    if(!Array.isArray(filas)){
      return [];
    }

    return filas.map(fila => {

      const nuevoRegistro = {
        ...fila
      };

      columnasAEliminar.forEach(columna => {
        delete nuevoRegistro[columna];
      });

      return nuevoRegistro;

    });
  }


  function algReadFile(file){

    if(!file){
      return Promise.resolve(null);
    }


    const name =
      (file.name||'').toLowerCase();


    if(
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ){

      return algReadXLSX(file);
    }


    return algReadCSV(file);
  }


  // ── Construye set de identificaciones ───────────────────────────

  function algBuildIdSet(dataset){

    if(!dataset){
      return null;
    }

    const set = new Set();

    const idCol =
      algCol(
        dataset.hdrs,
        /^identificaci/i,
        'Identificación'
      );

    const tipoIdCol =
      algCol(
        dataset.hdrs,
        /^tipo de identificaci/i,
        'Tipo de identificación'
      );

    const tipoPersonaCol =
      algCol(
        dataset.hdrs,
        /^tipo de persona$/i,
        'Tipo de persona'
      );

    dataset.rows.forEach(r=>{

      const esJuridica =
        /jur[ií]dica/i.test(
          String(r[tipoPersonaCol] || '')
        );

      const tipoId =
        algMapTipoId(
          ALG_TIPO_ID_CLD,
          r[tipoIdCol],
          esJuridica
        );

      const id =
        algNormalizarIdPorTipo(
          tipoId,
          r[idCol]
        );

      if(id){
        set.add(id);
      }
    });

    return set;
  }


  // ── Carga todos los archivos ─────────────────────────────────────

  async function algLoadAll(){

    const fContactos =
      ALG_S.files.contactos || null;

    const fClientes =
      ALG_S.files.clientes || null;

    const fProveedores =
      ALG_S.files.proveedores || null;


    if(
      !fContactos &&
      !fClientes &&
      !fProveedores
    ){

      throw new Error(
        'Carga al menos un archivo de Alegra: Contactos, Clientes o Proveedores.'
      );
    }


    const [
      dContactos,
      dClientes,
      dProveedores
    ] = await Promise.all([

      algReadFile(fContactos),
      algReadFile(fClientes),
      algReadFile(fProveedores)

    ]);


    const clienteIds =
      algBuildIdSet(
        dClientes
      );

    const proveedorIds =
      algBuildIdSet(
        dProveedores
      );


    let maestroHdrs=[];
    let maestroRows=[];


    if(dContactos){

      maestroHdrs =
        dContactos.hdrs;

      maestroRows =
        dContactos.rows;

    }else{

      maestroHdrs =
        (dClientes && dClientes.hdrs) ||
        (dProveedores && dProveedores.hdrs) ||
        [];


      const seen =
        new Set();


      [
        dClientes,
        dProveedores
      ].forEach(ds=>{

        if(!ds) return;


        const idCol =
          algCol(
            ds.hdrs,
            /^identificaci/i,
            'Identificación'
          );


        ds.rows.forEach(r=>{

          const tipoIdCol =
            algCol(
              ds.hdrs,
              /^tipo de identificaci/i,
              'Tipo de identificación'
            );

          const tipoPersonaCol =
            algCol(
              ds.hdrs,
              /^tipo de persona$/i,
              'Tipo de persona'
            );

          const esJuridica =
            /jur[ií]dica/i.test(
              String(r[tipoPersonaCol] || '')
            );

          const tipoId =
            algMapTipoId(
              ALG_TIPO_ID_CLD,
              r[tipoIdCol],
              esJuridica
            );

          const id =
            algNormalizarIdPorTipo(
              tipoId,
              r[idCol]
            );


          if(
            !id ||
            seen.has(id)
          ){

            return;
          }


          seen.add(id);

          maestroRows.push(r);

        });

      });
    }


    return {

      maestroHdrs,
      maestroRows,
      clienteIds,
      proveedorIds,

      counts:{

        contactos:
          dContactos
            ? dContactos.rows.length
            : null,

        clientes:
          dClientes
            ? dClientes.rows.length
            : null,

        proveedores:
          dProveedores
            ? dProveedores.rows.length
            : null

      }

    };
  }


  // ── Extrae fila Alegra ───────────────────────────────────────────

  function algExtractRow(r,hdrs){

    const cNom =
      algCol(
        hdrs,
        /^nombre$/i,
        'Nombre'
      );


    const cNom2 =
      algCol(
        hdrs,
        /^segundo nombre$/i,
        'Segundo nombre'
      );


    const cApe1 =
      algCol(
        hdrs,
        /^primer apellido$/i,
        'Primer apellido'
      );


    const cApe2 =
      algCol(
        hdrs,
        /^segundo apellido$/i,
        'Segundo apellido'
      );


    const cID =
      algCol(
        hdrs,
        /^identificaci/i,
        'Identificación'
      );


    const cTipoId =
      algCol(
        hdrs,
        /^tipo de identificaci/i,
        'Tipo de identificación'
      );


    const cTipoPersona =
      algCol(
        hdrs,
        /^tipo de persona$/i,
        'Tipo de persona'
      );


    const cResp =
      algCol(
        hdrs,
        /responsabilidad tributaria/i,
        'Responsabilidad Tributaria'
      );


    const cMunicipio =
      algCol(
        hdrs,
        /^municipio$/i,
        'Municipio'
      );


    const cDireccion =
      algCol(
        hdrs,
        /^direcci/i,
        'Dirección'
      );


    const cTel1 =
      algCol(
        hdrs,
        /^tel[eé]fono ?1$/i,
        'Teléfono 1'
      );


    const cTel2 =
      algCol(
        hdrs,
        /^tel[eé]fono ?2$/i,
        'Teléfono 2'
      );


    const cCelular =
      algCol(
        hdrs,
        /^celular$/i,
        'Celular'
      );


    const cCorreo =
      algCol(
        hdrs,
        /^correo$/i,
        'Correo'
      );


    const cCorreo2 =
      algCol(
        hdrs,
        /correo electr[oó]nico ?2/i,
        'Correo electrónico 2'
      );


    const cEstado =
      algCol(
        hdrs,
        /^estado del contacto$/i,
        'Estado del contacto'
      );


    const cTermPago =
      algCol(
        hdrs,
        /t[eé]rmino de pago/i,
        'Término de pago'
      );


    const cListaPrecios =
      algCol(
        hdrs,
        /lista de precios/i,
        'Lista de precios'
      );


    const cVendedor =
      algCol(
        hdrs,
        /^vendedor$/i,
        'Vendedor'
      );


    const idRaw =
      r[cID];


    const tipoPersonaRaw =
      String(
        r[cTipoPersona] || ''
      );


    const esJuridica =
      /jur[ií]dica/i.test(
        tipoPersonaRaw
      );

    const tipoIdMapped =
      algMapTipoId(
        ALG_TIPO_ID_CLD,
        r[cTipoId],
        esJuridica
      );

    const id =
      algNormalizarIdPorTipo(
        tipoIdMapped,
        idRaw
      );


    return {

      id,
      idRaw,

      esJuridica,

      tipoIdRaw:
        r[cTipoId],

      respRaw:
        r[cResp],

      p1:
        algCleanName(
          r[cNom]
        ),

      p2:
        algCleanName(
          r[cNom2]
        ),

      a1:
        algCleanName(
          r[cApe1]
        ),

      a2:
        algCleanName(
          r[cApe2]
        ),

      municipioRaw:
        r[cMunicipio],

      direccionRaw:
        r[cDireccion],

      tel1Raw:
        r[cTel1],

      tel2Raw:
        r[cTel2],

      celularRaw:
        r[cCelular],

      correo:
        String(
          r[cCorreo] || ''
        ).trim(),

      correo2:
        String(
          r[cCorreo2] || ''
        ).trim(),

      estadoRaw:
        r[cEstado],

      termPago:
        String(
          r[cTermPago] || ''
        ).trim(),

      listaPrecios:
        String(
          r[cListaPrecios] || ''
        ).trim(),

      vendedor:
        String(
          r[cVendedor] || ''
        ).trim()

    };
  }


  // ── Rol del tercero ──────────────────────────────────────────────

  function algRol(
    id,
    clienteIds,
    proveedorIds
  ){

    let esC =
      clienteIds
        ? clienteIds.has(id)
        : true;


    let esP =
      proveedorIds
        ? proveedorIds.has(id)
        : true;


    if(!esC && !esP){

      esC=true;
      esP=true;
    }


    return {
      esC,
      esP
    };
  }


  // ══════════════════════════════════════════════════════════════════
  // PIPELINE 1:
  // Alegra → World Office Escritorio
  // ══════════════════════════════════════════════════════════════════

  async function startAlegraEscETL(){

    setStep(3);

    ALG_LOG.length=0;


    const panel =
      document.getElementById('logp');


    if(panel){
      panel.innerHTML='';
    }


    setPStep(0);

    setPct(
      0,
      'Iniciando...'
    );


    const t0=Date.now();


    try{

      algLog(
        '📂 Leyendo archivos de Alegra...',
        'i',
        'Lectura'
      );


      setPStep(1);

      setPct(
        10,
        'Leyendo archivos...'
      );


      await algSleep(30);


      const {
        maestroHdrs,
        maestroRows,
        clienteIds,
        proveedorIds,
        counts
      }=await algLoadAll();


      if(counts.contactos!=null){

        algLog(
          '   Contactos: '+
          counts.contactos+
          ' registros',
          'i',
          'Lectura'
        );
      }


      if(counts.clientes!=null){

        algLog(
          '   Clientes: '+
          counts.clientes+
          ' registros (para identificar rol)',
          'i',
          'Lectura'
        );
      }


      if(counts.proveedores!=null){

        algLog(
          '   Proveedores: '+
          counts.proveedores+
          ' registros (para identificar rol)',
          'i',
          'Lectura'
        );
      }


      if(counts.contactos==null){

        algLog(
          '   Sin archivo de Contactos — maestro = unión de Clientes + Proveedores ('+
          maestroRows.length+
          ' registros)',
          'i',
          'Lectura'
        );
      }


      setPStep(2);

      setPct(
        30,
        'Consolidando...'
      );


      await algSleep(30);


      const seen =
        new Set();

      const out=[];

      const defaults=[];

      const nitExcluidos=[];

      const excluded=[];

      const totalEntrada =
        maestroRows.length;


      maestroRows.forEach(r=>{

        const f =
          algExtractRow(
            r,
            maestroHdrs
          );


        if(!f.id){

          excluded.push({
            id:'',
            nombre:f.p1,
            tipo:'sin-id'
          });

          return;
        }


        if(seen.has(f.id)){

          excluded.push({
            id:f.id,
            nombre:f.p1,
            tipo:'duplicado'
          });

          return;
        }


        seen.add(f.id);

        
        if(
          ALG_NITS_BLOQUEADOS.has(f.id)
        ){

          nitExcluidos.push({
            id:f.id,
            nombre:
              (f.p1+' '+f.a1)
              .trim()
              .toUpperCase()
          });

          return;
        }


        let tipoId =
          algMapTipoId(
            ALG_TIPO_ID_ESC,
            f.tipoIdRaw,
            f.esJuridica
          );

        const idNormalizado =
          algNormalizarIdPorTipo(
            tipoId,
            f.id
          );

        if(!idNormalizado){
          return;
        }

        f.id = idNormalizado;


        const retencion =
          algRetencionEsc(
            f.respRaw,
            f.esJuridica
          );


        const ciudad =
          algNormalizarCiudad(
            f.municipioRaw
          );


        const dir =
          escNormAddr(
            f.direccionRaw
          );


        const telPrincipal =
          f.tel1Raw ||
          f.celularRaw ||
          f.tel2Raw;


        const tel =
          escNormTel(
            telPrincipal
          );


        const movil1 =
          f.celularRaw
            ? escNormTel(
                f.celularRaw
              )
            : null;


        const activo =
          escMapActivo(
            f.estadoRaw
          );


        const {
          esC,
          esP
        }=algRol(
          f.id,
          clienteIds,
          proveedorIds
        );


        let propActiva =
        esC && esP ? 'Cliente;Proveedor;' :
        esC ? 'Proveedor;' :
        esP ? 'Cliente;' :
        'Cliente;Proveedor;';

        const row={

          'Tipo Identificación':
            tipoId,

          'No. Identificación':
            f.id,

          'Ciudad Identificación':
            ciudad,

          '1er. Nombre o Razón Social':
            f.p1,

          '2do. Nombre':
            f.p2||null,

          '1re. Apellido':
            f.a1||null,

          '2do.Apellido':
            f.a2||null,

          'Propiedad Activa':
            propActiva,

          'Activo':
            activo,

          'Propiedad Retención':
            retencion,

          'Fecha Creación':
            escFechaHoy(),

          'Plazo':
            algNormalizarFormaPago(f.termPago).plazoDias,

          'Clasificación Dian':
            'Normal',

          'Actividad Económica':
            null,

          'Matricula':
            null,

          'Tipos_Responsabilidades':
            null,

          'Aplica ReteIca':
            null,

          '% Ica':
            null,

          'Maneja Cupo Crédito':
            null,

          'Cupo Crédito':
            null,

          'Código':
            null,

          'Fecha Aniversario':
            null,

          'Forma de Pago':
            algNormalizarFormaPago(f.termPago).formaPago,

          'Lista Precios':
            f.listaPrecios||null,

          'Nota':
            null,

          '% Descuento':
            null,

          'Vendedor':
            f.vendedor||null,

          'Clasificación Uno':
            null,

          'Clasificación Dos':
            null,

          'Clasificación Tres':
            null,

          'Zona Uno':
            null,

          'Zona Dos':
            null,

          'Personalizado 1':
            null,

          'Personalizado 2':
            null,

          'Personalizado 3':
            null,

          'Personalizado 4':
            null,

          'Personalizado 5':
            null,

          'Personalizado 6':
            null,

          'Personalizado 7':
            null,

          'Personalizado 8':
            null,

          'Personalizado 9':
            null,

          'Personalizado 10':
            null,

          'Personalizado 11':
            null,

          'Personalizado 12':
            null,

          'Personalizado 13':
            null,

          'Personalizado 14':
            null,

          'Personalizado 15':
            null,

          'Tipo Dirección':
            f.esJuridica
              ? 'Empresa/Oficina'
              : 'Casa',

          'Ciudad Dirección':
            ciudad,

          'Dirección':
            dir,

          'Dirección Principal':
            -1,

          'Teléfonos':
            tel||null,

          'Código Postal':
            null,

          'Fax':
            null,

          'Movil 1':
            movil1,

          'Movil 2':
            null,

          'E_Mail':
            f.correo||null,

          'E_Mail 2':
            f.correo2||null,

          'E_Mail 3':
            null,

          'Página Web':
            null,

          'Observaciones':
            null,

          'Sucursal':
            null

        };


        out.push(row);


        if(!f.municipioRaw){

          defaults.push({

            'Tipo Identificación Aplicado':
              tipoId,

            'No. Identificación':
              f.id,

            'Nombre':
              f.p1,

            'Concepto':
              'Municipio vacío en origen — se aplica Bogotá, D.C. por defecto'

          });
        }


        if(
          !f.direccionRaw ||
          String(f.direccionRaw).length<3
        ){

          defaults.push({

            'Tipo Identificación Aplicado':
              tipoId,

            'No. Identificación':
              f.id,

            'Nombre':
              f.p1,

            'Concepto':
              'Dirección vacía en origen — se aplica DIRECCION NO INFORMADA por defecto'

          });
        }


        if(!telPrincipal){

          defaults.push({

            'Tipo Identificación Aplicado':
              tipoId,

            'No. Identificación':
              f.id,

            'Nombre':
              f.p1,

            'Concepto':
              'Teléfono vacío en origen — se aplica 6050000000 por defecto'

          });
        }

      });


      algLog(
        '✅ Consolidados: '+
        out.length+
        ' registros',
        'o',
        'Consolidación'
      );


      setPStep(3);

      setPct(
        60,
        'Transformando...'
      );


      await algSleep(30);


      algLog(
        '🔄 Transformados: '+
        out.length+
        ' registros',
        'o',
        'Transformación'
      );


      setPStep(4);

      setPct(
        80,
        'Generando Excel...'
      );


      await algSleep(30);


      algLog(
        '📊 Construyendo archivo Excel...',
        'i',
        'Escritura'
      );


      if(nitExcluidos.length>0){

        algLog(
          '   '+
          nitExcluidos.length+
          ' NITs excluidos (lista predefinida)',
          'w',
          'Consolidación'
        );
      }


      const outSinColumnas =
        algEliminarColumnas(out);


      ALG_ESC_WB =
        escBuildWB(
          outSinColumnas,
          ALG_LOG,
          {
            archivos_entrada:
              (counts.contactos!=null?1:0)+
              (counts.clientes!=null?1:0)+
              (counts.proveedores!=null?1:0),

            registros_entrada:
              totalEntrada,

            registros_salida:
              out.length,

            errores:0,
            warnings:0
          },
          excluded,
          defaults,
          nitExcluidos
        );

      algCorregirBogotaEnWB(ALG_ESC_WB);


      const dur =
        ((Date.now()-t0)/1000)
        .toFixed(1);


      setPct(
        100,
        '¡Listo!'
      );


      setPStep(5);


      algLog(
        '✅ Excel generado en '+
        dur+
        's — '+
        out.length+
        ' registros',
        'o',
        'Escritura'
      );


      const fn =
        algBuildFN(
          'escritorio'
        );


      const fnEl =
        document.getElementById(
          'dl-fn'
        );


      if(fnEl){
        fnEl.textContent=fn;
      }


      const lbl =
        document.getElementById(
          'dl-dest-label'
        );


      if(lbl){

        lbl.textContent =
          'Para importar en World Office Escritorio';
      }


      const stIn =
        document.getElementById(
          'st-in'
        );


      if(stIn){
        stIn.textContent =
          totalEntrada;
      }


      const stOk =
        document.getElementById(
          'st-ok'
        );


      if(stOk){
        stOk.textContent =
          out.length;
      }


      try{

        await logMigrationToBackend({

          filename_out:fn,

          orig_soft:'Alegra',

          dest_soft:
            'World Office Escritorio',

          module:'Terceros',

          records_in:
            totalEntrada,

          records_out:
            out.length,

          errors:0,

          warnings:0,

          duration_sec:
            parseFloat(dur),

          status:'completed'

        });

      }catch(e){}


      setStep(4);


    }catch(err){

      algLog(
        '❌ Error: '+err.message,
        'e',
        'Pipeline'
      );

      console.error(err);
    }

  }


  // ══════════════════════════════════════════════════════════════════
  // PIPELINE 2:
  // Alegra → World Office Cloud
  // ══════════════════════════════════════════════════════════════════

  function algIdNum(id){

    if(
      /^[0-9]+$/.test(id) &&
      id.length<=15
    ){

      return Number(id);
    }

    return id;
  }


  async function startAlegraCldETL(){

    setStep(3);

    ALG_LOG.length=0;


    const panel =
      document.getElementById('logp');


    if(panel){
      panel.innerHTML='';
    }


    setPStep(
      'ps0',
      'ps act'
    );


    setPct(
      5,
      'Cargando configuración...'
    );


    const t0=Date.now();


    try{

      algLog(
        'INICIANDO PIPELINE ETL (Alegra → World Office Cloud)',
        'o',
        null
      );


      await algSleep(150);


      setPStep(
        'ps0',
        'ps don'
      );


      setPStep(
        'ps1',
        'ps act'
      );


      setPct(
        15,
        'Leyendo archivos...'
      );


      const {
        maestroHdrs,
        maestroRows,
        clienteIds,
        proveedorIds,
        counts
      }=await algLoadAll();


      if(counts.contactos!=null){

        algLog(
          '   Contactos: '+
          counts.contactos+
          ' registros',
          'i',
          'Lectura de archivos'
        );
      }


      if(counts.clientes!=null){

        algLog(
          '   Clientes: '+
          counts.clientes+
          ' registros (para identificar rol)',
          'i',
          'Lectura de archivos'
        );
      }


      if(counts.proveedores!=null){

        algLog(
          '   Proveedores: '+
          counts.proveedores+
          ' registros (para identificar rol)',
          'i',
          'Lectura de archivos'
        );
      }


      if(counts.contactos==null){

        algLog(
          '   Sin archivo de Contactos — maestro = unión de Clientes + Proveedores ('+
          maestroRows.length+
          ' registros)',
          'i',
          'Lectura de archivos'
        );
      }


      if(
        !clienteIds &&
        !proveedorIds
      ){

        algLog(
          '   No se cargó Clientes ni Proveedores — todos los contactos se marcan Cliente,Proveedor',
          'w',
          'Lectura de archivos'
        );
      }


      const totalEntrada =
        maestroRows.length;


      await algSleep(150);


      setPStep(
        'ps1',
        'ps don'
      );


      setPStep(
        'ps2',
        'ps act'
      );


      setPct(
        35,
        'Consolidando...'
      );


      const seen =
        new Set();

      const filtered=[];

      const nitExcluidos=[];


      maestroRows.forEach(r=>{

        const f =
          algExtractRow(
            r,
            maestroHdrs
          );


        if(
          !f.id ||
          seen.has(f.id)
        ){

          return;
        }


        if(
          ALG_NITS_BLOQUEADOS.has(f.id)
        ){

          nitExcluidos.push({

            id:f.id,

            nombre:
              (f.p1+' '+f.a1)
              .trim()

          });

          return;
        }


        seen.add(f.id);

        filtered.push(f);

      });


      algLog(
        'Consolidación: '+
        totalEntrada+
        ' -> '+
        filtered.length+
        ' registros únicos',
        'o',
        'Consolidación de datos'
      );


      if(nitExcluidos.length>0){

        algLog(
          '   '+
          nitExcluidos.length+
          ' NITs excluidos (lista predefinida)',
          'w',
          'Consolidación de datos'
        );
      }


      await algSleep(150);


      setPStep(
        'ps2',
        'ps don'
      );


      setPStep(
        'ps3',
        'ps act'
      );


      setPct(
        58,
        'Transformando...'
      );


      // ══════════════════════════════════════════════════════════════
      // CONSULTA DE CORREO PREDETERMINADO
      //
      // Se hace UNA sola vez para todos los registros.
      // ══════════════════════════════════════════════════════════════

      const emailConfig =
        await algSolicitarEmailPredeterminado(
          filtered
        );


      // Registrar en el log si se aplicará correo
      if(emailConfig.aplicar){

        algLog(
          '   Se aplicará el correo predeterminado "'+
          emailConfig.email+
          '" únicamente en los registros que tengan Email vacío.',
          'i',
          'Correo electrónico'
        );

      }else{

        const cantidadVacios =
          filtered.filter(f =>
            !f.correo ||
            String(f.correo).trim()===''
          ).length;


        if(cantidadVacios>0){

          algLog(
            '   Se conservarán '+
            cantidadVacios+
            ' correos vacíos.',
            'w',
            'Correo electrónico'
          );
        }
      }


      const out=[];

      let warns=0;

      let errCount=0;

      const defaultsLog=[];


      filtered.forEach(f=>{

        let tipoId =
          algMapTipoId(
            ALG_TIPO_ID_CLD,
            f.tipoIdRaw,
            f.esJuridica
          );

        const idNormalizado =
          algNormalizarIdPorTipo(
            tipoId,
            f.id
          );

        if(!idNormalizado){
          return;
        }

        f.id = idNormalizado;


        // ═══════════════════════════════════════════════════════════
        // NORMALIZACIÓN DE FORMA DE PAGO
        // ═══════════════════════════════════════════════════════════

        const pagoNormalizado =
          algNormalizarFormaPago(
            f.termPago
          );


        const ciudad =
          algNormalizarCiudad(
            f.municipioRaw
          );


        const dir =
          normAddr(
            f.direccionRaw
          );


        const telPrincipal =
          f.tel1Raw ||
          f.celularRaw ||
          f.tel2Raw;


        const telefono =
          normTel(
            telPrincipal
          ) ||
          '3000000000';


        const activo =
          mapActivo(
            f.estadoRaw
          );


        // ═══════════════════════════════════════════════════════════
        // EMAIL FINAL
        //
        // Si Alegra ya tiene correo:
        //     se conserva.
        //
        // Si está vacío y el usuario eligió correo predeterminado:
        //     se aplica.
        //
        // Si está vacío y el usuario eligió NO:
        //     queda vacío.
        // ═══════════════════════════════════════════════════════════

        let emailFinal =
          f.correo || null;


        if(
          emailConfig.aplicar &&
          (
            !emailFinal ||
            String(emailFinal).trim()===''
          )
        ){

          emailFinal =
            emailConfig.email;
        }


        if(!f.municipioRaw){

          defaultsLog.push({

            id:f.id,

            nombre:f.p1,

            campo:
              'Ciudad Identificación / Ciudad Dirección',

            valor_aplicado:
              'Bogotá, D.C.',

            motivo:
              'Campo vacío en origen'

          });
        }


        if(
          !f.direccionRaw ||
          String(f.direccionRaw).length<3
        ){

          defaultsLog.push({

            id:f.id,

            nombre:f.p1,

            campo:'Dirección',

            valor_aplicado:
              'DIRECCION NO INFORMADA',

            motivo:
              'Campo vacío en origen'

          });
        }


        if(!telPrincipal){

          defaultsLog.push({

            id:f.id,

            nombre:f.p1,

            campo:'Telefonos',

            valor_aplicado:
              '3000000000',

            motivo:
              'Campo vacío en origen'

          });
        }


        if(
          !f.esJuridica &&
          !f.a1
        ){

          warns++;
        }


        const {
          esC,
          esP
        }=algRol(
          f.id,
          clienteIds,
          proveedorIds
        );


        // ═══════════════════════════════════════════════════════════
        // TIPO DE TERCERO ORIGINAL
        // ═══════════════════════════════════════════════════════════

        let tipoTercero =
          'Cliente,Proveedor';


        if(esC && esP){

          tipoTercero =
            'Cliente,Proveedor';

        }else if(esC){

          tipoTercero =
            'Proveedor';

        }else if(esP){

          tipoTercero =
            'Cliente';
        }


        // ═══════════════════════════════════════════════════════════
        // PROCESO PARA NIT
        // ═══════════════════════════════════════════════════════════

        const nombreRazonSocial =
          algAjustarNombreNIT(
            tipoId,
            f.p1,
            f.p2,
            f.a1,
            f.a2
          );


        const esNIT =
          algEsNIT(tipoId);


        // ═══════════════════════════════════════════════════════════
        // SALIDA WORLD OFFICE CLOUD
        // ═══════════════════════════════════════════════════════════

        out.push({

          'Tipo Identificacion *':
            tipoId,

          'Identificacion *':
            algIdNum(f.id),

          'Ciudad Identificacion*':
            ciudad,

          'Primer Nombre o Razon Social*':
            nombreRazonSocial,

          'Segundo Nombre':
            esNIT
              ? null
              : (f.p2||null),

          'Primer Apellido *':
            esNIT
              ? null
              : (f.a1||null),

          'Segundo Apellido':
            esNIT
              ? null
              : (f.a2||null),

          'Tipo Tercero *':
            tipoTercero,

          'Codigo':
            null,

          'Activo':
            activo,

          'Actividad Economica':
            null,

          'Tipo Contribuyente *':
            algTipoContribCld(
              f.esJuridica,
              f.respRaw
            ),

          'Clasi. Administrador Impuesto *':
            'Normal',

          'Excepcion Impuesto':
            null,

          'Tarifa Reteica Compras':
            9.66,

          'Aplica Reteica Ventas':
            null,

          'Maneja Cupo Credito':
            null,

          'Vendedor':
            null,

          'Lista Precios':
            null,

          // ── FORMA DE PAGO NORMALIZADA ──────────────────────────
          //
          // "30 días" → "Credito"
          // "Contado" → "Contado"

          'Forma Pago':
            pagoNormalizado.formaPago,


          // ── PLAZO NORMALIZADO ──────────────────────────────────
          //
          // "30 días" → 30
          // "60 dias" → 60

          'Plazo Dias':
            pagoNormalizado.plazoDias,


          'Porcentaje Descuento':
            null,

          'Tipo Direccion *':
            f.esJuridica
              ? 'Empresa/Oficina'
              : 'Casa',

          'Nombre Direccion *':
            'Principal',

          'Direccion *':
            dir,

          'Telefonos *':
            telefono,

          // ── EMAIL FINAL ───────────────────────────────────────
          //
          // Mantiene el correo original si existe.
          // Solo usa el predeterminado cuando estaba vacío.

          'Email *':
            emailFinal,

          'Ciudad Direccion *':
            ciudad,

          'Zona':
            null,

          'Barrio':
            null

        });

      });


      algLog(
        'Transformación: '+
        out.length+
        ' registros, 30 campos',
        'o',
        'Transformación de datos'
      );


      if(warns>0){

        algLog(
          '   '+
          warns+
          ' personas naturales sin apellido',
          'w',
          'Transformación de datos'
        );
      }


      await algSleep(150);


      setPStep(
        'ps3',
        'ps don'
      );


      setPStep(
        'ps4',
        'ps act'
      );


      setPct(
        74,
        'Validando...'
      );


      out.forEach(r=>{

        if(
          !r['Tipo Identificacion *'] ||
          !r['Identificacion *'] ||
          !r['Primer Nombre o Razon Social*']
        ){

          errCount++;
        }

      });


      algLog(
        'Validación: '+
        errCount+
        ' errores, '+
        warns+
        ' advertencias',
        'o',
        'Validación de datos'
      );


      await algSleep(120);


      setPStep(
        'ps4',
        'ps don'
      );


      setPStep(
        'ps5',
        'ps act'
      );


      setPct(
        88,
        'Generando Excel...'
      );


      algLog(
        'Generando Excel con plantilla WO Cloud',
        'i',
        'Escritura de archivo'
      );


      const _stats={

        archivos_entrada:
          (counts.contactos!=null?1:0)+
          (counts.clientes!=null?1:0)+
          (counts.proveedores!=null?1:0),

        registros_entrada:
          totalEntrada,

        registros_consolidados:
          filtered.length,

        registros_transformados:
          out.length,

        errores:
          errCount,

        warnings:
          warns
      };


      ALG_CLD_WB =
        buildWB(
          out,
          ALG_LOG,
          _stats,
          [],
          new Set(),
          defaultsLog,
          nitExcluidos
        );

      algCorregirBogotaEnWB(ALG_CLD_WB);


      const dur =
        ((Date.now()-t0)/1000)
        .toFixed(1);


      algLog(
        'Excel generado en '+
        dur+
        's',
        'o',
        'Escritura de archivo'
      );


      algLog(
        'PIPELINE COMPLETADO | '+
        out.length+
        ' terceros migrados',
        'o',
        null
      );


      setPStep(
        'ps5',
        'ps don'
      );


      setPct(
        100,
        'Completado'
      );


      await algSleep(300);


      const fn =
        algBuildFN(
          'cloud'
        );


      const dlFnEl =
        document.getElementById(
          'dl-fn'
        );


      if(dlFnEl){

        dlFnEl.textContent =
          fn;
      }


      const dlMeta =
        document.getElementById(
          'dl-meta'
        );


      if(dlMeta){

        dlMeta.textContent =
          'Excel - '+
          out.length+
          ' registros - WO Cloud';
      }


      const lbl =
        document.getElementById(
          'dl-dest-label'
        );


      if(lbl){

        lbl.textContent =
          'Para importar en World Office Cloud';
      }


      const rsub =
        document.getElementById(
          'rsub'
        );


      if(rsub){

        rsub.textContent =
          'Alegra -> World Office Cloud - Terceros - '+
          dur+
          's';
      }


      const stIn =
        document.getElementById(
          'st-in'
        );


      if(stIn){

        stIn.textContent =
          out.length.toLocaleString(
            'es-CO'
          );
      }


      const stOk =
        document.getElementById(
          'st-ok'
        );


      if(stOk){

        stOk.textContent =
          (out.length-errCount)
            .toLocaleString(
              'es-CO'
            );
      }


      const stW =
        document.getElementById(
          'st-w'
        );


      if(stW){

        stW.textContent =
          (warns+errCount);
      }


      const stT =
        document.getElementById(
          'st-t'
        );


      if(stT){

        stT.textContent =
          dur;
      }


      const rlog =
        document.getElementById(
          'rlog'
        );

      const logp =
        document.getElementById(
          'logp'
        );


      if(rlog && logp){

        rlog.innerHTML =
          logp.innerHTML;
      }


      setStep(4);


      try{

        await logMigrationToBackend({

          filename_out:
            fn,

          orig_soft:
            'Alegra',

          dest_soft:
            'World Office Cloud',

          module:
            'Terceros',

          records_in:
            totalEntrada,

          records_out:
            out.length,

          errors:
            errCount,

          warnings:
            warns,

          duration_sec:
            parseFloat(dur),

          status:
            'completed'

        });

      }catch(e){}


    }catch(err){

      algLog(
        'ERROR: '+err.message,
        'e',
        null
      );


      console.error(err);


      setStep(2);


      const a2m =
        document.getElementById(
          'a2m'
        );


      const a2 =
        document.getElementById(
          'a2'
        );


      if(a2m){

        a2m.textContent =
          'Error en pipeline: '+
          err.message;
      }


      if(a2){

        a2.classList.remove(
          'hide'
        );
      }

    }

  }


  // ── Nombre de archivo ────────────────────────────────────────────

  function algBuildFN(target){

    const now =
      new Date();


    const p =
      x =>
        String(x).padStart(
          2,
          '0'
        );


    const ts =
      now.getFullYear()+
      '_'+
      p(now.getMonth()+1)+
      '_'+
      p(now.getDate());


    return target === 'escritorio'

      ? (
          'terceros_alegra_wo_escritorio_'+
          ts+
          '.xlsx'
        )

      : (
          'terceros_alegra_wo_cloud_'+
          ts+
          '.xlsx'
        );
  }


  // ── Descarga ────────────────────────────────────────────────────

  function algDoDownload(){

    const dest =
      (
        document.getElementById(
          'sdest'
        ) || {}
      ).value;


    if(
      dest ===
      'World Office Escritorio'
    ){

      if(!ALG_ESC_WB){

        alert(
          'Primero ejecuta el proceso ETL'
        );

        return;
      }


      algCorregirBogotaEnWB(ALG_ESC_WB);

      XLSX.writeFile(

        ALG_ESC_WB,

        (
          document.getElementById(
            'dl-fn'
          ) || {}
        ).textContent ||

        algBuildFN(
          'escritorio'
        )

      );


    }else{

      if(!ALG_CLD_WB){

        alert(
          'Primero ejecuta la migracion.'
        );

        return;
      }


      algCorregirBogotaEnWB(ALG_CLD_WB);

      XLSX.writeFile(

        ALG_CLD_WB,

        (
          document.getElementById(
            'dl-fn'
          ) || {}
        ).textContent ||

        algBuildFN(
          'cloud'
        )

      );
    }
  }


  // ══════════════════════════════════════════════════════════════════
  // INSTALACIÓN EN LA PÁGINA
  // ══════════════════════════════════════════════════════════════════

  // Este archivo es el dueño de World Office CLOUD
  window.__algCloudETL = startAlegraCldETL;
  window.__algCloudDownload = function(){ algDoDownload(); };

  function algInstall(){

    console.log('%c[terceros_alegra.js] v7 — maneja CLOUD','color:#16a34a;font-weight:bold');

    console.log('%c[terceros_alegra v4] Módulo de ciudades nuevo cargado','color:#16a34a;font-weight:bold');

    const sorigEl =
      document.getElementById(
        'sorig'
      );


    const s2card =
      document.querySelector(
        '#s2 .card'
      );


    if(
      !sorigEl ||
      !s2card
    ){

      return;
    }


    // ── Opción Alegra ──────────────────────────────────────────────

    if(
      !sorigEl.querySelector(
        'option[value="Alegra"]'
      )
    ){

      const opt =
        document.createElement(
          'option'
        );


      opt.value =
        'Alegra';

      opt.textContent =
        'Alegra';


      sorigEl.appendChild(
        opt
      );
    }


    // ── Referencias Siigo ──────────────────────────────────────────

    const siigoFslots =
      document.querySelector(
        '#s2 .fslots'
      );


    const siigoInfo =
      document.querySelector(
        '#s2 .al.al-i'
      );


    // ── Información Alegra ─────────────────────────────────────────

    const algInfoHTML =

      '<div class="al al-i" id="alg-info" '+
      'style="display:none;margin-bottom:14px">'+

        '<span>ℹ️</span>'+

        '<span>'+
          'Alegra: <strong>Contactos → Exportar</strong> '+
          '(trae todo). Opcionalmente exporta también '+
          '<strong>Clientes</strong> y/o '+
          '<strong>Proveedores</strong> por separado para que '+
          'el sistema identifique el rol de cada uno. '+
          'Ninguno de los 3 es obligatorio individualmente, '+
          'pero debes cargar al menos uno. '+
          'Si no cargas Clientes ni Proveedores, '+
          'se asume que todos son Cliente y Proveedor.'+
        '</span>'+

      '</div>';


    // ── Slots Alegra ───────────────────────────────────────────────

    const algSlotsHTML =

      '<div class="fslots" id="alg-fslots" '+
      'style="display:none">'+

        '<div class="fslot" id="sl-alg-cont">'+

          '<input type="file" '+
          'id="f-alg-cont" '+
          'accept=".csv,.xlsx,.xls" '+
          'onchange="window.__algOnFile(this,\'sl-alg-cont\',\'nm-alg-cont\',\'contactos\')">'+

          '<div class="fs-badge" '+
          'style="background:var(--surface);color:var(--t3)">'+
            'Opcional'+
          '</div>'+

          '<div class="fs-ico">👥</div>'+

          '<div class="fs-name">Contactos</div>'+

          '<div class="fs-desc">'+
            'Exportación de Alegra (Contactos) — trae clientes y proveedores juntos'+
          '</div>'+

          '<div class="fs-sel" id="nm-alg-cont"></div>'+

        '</div>'+


        '<div class="fslot" id="sl-alg-cli">'+

          '<input type="file" '+
          'id="f-alg-cli" '+
          'accept=".csv,.xlsx,.xls" '+
          'onchange="window.__algOnFile(this,\'sl-alg-cli\',\'nm-alg-cli\',\'clientes\')">'+

          '<div class="fs-badge" '+
          'style="background:var(--surface);color:var(--t3)">'+
            'Opcional'+
          '</div>'+

          '<div class="fs-ico">🧾</div>'+

          '<div class="fs-name">Clientes</div>'+

          '<div class="fs-desc">'+
            'Exportación de Alegra (Clientes) — para identificar el rol'+
          '</div>'+

          '<div class="fs-sel" id="nm-alg-cli"></div>'+

        '</div>'+


        '<div class="fslot" id="sl-alg-pro">'+

          '<input type="file" '+
          'id="f-alg-pro" '+
          'accept=".csv,.xlsx,.xls" '+
          'onchange="window.__algOnFile(this,\'sl-alg-pro\',\'nm-alg-pro\',\'proveedores\')">'+

          '<div class="fs-badge" '+
          'style="background:var(--surface);color:var(--t3)">'+
            'Opcional'+
          '</div>'+

          '<div class="fs-ico">🚚</div>'+

          '<div class="fs-name">Proveedores</div>'+

          '<div class="fs-desc">'+
            'Exportación de Alegra (Proveedores) — para identificar el rol'+
          '</div>'+

          '<div class="fs-sel" id="nm-alg-pro"></div>'+

        '</div>'+

      '</div>';


    if(siigoInfo){

      siigoInfo.insertAdjacentHTML(
        'afterend',
        algInfoHTML
      );
    }


    if(siigoFslots){

      siigoFslots.insertAdjacentHTML(
        'afterend',
        algSlotsHTML
      );
    }


    // ── Cambio de archivo ──────────────────────────────────────────

    const _prevAlgOnFile =
      window.__algOnFile;

    const _algOnFileSelf =
      function(
        input,
        slotId,
        nameId,
        key
      ){

        // Compartir el archivo con el otro módulo de Alegra
        // (Escritorio y Cloud viven en archivos distintos)
        if(
          typeof _prevAlgOnFile === 'function' &&
          _prevAlgOnFile !== _algOnFileSelf
        ){
          try{ _prevAlgOnFile(input, slotId, nameId, key); }catch(e){}
        }

        const f =
          input.files[0];


        if(!f) return;


        const slot =
          document.getElementById(
            slotId
          );


        const nm =
          document.getElementById(
            nameId
          );


        if(slot){

          slot.className =
            'fslot ok';
        }


        if(nm){

          nm.textContent =
            f.name;
        }


        ALG_S.files[key]=f;
      };

    window.__algOnFile =
      _algOnFileSelf;



    // ── Mostrar / ocultar Alegra ───────────────────────────────────

    function algToggle(){

      const isAlg =
        sorigEl.value === 'Alegra';


      const algFslots =
        document.getElementById(
          'alg-fslots'
        );


      const algInfo =
        document.getElementById(
          'alg-info'
        );


      if(siigoFslots){

        siigoFslots.style.display =
          isAlg ? 'none' : '';
      }


      if(siigoInfo){

        siigoInfo.style.display =
          isAlg ? 'none' : '';
      }


      if(algFslots){

        algFslots.style.display =
          isAlg ? '' : 'none';
      }


      if(algInfo){

        algInfo.style.display =
          isAlg ? '' : 'none';
      }
    }


    sorigEl.addEventListener(
      'change',
      algToggle
    );


    algToggle();


    // ── routeETL ───────────────────────────────────────────────────

    const _origRouteETL =
      window.routeETL;


    window.routeETL =
      function(){

        const orig =
          (
            document.getElementById(
              'sorig'
            ) || {}
          ).value;


        if(orig === 'Alegra'){

          const dest =
            (
              document.getElementById(
                'sdest'
              ) || {}
            ).value;


          const lbl =
            document.getElementById(
              'dl-dest-label'
            );


          if(
            dest ===
            'World Office Escritorio'
          ){

            if(lbl){

              lbl.textContent =
                'Para importar en World Office Escritorio';
            }


            // Escritorio lo maneja terceros_alegra_escritorio.js
            (window.__algEscETL || startAlegraEscETL)();

          }else{

            if(lbl){

              lbl.textContent =
                'Para importar en World Office Cloud';
            }


            startAlegraCldETL();
          }


          return;
        }


        if(
          typeof _origRouteETL ===
          'function'
        ){

          _origRouteETL();
        }

      };


    // ── routeDownload ──────────────────────────────────────────────

    const _origRouteDownload =
      window.routeDownload;


    window.routeDownload =
      function(){

        const orig =
          (
            document.getElementById(
              'sorig'
            ) || {}
          ).value;


        if(orig === 'Alegra'){

          const _dst =
            (document.getElementById('sdest') || {}).value;

          if(_dst === 'World Office Escritorio'){
            (window.__algEscDownload || algDoDownload)();
          }else{
            algDoDownload();
          }

          return;
        }


        if(
          typeof _origRouteDownload ===
          'function'
        ){

          _origRouteDownload();
        }

      };


    // ── showPg ─────────────────────────────────────────────────────

    const _origShowPg =
      window.showPg;


    window.showPg =
      function(name){

        if(
          typeof _origShowPg ===
          'function'
        ){

          _origShowPg(name);
        }


        if(name === 'terceros'){

          ALG_S.files={};


          [
            'sl-alg-cont',
            'sl-alg-cli',
            'sl-alg-pro'
          ].forEach(id=>{

            const el =
              document.getElementById(
                id
              );


            if(el){

              el.className =
                'fslot';
            }

          });


          [
            'nm-alg-cont',
            'nm-alg-cli',
            'nm-alg-pro'
          ].forEach(id=>{

            const el =
              document.getElementById(
                id
              );


            if(el){

              el.textContent='';
            }

          });


          [
            'f-alg-cont',
            'f-alg-cli',
            'f-alg-pro'
          ].forEach(id=>{

            const el =
              document.getElementById(
                id
              );


            if(el){

              el.value='';
            }

          });


          algToggle();
        }

      };

  }


  // ── Inicialización ───────────────────────────────────────────────

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      algInstall
    );

  }else{

    algInstall();
  }

})();

