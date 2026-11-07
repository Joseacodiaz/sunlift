// Cotizador de SunLift: una pregunta por pantalla y al final tres opciones con precio, ahorro y retorno.
// precios.json trae solo precios finales al cliente (con IVA); los costos se quedan en la consola de propuestas.
(() => {
  const caja = document.getElementById('cotCaja');
  if (!caja) return;
  const $ = id => document.getElementById(id);
  const BASE = document.getElementById('cotiza').dataset.base || '/';
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LEADS = 'https://sunlift.netlify.app/'; // formulario "cotizacion" de Netlify
  const PUENTE = 'https://sunlift.netlify.app/api/cotizacion'; // reenvía a la consola de propuestas de Tito
  const ORDEN = ['ubicacion', 'mapa', 'uso', 'condominio', 'boleta', 'gasto', 'temporada', 'medidor', 'contacto'];
  const pasos = Object.fromEntries([...caja.querySelectorAll('.cot-paso')].map(p => [p.dataset.paso, p]));
  const d = { region: '', comuna: '', direccion: '', punto: null, uso: '', condominio: '', lote: '', boleta: '', unidad: 'clp', gasto: 0, metros: 15, motivo: '', temporada: '', archivo: null, pago: 'credito', plazo: 60, tasa: 1 };
  let P = null, actual = 'ubicacion', historial = [], mapa = null, opciones = [], elegida = 1, ctx = null, arma = null;

  const fmt = n => Math.round(n).toLocaleString('es-CL');
  const plata = n => '$' + fmt(Math.round(n / 10000) * 10000);
  const vivo = t => { $('cotVivo').textContent = t; };

  // ---- Barra de avance
  $('cotBarra').innerHTML = ORDEN.map(() => '<li></li>').join('');
  const barra = [...$('cotBarra').children];

  function ir(paso, volviendo) {
    if (!volviendo && paso !== actual) historial.push(actual);
    actual = paso;
    for (const [k, el] of Object.entries(pasos)) el.classList.toggle('on', k === paso);
    const i = ORDEN.indexOf(paso), hecho = i < 0 ? ORDEN.length : i + 1;
    barra.forEach((b, j) => b.classList.toggle('on', j < hecho));
    $('cotBarra').setAttribute('aria-label', `Paso ${Math.min(hecho, ORDEN.length)} de ${ORDEN.length}`);
    caja.classList.toggle('ancha', paso === 'resultado');
    if (paso === 'mapa') abrirMapa();
    const top = caja.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * .5) caja.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
    const q = pasos[paso].querySelector('.cot-q');
    if (q && historial.length) q.focus({ preventScroll: true });
  }
  caja.addEventListener('click', e => { if (e.target.closest('[data-volver]') && historial.length) ir(historial.pop(), true); });

  // ---- Grupos de opciones: elegir y avanzar solo
  function grupo(nombre, alElegir) {
    const botones = [...caja.querySelectorAll(`[data-grupo="${nombre}"] .cot-op`)];
    botones.forEach(b => b.addEventListener('click', () => {
      botones.forEach(x => x.setAttribute('aria-pressed', x === b));
      alElegir(b.dataset.valor, b);
    }));
  }
  const luego = fn => setTimeout(fn, quieto ? 0 : 220);

  // ---- 1 · Región, comuna y dirección
  const selR = $('cotRegion'), selC = $('cotComuna'), dir = $('cotDireccion'), sig1 = pasos.ubicacion.querySelector('[data-sig]');
  fetch(BASE + 'cotiza/precios.json?v=' + (document.getElementById('cotiza').dataset.ver || '')).then(r => r.json()).then(datos => {
    P = datos;
    // de norte a sur, con el nombre corto que usa la gente
    const NORTE_SUR = ['Arica', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana', 'Higgins', 'Maule', 'Ñuble', 'Biobío', 'Araucanía', 'Ríos', 'Lagos', 'Aisén', 'Magallanes'];
    const corto = r => r.replace(/^Región (del? )?/, '').replace(/^la /, 'La ').replace(/^los /, 'Los ').replace('Libertador Gral. Bernardo ', '').replace(' de Santiago', '').replace(/ del Gral\..*/, '').replace(/ y de la Antártica Chilena/, '').replace(/^Metropolitana$/, 'Metropolitana (Santiago)');
    const lugar = r => NORTE_SUR.findIndex(k => r.includes(k));
    const regiones = [...new Set(Object.values(P.comunas).map(c => c[0]))].sort((a, b) => lugar(a) - lugar(b));
    for (const r of regiones) selR.add(new Option(corto(r), r));
  });
  selR.addEventListener('change', () => {
    d.region = selR.value; d.comuna = '';
    selC.length = 0;
    selC.add(new Option(d.region ? 'Selecciona tu comuna' : 'Selecciona primero una región', ''));
    if (d.region) Object.keys(P.comunas).filter(c => P.comunas[c][0] === d.region).sort((a, b) => a.localeCompare(b, 'es')).forEach(c => selC.add(new Option(c, c)));
    selC.disabled = !d.region; dir.disabled = true; validar1();
  });
  selC.addEventListener('change', () => { d.comuna = selC.value; dir.disabled = !d.comuna; if (d.comuna) dir.focus(); validar1(); });
  dir.addEventListener('input', validar1);
  function validar1() { sig1.disabled = !(d.region && d.comuna && dir.value.trim().length >= 3); }
  sig1.addEventListener('click', () => { d.direccion = dir.value.trim(); ir('mapa'); });
  dir.addEventListener('keydown', e => { if (e.key === 'Enter' && !sig1.disabled) sig1.click(); });

  // ---- 2 · Mapa satelital con el punto fijo al centro
  function cargarLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((ok, mal) => {
      const css = document.createElement('link');
      Object.assign(css, { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', crossOrigin: '' });
      const js = document.createElement('script');
      Object.assign(js, { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=', crossOrigin: '', onload: ok, onerror: mal });
      document.head.append(css, js);
    });
  }
  async function buscar(q) {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&accept-language=es&q=' + encodeURIComponent(q));
      const [h] = await r.json();
      return h ? [+h.lat, +h.lon] : null;
    } catch { return null; }
  }
  async function abrirMapa() {
    const destino = (await buscar(`${d.direccion}, ${d.comuna}, Chile`)) || (await buscar(`${d.comuna}, Chile`));
    try { await cargarLeaflet(); } catch { $('cotMapa').innerHTML = '<div class="cot-cargando">No pudimos cargar el mapa. Puedes seguir sin él.</div>'; return; }
    const centro = destino || [-33.4489, -70.6693];
    if (!mapa) {
      $('cotMapa').innerHTML = '';
      mapa = L.map('cotMapa', { zoomControl: true, attributionControl: true }).setView(centro, destino ? 19 : 12);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imágenes © Esri' }).addTo(mapa);
    } else { mapa.invalidateSize(); mapa.setView(centro, destino ? 19 : 12); }
    d.referencia = destino; // si no confirma el punto, la distancia sale de la dirección o la comuna
  }
  $('cotConfirmar').addEventListener('click', () => { if (mapa) { const c = mapa.getCenter(); d.punto = [+c.lat.toFixed(6), +c.lng.toFixed(6)]; } ir('uso'); });
  $('cotSinMapa').addEventListener('click', () => { d.punto = null; ir('uso'); });

  // ---- 3 · Para qué
  const aviso = (id, html, boton, motivo) => {
    const el = $(id); el.hidden = false;
    el.innerHTML = html + `<p><button type="button" class="cot-sig">${boton} <span aria-hidden="true">→</span></button></p>`;
    el.querySelector('button').addEventListener('click', () => { d.motivo = motivo; ir('contacto'); });
  };
  grupo('uso', v => {
    d.uso = v; d.motivo = ''; $('cotAvisoUso').hidden = true;
    if (v !== 'casa') { d.condominio = ''; d.lote = ''; d.boleta = ''; d.gasto = 0; }
    if (v === 'casa') return luego(() => ir('condominio'));
    if (v === 'departamento') aviso('cotAvisoUso', '<p>Por ahora instalamos en casas, porque en un edificio el techo es de todos y cada depto tiene su propio medidor.</p><p>Si el edificio quiere paneles para los espacios comunes, déjanos tus datos y lo vemos con la administración.</p>', 'Dejar mis datos', 'departamento');
    else aviso('cotAvisoUso', '<p>Para empresas y campos el sistema se diseña a medida, según tu tarifa y tus horarios de consumo.</p><p>Déjanos tus datos y un especialista te prepara la propuesta.</p>', 'Hablar con un especialista', 'empresa');
  });

  // ---- 4 · Condominio
  grupo('condominio', v => {
    d.condominio = v;
    $('cotLoteCaja').hidden = v !== 'si'; $('cotSigCondo').hidden = v !== 'si';
    if (v === 'si') $('cotLote').focus(); else luego(() => ir('boleta'));
  });
  $('cotSigCondo').addEventListener('click', () => { d.lote = $('cotLote').value.trim(); ir('boleta'); });

  // ---- 5 · Quién cobra la luz
  grupo('boleta', v => {
    d.boleta = v; d.motivo = ''; $('cotAvisoBoleta').hidden = true;
    if (v === 'distribuidora') return luego(() => ir('gasto'));
    if (v === 'administracion') aviso('cotAvisoBoleta', '<p>Para inyectar lo que sobra a la red necesitas un medidor a tu nombre. Se puede pedir a la distribuidora y te podemos ayudar con el trámite.</p>', 'Quiero que me ayuden', 'medidor compartido');
    else aviso('cotAvisoBoleta', '<p>Sin una boleta no podemos calcular tu ahorro. Si tu casa está en construcción, igual podemos diseñar el sistema desde los planos.</p>', 'Dejar mis datos', 'sin boleta');
  });

  // ---- 6 · Gasto mensual, en pesos o kWh (se corrige solo si la cifra no calza con la unidad)
  const gasto = $('cotGasto'), nota = $('cotGastoNota'), sig6 = pasos.gasto.querySelector('[data-sig]');
  const chips = { clp: [40000, 70000, 100000, 150000, 250000], kwh: [150, 250, 350, 500, 800] };
  function unidad(u, auto) {
    d.unidad = u;
    caja.querySelectorAll('[data-unidad]').forEach(b => b.setAttribute('aria-pressed', b.dataset.unidad === u));
    $('cotGastoPref').textContent = u === 'clp' ? '$' : 'kWh';
    $('cotGastoEtq').textContent = u === 'clp' ? 'Gasto promedio mensual de luz' : 'Consumo promedio mensual de luz';
    gasto.placeholder = u === 'clp' ? '90.000' : '300';
    $('cotChips').innerHTML = chips[u].map(n => `<button type="button" data-n="${n}">${u === 'clp' ? '$' + fmt(n) : fmt(n) + ' kWh'}</button>`).join('');
    if (!auto) nota.textContent = '';
  }
  caja.querySelectorAll('[data-unidad]').forEach(b => b.addEventListener('click', () => { unidad(b.dataset.unidad); ponerGasto(d.gasto, false); }));
  $('cotChips').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { ponerGasto(+b.dataset.n, false); sig6.focus(); } });
  function ponerGasto(n, revisar = true) {
    if (revisar && n) {
      if (d.unidad === 'kwh' && n >= 3000) { unidad('clp', true); nota.textContent = 'Lo cambiamos a pesos: es mucho para kWh'; }
      else if (d.unidad === 'clp' && n > 0 && n < 2000 && n >= 30) { unidad('kwh', true); nota.textContent = 'Lo cambiamos a kWh: es muy poco para pesos'; }
    }
    d.gasto = n;
    gasto.value = n ? fmt(n) : '';
    sig6.disabled = !(d.unidad === 'clp' ? n >= 10000 && n <= 5000000 : n >= 30 && n <= 20000);
  }
  gasto.addEventListener('input', () => ponerGasto(+gasto.value.replace(/\D/g, '')));
  gasto.addEventListener('keydown', e => { if (e.key === 'Enter' && !sig6.disabled) sig6.click(); });
  sig6.addEventListener('click', () => ir('temporada'));

  // ---- 6b · Cuándo paga más luz (dato para la consola de propuestas)
  grupo('temporada', v => { d.temporada = v; luego(() => ir('medidor')); });
  unidad('clp');

  // ---- Boleta: opcional, en el paso del gasto y como recordatorio antes del contacto
  const archivo = $('cotArchivo');
  const TIPOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
  archivo.addEventListener('change', () => {
    const f = archivo.files[0];
    $('cotArchivoErr').textContent = '';
    if (!f) return;
    if (!TIPOS.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { $('cotArchivoErr').textContent = 'Sube una foto (JPG, PNG o HEIC) o un PDF.'; archivo.value = ''; return; }
    if (f.size > 7.5 * 1024 * 1024) { $('cotArchivoErr').textContent = 'El archivo pesa más de 7,5 MB. Prueba con una foto o un PDF más liviano.'; archivo.value = ''; return; }
    d.archivo = f;
    caja.querySelectorAll('[data-boleta]').forEach(l => {
      l.classList.add('lista');
      l.querySelector('[data-boleta-estado]').textContent = 'Cambiar';
      l.querySelector('[data-boleta-sub]').textContent = '✓ ' + (f.name.length > 34 ? f.name.slice(0, 31) + '…' : f.name);
    });
    vivo('Boleta lista: ' + f.name);
  });

  // ---- 7 · Distancia al medidor
  grupo('medidor', v => { d.metros = +v; luego(() => ir('contacto')); });

  // ---- 8 · Contacto
  const form = $('cotForm');
  const telOk = t => /^9\d{8}$/.test(t.replace(/\D/g, '').replace(/^56/, ''));
  function errorCampo(input, msj) {
    const campo = input.closest('.cot-campo'); campo.classList.toggle('error', !!msj);
    campo.querySelector('.cot-err').textContent = msj || '';
    input.setAttribute('aria-invalid', !!msj);
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = form.elements;
    if (f.empresa.value) return; // trampa para robots
    const fallas = [
      [f.nombre, f.nombre.value.trim().length < 2 && 'Escribe tu nombre'],
      [f.apellido, f.apellido.value.trim().length < 2 && 'Escribe tu apellido'],
      [f.telefono, !telOk(f.telefono.value) && 'Revisa tu número: son 9 dígitos y empieza con 9'],
      [f.correo, f.correo.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.correo.value.trim()) && 'Revisa tu correo'],
    ];
    fallas.forEach(([i, m]) => errorCampo(i, m));
    const primera = fallas.find(([, m]) => m);
    if (primera) return primera[0].focus();
    d.contacto = { nombre: f.nombre.value.trim() + ' ' + f.apellido.value.trim(), telefono: '+56' + f.telefono.value.replace(/\D/g, '').replace(/^56/, ''), correo: f.correo.value.trim() };
    if (d.motivo) { enviar(null); return mostrarGracias(); }
    calcular();
  });

  // ---- 9 · Cálculo
  function distanciaKm([a, b], [c, e]) {
    const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((e - b) * r / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(x));
  }
  function ahorro(conBateria, kwp, consumoMes, prod, perfil) {
    let auto = 0, iny = 0;
    for (const f of perfil) {
      const gen = kwp * prod * f, usa = Math.min(gen, consumoMes * (conBateria ? 1 : P.tarifa.autoconsumoSinBateria));
      auto += usa; iny += gen - usa;
    }
    return { gen: auto + iny, anual: auto * P.tarifa.compra + iny * P.tarifa.inyeccion };
  }
  // bat: null = sin batería, 'auto' = la que alcanza para ~10 h de respaldo, o un índice de P.baterias
  function opcion(n, bat) {
    const { km, consumoMes, prod, perfil } = ctx;
    n = Math.max(1, Math.min(40, n));
    const tabla = P[bat === null ? 'sinBateria' : 'conBateria'][km <= 400 ? 'cerca' : 'lejos'];
    const tramo = P.porKm.find(([hasta]) => km <= hasta);
    let total = tabla[n - 1] + tramo[1] * km + P.porMetro * d.metros, b = null;
    if (bat !== null) {
      const kwhNecesarios = P.bateriaUso.horas * (consumoMes * 12 / 8760) / P.bateriaUso.usable;
      const i = bat === 'auto' ? Math.max(0, P.baterias.findIndex(([hasta]) => kwhNecesarios <= hasta)) : bat;
      const t = P.baterias[i];
      b = { i, modelo: t[1], kwh: t[2], horas: Math.round(t[2] * P.bateriaUso.usable / (consumoMes * 12 / 8760)) };
      total += t[3];
    }
    const kwp = n * P.panel.kw, a = ahorro(bat !== null, kwp, consumoMes, prod, perfil);
    return { paneles: n, kwp, m2: Math.round(n * P.panel.m2), total, ahorroMes: a.anual / 12, retorno: total / a.anual, cubre: Math.min(1, a.gen / (consumoMes * 12)), bat: b };
  }
  function calcular() {
    ir('calculando');
    const textos = ['Revisando el sol de tu comuna', 'Calculando cuántos paneles caben', 'Armando tus tres opciones'];
    let t = 0; const reloj = setInterval(() => { t = Math.min(t + 1, textos.length - 1); $('cotCalcTxt').textContent = textos[t]; }, 900);
    const [, prod, perfil] = P.comunas[d.comuna];
    const consumoMes = d.unidad === 'kwh' ? d.gasto : Math.max(50, (d.gasto - P.tarifa.cargoFijo) / P.tarifa.compra);
    const lugar = d.punto || d.referencia, km = lugar ? distanciaKm(lugar, P.oficina) : 50;
    ctx = { km, consumoMes, prod, perfil };
    const cero = Math.ceil(consumoMes * 12 / (prod * P.panel.kw));
    const esencial = Math.max(1, Math.min(cero - 1, Math.round(cero * .6)));
    opciones = [
      { id: 'esencial', nombre: 'Esencial', sub: 'Baja tu cuenta con una inversión menor. Puedes sumar paneles después.', foto: BASE + 'img/proyectos/los-angeles-1-800.webp', ...opcion(esencial, null) },
      { id: 'cuenta-cero', nombre: 'Cuenta casi cero', sub: 'Produce lo que consumes en el año. Lo que sobra de día se descuenta de tu boleta.', foto: BASE + 'img/proyectos/churros-1-800.webp', sello: 'Recomendada', ...opcion(cero, null) },
      { id: 'con-bateria', nombre: 'Con batería', sub: 'Lo mismo, más respaldo cuando se corta la luz y energía solar de noche.', foto: BASE + 'img/casa-atardecer-640.webp', ...opcion(cero, 'auto') },
    ];
    if (cero <= 1) opciones.shift();
    enviar(opciones);
    setTimeout(() => { clearInterval(reloj); pintar(); ir('resultado'); }, quieto ? 300 : 2700);
  }

  // ---- 10 · Resultado: tarjetas con imagen; se elige una y se agenda la visita
  function pintar() {
    elegida = opciones.findIndex(o => o.id === 'cuenta-cero');
    $('cotResTitulo').textContent = `${d.contacto.nombre.split(' ')[0]}, estas son tus opciones`;
    $('cotResDato').textContent = `${d.comuna} · cuenta de ${d.unidad === 'clp' ? '$' + fmt(d.gasto) : fmt(d.gasto) + ' kWh'} al mes`;
    const cont = $('cotOpciones'); cont.textContent = '';
    opciones.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cot-card'; b.setAttribute('aria-pressed', i === elegida);
      b.innerHTML = `<img class="foto" alt="" loading="lazy" width="800" height="500"><div class="cuerpo"><h3></h3><p class="sub"></p>
        <p class="precio"></p><div class="cubre" aria-hidden="true"><i></i></div>
        <dl><div><dt>Ahorro al mes</dt><dd data-k="ahorro"></dd></div><div><dt>Se paga en</dt><dd data-k="retorno"></dd></div>
        <div><dt>Paneles</dt><dd data-k="paneles"></dd></div><div><dt>${o.bat ? 'Respaldo' : 'Cubre tu consumo'}</dt><dd data-k="extra"></dd></div></dl></div>`;
      b.querySelector('img').src = o.foto;
      b.querySelector('h3').textContent = o.nombre;
      b.querySelector('.sub').textContent = o.sub;
      b.querySelector('.precio').innerHTML = `${plata(o.total)}<small>Precio con IVA, instalado</small>`;
      const cr = document.createElement('p'); cr.className = 'credito';
      cr.innerHTML = `o <b>$${fmt(Math.round(cuota(o.total, 1, 60) / 1000) * 1000)} al mes</b> con crédito verde*`;
      b.querySelector('.precio').after(cr);
      b.querySelector('.cubre i').style.width = Math.round(o.cubre * 100) + '%';
      b.querySelector('[data-k="ahorro"]').textContent = '$' + fmt(Math.round(o.ahorroMes / 1000) * 1000);
      b.querySelector('[data-k="retorno"]').textContent = o.retorno.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' años';
      b.querySelector('[data-k="paneles"]').textContent = `${o.paneles} · ${o.kwp.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWp`;
      b.querySelector('[data-k="extra"]').textContent = o.bat ? `${o.bat.horas} h · ${o.bat.kwh.toLocaleString('es-CL')} kWh` : Math.round(o.cubre * 100) + '%';
      if (o.sello) { const s = document.createElement('span'); s.className = 'sello'; s.textContent = o.sello; b.prepend(s); }
      b.addEventListener('click', () => {
        elegida = i; [...cont.children].forEach((x, j) => x.setAttribute('aria-pressed', j === i));
        cargarArma(o); vivo('Elegiste ' + o.nombre + '. Puedes ajustarlo abajo.');
      });
      cont.append(b);
    });
    // las baterías se ofrecen por tamaño (sin repetir), con las horas de respaldo para esta casa
    const vistas = new Set();
    $('cotBats').innerHTML = '';
    const sinBat = document.createElement('button'); sinBat.type = 'button'; sinBat.dataset.bat = '';
    sinBat.innerHTML = 'Sin batería<small>Solo de día</small>'; $('cotBats').append(sinBat);
    P.baterias.forEach(([, , kwh], i) => {
      if (vistas.has(kwh) || vistas.size >= 4) return; vistas.add(kwh);
      const o = opcion(1, i), x = document.createElement('button'); x.type = 'button'; x.dataset.bat = i;
      x.append(kwh.toLocaleString('es-CL') + ' kWh', Object.assign(document.createElement('small'), { textContent: o.bat.horas + ' h de respaldo' }));
      $('cotBats').append(x);
    });
    cargarArma(opciones[elegida]);
  }

  // ---- Arma tu propuesta: parte de un plan y se ajustan paneles y batería; todo se recalcula al tiro
  function cargarArma(o) {
    arma = { base: o.nombre, paneles: o.paneles, bat: o.bat ? o.bat.i : null };
    pintarArma(false);
  }
  function pintarArma(animar = true) {
    const o = opcion(arma.paneles, arma.bat), cero = opciones.find(x => x.id === 'cuenta-cero');
    const plan = opciones.find(x => x.paneles === o.paneles && (x.bat ? x.bat.i : null) === arma.bat);
    arma.nombre = plan ? plan.nombre : 'A medida';
    arma.resultado = o;
    $('cotArmaBase').textContent = plan ? `Partiste del plan ${plan.nombre}. Suma paneles o cambia la batería y ves el precio al tiro.` : `Tu propuesta a medida, armada desde el plan ${arma.base}.`;
    $('cotNPan').textContent = o.paneles;
    $('cotMenos').disabled = o.paneles <= 1; $('cotMas').disabled = o.paneles >= 40;
    const falta = cero && o.paneles < cero.paneles ? ` · con ${cero.paneles} cubres todo tu consumo` : '';
    $('cotPanInfo').textContent = `${o.kwp.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWp · usa unos ${o.m2} m² de techo${falta}`;
    [...$('cotBats').children].forEach(x => x.setAttribute('aria-pressed', (x.dataset.bat === '' ? null : +x.dataset.bat) === arma.bat));
    $('cotBatInfo').textContent = o.bat ? `${o.bat.modelo}: si se corta la luz, tu casa sigue funcionando unas ${o.bat.horas} horas con un consumo normal.` : 'Lo que no usas de día se inyecta a la red y se descuenta de tu boleta.';
    const poner = (id, txt) => { const el = $(id); if (el.textContent !== txt) { el.textContent = txt; if (animar && !quieto) { el.classList.remove('cambia'); void el.offsetWidth; el.classList.add('cambia'); } } };
    poner('cotRPrecio', plata(o.total));
    poner('cotRAhorro', '$' + fmt(Math.round(o.ahorroMes / 1000) * 1000));
    poner('cotRRetorno', o.retorno.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' años');
    poner('cotRCubre', Math.round(o.cubre * 100) + '%');
    $('cotRBarra').style.width = Math.round(o.cubre * 100) + '%';
    pintarCarro(o);
    pintarFin(o);
  }

  // ---- Financiamiento: contado o crédito verde (cuota fija; la tasa es de ejemplo y la ajusta la persona)
  const cuota = (monto, tasaMes, n) => { const r = tasaMes / 100; return r === 0 ? monto / n : monto * r / (1 - Math.pow(1 + r, -n)); };
  function pintarFin(o) {
    caja.querySelectorAll('[data-pago]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pago === d.pago));
    $('cotFin').hidden = d.pago !== 'credito';
    $('cotPlazos').querySelectorAll('[data-plazo]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.plazo === d.plazo));
    $('cotTasaTxt').textContent = d.tasa.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    if (d.pago !== 'credito') return;
    const c = cuota(o.total, d.tasa, d.plazo), neto = o.ahorroMes - c;
    $('cotCuota').textContent = '$' + fmt(Math.round(c / 1000) * 1000);
    $('cotFinAhorro').textContent = '$' + fmt(Math.round(o.ahorroMes / 1000) * 1000);
    $('cotNeto').textContent = (neto >= 0 ? '+$' : '−$') + fmt(Math.round(Math.abs(neto) / 1000) * 1000);
    $('cotNetoEtq').textContent = neto >= 0 ? 'Te queda al mes' : 'Pones al mes';
    $('cotNeto').parentElement.classList.toggle('falta', neto < 0);
    $('cotFinMsj').textContent = neto >= 0
      ? 'Tu ahorro en la cuenta de la luz paga la cuota: el sistema se paga solo desde el primer mes.'
      : `Pones unos $${fmt(Math.round(-neto / 1000) * 1000)} al mes durante el crédito; cuando termine, te ahorras $${fmt(Math.round(o.ahorroMes / 1000) * 1000)} todos los meses.`;
  }
  caja.querySelectorAll('[data-pago]').forEach(b => b.addEventListener('click', () => { d.pago = b.dataset.pago; pintarFin(arma.resultado); }));
  $('cotPlazos').addEventListener('click', e => { const b = e.target.closest('[data-plazo]'); if (!b) return; d.plazo = +b.dataset.plazo; pintarFin(arma.resultado); });
  $('cotTasa').addEventListener('input', e => { d.tasa = +e.target.value; pintarFin(arma.resultado); });

  // ---- Carrito «Tu sistema»: lo que incluye la propuesta armada (sin precios por ítem; solo el total)
  let carroAntes = new Set();
  function pintarCarro(o) {
    const con = !!o.bat, kw = P.inversorKw[con ? 'conBateria' : 'sinBateria'][o.paneles - 1];
    const items = [
      [o.paneles, 'Paneles solares 550 W', P.panelModelo.replace('Módulo ', '')],
      [1, `Inversor ${con ? 'híbrido' : 'on-grid'} de ${String(kw).replace('.', ',')} kW`, con ? 'Maneja paneles, batería y red' : 'Convierte la energía del techo para tu casa'],
    ];
    if (o.bat) {
      const unidad = +((o.bat.modelo.match(/([\d,]+) kWh/) || [, '1'])[1].replace(',', '.'));
      const n = Math.max(1, Math.round(o.bat.kwh / unidad));
      items.push([n, `Batería ${o.bat.modelo}`, `${o.bat.kwh.toLocaleString('es-CL')} kWh en total · ~${o.bat.horas} h de respaldo`]);
    }
    items.push(
      [o.paneles, 'Estructuras de montaje', 'Una por panel, ancladas al techo'],
      [1, 'Monitoreo en tu celular', 'Ves cuánto produces y consumes'],
      [d.metros, 'Metros de cable al medidor', 'Según la distancia que nos dijiste'],
      [1, 'Ingeniería y trámite SEC', 'Incluye la inscripción para Net Billing'],
      [1, 'Instalación y puesta en marcha', 'Equipo propio, 2 a 5 días'],
    );
    const ul = $('cotCarro'); ul.textContent = '';
    const ahora = new Set();
    for (const [n, titulo, sub] of items) {
      const li = document.createElement('li'), clave = n + titulo; ahora.add(clave);
      if (carroAntes.size && !carroAntes.has(clave) && !quieto) li.className = 'nuevo';
      li.append(Object.assign(document.createElement('span'), { className: 'n', textContent: n }));
      const txt = document.createElement('span');
      txt.append(Object.assign(document.createElement('b'), { textContent: titulo }), Object.assign(document.createElement('small'), { textContent: sub }));
      li.append(txt); ul.append(li);
    }
    carroAntes = ahora;
    $('cotCarroTotal').textContent = plata(o.total);
  }
  $('cotMenos').addEventListener('click', () => { arma.paneles--; pintarArma(); });
  $('cotMas').addEventListener('click', () => { arma.paneles++; pintarArma(); });
  $('cotBats').addEventListener('click', e => { const x = e.target.closest('[data-bat]'); if (!x) return; arma.bat = x.dataset.bat === '' ? null : +x.dataset.bat; pintarArma(); });
  const cierreOriginal = $('cotCierreTxt').innerHTML;
  $('cotAgendar').addEventListener('click', () => {
    const o = { nombre: arma.nombre, ...arma.resultado };
    enviar(opciones, o);
    $('cotCierreTxt').innerHTML = '';
    const p = $('cotCierreTxt');
    p.append('¡Listo! Te vamos a escribir al ', Object.assign(document.createElement('b'), { textContent: d.contacto.telefono }), ` para coordinar la visita técnica de tu propuesta (${o.paneles} paneles${o.bat ? ' y batería de ' + o.bat.kwh.toLocaleString('es-CL') + ' kWh' : ''}, ${plata(o.total)}). Cuesta $50.000 y se descuenta si instalas.`);
    $('cotAgendar').hidden = true;
    aConsola(o);
  });

  // ---- La propuesta armada viaja a la consola de Tito (vía el puente de Netlify, que guarda el token)
  async function aConsola(o) {
    const lugar = d.punto || d.referencia;
    const cuerpo = {
      cliente: { nombre: d.contacto.nombre, telefono: d.contacto.telefono, correo: d.contacto.correo || undefined },
      ubicacion: { direccion: d.direccion, comuna: d.comuna, region: d.region, ...(lugar ? { lat: lugar[0], lng: lugar[1] } : {}) },
      vivienda: { tipo: 'casa', condominio: d.condominio === 'si', ...(d.lote ? { lote: d.lote } : {}) },
      consumo: { monto: d.gasto, unidad: d.unidad, temporada: d.temporada },
      instalacion: { metrosAlMedidor: d.metros },
      propuesta: { paneles: o.paneles, conBateria: !!o.bat, ...(o.bat ? { bateriaKwh: o.bat.kwh } : {}) },
    };
    try {
      const r = await fetch(PUENTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const res = await r.json();
      if (res.propuestaUrl && /^https:\/\//.test(res.propuestaUrl)) {
        const a = Object.assign(document.createElement('a'), { href: res.propuestaUrl, target: '_blank', rel: 'noopener', className: 'cot-sig', textContent: 'Ver mi propuesta →' });
        $('cotCierreTxt').after(a);
      }
    } catch { /* el lead ya llegó por el formulario; la consola puede recibirlo después */ }
  }
  $('cotRehacer').addEventListener('click', () => {
    historial = [];
    caja.querySelector('.cot-cierre').hidden = false; $('cotArma').hidden = false; $('cotAgendar').hidden = false; $('cotCierreTxt').innerHTML = cierreOriginal;
    ir('ubicacion', true);
  });

  function mostrarGracias() {
    ir('resultado');
    $('cotResTitulo').textContent = `Gracias, ${d.contacto.nombre.split(' ')[0]}`;
    $('cotResDato').textContent = 'Un especialista te escribe por WhatsApp para ver tu caso.';
    $('cotOpciones').textContent = '';
    $('cotArma').hidden = true;
    caja.querySelector('.cot-cierre').hidden = true;
  }

  // ---- Envío del lead al formulario "cotizacion" de Netlify (los name calzan con ese formulario)
  function enviar(ops, elegidaOp) {
    const s = ops && ops.find(o => o.id === 'cuenta-cero'), c = ops && ops.find(o => o.id === 'con-bateria');
    const datos = {
      'form-name': 'cotizacion', nombre: d.contacto.nombre, telefono: d.contacto.telefono, correo: d.contacto.correo,
      vivienda: [d.uso, d.condominio === 'si' ? 'condominio' + (d.lote ? ' ' + d.lote : '') : '', d.temporada && 'paga más luz: ' + d.temporada, d.motivo && 'sin cotización: ' + d.motivo].filter(Boolean).join(' · '),
      region: d.region, comuna: d.comuna,
      cuenta: d.gasto ? (d.unidad === 'clp' ? '$' + fmt(d.gasto) : fmt(d.gasto) + ' kWh') : '',
      ubicacion: d.direccion + (d.punto ? ` (${d.punto.join(', ')})` : ' (sin punto en el mapa)'),
      medidor: d.boleta, metros_alimentador: d.metros,
      km_oficina: (d.punto || d.referencia) ? Math.round(distanciaKm(d.punto || d.referencia, P.oficina)) : '',
      paneles: s ? s.paneles : '', kwp: s ? s.kwp : '',
      total_sin_bateria: s ? Math.round(s.total) : '', total_con_bateria: c ? Math.round(c.total) : '',
      ahorro_mes_sin_bateria: s ? Math.round(s.ahorroMes) : '', ahorro_mes_con_bateria: c ? Math.round(c.ahorroMes) : '',
      bateria: elegidaOp ? `QUIERE VISITA · ${elegidaOp.nombre} · ${elegidaOp.paneles} paneles · ${elegidaOp.bat ? 'batería ' + elegidaOp.bat.kwh + ' kWh' : 'sin batería'} · ${plata(elegidaOp.total)}` : '',
      techo: 'web de José (GitHub Pages)' + (d.archivo ? ' · subió boleta' : ''),
      financiamiento: elegidaOp ? (d.pago === 'credito' ? `crédito verde ${d.plazo} meses, tasa ejemplo ${d.tasa}% · cuota ~${plata(cuota(elegidaOp.total, d.tasa, d.plazo))}` : 'al contado') : '',
    };
    // Con boleta va como multipart (Netlify guarda el archivo); se adjunta solo en el primer envío
    if (d.archivo && !d.archivoEnviado) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(datos)) fd.append(k, v ?? '');
      fd.append('boleta', d.archivo, d.archivo.name);
      d.archivoEnviado = true;
      fetch(LEADS, { method: 'POST', mode: 'no-cors', body: fd }).catch(() => {});
      return;
    }
    fetch(LEADS, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(datos).toString() }).catch(() => {});
  }

  // Segunda entrada (debajo de «Un día con SunLift»): trae región, comuna y dirección y sigue aquí, en el mapa
  let listo; const cargado = new Promise(r => { listo = r; });
  const esperar = setInterval(() => { if (P) { clearInterval(esperar); listo(); } }, 100);
  window.SunLiftCotiza = {
    cargado,
    regiones: () => [...selR.options].slice(1).map(o => [o.value, o.text]),
    comunas: region => Object.keys(P.comunas).filter(c => P.comunas[c][0] === region).sort((a, b) => a.localeCompare(b, 'es')),
    empezar(region, comuna, direccion) {
      selR.value = region; selR.dispatchEvent(new Event('change'));
      selC.value = comuna; selC.dispatchEvent(new Event('change'));
      dir.value = direccion; validar1();
      historial = []; d.direccion = direccion.trim();
      ir('mapa');
      caja.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
    },
  };

  ir('ubicacion', true);
})();
