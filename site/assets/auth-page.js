/* 登录页 / 注册页的表单逻辑（两页共用，按 DOM 是否存在分流） */
(function () {
  const LD = window.LD || {};
  const AUTH = LD.auth || {};

  const nextUrl = () => {
    const n = new URLSearchParams(location.search).get('next');
    return n && n.startsWith('/') ? n : '/account';
  };

  const setErr = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', Boolean(msg));
  };

  const busy = (btn, on, label) => {
    if (!btn) return;
    btn.disabled = on;
    if (label) btn.textContent = on ? 'PLEASE WAIT…' : label;
  };

  /* ---------------- 登录 ---------------- */
  const loginForm = document.getElementById('ld-login-form');
  if (loginForm) {
    // 已登录直接进账号页
    AUTH.me &&
      AUTH.me().then((u) => {
        if (u) location.replace(nextUrl());
      });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr('ld-login-error', '');
      const email = loginForm.querySelector('#ld-email').value.trim();
      const password = loginForm.querySelector('#ld-password').value;
      const btn = document.getElementById('ld-login-submit');

      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return setErr('ld-login-error', 'Please enter a valid email address.');
      if (password.length < 6) return setErr('ld-login-error', 'Password must be at least 6 characters.');

      busy(btn, true, 'LOGIN');
      const r = await AUTH.login(email, password);
      busy(btn, false, 'LOGIN');

      if (r.data && r.data.ok) {
        LD.toast && LD.toast('Welcome back');
        location.href = nextUrl();
      } else {
        setErr('ld-login-error', (r.data && r.data.message) || 'Login failed. Please try again.');
      }
    });
  }

  /* ---------------- 注册（会员申请） ---------------- */
  const regForm = document.getElementById('ld-register-form');
  if (regForm) {
    const regionSel = document.getElementById('ld-region');
    const citySel = document.getElementById('ld-city');
    const regions = (LD.location && LD.location.regions) || [];

    const fillCities = () => {
      const r = regions.find((x) => x.name === regionSel.value) || regions[0];
      citySel.innerHTML = (r ? r.cities : []).map((c) => `<option value="${c}">${c}</option>`).join('');
    };
    regionSel.innerHTML = regions.map((r) => `<option value="${r.name}">${r.name}</option>`).join('');
    regionSel.addEventListener('change', fillCities);
    fillCities();

    const loc = LD.location && LD.location.get();
    if (loc) {
      if (loc.region) regionSel.value = loc.region;
      fillCities();
      if (loc.city) citySel.value = loc.city;
      document.getElementById('ld-address').value = loc.barangay || '';
      document.getElementById('ld-zip').value = loc.zip || '';
    }

    regionSel.addEventListener('change', () => setErr('ld-register-error', ''));

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr('ld-register-error', '');

      const v = (id) => document.getElementById(id).value.trim();
      const password = document.getElementById('ld-password').value;
      const password2 = document.getElementById('ld-password2').value;
      const terms = document.getElementById('ld-terms').checked;
      const btn = document.getElementById('ld-register-submit');

      if (v('ld-name').length < 2) return setErr('ld-register-error', 'Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v('ld-email'))) return setErr('ld-register-error', 'Please enter a valid email address.');
      if (v('ld-phone').replace(/\D/g, '').length < 10) return setErr('ld-register-error', 'Please enter a valid mobile number.');
      if (password.length < 6) return setErr('ld-register-error', 'Password must be at least 6 characters.');
      if (password !== password2) return setErr('ld-register-error', 'The two passwords do not match.');
      if (v('ld-address').length < 5) return setErr('ld-register-error', 'Please enter your street address.');
      if (!terms) return setErr('ld-register-error', 'Please accept the Terms and Conditions.');

      busy(btn, true, 'CREATE ACCOUNT');
      const r = await AUTH.register({
        name: v('ld-name'),
        email: v('ld-email'),
        phone: v('ld-phone'),
        password,
        membership: document.getElementById('ld-membership').value,
        address: v('ld-address'),
        region: regionSel.value,
        city: citySel.value,
        zip: v('ld-zip'),
        terms: true,
      });
      busy(btn, false, 'CREATE ACCOUNT');

      if (r.data && r.data.ok) {
        // 注册顺带记住送货地址
        if (LD.location && LD.location.set) {
          LD.location.set({
            region: regionSel.value,
            city: citySel.value,
            barangay: v('ld-address'),
            zip: v('ld-zip'),
            label: v('ld-address') ? `${v('ld-address')}, ${citySel.value}` : citySel.value,
            setAt: Date.now(),
          });
        }
        LD.toast && LD.toast('Membership created');
        location.href = '/account';
      } else {
        setErr('ld-register-error', (r.data && r.data.message) || 'Registration failed. Please try again.');
      }
    });
  }
})();
