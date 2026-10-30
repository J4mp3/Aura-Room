/**
 * Aura Room · Tarjeta Aura Room — Tarjeta de fidelidad · script de Google
 * Generado por el TarjetaEditor el 2026-10-29 (versión 2026-10-29.3).
 *
 * Guarda los clientes y los sellos en el Google Drive de esta cuenta
 * (archivo aura-room-tarjeta.json, con un respaldo por cada día de la semana) y responde a:
 *  - la página de la tarjeta (pública): sumarse, ver "Mi tarjeta" y los premios;
 *  - la app de sellos (con la clave): clientes, sumar y quitar sellos, canjes y cupones.
 * Es un proyecto aparte: no tiene nada que ver con el script de la app de gestión.
 *
 * Publicar: Implementar → Nueva implementación → Aplicación web →
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar → Autorizar.
 * Si cambiás el código: Implementar → Administrar implementaciones → lápiz →
 *   Versión: Nueva versión → Implementar (la URL no cambia).
 */
var CLAVE = 'ejg3w72x8pks7bfwu3zabqp6xpca';          // la usa la app de sellos: no la publiques ni la compartas
var ARCHIVO = 'aura-room-tarjeta.json'; // archivo con los datos en tu Drive
var CFG_INICIAL = {"regalo":8,"regaloTxt":"Un servicio de regalo","desc":4,"descTipo":"pct","pct":15,"descTxt":""};
var PIN_INICIAL = '4211';      // PIN de la app para premios, ajustes y borrar (se cambia desde la app)
var ZONA = 'America/Argentina/Buenos_Aires';

// Topes de la parte pública (la página de la tarjeta)
var ALTAS_POR_DIA = 40, ALTAS_POR_MINUTO = 5, NUEVOS_MAX = 300, REPETIDOS_POR_DIA = 10;
var VER_POR_MINUTO = 90, CLAVES_MALAS_POR_MINUTO = 20, MAX_OPS = 50;
var DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/* ==========================================================================
   Lógica de la tarjeta de sellos. Este bloque es IGUAL en el script de Google
   y en la app de sellos (lo pega el TarjetaEditor): el script es el que manda,
   la app lo usa para mostrar el cambio al instante mientras sube.
   Cada cliente: s = sellos en la tarjeta actual, tot = sellos de siempre,
   cic = tarjetas completas, dp = premios intermedios ganados sin usar,
   rp = regalos guardados (tarjetas llenas que siguieron sumando), cup = cupones.
   ========================================================================== */
var FID = (function(){
  var DEF = { regalo: 10, regaloTxt: 'Un regalo', desc: 5, descTipo: 'pct', pct: 10, descTxt: '' };
  var TOK = /^[a-z0-9]{20}$/, OPID = /^[a-z0-9-]{8,40}$/;
  var MAX_MOVS = 2000, MAX_CUP = 8, MAX_CLIENTES = 5000;
  var CUP_K = ['percent', '2x1', 'gift', 'custom'];
  function ent(v, min, max, d){ v = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max ? v : d; }
  function txt(v, max){ return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function nota(v){ return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300); }
  function cfg(c){
    c = c && typeof c === 'object' ? c : {};
    var r = ent(c.regalo, 4, 12, DEF.regalo);
    var o = {
      regalo: r,
      regaloTxt: txt(c.regaloTxt, 40) || DEF.regaloTxt,
      desc: ent(c.desc, 0, r - 1, Math.min(DEF.desc, r - 1)),
      descTipo: c.descTipo === 'txt' ? 'txt' : 'pct',
      pct: ent(c.pct, 1, 90, DEF.pct),
      descTxt: txt(c.descTxt, 40)
    };
    if(o.descTipo === 'txt' && !o.descTxt) o.descTipo = 'pct';
    return o;
  }
  function telClave(t){ var d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; }
  function mailOk(m){ return /^[^\s@\/:]+@[^\s@\/:]+\.[^\s@\/:]{2,}$/.test(m); }
  function cumOk(c){
    var m = /^(\d\d)-(\d\d)$/.exec(c || ''); if(!m) return false;
    var mes = +m[1], dia = +m[2];
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  }
  function pila(n){ n = String(n || ''); var s = (n.indexOf(',') >= 0 ? n.slice(n.indexOf(',') + 1) : n).trim().split(/\s+/)[0] || ''; return s.slice(0, 30); }
  function vacio(){ return { s: 0, tot: 0, cic: 0, dp: 0, rp: 0, cup: [] }; }
  function cupCopia(l){ return (Array.isArray(l) ? l : []).map(function(x){ return { id: x.id, k: x.k, v: x.v, l: x.l, ts: x.ts }; }); }
  function foto(c){ return { s: c.s, tot: c.tot, cic: c.cic, dp: c.dp, rp: c.rp, cup: cupCopia(c.cup) }; }
  function restaurar(c, a){ c.s = a.s; c.tot = a.tot; c.cic = a.cic; c.dp = a.dp; c.rp = a.rp; c.cup = cupCopia(a.cup); }
  function regalos(c, cf){ return (c.s >= cf.regalo ? 1 : 0) + (c.rp || 0); }
  function sumarUno(c, cf){
    if(c.s >= cf.regalo){ c.rp++; c.s = 0; } // tarjeta llena sin canjear: el regalo queda guardado y arranca otra
    c.s++; c.tot++;
    if(cf.desc > 0 && c.s === cf.desc) c.dp++;
    if(c.s === cf.regalo) c.cic++;
  }
  function quitarUno(c, cf){
    if(c.s <= 0) return false;
    if(cf.desc > 0 && c.s === cf.desc && c.dp > 0) c.dp--;
    if(c.s === cf.regalo && c.cic > 0) c.cic--;
    c.s--; if(c.tot > 0) c.tot--;
    return true;
  }
  /* lo que ve el cliente en "Mi tarjeta" (nunca teléfono, mail ni cumpleaños) */
  function publico(c, cf){
    var R = regalos(c, cf), cup = [], i;
    for(i = 0; i < Math.min(c.dp, 3); i++) cup.push(cf.descTipo === 'txt' ? { k: 'gift', l: cf.descTxt, p: 1 } : { k: 'percent', v: cf.pct, p: 1 });
    for(i = 0; i < Math.min(R, 3); i++) cup.push({ k: 'gift', l: cf.regaloTxt, p: 1 });
    (c.cup || []).forEach(function(x){ cup.push({ k: x.k, v: x.v, l: x.l }); });
    return { ok: true, nombre: pila(c.n), sellos: Math.min(c.s, cf.regalo), premio: R > 0 ? 'regalo' : c.dp > 0 ? 'desc' : '', tot: c.tot, cic: c.cic,
      regalo: cf.regalo, regaloTxt: cf.regaloTxt, desc: cf.desc, descTipo: cf.descTipo, pct: cf.pct, descTxt: cf.descTxt, cupones: cup.slice(0, 8) };
  }
  function nuevoDatos(c0){ return { v: 1, rev: 0, cfg: cfg(c0), pin: '', c: {}, m: [], ops: {}, non: {}, rep: { d: '', n: 0 } }; }
  function normDatos(D, c0){
    if(!D || typeof D !== 'object' || D.v !== 1) D = nuevoDatos(c0);
    D.cfg = cfg(D.cfg || c0);
    if(!D.c || typeof D.c !== 'object') D.c = {};
    if(!Array.isArray(D.m)) D.m = [];
    if(!D.ops || typeof D.ops !== 'object') D.ops = {};
    if(!D.non || typeof D.non !== 'object') D.non = {};
    if(!D.rep || typeof D.rep !== 'object') D.rep = { d: '', n: 0 };
    if(typeof D.rev !== 'number') D.rev = 0;
    if(typeof D.pin !== 'string') D.pin = '';
    return D;
  }
  function mov(D, m){ D.m.push(m); if(D.m.length > MAX_MOVS) D.m.splice(0, D.m.length - MAX_MOVS); return m; }
  /* último movimiento que se puede deshacer de ese cliente (los que guardan cómo estaba antes) */
  function ultimoDeshacible(D, t){
    for(var i = D.m.length - 1, n = 0; i >= 0 && n < 600; i--, n++){
      var m = D.m[i];
      if(m.t !== t) continue;
      if(m.k === 'alta' || m.k === 'editar' || m.k === 'visto') continue;
      if(m.k === 'deshacer') continue;
      if(m.x) continue;
      return m.a ? m : null;
    }
    return null;
  }
  function campos(c, op, nuevo){
    if(op.n != null || nuevo){ var n = txt(op.n, 60); if(n.length < 2) return 'nombre'; c.n = n; }
    if(op.tel != null){ var tel = txt(op.tel, 30); if(tel && (!/^[\d\s()+.\-]+$/.test(tel) || tel.replace(/\D/g, '').length < 6 || tel.replace(/\D/g, '').length > 15)) return 'teléfono'; c.tel = tel; }
    if(op.mail != null){ var ml = txt(op.mail, 80).toLowerCase(); if(ml && !mailOk(ml)) return 'mail'; c.mail = ml; }
    if(op.cum != null){ var cu = String(op.cum || ''); if(cu && !cumOk(cu)) return 'cumpleaños'; c.cum = cu; }
    if(op.nota != null) c.nota = nota(op.nota);
    return '';
  }
  /* aplica una operación de la app. ctx = { ts, quien }. Devuelve { ok, error?, t?, cambio } */
  function aplicar(D, op, ctx){
    if(!op || typeof op !== 'object' || !OPID.test(String(op.id || ''))) return { ok: false, error: 'dato' };
    var k = String(op.a || ''), ts = ctx.ts, q = txt(ctx.quien, 24);
    if(typeof op.ts === 'number' && op.ts > ctx.ts - 30 * 864e5 && op.ts < ctx.ts + 5 * 6e4) ts = Math.round(op.ts);
    var cf = D.cfg;
    if(k === 'cfg'){
      D.cfg = cfg(op.cfg);
      mov(D, { id: op.id, ts: ts, t: '', k: 'cfg', q: q });
      return { ok: true, cambio: true };
    }
    if(k === 'pin'){
      var pin = String(op.pin || '');
      if(!/^\d{4,8}$/.test(pin)) return { ok: false, error: 'dato' };
      D.pin = pin; mov(D, { id: op.id, ts: ts, t: '', k: 'pin', q: q });
      return { ok: true, cambio: true };
    }
    var t = String(op.t || '');
    if(!TOK.test(t)) return { ok: false, error: 'dato' };
    var has = Object.prototype.hasOwnProperty.call(D.c, t), c = has ? D.c[t] : null;
    if(k === 'alta'){
      if(has) return { ok: false, error: 'ya existe', t: t };
      if(Object.keys(D.c).length >= MAX_CLIENTES) return { ok: false, error: 'lleno' };
      var nc = vacio(); nc.n = ''; nc.tel = ''; nc.mail = ''; nc.cum = ''; nc.nota = ''; nc.o = 'app'; nc.ts = ts; nc.u = 0; nc.nv = 0;
      var e1 = campos(nc, op, true); if(e1) return { ok: false, error: e1 };
      D.c[t] = nc; mov(D, { id: op.id, ts: ts, t: t, k: 'alta', q: q });
      return { ok: true, t: t, cambio: true };
    }
    if(!has) return { ok: false, error: 'no existe', t: t };
    if(k === 'visto'){ if(!c.nv) return { ok: true, t: t, cambio: false }; c.nv = 0; return { ok: true, t: t, cambio: true }; }
    if(k === 'editar'){
      var copia = JSON.parse(JSON.stringify(c)), e2 = campos(copia, op, false);
      if(e2) return { ok: false, error: e2, t: t };
      D.c[t] = copia; copia.nv = 0; mov(D, { id: op.id, ts: ts, t: t, k: 'editar', q: q });
      return { ok: true, t: t, cambio: true };
    }
    if(k === 'borrar'){
      delete D.c[t];
      D.m.forEach(function(m){ if(m.t === t) delete m.a; }); // no queda nada suyo para deshacer
      mov(D, { id: op.id, ts: ts, t: t, k: 'borrar', q: q });
      return { ok: true, t: t, cambio: true };
    }
    var antes = foto(c), m = { id: op.id, ts: ts, t: t, k: k, q: q, a: antes };
    if(k === 'mas'){
      var n = ent(op.n, 1, 20, 0); if(!n) return { ok: false, error: 'dato', t: t };
      for(var i = 0; i < n; i++) sumarUno(c, cf);
      c.u = ts; c.nv = 0; m.n = n;
    } else if(k === 'menos'){
      var u = ultimoDeshacible(D, t);
      if(u && u.k === 'mas' && u.n === 1 && ts - u.ts < 30 * 6e4){ restaurar(c, u.a); u.x = 1; m.ref = u.id; } // fue un toque de más: vuelve exacto a como estaba
      else if(!quitarUno(c, cf)) return { ok: false, error: 'sin sellos', t: t };
      c.nv = 0;
    } else if(k === 'canjeD'){
      if(c.dp <= 0) return { ok: false, error: 'sin premio', t: t };
      c.dp--; c.nv = 0;
    } else if(k === 'canjeR'){
      if(c.s >= cf.regalo) c.s = 0; else if(c.rp > 0) c.rp--; else return { ok: false, error: 'sin premio', t: t };
      c.nv = 0;
    } else if(k === 'cupDar'){
      var ck = String(op.k || ''); if(CUP_K.indexOf(ck) < 0) return { ok: false, error: 'dato', t: t };
      if((c.cup || []).length >= MAX_CUP) return { ok: false, error: 'lleno', t: t };
      var cp = { id: op.id, k: ck, ts: ts, l: txt(op.l, 40) };
      if(ck === 'percent'){ cp.v = ent(op.v, 1, 90, 0); if(!cp.v) return { ok: false, error: 'dato', t: t }; }
      if((ck === 'custom' || ck === 'gift') && !cp.l) return { ok: false, error: 'dato', t: t };
      c.cup = (c.cup || []).concat([cp]); c.nv = 0; m.l = cp.l || (ck === 'percent' ? cp.v + '%' : ck);
    } else if(k === 'cupUsar'){
      var cid = String(op.cid || ''), idx = -1;
      (c.cup || []).forEach(function(x, j){ if(x.id === cid) idx = j; });
      if(idx < 0) return { ok: false, error: 'no existe', t: t };
      var usado = c.cup[idx]; c.cup = c.cup.slice(0, idx).concat(c.cup.slice(idx + 1)); c.nv = 0;
      m.l = usado.l || (usado.k === 'percent' ? usado.v + '%' : usado.k);
    } else if(k === 'ajustar'){
      var s = ent(op.s, 0, cf.regalo, -1), dp = ent(op.dp, 0, 20, -1), rp = ent(op.rp, 0, 20, -1);
      if(s < 0 || dp < 0 || rp < 0) return { ok: false, error: 'dato', t: t };
      c.tot = Math.max(0, c.tot + (s - c.s)); c.s = s; c.dp = dp; c.rp = rp; c.nv = 0;
    } else if(k === 'deshacer'){
      var ref = String(op.ref || ''), ud = ultimoDeshacible(D, t);
      if(!ud || ud.id !== ref) return { ok: false, error: 'no se puede deshacer', t: t };
      restaurar(c, ud.a); ud.x = 1; delete m.a; m.ref = ref;
    } else return { ok: false, error: 'dato', t: t };
    mov(D, m);
    return { ok: true, t: t, cambio: true };
  }
  return { DEF: DEF, TOK: TOK, OPID: OPID, MAX_MOVS: MAX_MOVS, cfg: cfg, txt: txt, telClave: telClave, mailOk: mailOk, cumOk: cumOk, pila: pila, vacio: vacio,
    regalos: regalos, publico: publico, nuevoDatos: nuevoDatos, normDatos: normDatos, aplicar: aplicar, ultimoDeshacible: ultimoDeshacible };
})();


/* ---------------- entrada ---------------- */
function doGet(e){
  var p = (e && e.parameter) || {};
  try {
    var a = String(p.action || '');
    if (a === 'fidInfo') return json_(fidInfo_());
    if (a === 'fidVer') return json_(fidVer_(String(p.t || '')));
    if (a === 'ping') return json_({ ok: true, tarjeta: 1 });
    return json_({ ok: false, error: 'acción desconocida' });
  } catch (err) { return json_({ ok: false, error: 'error' }); }
}
function doPost(e){
  var p = (e && e.parameter) || {};
  try {
    var raw = e && e.postData ? String(e.postData.contents || '') : '';
    var a = String(p.action || '');
    if (a === 'fidAlta') return json_(fidAlta_(raw));
    if (a === 'adm') return json_(adm_(raw));
    return json_({ ok: false, error: 'acción desconocida' });
  } catch (err) { return json_({ ok: false, error: 'error' }); }
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- ayudantes ---------------- */
function zona_(){ return ZONA && ZONA.indexOf('__') !== 0 ? ZONA : Session.getScriptTimeZone(); }
function hoy_(){ return Utilities.formatDate(new Date(), zona_(), 'yyyyMMdd'); }
function minuto_(){ return Math.floor(Date.now() / 60000); }
function cache_(){ return CacheService.getScriptCache(); }
function contar_(clave, seg){ var c = cache_(), n = Number(c.get(clave) || 0) + 1; c.put(clave, String(n), seg); return n; }
function tiene_(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
/* contador exacto por día (en las propiedades del script, siempre dentro del candado) */
function contarDia_(nombre){
  var props = PropertiesService.getScriptProperties(), d = hoy_(), o = null;
  try { o = JSON.parse(props.getProperty(nombre) || 'null'); } catch (e) { o = null; }
  if (!o || o.d !== d) o = { d: d, n: 0 };
  o.n++; props.setProperty(nombre, JSON.stringify(o));
  return o.n;
}
function verDia_(nombre){
  try { var o = JSON.parse(PropertiesService.getScriptProperties().getProperty(nombre) || 'null'); return o && o.d === hoy_() ? o.n : 0; } catch (e) { return 0; }
}
function archivo_(){
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('ARCHIVO_ID');
  if (id) {
    try { var f = DriveApp.getFileById(id); if (f.isTrashed()) f.setTrashed(false); return f; } catch (e) {}
  }
  var nuevo = DriveApp.createFile(ARCHIVO, JSON.stringify(FID.nuevoDatos(CFG_INICIAL)), MimeType.PLAIN_TEXT);
  props.setProperty('ARCHIVO_ID', nuevo.getId());
  return nuevo;
}
function leer_(){
  var f = archivo_(), txt = f.getBlob().getDataAsString('UTF-8'), D;
  try { D = JSON.parse(txt || 'null'); } catch (e) { throw new Error('el archivo ' + ARCHIVO + ' está dañado: restauralo desde un respaldo'); }
  return { f: f, txt: txt, D: FID.normDatos(D, CFG_INICIAL) };
}
function guardar_(R){
  var D = R.D;
  D.rev++;
  var ids = Object.keys(D.ops);
  if (ids.length > 3000) { ids.sort(function(a, b){ return D.ops[a] - D.ops[b]; }); ids.slice(0, ids.length - 3000).forEach(function(k){ delete D.ops[k]; }); }
  var lim = Date.now() - 15 * 60000;
  Object.keys(D.non).forEach(function(k){ if (!(D.non[k] && D.non[k][1] > lim)) delete D.non[k]; });
  var txt = JSON.stringify(D);
  respaldo_(R.txt);
  R.f.setContent(txt); R.txt = txt;
}
/* una vez por día guarda cómo estaba todo antes del primer cambio (un archivo por día de la semana) */
function respaldo_(viejo){
  var props = PropertiesService.getScriptProperties(), dia = hoy_();
  if (!viejo || props.getProperty('RESPALDO_DIA') === dia) return;
  try {
    var n = new Date().getDay(), key = 'RESPALDO_' + n, id = props.getProperty(key), f = null;
    if (id) { try { f = DriveApp.getFileById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
    if (f) f.setContent(viejo);
    else { f = DriveApp.createFile(ARCHIVO.replace(/\.json$/, '') + '-respaldo-' + DIAS[n] + '.json', viejo, MimeType.PLAIN_TEXT); props.setProperty(key, f.getId()); }
    props.setProperty('RESPALDO_DIA', dia);
  } catch (e) {}
}
function token_(D){
  for (var i = 0; i < 20; i++) {
    var t = (Utilities.getUuid() + Utilities.getUuid()).replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (FID.TOK.test(t) && !tiene_(D.c, t)) return t;
  }
  throw new Error('no se pudo crear el código');
}
function olvidar_(tokens, info){
  try { var ks = tokens.map(function(t){ return 'v' + t; }); if (info) ks.push('info'); if (ks.length) cache_().removeAll(ks); } catch (e) {}
}

/* ---------------- públicas (la página de la tarjeta) ---------------- */
function fidInfo_(){
  var c = cache_(), s = c.get('info');
  if (s) return JSON.parse(s);
  if (contar_('vm' + minuto_(), 120) > VER_POR_MINUTO) return { ok: false, error: 'muchos' };
  var o = { ok: true, cfg: leer_().D.cfg };
  c.put('info', JSON.stringify(o), 600);
  return o;
}
function fidVer_(t){
  if (!FID.TOK.test(t)) return { ok: false };
  var c = cache_(), s = c.get('v' + t);
  if (s) return JSON.parse(s);
  if (contar_('vm' + minuto_(), 120) > VER_POR_MINUTO) return { ok: false, error: 'muchos' };
  var D = leer_().D;
  if (!tiene_(D.c, t)) { c.put('v' + t, '{"ok":false}', 20); return { ok: false }; } // poco tiempo: si la cargan desde la app, la subida borra esta caché
  var o = FID.publico(D.c[t], D.cfg);
  c.put('v' + t, JSON.stringify(o), 120);
  return o;
}
function fidAlta_(raw){
  if (raw.length > 3000) return { ok: false };
  var b; try { b = JSON.parse(raw); } catch (e) { return { ok: false }; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false };
  if (b.web || !(Number(b.t) >= 3000)) return { ok: true }; // robots: no se guarda nada
  var nom = FID.txt(b.nombre, 60), tel = FID.txt(b.tel, 30), mail = FID.txt(b.mail, 80).toLowerCase(), cum = String(b.cumple || ''), n = String(b.n || '');
  if (nom.length < 3 || !/^[\p{L}\p{M} .,'’\-]+$/u.test(nom)) return { ok: false, error: 'dato' };
  var dig = tel.replace(/\D/g, '');
  if (!/^[\d\s()+.\-]+$/.test(tel) || dig.length < 8 || dig.length > 15) return { ok: false, error: 'dato' };
  if ((mail && !FID.mailOk(mail)) || (cum && !FID.cumOk(cum)) || b.acepto !== true) return { ok: false, error: 'dato' }; // mail y cumpleaños pueden venir vacíos (la página decide si los pide)
  if (!/^[a-z0-9]{16,40}$/.test(n)) n = '';
  if (contar_('am' + minuto_(), 120) > ALTAS_POR_MINUTO) return { ok: false, error: 'muchos' };
  if (verDia_('ALTAS_DIA') >= ALTAS_POR_DIA) return { ok: false, error: 'muchos' };
  var L = LockService.getScriptLock();
  if (!L.tryLock(8000)) return { ok: false, error: 'muchos' };
  try {
    var R = leer_(), D = R.D, ahora = Date.now();
    // doble toque desde la misma página: la misma tarjeta (otra página con los mismos datos nunca recibe la tarjeta de otro)
    if (n && tiene_(D.non, n) && ahora - D.non[n][1] < 15 * 60000 && tiene_(D.c, D.non[n][0])) return { ok: true, t: D.non[n][0] };
    var tk = FID.telClave(tel), t, nuevos = 0;
    for (t in D.c) {
      var c = D.c[t];
      if ((tk && FID.telClave(c.tel) === tk) || (c.mail && c.mail === mail)) return contarDia_('REPETIDOS_DIA') > REPETIDOS_POR_DIA ? { ok: false, error: 'muchos' } : { ok: false, error: 'repetido' };
      if (c.nv) nuevos++;
    }
    if (nuevos >= NUEVOS_MAX) return { ok: false, error: 'muchos' };
    if (contarDia_('ALTAS_DIA') > ALTAS_POR_DIA) return { ok: false, error: 'muchos' };
    var tok = token_(D);
    var r = FID.aplicar(D, { id: 'web-' + ahora.toString(36) + '-' + tok.slice(0, 6), a: 'alta', t: tok, n: nom, tel: tel, mail: mail, cum: cum }, { ts: ahora, quien: 'web' });
    if (!r.ok) return { ok: false, error: 'dato' };
    D.c[tok].o = 'web'; D.c[tok].nv = 1;
    if (n) D.non[n] = [tok, ahora];
    guardar_(R);
    return { ok: true, t: tok };
  } finally { L.releaseLock(); }
}

/* ---------------- app de sellos (con la clave) ---------------- */
function adm_(raw){
  if (raw.length > 300000) return { ok: false, error: 'muy grande' };
  var b; try { b = JSON.parse(raw); } catch (e) { return { ok: false, error: 'dato' }; }
  if (!b || typeof b !== 'object' || typeof b.k !== 'string' || CLAVE.indexOf('__') === 0 || CLAVE.length < 16 || b.k !== CLAVE) {
    if (contar_('km' + minuto_(), 120) > CLAVES_MALAS_POR_MINUTO) return { ok: false, error: 'muchos' };
    return { ok: false, error: 'clave' };
  }
  try {
    if (b.op === 'datos') return datos_(b);
    if (b.op === 'ops') return ops_(b);
    return { ok: false, error: 'dato' };
  } catch (err) { return { ok: false, error: 'error: ' + String((err && err.message) || err).slice(0, 200) }; }
}
function datos_(b){
  var D = leer_().D;
  if (typeof b.desde === 'number' && b.desde === D.rev) return { ok: true, rev: D.rev, igual: true, ahora: Date.now() };
  return { ok: true, rev: D.rev, cfg: D.cfg, pin: D.pin || PIN_INICIAL, c: D.c, m: D.m.slice(-400), ahora: Date.now() };
}
function ops_(b){
  var lista = Array.isArray(b.ops) ? b.ops.slice(0, MAX_OPS) : [];
  var L = LockService.getScriptLock();
  L.waitLock(20000);
  try {
    var R = leer_(), D = R.D, revAntes = D.rev, ahora = Date.now(), res = [], toc = {}, info = false, escribir = false;
    lista.forEach(function(op){
      var id = op && typeof op === 'object' ? String(op.id || '') : '';
      if (id && tiene_(D.ops, id)) { res.push({ id: id, ok: true, dup: true }); return; }
      var r = FID.aplicar(D, op, { ts: ahora, quien: b.quien });
      if (FID.OPID.test(id)) { D.ops[id] = ahora; escribir = true; } // también las que fallan: no se vuelven a aplicar
      if (r.t) toc[r.t] = 1;
      if (r.cambio && op.a === 'cfg') info = true;
      res.push({ id: id, ok: r.ok, error: r.error });
    });
    if (escribir) guardar_(R);
    var full = b.desde !== revAntes, c = {};
    if (full) c = D.c; else Object.keys(toc).forEach(function(t){ c[t] = tiene_(D.c, t) ? D.c[t] : null; });
    olvidar_(Object.keys(toc), info);
    return { ok: true, rev: D.rev, revAntes: revAntes, full: full, res: res, c: c, cfg: D.cfg, pin: D.pin || PIN_INICIAL, m: D.m.slice(-400), ahora: Date.now() };
  } finally { L.releaseLock(); }
}

/* Volver al último respaldo diario (antes guarda lo que hay ahora en otro archivo, así no se pierde nada).
   En el editor del script: elegí restaurarRespaldo arriba → Ejecutar. */
function restaurarRespaldo(){
  var props = PropertiesService.getScriptProperties(), mejor = null;
  for (var n = 0; n < 7; n++) {
    var id = props.getProperty('RESPALDO_' + n); if (!id) continue;
    try { var f = DriveApp.getFileById(id); if (!f.isTrashed() && (!mejor || f.getLastUpdated() > mejor.getLastUpdated())) mejor = f; } catch (e) {}
  }
  if (!mejor) { Logger.log('Todavía no hay respaldos.'); return; }
  var L = LockService.getScriptLock(); L.waitLock(20000);
  try {
    var actual = archivo_(), txt = actual.getBlob().getDataAsString('UTF-8');
    DriveApp.createFile(ARCHIVO.replace(/\.json$/, '') + '-antes-de-restaurar-' + Utilities.formatDate(new Date(), zona_(), 'yyyy-MM-dd-HHmm') + '.json', txt, MimeType.PLAIN_TEXT);
    var D = FID.normDatos(JSON.parse(mejor.getBlob().getDataAsString('UTF-8')), CFG_INICIAL), revAhora = 0;
    try { revAhora = JSON.parse(txt).rev || 0; } catch (e) {}
    D.rev = Math.max(D.rev, revAhora) + 1; // así los celulares bajan todo de nuevo
    actual.setContent(JSON.stringify(D));
    try { cache_().removeAll(['info']); } catch (e) {}
    Logger.log('Listo: se restauró ' + mejor.getName() + ' (' + mejor.getLastUpdated() + '). Lo que había quedó en el archivo «antes-de-restaurar».');
  } finally { L.releaseLock(); }
}

/* Correla una vez desde el editor (botón ▶ Ejecutar) para dar los permisos y ver que anda */
function probarTarjeta(){
  var R = leer_(), D = R.D;
  Logger.log('Archivo: ' + R.f.getName() + ' · ' + R.f.getUrl());
  Logger.log('Clientes: ' + Object.keys(D.c).length + ' · movimientos: ' + D.m.length + ' · premios: ' + JSON.stringify(D.cfg));
  Logger.log(CLAVE.indexOf('__') === 0 ? 'OJO: falta la clave (CLAVE).' : 'Clave cargada (' + CLAVE.length + ' caracteres).');
}
