(() => {
  'use strict';

  const ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
  const CEP_ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cep-lookup';
  const WHATSAPP_NUMBER = '5512983216069';
  const cart = window.CenterCupulasCart;

  const itemsHost = document.querySelector('[data-cart-items]');
  const emptyState = document.querySelector('[data-cart-empty]');
  const summary = document.querySelector('[data-cart-summary]');
  const subtotalEl = document.querySelector('[data-cart-subtotal]');
  const discountRow = document.querySelector('[data-cart-discount-row]');
  const discountEl = document.querySelector('[data-cart-discount]');
  const progressEl = document.querySelector('[data-cart-progress]');
  const totalEl = document.querySelector('[data-cart-total]');
  const checkoutForm = document.querySelector('[data-checkout-form]');
  const checkoutButton = document.querySelector('[data-checkout-submit]');
  const statusBox = document.querySelector('[data-checkout-status]');
  const packagingSummary = document.querySelector('[data-packaging-summary]');
  const packagingBody = document.querySelector('[data-packaging-body]');
  const cepInput = checkoutForm?.querySelector('[name="cep"]');
  const streetInput = checkoutForm?.querySelector('[name="street"]');
  const neighborhoodInput = checkoutForm?.querySelector('[name="neighborhood"]');
  const cityInput = checkoutForm?.querySelector('[name="city"]');
  const stateInput = checkoutForm?.querySelector('[name="state"]');
  const cepStatus = checkoutForm?.querySelector('[data-cep-status]');
  let preview = null;
  let timer = 0;
  let requestSeq = 0;

  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const formatLabel = (item) => item.format_label || ({
    conica: 'Cônica / Empire',
    drum: 'Drum / Cilíndrica',
    bell: 'Bell / Sino',
    oval: 'Oval',
    'piramidal-quadrada': 'Piramidal quadrada',
    cubo: 'Box reto / Quadrada'
  }[item.format] || item.format);

  const apiItems = () => cart.read().map((item) => ({
    id: item.id,
    format: item.format,
    format_label: item.format_label,
    material: item.material,
    color: item.color,
    top: Number(item.top),
    bottom: Number(item.bottom),
    height: Number(item.height),
    quantity: Number(item.quantity || 1),
    reference: item.reference || null,
    observations: item.observations || ''
  }));

  const setStatus = (type, html) => {
    if (!statusBox) return;
    statusBox.className = 'checkout-status checkout-status--' + type;
    statusBox.innerHTML = html;
    statusBox.hidden = false;
  };

  const renderItems = () => {
    const items = cart.read();
    const empty = items.length === 0;
    if (emptyState) emptyState.hidden = !empty;
    if (summary) summary.hidden = empty;
    if (checkoutForm) checkoutForm.closest('.checkout-card').hidden = empty;
    if (!itemsHost) return;

    itemsHost.innerHTML = items.map((item) => {
      const snapshot = item.quote_snapshot;
      const rough = snapshot?.unit_price ? money(snapshot.unit_price) + ' / un.' : 'Preço será recalculado';
      return '<article class="cart-item" data-cart-id="' + escapeHtml(item.id) + '">' +
        '<div class="cart-item__main">' +
          '<span class="cart-item__eyebrow">' + escapeHtml(formatLabel(item)) + '</span>' +
          '<h3>' + escapeHtml(item.top + ' × ' + item.bottom + ' × ' + item.height + ' cm') + '</h3>' +
          '<p>' + escapeHtml(item.material + (item.color ? ' · ' + item.color : '')) + '</p>' +
          (item.reference ? '<small>REF. ' + escapeHtml(item.reference) + '</small>' : '') +
        '</div>' +
        '<div class="cart-item__controls">' +
          '<label>Quantidade<input type="number" min="1" max="500" step="1" value="' + Number(item.quantity || 1) + '" data-cart-qty></label>' +
          '<strong data-cart-line>' + rough + '</strong>' +
          '<button type="button" class="cart-remove" data-cart-remove>Remover</button>' +
        '</div>' +
      '</article>';
    }).join('');

    itemsHost.querySelectorAll('[data-cart-id]').forEach((row) => {
      const id = row.dataset.cartId;
      row.querySelector('[data-cart-qty]')?.addEventListener('change', (event) => {
        cart.setQuantity(id, event.target.value);
      });
      row.querySelector('[data-cart-remove]')?.addEventListener('click', () => {
        cart.remove(id);
      });
    });
  };

  const renderPreview = (data) => {
    preview = data;
    if (!data || data.status !== 'ok') return;
    const byId = new Map((data.items || []).map((item) => [item.id, item]));
    document.querySelectorAll('[data-cart-id]').forEach((row) => {
      const priced = byId.get(row.dataset.cartId);
      const line = row.querySelector('[data-cart-line]');
      if (priced && line) line.textContent = money(priced.line_total);
    });
    if (subtotalEl) subtotalEl.textContent = money(data.subtotal_before_discount);
    if (discountRow) discountRow.hidden = !data.discount?.unlocked;
    if (discountEl) discountEl.textContent = data.discount?.unlocked ? '- ' + money(data.discount.amount) : money(0);
    if (progressEl) {
      if (data.discount?.unlocked) {
        progressEl.textContent = '10% de desconto aplicado automaticamente.';
        progressEl.className = 'cart-progress cart-progress--ok';
      } else {
        progressEl.textContent = 'Faltam ' + money(data.discount?.amount_to_unlock || 0) + ' em produtos para liberar 10% de desconto.';
        progressEl.className = 'cart-progress';
      }
    }
    if (totalEl) totalEl.textContent = money(data.product_total);
    if (packagingSummary && packagingBody && data.packaging) {
      packagingSummary.hidden = false;
      const packs = Array.isArray(data.packaging.packages) ? data.packaging.packages : [];
      if (!packs.length) {
        packagingBody.innerHTML = '<p>Embalagem a confirmar manualmente.</p>';
      } else {
        const previewPacks = packs.slice(0, 6).map((pack, index) => {
          const d = pack.dimensions_cm || {};
          return '<div class="packaging-line"><span>Volume ' + (index + 1) + ' · ' + Number(pack.units || 1) + (Number(pack.units || 1) === 1 ? ' peça' : ' peças') + '</span><b>' +
            Number(d.width || 0) + ' × ' + Number(d.length || 0) + ' × ' + Number(d.height || 0) + ' cm</b></div>';
        }).join('');
        const extra = packs.length > 6 ? '<p>+' + (packs.length - 6) + ' volume(s) adicionais.</p>' : '';
        const warning = data.packaging.status === 'review'
          ? '<p class="packaging-warning">A embalagem precisa de revisão manual antes da cotação do frete.</p>'
          : '<p>Prévia para organizar o frete. Medidas da caixa serão confirmadas pela fábrica.</p>';
        packagingBody.innerHTML = '<strong>' + Number(data.packaging.package_count || packs.length) + ' volume(s) estimado(s)</strong>' + previewPacks + extra + warning;
      }
    }
    if (checkoutButton) checkoutButton.disabled = false;
  };

  const refreshPreview = async () => {
    const items = apiItems();
    if (!items.length) {
      preview = null;
      if (checkoutButton) checkoutButton.disabled = true;
      return;
    }
    const seq = ++requestSeq;
    if (checkoutButton) checkoutButton.disabled = true;
    if (totalEl) totalEl.textContent = 'Calculando…';
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ action: 'preview', items })
      });
      const data = await response.json();
      if (seq !== requestSeq) return;
      if (!response.ok || data.status !== 'ok') {
        setStatus('warning', '<strong>Este pedido precisa de revisão.</strong><p>Uma das configurações ainda não tem segurança suficiente para preço automático. Você pode falar com a equipe pelo WhatsApp.</p>');
        if (totalEl) totalEl.textContent = 'Sob consulta';
        return;
      }
      if (statusBox) statusBox.hidden = true;
      renderPreview(data);
    } catch {
      if (seq !== requestSeq) return;
      setStatus('warning', '<strong>Não foi possível atualizar o preço agora.</strong><p>Tente novamente em instantes ou continue pelo WhatsApp.</p>');
      if (totalEl) totalEl.textContent = 'Indisponível';
    }
  };

  const schedulePreview = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refreshPreview, 180);
  };

  window.addEventListener('center-cart-change', () => {
    renderItems();
    schedulePreview();
  });

  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

  const formatCep = (value) => {
    const digits = onlyDigits(value).slice(0, 8);
    return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
  };

  const lookupCep = async () => {
    if (!cepInput) return;
    const cep = onlyDigits(cepInput.value);
    cepInput.value = formatCep(cep);
    if (cep.length !== 8) {
      if (cepStatus) {
        cepStatus.textContent = cep.length ? 'Digite os 8 números do CEP.' : '';
        cepStatus.className = 'field-inline-status';
      }
      return;
    }

    if (cepStatus) {
      cepStatus.textContent = 'Buscando endereço…';
      cepStatus.className = 'field-inline-status is-loading';
    }

    try {
      const response = await fetch(CEP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ cep })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'cep_error');
      if (streetInput && !streetInput.value.trim()) streetInput.value = data.street || '';
      if (neighborhoodInput && !neighborhoodInput.value.trim()) neighborhoodInput.value = data.neighborhood || '';
      if (cityInput) cityInput.value = data.city || cityInput.value;
      if (stateInput) stateInput.value = data.state || stateInput.value;
      if (cepStatus) {
        cepStatus.textContent = 'Endereço encontrado.';
        cepStatus.className = 'field-inline-status is-ok';
      }
      checkoutForm?.querySelector('[name="number"]')?.focus();
    } catch {
      if (cepStatus) {
        cepStatus.textContent = 'Não encontramos o CEP. Preencha o endereço manualmente.';
        cepStatus.className = 'field-inline-status is-warning';
      }
    }
  };

  cepInput?.addEventListener('input', () => {
    cepInput.value = formatCep(cepInput.value);
    if (onlyDigits(cepInput.value).length === 8) lookupCep();
  });
  cepInput?.addEventListener('blur', lookupCep);

  checkoutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = apiItems();
    if (!items.length) return;
    if (!checkoutForm.reportValidity()) return;

    const formData = new FormData(checkoutForm);
    const customer = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      cep: formData.get('cep'),
      street: formData.get('street'),
      number: formData.get('number'),
      complement: formData.get('complement'),
      neighborhood: formData.get('neighborhood'),
      city: formData.get('city'),
      state: formData.get('state'),
      notes: formData.get('notes')
    };

    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Enviando…';
    setStatus('info', '<strong>Enviando seu pedido para a Center Cúpulas…</strong>');

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ action: 'submit', items, customer })
      });
      const data = await response.json();
      if (!response.ok || !data.submitted) throw new Error(data.error || 'checkout_error');

      cart.clear();
      const message = [
        'Olá! Acabei de montar um pedido pelo site da Center Cúpulas.',
        '',
        'Código: ' + data.quote_code,
        'Produtos: ' + money(data.product_total),
        'Frete: a confirmar',
        '',
        'Gostaria de confirmar os detalhes para produção.'
      ].join('\n');
      const wa = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);

      document.querySelector('[data-checkout-layout]')?.classList.add('is-complete');
      setStatus('success',
        '<strong>Pedido recebido!</strong>' +
        '<p>Seu código é <b>' + escapeHtml(data.quote_code) + '</b>. O valor dos produtos ficou em <b>' + money(data.product_total) + '</b>. Seu endereço e a prévia de embalagem foram registrados para a próxima etapa de frete.</p>' +
        '<a class="button button--whatsapp" href="' + wa + '" target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp <span aria-hidden="true">↗</span></a>'
      );
      window.CenterCupulas?.sendWebEvent?.('cart_checkout_submitted', { placement: 'cart_checkout', ctaText: data.quote_code });
    } catch {
      setStatus('error', '<strong>Não conseguimos enviar o pedido.</strong><p>Revise os dados e tente novamente. Se continuar, fale com a equipe pelo WhatsApp.</p>');
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Enviar pedido para confirmação';
    }
  });

  renderItems();
  refreshPreview();
})();