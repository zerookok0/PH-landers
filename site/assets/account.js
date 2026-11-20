/* 账号页：资料 / 送货地址 / 订单历史 */
(function () {
  const LD = window.LD || {};
  const AUTH = LD.auth || {};
  const LOC = LD.location || {};
  let currentUser = null;

  const money = LD.money || ((c) => '\u20B1' + (c / 100).toFixed(2));
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const kv = (rows) =>
    rows
      .map(
        ([k, v]) =>
          `<div class="ld-kv-row"><span>${esc(k)}</span><b>${v === '' || v == null ? '—' : esc(v)}</b></div>`
      )
      .join('');

  const orders = () => {
    try {
      const list = JSON.parse(localStorage.getItem('ld_orders') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  };

  const renderAddress = (user) => {
    const loc = LOC.get ? LOC.get() : null;
    const box = document.getElementById('ld-address');
    if (!box) return;

    if (loc) {
      box.innerHTML = kv([
        ['Deliver to', loc.barangay || loc.city],
        ['City', loc.city],
        ['Region', loc.region],
        ['ZIP', loc.zip || ''],
      ]);
      return;
    }

    // 没有选址记录时，退回会员资料里的地址
    if (user && user.city) {
      box.innerHTML =
        kv([
          ['Deliver to', user.address || ''],
          ['City', user.city],
          ['Region', user.region || ''],
          ['ZIP', user.zip || ''],
        ]) +
        `<p style="margin-top:12px"><button class="ld-btn ld-btn-ghost" type="button" id="ld-use-profile-addr">USE THIS ADDRESS</button></p>`;
      document.getElementById('ld-use-profile-addr')?.addEventListener('click', () => {
        LOC.set &&
          LOC.set({
            region: user.region || '',
            city: user.city,
            barangay: user.address || '',
            zip: user.zip || '',
            label: user.address ? `${user.address}, ${user.city}` : user.city,
            setAt: Date.now(),
          });
        renderAddress(user);
      });
      return;
    }

    box.innerHTML = '<p style="color:#8b93a5;font-size:13px">No delivery address saved yet. Add one so checkout can prefill it.</p>';
  };

  const renderOrders = () => {
    const box = document.getElementById('ld-orders');
    if (!box) return;
    const list = orders();
    if (!list.length) {
      box.innerHTML = '<p style="color:#8b93a5;font-size:13px">No orders yet.</p>';
      return;
    }
    box.innerHTML = list
      .slice(0, 10)
      .map(
        (o) => `
        <div class="ld-order-card">
          <div class="ld-order-card-head">
            <a href="/order/${encodeURIComponent(o.order_number)}"><b>${esc(o.order_number)}</b></a>
            <span>${esc(new Date(o.at || Date.now()).toLocaleString('en-PH'))}</span>
          </div>
          <div class="ld-order-card-body">
            ${(o.items || [])
              .map((it) => `<div class="ld-order-line"><span>${esc(it.name)} × ${it.qty}</span><b>${money(it.price * it.qty)}</b></div>`)
              .join('') || '<div class="ld-order-line"><span>Items</span><b>—</b></div>'}
          </div>
          <div class="ld-order-card-total">Total <b>${money(o.total || 0)}</b></div>
        </div>`
      )
      .join('');
  };

  const boot = async () => {
    document.getElementById('ld-change-loc')?.addEventListener('click', () => {
      if (LOC.open) LOC.open({ onSave: () => renderAddress(currentUser) });
    });
    window.addEventListener('ld:location-changed', () => renderAddress(currentUser));

    renderOrders();
    renderAddress(null);

    if (!AUTH.requireUser) return;
    const user = await AUTH.requireUser('/account');
    if (!user) return;
    currentUser = user;
    renderAddress(user);

    AUTH.paintHeader && AUTH.paintHeader(user);

    const chip = document.getElementById('ld-account-chip');
    if (chip) chip.textContent = `${user.membership || 'Member'} member`;

    const profile = document.getElementById('ld-profile');
    if (profile) {
      profile.innerHTML = kv([
        ['Name', user.name],
        ['Email', user.email],
        ['Mobile', user.phone],
        ['Membership', user.membership],
        ['Member since', user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-PH') : ''],
      ]);
    }

    document.getElementById('ld-logout')?.addEventListener('click', async () => {
      await AUTH.logout();
      location.href = '/';
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
