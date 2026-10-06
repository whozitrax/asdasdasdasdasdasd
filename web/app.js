(() => {
  const tg = window.Telegram?.WebApp;
  const $ = (id) => document.getElementById(id);
  const els = {
    screen: $('screen'), actions: $('actions'), giftImage: $('giftImage'), giftFallback: $('giftFallback'),
    giftName: $('giftName'), subtitle: $('subtitle'), price: $('price'), timer: $('timer'),
    statusText: $('statusText'), overlay: $('overlay'), sheet: $('sheet'), pageTitle: $('pageTitle'), closeTop: $('closeTop')
  };

  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#0b1018'); tg.setBackgroundColor('#090d14'); tg.setBottomBarColor('#090d14'); } catch (_) {}
  }

  const params = new URLSearchParams(location.search);
  const offerId = tg?.initDataUnsafe?.start_param || params.get('tgWebAppStartParam') || params.get('offer_id') || '';
  const initData = tg?.initData || '';
  let offer = null;
  let timerHandle = null;

  const api = async (path, options = {}) => {
    const headers = { 'X-Telegram-Init-Data': initData, ...(options.headers || {}) };
    const res = await fetch(path, { ...options, headers });
    let body = {};
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw Object.assign(new Error(body.error || 'Ошибка сервера'), { body, status: res.status });
    return body;
  };

  const haptic = (type = 'light') => { try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {} };
  const close = () => tg?.close ? tg.close() : window.close();
  els.closeTop.addEventListener('click', close);

  function button(text, cls, onClick) {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = text;
    b.onclick = onClick;
    return b;
  }

  function setActions(...buttons) {
    els.actions.replaceChildren(...buttons);
  }

  function formatTime(total) {
    total = Math.max(0, total | 0);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function startTimer(seconds) {
    clearInterval(timerHandle);
    let left = Math.max(0, seconds || 0);
    const paint = () => {
      els.timer.textContent = left > 0 ? `Предложение действительно ещё ${formatTime(left)}` : 'Срок предложения истёк';
      left--;
    };
    paint(); timerHandle = setInterval(paint, 1000);
  }

  function showSheet(title, text, actions, loading = false) {
    els.sheet.innerHTML = `${loading ? '<div class="loader"></div>' : ''}<h3>${title}</h3><p>${text}</p><div class="sheet-actions" id="sheetActions"></div>`;
    const box = els.sheet.querySelector('#sheetActions');
    (actions || []).forEach(a => box.appendChild(button(a.text, a.cls || 'btn-ghost', a.onClick)));
    els.overlay.hidden = false;
  }
  function hideSheet() { els.overlay.hidden = true; }
  els.overlay.addEventListener('click', (e) => { if (e.target === els.overlay) hideSheet(); });

  async function loadGiftImage() {
    if (!offerId || !initData) return;
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/gift-image`, { headers: { 'X-Telegram-Init-Data': initData } });
      if (!res.ok) return;
      const blob = await res.blob();
      els.giftImage.src = URL.createObjectURL(blob);
      els.giftImage.hidden = false;
      els.giftFallback.hidden = true;
    } catch (_) {}
  }

  function renderBase(o) {
    offer = o;
    els.screen.classList.remove('skeleton-card');
    els.giftName.textContent = o.gift.name;
    els.price.textContent = `${o.price.value} ${o.price.currency === 'звёзд' ? '⭐' : o.price.currency}`;
    startTimer(o.seconds_left);
  }

  function statusScreen(icon, title, text, buttonText = 'Закрыть') {
    clearInterval(timerHandle);
    els.pageTitle.textContent = 'GiftRelayer';
    els.screen.innerHTML = `<div class="status-screen"><div class="status-icon">${icon}</div><h2>${title}</h2><p>${text}</p></div>`;
    setActions(button(buttonText, 'btn-primary', close));
  }

  function openBuyer() {
    if (!offer?.creator?.link) return;
    haptic();
    try { tg?.openTelegramLink(offer.creator.link); }
    catch (_) { location.href = offer.creator.link; }
  }

  async function doAccept(btn) {
    btn.disabled = true; haptic('medium');
    try {
      const body = await api(`/api/offers/${encodeURIComponent(offerId)}/accept`, { method: 'POST' });
      offer = body.offer; renderAccepted(offer);
    } catch (e) {
      if (e.body?.code === 'own_offer') {
        showSheet('Нельзя принять собственное предложение', 'Этот оффер был создан вами.', [{ text: 'Закрыть', cls: 'btn-primary', onClick: close }]);
      } else {
        showSheet('Не удалось принять предложение', e.message, [{ text: 'Понятно', cls: 'btn-primary', onClick: hideSheet }]);
      }
    } finally { btn.disabled = false; }
  }

  function confirmDecline() {
    haptic();
    showSheet('Отклонить предложение?', 'После этого предложение станет недоступно.', [
      { text: 'Отклонить', cls: 'btn-secondary', onClick: doDecline },
      { text: 'Назад', cls: 'btn-ghost', onClick: hideSheet },
    ]);
  }

  async function doDecline() {
    hideSheet();
    try {
      await api(`/api/offers/${encodeURIComponent(offerId)}/decline`, { method: 'POST' });
      haptic('medium');
      statusScreen('❌', 'Предложение отклонено', `Вы отказались от предложения на ${offer.gift.name}. Оффер больше не активен.`);
    } catch (e) {
      showSheet('Не удалось отклонить', e.message, [{ text: 'Понятно', cls: 'btn-primary', onClick: hideSheet }]);
    }
  }

  function renderActive(o) {
    renderBase(o);
    els.pageTitle.textContent = 'Предложение';
    els.statusText.textContent = 'ОФФЕР АКТИВЕН';
    els.subtitle.textContent = 'За ваш подарок предлагают';
    const accept = button('Принять оффер', 'btn-primary', () => doAccept(accept));
    const decline = button('Отклонить', 'btn-secondary', confirmDecline);
    setActions(accept, decline);
  }

  function renderAccepted(o) {
    renderBase(o);
    els.pageTitle.textContent = 'Передача подарка';
    els.statusText.textContent = 'ПРЕДЛОЖЕНИЕ ПРИНЯТО';
    els.subtitle.innerHTML = 'Передайте этот подарок пользователю, который отправил предложение. После передачи вернитесь сюда и подтвердите операцию.';
    const info = document.createElement('div');
    info.className = 'info-box';
    info.innerHTML = `<strong>Кому передать</strong><br>${o.creator.username ? '@' + o.creator.username : 'Покупатель из исходной сделки'}`;
    els.screen.querySelector('.gift-meta')?.appendChild(info);
    const transfer = button('🎁 Передать подарок', 'btn-primary', openBuyer);
    const confirm = button('✅ Подтвердить передачу', 'btn-success', () => verifyTransfer(confirm));
    setActions(transfer, confirm);
  }

  async function verifyTransfer(btn) {
    btn.disabled = true; haptic('medium');
    showSheet('Проверяем передачу…', 'Проверяем владельца подарка через доступные официальные данные Telegram.', [], true);
    try {
      const body = await api(`/api/offers/${encodeURIComponent(offerId)}/confirm-transfer`, { method: 'POST' });
      hideSheet();
      if (body.result === 'VERIFIED') {
        statusScreen('✅', 'Подарок передан', `Передача ${offer.gift.name} успешно подтверждена. Подарок передан покупателю.`);
      } else if (body.result === 'NOT_TRANSFERRED') {
        showSheet('Подарок ещё не передан', `Мы проверили ${offer.gift.name} и пока видим подарок у продавца. Сначала передайте его покупателю, затем повторите проверку.`, [
          { text: '🎁 Передать подарок', cls: 'btn-primary', onClick: () => { hideSheet(); openBuyer(); } },
          { text: 'Попробовать снова', cls: 'btn-ghost', onClick: () => { hideSheet(); verifyTransfer(btn); } },
        ]);
      } else {
        statusScreen('⏳', 'Передача отправлена на проверку', 'Автоматическая проверка этого подарка сейчас недоступна. Информация отправлена администратору на ручную проверку.');
      }
    } catch (e) {
      hideSheet();
      showSheet('Проверка не выполнена', e.message, [{ text: 'Попробовать снова', cls: 'btn-primary', onClick: () => { hideSheet(); verifyTransfer(btn); } }]);
    } finally { btn.disabled = false; }
  }

  function renderOffer(o) {
    if (o.action_blocked === 'OWN_OFFER') {
      renderBase(o);
      setActions();
      showSheet('Нельзя принять собственное предложение', 'Этот оффер был создан вами.', [{ text: 'Закрыть', cls: 'btn-primary', onClick: close }]);
      return;
    }
    if (o.action_blocked === 'NOT_RECIPIENT') {
      statusScreen('🔒', 'Предложение недоступно', 'Этот оффер предназначен другому пользователю.');
      return;
    }
    if (o.status === 'ACTIVE') return renderActive(o);
    if (o.status === 'ACCEPTED') return renderAccepted(o);
    if (o.status === 'DECLINED') return statusScreen('❌', 'Предложение отклонено', `Оффер на ${o.gift.name} больше не активен.`);
    if (o.status === 'TRANSFER_PENDING') return statusScreen('⏳', 'Передача ожидает проверки', 'Информация отправлена на ручную проверку.');
    if (o.status === 'TRANSFER_CONFIRMED') return statusScreen('✅', 'Подарок передан', `Передача ${o.gift.name} подтверждена.`);
    if (o.status === 'EXPIRED') return statusScreen('⏱', 'Срок предложения истёк', 'Этот оффер больше недоступен.');
    return statusScreen('🔒', 'Сделка завершена', 'Этот оффер больше не активен.');
  }

  async function init() {
    if (!tg || !initData) {
      return statusScreen('⚠️', 'Откройте через Telegram', 'Mini App должен быть запущен из официальной кнопки GiftRelayer внутри Telegram.');
    }
    if (!offerId) {
      return statusScreen('⚠️', 'Оффер не выбран', 'Откройте Mini App кнопкой «Принять» под конкретным предложением.');
    }
    try {
      const body = await api(`/api/offers/${encodeURIComponent(offerId)}`);
      renderOffer(body.offer);
      loadGiftImage();
    } catch (e) {
      statusScreen('⚠️', 'Не удалось открыть предложение', e.message || 'Попробуйте открыть оффер снова из Telegram.');
    }
  }

  init();
})();
