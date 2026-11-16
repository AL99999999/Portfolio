/* ============================================================
   ATS — interactions, lecteur audio, animations
   (le contenu se modifie dans js/data.js)
   ============================================================ */
(() => {
  'use strict';

  const D = window.ATS;
  const T = D.tracks;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => (isFinite(s) && s >= 0) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
  const pad2 = n => String(n).padStart(2, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AC = window.AudioContext || window.webkitAudioContext;
  // Égaliseur, stems et spectre temps réel demandent que le site soit servi en http(s).
  const canWA = !!AC && /^https?:/.test(location.protocol);

  const body = document.body;
  const audio = $('#audio');   // piste principale (titre complet, extrait, ou stem « prod »)
  const vox = $('#audioVox');  // stem « voix » quand des stems réels sont fournis
  let cur = -1;                // index du titre chargé
  let shown = -1;              // index du titre affiché sur la console
  let realStems = false;

  /* ---------------- Toast ---------------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
  }

  /* ---------------- Texte découpé ---------------- */
  $$('[data-split]').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><i style="--i:${i}">${esc(w)}</i></span>`).join(' ');
  });
  const statement = $('#statement');
  statement.innerHTML = statement.textContent.trim().split(/\s+/).map(w => `<span class="w">${esc(w)}</span>`).join(' ');
  const stWords = $$('.w', statement);

  /* ---------------- Contact / divers ---------------- */
  const year = new Date().getFullYear();
  $('#year').textContent = year;
  $('#year2').textContent = year;
  const C = D.contact;
  const mail = $('#mailLink');
  mail.textContent = C.email;
  mail.href = 'mailto:' + C.email;
  $('#copyMail').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(C.email); toast('Email copié'); }
    catch { toast(C.email); }
  });
  if (C.cv) { const cv = $('#cvLink'); cv.href = C.cv; cv.hidden = false; }
  if (C.instagram) {
    const handle = C.instagram.replace(/\/+$/, '').split('/').pop();
    const a = $('#aboutInstaLink');
    a.href = C.instagram;
    a.textContent = '@' + handle + ' ↗';
    $('#aboutInsta').hidden = false;
  }
  const socials = [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['soundcloud', 'SoundCloud'], ['spotify', 'Spotify'], ['linkedin', 'LinkedIn']];
  $('#socials').innerHTML = socials.filter(([k]) => C[k]).map(([k, n]) => `<li><a href="${esc(C[k])}" target="_blank" rel="noopener" data-cursor="link">${n} ↗</a></li>`).join('');

  /* ---------------- Liens vers les plateformes ---------------- */
  // Lien exact s'il est renseigné dans data.js (« liens »), sinon recherche du titre sur la plateforme.
  const PLATFORMS = [
    ['spotify', 'Spotify', q => 'https://open.spotify.com/search/' + encodeURIComponent(q)],
    ['apple', 'Apple Music', q => 'https://music.apple.com/fr/search?term=' + encodeURIComponent(q)],
    ['deezer', 'Deezer', null],
    ['youtube', 'YouTube', q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)]
  ];
  function linksHTML(t) {
    const q = `${t.titre} ${t.artistes.replace(/[&,]/g, ' ').replace(/\s+/g, ' ')}`;
    const L = t.liens || {};
    return PLATFORMS.map(([k, name, search]) => {
      const url = L[k] || (k === 'deezer' ? (t.deezer ? 'https://www.deezer.com/track/' + t.deezer : '') : search(q));
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener" data-cursor="link" aria-label="${esc(t.titre)} sur ${name}">${name} ↗</a>` : '';
    }).join('');
  }

  /* ---------------- Liste des prods ---------------- */
  const list = $('#tracklist');
  list.innerHTML = T.map((t, i) => `
    <li class="track" data-i="${i}" data-reveal style="--d:${i * 70}ms">
      <button class="track__btn" data-cursor="link" aria-label="Écouter ${esc(t.titre)} — ${esc(t.artistes)}">
        <span class="track__n">${pad2(i + 1)}</span>
        <span class="track__thumb"><img src="${esc(t.cover)}" alt="" loading="lazy"><span class="track__eq"><i></i><i></i><i></i></span></span>
        <span class="track__main"><span class="track__title">${esc(t.titre)}</span><span class="track__artist">${esc(t.artistes)}</span></span>
        <span class="track__proj">${esc(t.projet)}</span>
        <span class="track__tag">${esc(t.role)}</span>
        <span class="track__dur">···</span>
      </button>
      <span class="track__links mono"><em>Écouter sur</em>${linksHTML(t)}</span>
    </li>`).join('');
  const rows = $$('.track', list);

  /* ---------------- Sources audio ---------------- */
  // Le fichier existe-t-il ? (renvoie sa durée, ou 0)
  function fileDuration(src) {
    return new Promise(res => {
      if (!src) return res(0);
      const a = new Audio();
      let done = false;
      const fin = d => { if (done) return; done = true; a.removeAttribute('src'); res(d); };
      a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => fin(a.duration || 0));
      a.addEventListener('error', () => fin(0));
      setTimeout(() => fin(0), 8000);
      a.src = src;
    });
  }
  // Deezer : l'API publique se lit en JSONP et renvoie un extrait officiel de 30 s (lien temporaire).
  function jsonp(url) {
    return new Promise((res, rej) => {
      const cb = '__dz' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const clean = () => { clearTimeout(to); delete window[cb]; s.remove(); };
      const to = setTimeout(() => { clean(); rej(new Error('timeout')); }, 9000);
      window[cb] = d => { clean(); res(d); };
      s.onerror = () => { clean(); rej(new Error('network')); };
      s.src = `${url}?output=jsonp&callback=${cb}`;
      document.head.appendChild(s);
    });
  }
  async function deezerPreview(t) {
    if (t.pv && t.pvExp > Date.now() + 60000) return t.pv;
    const d = await jsonp('https://api.deezer.com/track/' + t.deezer);
    if (!d || !d.preview) throw new Error('no preview');
    const m = /exp=(\d+)/.exec(d.preview);
    t.pv = d.preview;
    t.pvExp = m ? +m[1] * 1000 : Date.now() + 10 * 60000;
    return t.pv;
  }
  async function probe(t, i) {
    const dur = $('.track__dur', rows[i]);
    t.ok = false;
    if (t.stems && canWA) {
      const [dv, dp] = await Promise.all([fileDuration(t.stems.voix), fileDuration(t.stems.prod)]);
      if (dv && dp) { t.ok = true; t.mode = 'stems'; t.dur = dp; }
    }
    if (!t.ok) {
      const d = await fileDuration(t.src);
      if (d) { t.ok = true; t.mode = 'local'; t.dur = d; }
    }
    if (!t.ok && t.deezer) {
      try { await deezerPreview(t); t.ok = true; t.mode = 'preview'; t.dur = 30; } catch (e) { /* hors ligne */ }
    }
    dur.textContent = !t.ok ? 'Bientôt' : t.mode === 'preview' ? 'Extrait' : fmt(t.dur);
    rows[i].classList.toggle('is-soon', !t.ok);
  }

  /* ---------------- Console : pochette ---------------- */
  const stage = $('#stage');
  function showStage(i) {
    if (i === shown || !T[i]) return;
    shown = i;
    const t = T[i];
    const img = new Image();
    img.alt = `Pochette — ${t.titre}`;
    img.className = 'in';
    img.src = t.cover;
    const old = $$('img', stage);
    stage.insertBefore(img, $('.stage__badge', stage));
    setTimeout(() => old.forEach(o => o.remove()), 900);
    $('#stageTitle').textContent = t.titre;
    $('#stageArtist').textContent = `${t.artistes} — ${t.role} ATS`;
    $('#stageProj').textContent = t.projet;
    $('#fullLinks').innerHTML = linksHTML(t);
  }
  rows.forEach((r, i) => {
    r.addEventListener('mouseenter', () => showStage(i));
    $('.track__btn', r).addEventListener('click', () => {
      if (i === cur) return toggle();
      select(i, true);
    });
  });
  list.addEventListener('mouseleave', () => showStage(cur >= 0 ? cur : 0));

  /* ---------------- Web Audio : EQ + stems ---------------- */
  let actx, analyser, bass, treble, freq;
  const G = {};                       // gains du mélangeur
  const eq = { bass: 0, treble: 0 };
  const stem = { voix: 1, prod: 1 };

  function initGraph() {
    if (actx || !canWA) return;
    try {
      actx = new AC();
      const gain = (v = 1) => { const g = actx.createGain(); g.gain.value = v; return g; };
      const mono = (v = 1) => { const g = gain(v); g.channelCount = 1; g.channelCountMode = 'explicit'; return g; };
      const filt = (type, f) => { const b = actx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = .707; return b; };

      const src = actx.createMediaElementSource(audio);
      const srcV = actx.createMediaElementSource(vox);
      const out = gain();

      // 1. signal direct
      G.dry = gain(); src.connect(G.dry); G.dry.connect(out);

      // 2. séparation estimée (centre / côtés) quand il n'y a pas de vrais stems
      const st = gain(); st.channelCount = 2; st.channelCountMode = 'explicit'; src.connect(st);
      const split = actx.createChannelSplitter(2); st.connect(split);
      const mid = mono(), side = mono();
      const a = gain(.5), b = gain(.5), c = gain(.5), d = gain(-.5);
      split.connect(a, 0); split.connect(b, 1); a.connect(mid); b.connect(mid);
      split.connect(c, 0); split.connect(d, 1); c.connect(side); d.connect(side);
      //    voix ≈ centre du mix, entre 160 Hz et 7 kHz
      const vHP = filt('highpass', 160), vLP = filt('lowpass', 7000);
      G.vox = gain(0); mid.connect(vHP); vHP.connect(vLP); vLP.connect(G.vox); G.vox.connect(out);
      //    prod ≈ côtés stéréo + graves et aigus du centre
      const pLP = filt('lowpass', 160), pHP = filt('highpass', 7000);
      const pL = mono(), pR = mono(), inv = gain(-1);
      mid.connect(pLP); mid.connect(pHP);
      pLP.connect(pL); pHP.connect(pL); side.connect(pL);
      pLP.connect(pR); pHP.connect(pR); side.connect(inv); inv.connect(pR);
      const merge = actx.createChannelMerger(2); pL.connect(merge, 0, 0); pR.connect(merge, 0, 1);
      G.prod = gain(0); merge.connect(G.prod); G.prod.connect(out);

      // 3. vrai stem « voix » (second fichier synchronisé)
      G.stemV = gain(0); srcV.connect(G.stemV); G.stemV.connect(out);

      // sortie : égaliseur + analyseur
      bass = filt('lowshelf', 180); treble = filt('highshelf', 4200);
      analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .8;
      out.connect(bass); bass.connect(treble); treble.connect(analyser); analyser.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
      bass.gain.value = eq.bass; treble.gain.value = eq.treble;
      applyStems(true);
    } catch (e) { actx = null; analyser = null; }
  }
  function applyStems(now) {
    if (!actx) return;
    const v = stem.voix, p = stem.prod, t = actx.currentTime;
    const set = (g, val) => now ? g.gain.setValueAtTime(val, t) : g.gain.setTargetAtTime(val, t, .03);
    if (realStems) { set(G.dry, p); set(G.vox, 0); set(G.prod, 0); set(G.stemV, v); }
    else { const d = Math.min(v, p); set(G.dry, d); set(G.vox, v - d); set(G.prod, p - d); set(G.stemV, 0); }
  }
  function syncVox(force) {
    if (!realStems) return;
    if (force || Math.abs(vox.currentTime - audio.currentTime) > .07) vox.currentTime = audio.currentTime;
  }

  /* ---------------- Forme d'onde ---------------- */
  const NP = 220;
  function fakePeaks(seedStr) {
    let h = 2166136261;
    for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rnd = () => { h += 0x6D2B79F5; let x = Math.imul(h ^ (h >>> 15), 1 | h); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const p = new Float32Array(NP);
    let v = .5;
    for (let i = 0; i < NP; i++) {
      const x = i / NP;
      const env = Math.min(1, x * 14) * Math.min(1, (1 - x) * 10) * (.62 + .38 * Math.sin(x * Math.PI * (3 + (h & 3))) ** 2);
      v += (rnd() - .5) * .5; v = clamp(v, .25, 1);
      p[i] = clamp(env * v * (i % 8 === 0 ? 1.15 : 1), .05, 1);
    }
    return p;
  }
  async function realPeaks(t) {
    if (!actx || t.real || !t.url) return;
    t.real = true;
    try {
      const buf = await (await fetch(t.url)).arrayBuffer();
      const ab = await actx.decodeAudioData(buf);
      const ch = ab.getChannelData(0), block = Math.floor(ch.length / NP), p = new Float32Array(NP);
      let max = 0;
      for (let i = 0; i < NP; i++) {
        let m = 0;
        for (let j = 0; j < block; j += 16) { const a = Math.abs(ch[i * block + j]); if (a > m) m = a; }
        p[i] = m; if (m > max) max = m;
      }
      for (let i = 0; i < NP; i++) p[i] = clamp(p[i] / (max || 1), .04, 1);
      t.peaks = p;
    } catch (e) { t.real = false; }
  }

  /* ---------------- Lecteur ---------------- */
  const dockTitle = $('#dockTitle'), dockArtist = $('#dockArtist'), dockCover = $('#dockCover');
  const curTime = $('#curTime'), durTime = $('#durTime');
  const heroBtnTxt = $('#heroPlay .btn__txt');
  let selTok = 0;

  async function select(i, play) {
    const t = T[i];
    if (!t) return;
    showStage(i);
    if (!t.ok) {
      toast(`« ${t.titre} » — audio bientôt disponible`);
      rows[i].classList.remove('shake'); void rows[i].offsetWidth; rows[i].classList.add('shake');
      return;
    }
    const tok = ++selTok;
    let url;
    try { url = t.mode === 'preview' ? await deezerPreview(t) : t.mode === 'stems' ? t.stems.prod : t.src; }
    catch (e) { return toast('Extrait indisponible pour le moment — réessaie'); }
    if (tok !== selTok) return;

    cur = i;
    t.url = url;
    realStems = t.mode === 'stems';
    if (!t.peaks) t.peaks = fakePeaks(t.titre);
    audio.src = url;
    if (realStems) vox.src = t.stems.voix; else { vox.pause(); vox.removeAttribute('src'); }
    applyStems(true);

    rows.forEach((r, k) => r.classList.toggle('is-current', k === i));
    dockTitle.textContent = t.titre;
    dockArtist.textContent = t.artistes + (t.mode === 'preview' ? ' · extrait' : '');
    dockCover.style.backgroundImage = `url("${t.cover}")`;
    durTime.textContent = fmt(t.dur);
    curTime.textContent = '0:00';
    $('#consoleMode').textContent = t.mode === 'preview' ? 'Extrait 30 s' : t.mode === 'stems' ? 'Stems réels' : 'Titre complet';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.titre, artist: t.artistes, album: 'Prod. ATS', artwork: [{ src: t.cover }] });
    }
    if (play) playNow();
  }
  function playNow() {
    initGraph();
    if (actx && actx.state === 'suspended') actx.resume();
    audio.play().then(() => realPeaks(T[cur])).catch(() => {});
  }
  function toggle() {
    if (cur < 0) {
      const first = T.findIndex(t => t.ok);
      if (first < 0) return toast('Aucun son disponible pour le moment');
      return select(first, true);
    }
    audio.paused ? playNow() : audio.pause();
  }
  function step(dir, play = true) {
    if (!T.some(t => t.ok)) return;
    let i = cur;
    for (let k = 0; k < T.length; k++) {
      i = (i + dir + T.length) % T.length;
      if (T[i].ok) return select(i, play);
    }
  }

  audio.addEventListener('play', () => { body.classList.add('is-playing'); if (realStems) { syncVox(true); vox.play().catch(() => {}); } syncState(); });
  audio.addEventListener('pause', () => { body.classList.remove('is-playing'); vox.pause(); syncState(); });
  audio.addEventListener('seeked', () => syncVox(true));
  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('timeupdate', () => { curTime.textContent = fmt(audio.currentTime); syncVox(); });
  audio.addEventListener('loadedmetadata', () => { durTime.textContent = fmt(audio.duration); });
  audio.addEventListener('error', () => {
    if (cur < 0 || !audio.src) return;
    const t = T[cur];
    if (t.mode === 'preview') { t.pv = null; toast('Extrait expiré — clique à nouveau sur le titre'); }
  });
  function syncState() {
    const on = !audio.paused;
    const st = $('#consoleState');
    st.textContent = on ? '● PLAY' : (cur >= 0 ? 'PAUSE' : 'STANDBY');
    st.classList.toggle('is-on', on);
    heroBtnTxt.textContent = on ? 'Pause' : 'Écouter les prods';
    $('#playBtn').setAttribute('aria-label', on ? 'Pause' : 'Lecture');
  }

  $('#playBtn').addEventListener('click', toggle);
  $('#heroPlay').addEventListener('click', toggle);
  $('#nextBtn').addEventListener('click', () => step(1));
  $('#prevBtn').addEventListener('click', () => {
    if (audio.currentTime > 3) audio.currentTime = 0; else step(-1);
  });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
  }

  // Volume (curseur du lecteur + potard de la console)
  const volRange = $('#volRange');
  let volume = .9, volKnob;
  function setVolume(v, from) {
    volume = clamp(v);
    audio.volume = vox.volume = volume;
    audio.muted = vox.muted = false;
    body.classList.toggle('is-muted', volume === 0);
    volRange.value = volume;
    volRange.style.setProperty('--v', volume * 100 + '%');
    if (from !== 'knob' && volKnob) volKnob.set(volume, true);
  }
  volRange.addEventListener('input', () => setVolume(+volRange.value));
  $('#muteBtn').addEventListener('click', () => {
    audio.muted = vox.muted = !audio.muted;
    body.classList.toggle('is-muted', audio.muted || volume === 0);
  });

  /* ---------------- Potards ---------------- */
  const CIRC = 2 * Math.PI * 44;
  const allKnobs = [];
  function makeKnob(host, { label, value, def, show, onChange, off, color }) {
    const el = document.createElement('div');
    el.className = 'knob' + (off ? ' is-off' : '');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-valuemin', 0); el.setAttribute('aria-valuemax', 100);
    if (color) el.style.setProperty('--kc', color);
    if (off) el.title = 'Actif une fois le site en ligne (http)';
    el.innerHTML = `<div class="knob__dial"><svg viewBox="0 0 100 100"><circle class="knob__track" cx="50" cy="50" r="44" stroke-dasharray="${CIRC * .75} ${CIRC}"/><circle class="knob__val" cx="50" cy="50" r="44"/></svg><div class="knob__cap"></div></div><span class="knob__label">${label}<b></b></span>`;
    host.appendChild(el);
    const val = $('.knob__val', el), cap = $('.knob__cap', el), out = $('b', el);
    let v = value;
    const draw = x => {
      val.setAttribute('stroke-dasharray', `${CIRC * .75 * x} ${CIRC}`);
      cap.style.transform = `rotate(${-135 + x * 270}deg)`;
    };
    const api = {
      get: () => v,
      draw,
      set(nv, silent) {
        v = clamp(nv);
        draw(v);
        out.textContent = show(v);
        el.setAttribute('aria-valuenow', Math.round(v * 100));
        if (!silent) onChange(v);
      }
    };
    api.set(v, true);
    allKnobs.push(api);
    if (off) return api;
    let sy, sv;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); sy = e.clientY; sv = v; el.classList.add('is-drag'); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) api.set(sv + (sy - e.clientY) / 150); });
    el.addEventListener('pointerup', () => el.classList.remove('is-drag'));
    el.addEventListener('dblclick', () => api.set(def));
    el.addEventListener('wheel', e => { e.preventDefault(); api.set(v - e.deltaY * .0015); }, { passive: false });
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); api.set(v + .05); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); api.set(v - .05); }
    });
    return api;
  }
  const knobs = $('#knobs');
  knobs.innerHTML = '<div class="knobs__grp" data-t="Master / EQ"></div>';
  const grpEq = $('.knobs__grp', knobs);
  const db = v => { const g = Math.round((v - .5) * 24); return (g > 0 ? '+' : '') + g; };
  const pct = v => Math.round(v * 100);
  volKnob = makeKnob(grpEq, { label: 'Volume', value: volume, def: .9, show: pct, onChange: v => setVolume(v, 'knob') });
  makeKnob(grpEq, { label: 'Bass', value: .5, def: .5, off: !canWA, show: db, onChange: v => { eq.bass = (v - .5) * 24; if (bass) bass.gain.value = eq.bass; } });
  makeKnob(grpEq, { label: 'Treble', value: .5, def: .5, off: !canWA, show: db, onChange: v => { eq.treble = (v - .5) * 24; if (treble) treble.gain.value = eq.treble; } });
  setVolume(volume);

  // Les potards « montent » à leur valeur quand la console apparaît
  function sweepKnobs() {
    if (reduced) return;
    const t0 = performance.now();
    (function tick(now) {
      const p = clamp((now - t0 - 250) / 1100), e = 1 - Math.pow(1 - p, 4);
      allKnobs.forEach((k, i) => k.draw(k.get() * clamp(e * 1.25 - i * .06)));
      if (p < 1) requestAnimationFrame(tick); else allKnobs.forEach(k => k.draw(k.get()));
    })(t0);
  }

  /* ---------------- Canvas : barre de lecture ---------------- */
  const wave = $('#wave'), wctx = wave.getContext('2d');
  const spec = $('#spectrum'), sctx = spec.getContext('2d');
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    cv._dpr = dpr;
  }
  const fitAll = () => { fit(wave); fit(spec); };
  addEventListener('resize', fitAll);

  const idlePeaks = fakePeaks('ATS');
  function drawWave() {
    const w = wave.width, h = wave.height, dpr = wave._dpr || 1;
    wctx.clearRect(0, 0, w, h);
    const peaks = (cur >= 0 && T[cur].peaks) || idlePeaks;
    const prog = audio.duration ? audio.currentTime / audio.duration : 0;
    const bw = 2 * dpr, gap = 2 * dpr, n = Math.floor(w / (bw + gap));
    for (let i = 0; i < n; i++) {
      const p = peaks[Math.floor(i / n * NP)];
      const bh = Math.max(2 * dpr, p * (h - 4 * dpr));
      wctx.fillStyle = (i / n < prog) ? '#ff5b3a' : (cur >= 0 ? 'rgba(236,235,228,.42)' : 'rgba(236,235,228,.16)');
      wctx.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
    }
    if (cur >= 0) {
      wctx.fillStyle = '#ecebe4';
      wctx.fillRect(clamp(prog * w, 0, w - dpr), 0, dpr, h);
    }
    wave.setAttribute('aria-valuenow', Math.round(prog * 100));
  }
  function seekAt(e) {
    if (cur < 0 || !audio.duration) return;
    const r = wave.getBoundingClientRect();
    audio.currentTime = clamp((e.clientX - r.left) / r.width) * audio.duration;
  }
  wave.addEventListener('pointerdown', e => { wave.setPointerCapture(e.pointerId); seekAt(e); });
  wave.addEventListener('pointermove', e => { if (wave.hasPointerCapture(e.pointerId)) seekAt(e); });
  wave.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  /* ---------------- Canvas : spectre du hero ---------------- */
  const NL = 128, levels = new Float32Array(NL);
  function updateLevels(time) {
    const playing = !audio.paused;
    if (analyser && playing) {
      analyser.getByteFrequencyData(freq);
      for (let i = 0; i < NL; i++) {
        const idx = Math.min(freq.length - 1, Math.floor(Math.pow(i / NL, 1.7) * freq.length * .7));
        levels[i] += (freq[idx] / 255 - levels[i]) * .5;
      }
    } else {
      const amp = playing ? .8 : .2, s1 = playing ? 5.2 : 1.1, s2 = playing ? 3.1 : .6;
      for (let i = 0; i < NL; i++) {
        const x = i / NL;
        const env = Math.exp(-(((x - .13) / .13) ** 2)) * .95 + Math.exp(-(((x - .5) / .28) ** 2)) * .42 + .07;
        const n = .55 + .45 * Math.sin(time * s1 + i * .55) * Math.sin(time * s2 + i * .21);
        levels[i] += (env * n * amp - levels[i]) * .18;
      }
    }
  }
  const lv = x => {
    const f = clamp(x) * (NL - 1), i = Math.floor(f), k = f - i;
    return levels[i] * (1 - k) + levels[Math.min(NL - 1, i + 1)] * k;
  };
  function area(color, scale, stretch, shift) {
    const w = spec.width, h = spec.height, steps = 48;
    sctx.beginPath(); sctx.moveTo(0, h);
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      let a = 0; for (let k = -2; k <= 2; k++) a += lv((x + shift) * stretch + k * .012);
      sctx.lineTo(x * w, h - (a / 5) * scale * h);
    }
    sctx.lineTo(w, h); sctx.closePath();
    sctx.fillStyle = color; sctx.fill();
  }
  function drawSpectrum() {
    const w = spec.width, h = spec.height, dpr = spec._dpr || 1;
    sctx.clearRect(0, 0, w, h);
    area('rgba(125,255,176,.16)', .95, 1, 0);
    area('rgba(127,155,255,.2)', .7, .8, .08);
    area('rgba(255,91,58,.45)', .3, .6, 0);
    const stepPx = 4 * dpr, n = Math.floor(w / stepPx);
    sctx.strokeStyle = 'rgba(236,235,228,.5)'; sctx.lineWidth = dpr; sctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = i * stepPx + .5, y = h - 2 * dpr - lv(i / n) * (h - 6 * dpr) * .92;
      sctx.moveTo(x, h); sctx.lineTo(x, y);
    }
    sctx.stroke();
    sctx.fillStyle = 'rgba(236,235,228,.7)'; sctx.fillRect(0, h - dpr, w, dpr);
  }

  /* ---------------- Logo du hero ---------------- */
  let kick = 0;
  const heroLogo = $('.hero__logo'), g1 = $('.l-g1'), g2 = $('.l-g2');

  /* ---------------- Cadrans (À propos) ---------------- */
  const P = (r, a) => { const t = (a - 90) * Math.PI / 180; return [(60 + r * Math.cos(t)).toFixed(2), (60 + r * Math.sin(t)).toFixed(2)]; };
  function dialSVG(k) {
    let s = '';
    if (k === 0) for (let i = 0; i <= 30; i++) { const a = -135 + i * 9, [x1, y1] = P(50, a), [x2, y2] = P(i % 5 ? 55 : 59, a); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${i % 5 ? 1 : 2}"/>`; }
    if (k === 1) for (let i = 0; i < 26; i++) { const a = -140 + i * (280 / 25), [x, y] = P(54, a); s += `<rect x="${x - 2.4}" y="${y - 4}" width="4.8" height="8" transform="rotate(${a} ${x} ${y})" fill="currentColor" stroke="none" opacity="${i < 17 ? 1 : .22}"/>`; }
    if (k === 2) for (let i = 0; i < 16; i++) { const a = -135 + i * 18, [x, y] = P(54, a); s += `<circle cx="${x}" cy="${y}" r="${(.8 + i * .2).toFixed(2)}" fill="currentColor" stroke="none"/>`; }
    if (k === 3) s += `<circle cx="60" cy="60" r="58" stroke-width="2.5"/><circle cx="60" cy="60" r="52" stroke-width="5" stroke-dasharray="1 3.54"/>`;
    return `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true">${s}
      <g class="dial__rot"><circle cx="60" cy="60" r="43" stroke-width="2.5"/><circle cx="60" cy="60" r="${k === 2 ? 26 : 37}" stroke-width="1"/>
      ${k % 2 ? '<path d="M60 20 l4 8 h-8z" fill="currentColor" stroke="none"/>' : '<line x1="60" y1="21" x2="60" y2="34" stroke-width="3" stroke-linecap="round"/>'}</g></svg>`;
  }
  const dials = $$('.dial').map(d => { d.innerHTML = dialSVG(+d.dataset.dial); return { el: d, rot: $('.dial__rot', d), k: +d.dataset.dial }; });

  /* ---------------- Vidéos ---------------- */
  const vgrid = $('#vgrid');
  vgrid.innerHTML = D.videos.map((v, i) => `
    <a class="vcard" href="${esc(v.src)}" data-i="${i}" data-cursor="play" aria-label="Lire la vidéo ${esc(v.titre)}">
      <span class="vcard__media">
        <span class="vcard__par"><img src="${esc(v.poster)}" alt="${esc(v.titre)} — ${esc(v.type)}" loading="lazy"></span>
        <video muted loop playsinline preload="none" data-src="${esc(v.src)}"></video>
        <span class="vcard__n mono">V—${pad2(i + 1)}</span>
        <span class="vcard__len mono" hidden></span>
      </span>
      <span class="vcard__cap">
        <span class="vcard__title">${esc(v.titre)}</span>
        <span class="vcard__info mono"><b>${esc(v.type)}</b>${v.annee ? ' — ' + esc(v.annee) : ''}<br>${esc(v.detail)}</span>
      </span>
    </a>`).join('');
  const modal = $('#modal'), mv = $('#modalVideo');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let lastFocus;
  const vcards = $$('.vcard', vgrid).map(card => {
    const v = D.videos[+card.dataset.i], vid = $('video', card), len = $('.vcard__len', card), media = $('.vcard__media', card);
    vid.addEventListener('loadedmetadata', () => { len.textContent = fmt(vid.duration); len.hidden = false; });
    card.addEventListener('mouseenter', () => {
      if (!finePointer) return;
      if (!vid.src) vid.src = vid.dataset.src;
      vid.play().then(() => card.classList.add('is-preview')).catch(() => {});
    });
    card.addEventListener('mousemove', e => {
      if (!finePointer || reduced) return;
      const r = media.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      media.style.transform = `perspective(1100px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.015)`;
    });
    card.addEventListener('mouseleave', () => { vid.pause(); card.classList.remove('is-preview'); media.style.transform = ''; });
    card.addEventListener('click', e => {
      e.preventDefault();
      vid.pause(); card.classList.remove('is-preview');
      lastFocus = card;
      audio.pause();
      mv.src = v.src; mv.poster = v.poster;
      $('#modalTitle').textContent = v.titre;
      $('#modalInfo').textContent = [v.type, v.detail, v.annee].filter(Boolean).join(' — ');
      modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
      body.style.overflow = 'hidden';
      mv.play().catch(() => {});
      $('#modalClose').focus();
    });
    return { card, par: $('.vcard__par', card) };
  });
  function closeModal() {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true');
    body.style.overflow = '';
    mv.pause(); mv.removeAttribute('src'); mv.load();
    if (lastFocus) lastFocus.focus();
  }
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  /* ---------------- Clavier ---------------- */
  addEventListener('keydown', e => {
    if (e.key === 'Escape') return closeModal();
    if (modal.classList.contains('is-open')) return;
    if (e.code === 'Space' && !e.target.closest('input, textarea, button, a, [role=slider]')) { e.preventDefault(); toggle(); }
  });

  /* ---------------- Curseur + boutons magnétiques ---------------- */
  const cursor = $('.cursor'), cLabel = $('.cursor__label');
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
  if (finePointer) {
    addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursor.classList.add('is-on'); });
    document.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-cursor]');
      const kind = t ? t.dataset.cursor : '';
      cursor.classList.toggle('is-link', kind === 'link');
      cursor.classList.toggle('is-play', kind === 'play');
      cLabel.textContent = kind === 'play' ? 'PLAY' : '';
    });
    if (!reduced) $$('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.transition = 'transform .15s';
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
    });
  }

  /* ---------------- Nav : thème + lien actif ---------------- */
  const nav = $('#nav'), navSecs = $$('[data-nav]'), navLinks = $$('.nav__links a');
  let lastY = 0;
  function updateNav() {
    let light = false, active = '';
    for (const s of navSecs) {
      const r = s.getBoundingClientRect();
      if (r.top <= 34 && r.bottom > 34) light = s.dataset.nav === 'light';
      if (s.id && r.top <= innerHeight * .45 && r.bottom > innerHeight * .45) active = s.id;
    }
    nav.classList.toggle('is-light', light);
    nav.classList.toggle('is-hidden', scrollY > lastY && scrollY > 300);
    lastY = scrollY;
    navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + active));
  }

  /* ---------------- Boucle d'animation ---------------- */
  let heroVisible = true;
  new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; }).observe($('.hero'));
  let scrolled = true;
  addEventListener('scroll', () => { scrolled = true; }, { passive: true });
  const progress = $('#progress'), contactLogo = $('#contactLogo'), titles = $$('.sec-head__t');

  function frame(ms) {
    const time = ms / 1000;
    const playing = !audio.paused;

    cx += (mx - cx) * .22; cy += (my - cy) * .22;
    cursor.style.transform = `translate(${cx}px, ${cy}px)`;

    updateLevels(time);
    drawWave();

    const y = scrollY;

    if (heroVisible) {
      let bs = 0;
      for (let i = 0; i < 10; i++) bs += levels[i];
      drawSpectrum();

      // logo : pulse sur les basses, dédoublement coloré, léger suivi de la souris
      if (!reduced) {
        const b = clamp(bs / 10 * (playing ? 1.15 : .6));
        kick += (b - kick) * (b > kick ? .5 : .12);
        const px = (cx / innerWidth - .5) * -16, py = (cy / innerHeight - .5) * -10;
        heroLogo.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${(1 + kick * .04).toFixed(4)})`;
        const o = 4 + kick * 26;
        g1.style.transform = `translate(${(-o - px * .5).toFixed(1)}px, ${(kick * 6).toFixed(1)}px)`;
        g2.style.transform = `translate(${(o - px * .5).toFixed(1)}px, ${(-kick * 6).toFixed(1)}px)`;
      }
    }

    if (scrolled) {
      scrolled = false;
      updateNav();
      const vh = innerHeight;
      progress.style.transform = `scaleX(${clamp(y / Math.max(1, document.documentElement.scrollHeight - vh))})`;
      dials.forEach(d => d.rot.setAttribute('transform', `rotate(${((y * (.12 + d.k * .05)) * (d.k % 2 ? -1 : 1)) % 360} 60 60)`));
      const r = statement.getBoundingClientRect();
      const p = clamp((vh * .85 - r.top) / (r.height + vh * .35));
      const on = reduced ? stWords.length : Math.round(p * stWords.length * 1.1);
      stWords.forEach((w, i) => w.classList.toggle('on', i < on));
      if (!reduced) {
        titles.forEach(t => {
          const tr = t.getBoundingClientRect();
          if (tr.bottom > -100 && tr.top < vh + 100) t.style.transform = `translate3d(${((tr.top - vh * .5) * .07).toFixed(1)}px,0,0)`;
        });
        vcards.forEach(({ card, par }) => {
          const cr = card.getBoundingClientRect();
          if (cr.bottom > -100 && cr.top < vh + 100) par.style.transform = `translate3d(0,${((cr.top + cr.height / 2 - vh / 2) * -.07).toFixed(1)}px,0)`;
        });
        const lr = contactLogo.parentElement.getBoundingClientRect();
        if (lr.bottom > 0 && lr.top < vh) contactLogo.style.transform = `rotate(${(lr.top * -.035).toFixed(2)}deg) scale(${(1 + clamp(1 - lr.top / vh) * .12).toFixed(3)})`;
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- Apparitions au scroll ---------------- */
  function startReveals() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
      if (e.target.classList.contains('console')) sweepKnobs();
    }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split], .vcard').forEach(el => io.observe(el));
  }

  /* ---------------- Démarrage ---------------- */
  // Écran de lancement : un dB-mètre qui monte de -60 dB jusqu'à 0 dB
  const bar = $('#loaderBar'), dbOut = $('#loaderDb'), meter = $('#meter');
  const SEG = 60;
  const chans = ['#mL', '#mR'].map(id => {
    const el = $(id);
    el.innerHTML = Array.from({ length: SEG }, (_, i) => '<i class="' + (i >= SEG * .95 ? 'r' : i >= SEG * .8 ? 'o' : '') + '"></i>').join('');
    return { segs: $$('i', el), peak: 0 };
  });
  function setMeter(ch, db) {            // db entre -60 et 0
    const n = Math.round(clamp((db + 60) / 60) * SEG);
    ch.peak = Math.max(ch.peak, n);
    ch.segs.forEach((s, i) => { s.classList.toggle('on', i < n); s.classList.toggle('pk', i === ch.peak - 1 && i >= n); });
  }
  function runLoader() {
    return new Promise(res => {
      if (reduced) return res();
      setTimeout(res, 4500); // filet de sécurité si l'onglet est en arrière-plan
      const t0 = performance.now(), dur = 2100;
      (function tick(now) {
        const p = clamp((now - t0) / dur), e = 1 - Math.pow(1 - p, 2.4), t = now / 1000;
        const base = -60 + e * 60, wob = (1 - p) * 5;
        const l = Math.min(0, base + Math.sin(t * 21) * wob + Math.sin(t * 47) * wob * .5);
        const r = Math.min(0, base - 1.5 * (1 - p) + Math.sin(t * 17 + 2) * wob + Math.sin(t * 53) * wob * .5);
        setMeter(chans[0], p < 1 ? l : 0); setMeter(chans[1], p < 1 ? r : 0);
        const top = p < 1 ? Math.max(l, r) : 0;
        dbOut.textContent = (top <= -0.05 ? '-' : '') + Math.abs(top).toFixed(1);
        bar.style.width = e * 100 + '%';
        if (p < 1) return requestAnimationFrame(tick);
        meter.classList.add('is-clip');
        $('#meterPeak').textContent = 'Peak ● 0 dB';
        setTimeout(res, 420);
      })(t0);
    });
  }

  showStage(0);
  syncState();
  fitAll();
  requestAnimationFrame(frame);

  Promise.all(T.map(probe)).then(() => {
    const first = T.findIndex(t => t.ok);
    if (first >= 0 && cur < 0) select(first, false);
  });
  const fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
  Promise.all([runLoader(), Promise.race([fonts, new Promise(r => setTimeout(r, 2500))])]).then(() => {
    body.classList.remove('is-loading');
    fitAll();
    setTimeout(startReveals, 350);
  });
})();
