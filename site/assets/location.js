/* =============================================================================
 * 送货地址（Delivery Location）
 * -----------------------------------------------------------------------------
 * 原站顶栏的 "Enter Your Delivery Location" 是个真实的选址入口：选到不派送的
 * 城市会告诉你不可派送。这里实现同一套：
 *   LD.location.get()          读取当前地址 {region, city, barangay, label}
 *   LD.location.open(opts)     打开选址弹窗（opts.onSave 回调）
 *   LD.location.clear()        清空
 * 存储：localStorage.ld_loc + cookie ld_loc（30 天，SameSite=Lax）
 * ========================================================================== */
(function () {
  const LD = (window.LD = window.LD || {});

  /* 派送范围（对齐原站 delivery-areas：Metro Manila / Cebu / Naga / Bacolod / Davao） */
  const REGIONS = [
    {
      code: 'NCR',
      name: 'Metro Manila',
      cities: [
        'Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig', 'Mandaluyong', 'San Juan',
        'Marikina', 'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Caloocan',
        'Valenzuela', 'Malabon', 'Navotas', 'Pateros',
      ],
      zips: { 'Quezon City': '1100', Manila: '1000', Makati: '1210', Pasig: '1600', Taguig: '1630' },
    },
    { code: 'CEB', name: 'Cebu', cities: ['Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay'], zips: { 'Cebu City': '6000' } },
    { code: 'CAS', name: 'Camarines Sur', cities: ['Naga City'], zips: { 'Naga City': '4400' } },
    { code: 'NOC', name: 'Negros Occidental', cities: ['Bacolod City'], zips: { 'Bacolod City': '6100' } },
    { code: 'DAS', name: 'Davao del Sur', cities: ['Davao City'], zips: { 'Davao City': '8000' } },
  ];

  const KEY = 'ld_loc';
  const COOKIE = 'ld_loc';
  const MAX_AGE = 30 * 86400;

  const readCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    if (!m) return '';
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return '';
    }
  };

  const writeCookie = (name, value, maxAge) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  const LOC = (LD.location = LD.location || {});
  LOC.regions = REGIONS;

  LOC.get = () => {
    try {
      const raw = localStorage.getItem(KEY) || readCookie(COOKIE);
      const v = JSON.parse(raw || 'null');
      if (v && v.city) return v;
    } catch (e) {}
    return null;
  };

  LOC.label = () => {
    const l = LOC.get();
    if (!l) return 'Enter Your Delivery Location';
    return l.barangay ? `${l.barangay}, ${l.city}` : l.city;
  };

  const save = (loc) => {
    const value = JSON.stringify(loc);
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {}
    writeCookie(COOKIE, value, MAX_AGE);
    window.dispatchEvent(new CustomEvent('ld:location-changed', { detail: loc }));
    paintHeader();
  };

  LOC.clear = () => {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
    writeCookie(COOKIE, '', 0);
    window.dispatchEvent(new CustomEvent('ld:location-changed', { detail: null }));
    paintHeader();
  };

  /** 供注册页 / 其他页面直接写入一个地址（会同时写 localStorage 与 cookie） */
  LOC.set = save;

  const paintHeader = () => {
    const el = document.getElementById('ld-loc-btn');
    if (!el) return;
    const l = LOC.get();
    el.querySelector('.ld-loc-text').textContent = LOC.label();
    el.classList.toggle('is-set', Boolean(l));
    el.title = l ? `Delivering to ${LOC.label()}` : 'Choose your delivery location';
  };

  LOC.isServiceable = (city) => REGIONS.some((r) => r.cities.includes(city));

  /* ---------------- 弹窗 ---------------- */
  let modal = null;

  const buildModal = () => {
    const regionOpts = REGIONS.map((r) => `<option value="${r.code}">${r.name}</option>`).join('');
    const covered = REGIONS.map((r) => `<li><b>${r.name}</b> — ${r.cities.join(', ')}</li>`).join('');

    const el = document.createElement('div');
    el.className = 'ld-modal ld-loc-modal';
    el.id = 'ld-loc-modal';
    el.innerHTML = `
      <div class="ld-modal-backdrop" data-close="1"></div>
      <div class="ld-modal-card" role="dialog" aria-modal="true" aria-labelledby="ld-loc-title">
        <button class="ld-modal-x" type="button" data-close="1" aria-label="Close">&times;</button>
        <div class="ld-modal-body">
          <h3 id="ld-loc-title">Delivery Location</h3>
          <p class="ld-modal-sub">We deliver from the Landers branch nearest to you.</p>

          <div class="ld-field">
            <label for="ld-loc-region">Region</label>
            <select id="ld-loc-region">${regionOpts}</select>
          </div>
          <div class="ld-field">
            <label for="ld-loc-city">City / Municipality</label>
            <select id="ld-loc-city"></select>
          </div>
          <div class="ld-row-2">
            <div class="ld-field">
              <label for="ld-loc-brgy">Barangay</label>
              <input id="ld-loc-brgy" placeholder="e.g. Poblacion">
            </div>
            <div class="ld-field">
              <label for="ld-loc-zip">ZIP</label>
              <input id="ld-loc-zip" inputmode="numeric" placeholder="e.g. 1210">
            </div>
          </div>

          <div id="ld-loc-note" class="ld-loc-note"></div>

          <button class="ld-btn ld-modal-cta" id="ld-loc-save" type="button">SAVE LOCATION</button>
          <button class="ld-modal-dismiss" type="button" data-close="1">Cancel</button>

          <details class="ld-loc-covered">
            <summary>See all covered areas</summary>
            <ul>${covered}</ul>
          </details>
        </div>
      </div>`;
    document.body.appendChild(el);

    const regionSel = el.querySelector('#ld-loc-region');
    const citySel = el.querySelector('#ld-loc-city');
    const note = el.querySelector('#ld-loc-note');

    const fillCities = () => {
      const r = REGIONS.find((x) => x.code === regionSel.value) || REGIONS[0];
      citySel.innerHTML = r.cities.map((c) => `<option value="${c}">${c}</option>`).join('');
      const current = LOC.get();
      if (current && current.city && r.cities.includes(current.city)) citySel.value = current.city;
    };
    regionSel.addEventListener('change', fillCities);
    fillCities();

    const close = () => {
      el.classList.remove('is-on');
      setTimeout(() => {
        el.style.display = 'none';
      }, 200);
    };

    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-close]')) close();
    });

    el.querySelector('#ld-loc-save').addEventListener('click', () => {
      const region = REGIONS.find((x) => x.code === regionSel.value);
      const city = citySel.value;
      const barangay = el.querySelector('#ld-loc-brgy').value.trim();
      const zip = el.querySelector('#ld-loc-zip').value.trim();

      if (!LOC.isServiceable(city)) {
        note.textContent = `Sorry — we don't deliver to ${city} yet. Pick a covered city below.`;
        note.className = 'ld-loc-note is-err';
        return;
      }

      const loc = {
        region: region.name,
        regionCode: region.code,
        city,
        barangay,
        zip: zip || (region.zips && region.zips[city]) || '',
        label: barangay ? `${barangay}, ${city}` : city,
        setAt: Date.now(),
      };
      save(loc);
      close();
      LD.toast && LD.toast(`Delivering to ${loc.label}`);
      if (typeof modal.onSave === 'function') modal.onSave(loc);
    });

    return { el, regionSel, citySel, note, close };
  };

  LOC.open = (opts) => {
    if (!modal) modal = buildModal();
    modal.onSave = opts && opts.onSave;
    const cur = LOC.get();
    if (cur && cur.regionCode) {
      modal.regionSel.value = cur.regionCode;
      modal.regionSel.dispatchEvent(new Event('change'));
      if (cur.city) modal.citySel.value = cur.city;
      modal.el.querySelector('#ld-loc-brgy').value = cur.barangay || '';
      modal.el.querySelector('#ld-loc-zip').value = cur.zip || '';
    }
    modal.note.textContent = '';
    modal.note.className = 'ld-loc-note';
    modal.el.style.display = '';
    requestAnimationFrame(() => modal.el.classList.add('is-on'));
    setTimeout(() => modal.regionSel.focus(), 220);
  };

  const boot = () => {
    paintHeader();
    // 页头是 layout.js 后注入的，用事件委托保证顺序无关
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#ld-loc-btn');
      if (!btn) return;
      e.preventDefault();
      LOC.open();
    });
    window.addEventListener('ld:location-changed', () => paintHeader());
    window.addEventListener('ld:header-ready', () => paintHeader());
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
