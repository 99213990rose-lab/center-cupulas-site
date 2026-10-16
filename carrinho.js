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
  const freightRow = document.querySelector('[data-cart-freight-row]');
  const freightEl = document.querySelector('[data-cart-freight]');
  const grandTotalEl = document.querySelector('[data-cart-grand-total]');
  const checkoutForm = document.querySelector('[data-checkout-form]');
  const checkoutButton = document.querySelector('[data-checkout-submit]');
  const statusBox = document.querySelector('[data-checkout-status]');
  const flowNote = document.querySelector('[data-checkout-flow-note]');
  const freightNote = document.querySelector('[data-cart-freight-note]');
  const grandTotalLabel = document.querySelector('[data-cart-grand-label]');
  const heroDescription = document.querySelector('[data-cart-hero-description]');
  const packagingSummary = document.querySelector('[data-packaging-summary]');
  const packagingBody = document.querySelector('[data-packaging-body]');
  const cepInput = checkoutForm?.querySelector('[name="cep"]');
  const streetInput = checkoutForm?.querySelector('[name="street"]');
  const neighborhoodInput = checkoutForm?.querySelector('[name="neighborhood"]');
  const cityInput = checkoutForm?.querySelector('[name="city"]');
  const stateInput = checkoutForm?.querySelector('[name="state"]');
  const cepStatus = checkoutForm?.querySelector('[data-cep-status]');
  const shippingBox = checkoutForm?.querySelector('[data-shipping-box]');
  const shippingOptionsHost = checkoutForm?.querySelector('[data-shipping-options]');
  const shippingProvider = checkoutForm?.querySelector('[data-shipping-provider]');
  let preview = null;
  let timer = 0;
  let requestSeq = 0;
  let freightRequestSeq = 0;
  let freightOptions = [];
  let selectedShipping = null;
  let freightProviderConfigured = false;
  let checkoutProEnabled = false;
  let previewLoading = false;
  let isSubmitting = false;
  let cepLookupSeq = 0;
  let lastKnownCep = '';
  let autoFilledAddress = {};

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
    statusBox.setAttribute('role', type === 'error' ? 'alert' : 'status');
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

  const updateGrandTotal = () => {
    const hasFreight = selectedShipping && Number.isFinite(Number(selectedShipping.price));
    const productTotal = Number(preview?.product_total);
    const freight = hasFreight ? Number(selectedShipping.price) : 0;
    if (freightEl) freightEl.textContent = hasFreight ? money(freight) : 'A confirmar';
    if (grandTotalLabel) grandTotalLabel.textContent = hasFreight ? 'Total com frete estimado' : 'Total (frete a confirmar)';
    if (grandTotalEl) grandTotalEl.textContent = !Number.isFinite(productTotal)
      ? 'Calculando…' : hasFreight ? money(productTotal + freight) : money(productTotal) + ' + frete';
    if (freightNote) freightNote.textContent = hasFreight
      ? 'Frete estimado com a opção selecionada. O valor será conferido pelo servidor antes de qualquer pagamento.'
      : 'O valor exibido não inclui a entrega. Nossa equipe confirmará o frete quando não houver cotação automática.';
  };

  const updateCheckoutAvailability = () => {
    if (!checkoutButton) return;
    if (isSubmitting || previewLoading || !preview || preview.status !== 'ok') {
      checkoutButton.disabled = true;
      return;
    }
    checkoutButton.disabled = checkoutProEnabled
      ? (!selectedShipping || preview?.packaging?.status !== 'verified')
      : Boolean(freightProviderConfigured && freightOptions.length && !selectedShipping);
  };

  const renderFreightState = (data) => {
    if (!shippingBox || !shippingOptionsHost) return;
    shippingBox.hidden = false;
    freightOptions = Array.isArray(data?.options) ? data.options : [];
    freightProviderConfigured = data?.status === 'ok' || data?.status === 'no_options';

    // Prices calculated from estimated boxes are not an offer to ship at that price.
    // Keep the manual quotation workflow available until physical packing is approved.
    if (data?.calibration === true) {
      freightOptions = [];
      freightProviderConfigured = false;
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = 'sob consulta';
      shippingOptionsHost.innerHTML =
        '<p class="shipping-note"><strong>Frete sob avaliação.</strong> ' +
        'As embalagens deste pedido ainda precisam de medição e confirmação ' +
        'da equipe. Envie seu pedido para receber as opções de transporte antes ' +
        'de qualquer pagamento.</p>';
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    if (data?.error === 'frenet_not_configured') {
      freightProviderConfigured = false;
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = 'em ativação';
      shippingOptionsHost.innerHTML = '<p class="shipping-note"><strong>Frete sob consulta.</strong> Nossa equipe confirmará as opções de transporte e o valor antes de finalizar o pedido.</p>';
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    if (data?.status === 'no_options' || !freightOptions.length) {
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = data?.provider || 'transportadoras';
      shippingOptionsHost.innerHTML = data?.error
        ? '<p class="shipping-note">Não foi possível consultar a entrega agora. Nossa equipe poderá calcular o frete manualmente.</p>'
        : '<p class="shipping-note">Nenhuma opção de entrega automática encontrada para este CEP. Nossa equipe poderá calcular o frete manualmente.</p>';
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    if (shippingProvider) shippingProvider.textContent = data.provider || 'Frenet';
    shippingOptionsHost.innerHTML = freightOptions.map((option, index) => {
      const id = 'shipping-' + index;
      const prazo = Number(option.delivery_days || 0);
      return '<label class="shipping-option" for="' + id + '">' +
        '<input id="' + id + '" type="radio" name="shipping-service" value="' + escapeHtml(option.code) + '">' +
        '<span class="shipping-option__main"><b>' + escapeHtml(option.carrier || option.service) + '</b><small>' + escapeHtml(option.service || '') + (prazo ? ' · até ' + prazo + ' dia' + (prazo === 1 ? '' : 's') : '') + '</small></span>' +
        '<strong>' + money(option.price) + '</strong>' +
      '</label>';
    }).join('') + '<p class="shipping-calibration-note">Prazo e valor estimados com base na embalagem prevista. A confirmação final depende da validação logística.</p>';

    shippingOptionsHost.querySelectorAll('input[name="shipping-service"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedShipping = freightOptions.find((option) => String(option.code) === String(input.value)) || null;
        updateGrandTotal();
        updateCheckoutAvailability();
      });
    });

    updateGrandTotal();
    updateCheckoutAvailability();
  };

  const refreshFreight = async () => {
    const seq = ++freightRequestSeq;
    const cep = onlyDigits(cepInput?.value);
    if (!preview?.packaging?.packages?.length || cep.length !== 8) {
      selectedShipping = null;
      freightOptions = [];
      freightProviderConfigured = false;
      if (shippingBox) shippingBox.hidden = true;
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    selectedShipping = null;
    freightOptions = [];
    if (shippingBox) shippingBox.hidden = false;
    if (shippingProvider) shippingProvider.textContent = 'calculando';
    if (shippingOptionsHost) shippingOptionsHost.innerHTML = '<p class="shipping-note">Consultando transportadoras…</p>';
    updateGrandTotal();
    updateCheckoutAvailability();

    try {
      const response = await fetch('/api/frete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          recipientCep: cep,
          shipmentValue: preview.product_total,
          packages: preview.packaging.packages
        })
      });
      const data = await response.json();
      if (seq !== freightRequestSeq) return;
      if (response.status === 503 && data.error === 'frenet_not_configured') {
        renderFreightState(data);
        return;
      }
      if (!response.ok) {
        renderFreightState({ status: 'no_options', provider: 'Frete', error: 'unavailable' });
        return;
      }
      renderFreightState(data);
    } catch {
      if (seq !== freightRequestSeq) return;
      renderFreightState({ status: 'no_options', provider: 'Frete', error: 'unavailable' });
    }
  };

  const renderPreview = (data) => {
    previewLoading = false;
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
      const discountPercent = Math.max(0, Math.min(99, Number(data.discount?.percent || 0)));
      const discountLabel = discountPercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
      if (discountPercent <= 0) {
        progressEl.textContent = '';
        progressEl.className = 'cart-progress';
        progressEl.hidden = true;
      } else if (data.discount?.unlocked) {
        progressEl.hidden = false;
        progressEl.textContent = discountLabel + ' de desconto aplicado automaticamente.';
        progressEl.className = 'cart-progress cart-progress--ok';
      } else {
        progressEl.hidden = false;
        progressEl.textContent = 'Faltam ' + money(data.discount?.amount_to_unlock || 0) + ' em produtos para liberar ' + discountLabel + ' de desconto.';
        progressEl.className = 'cart-progress';
      }
    }
    if (totalEl) totalEl.textContent = money(data.product_total);
    updateGrandTotal();
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
    updateCheckoutAvailability();
    if (onlyDigits(cepInput?.value).length === 8) refreshFreight();
  };

  const refreshPreview = async () => {
    const items = apiItems();
    const seq = ++requestSeq;
    ++freightRequestSeq;
    selectedShipping = null;
    freightOptions = [];
    freightProviderConfigured = false;
    preview = null;
    previewLoading = items.length > 0;
    updateGrandTotal();
    if (!items.length) {
      if (shippingBox) shippingBox.hidden = true;
      if (checkoutButton) checkoutButton.disabled = true;
      updateGrandTotal();
      return;
    }
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
        previewLoading = false;
        setStatus('warning', '<strong>Este pedido precisa de revisão.</strong><p>Uma das configurações ainda não tem segurança suficiente para preço automático. Você pode falar com a equipe pelo WhatsApp.</p>');
        if (totalEl) totalEl.textContent = 'Sob consulta';
        return;
      }
      if (statusBox && !new URLSearchParams(window.location.search).has('payment')) statusBox.hidden = true;
      renderPreview(data);
    } catch {
      if (seq !== requestSeq) return;
      previewLoading = false;
      setStatus('warning', '<strong>Não foi possível atualizar o preço agora.</strong><p>Tente novamente em instantes ou continue pelo WhatsApp.</p>');
      if (totalEl) totalEl.textContent = 'Indisponível';
    }
  };

  const schedulePreview = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refreshPreview, 180);
  };

  window.addEventListener('center-cart-change', () => {
    ++requestSeq;
    ++freightRequestSeq;
    previewLoading = true;
    preview = null;
    selectedShipping = null;
    freightOptions = [];
    freightProviderConfigured = false;
    updateGrandTotal();
    updateCheckoutAvailability();
    renderItems();
    schedulePreview();
  });

  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

  const formatCep = (value) => {
    const digits = onlyDigits(value).slice(0, 8);
    return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
  };

  const addressFields = {
    street: streetInput,
    neighborhood: neighborhoodInput,
    city: cityInput,
    state: stateInput
  };

  // Remove only values populated by the CEP service; never discard manual edits.
  const clearAutoFilledAddress = () => {
    for (const [field, value] of Object.entries(autoFilledAddress)) {
      if (addressFields[field]?.value === value) addressFields[field].value = '';
    }
    autoFilledAddress = {};
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
    if (lastKnownCep === cep) return;
    const seq = ++cepLookupSeq;
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
      if (seq !== cepLookupSeq || onlyDigits(cepInput.value) !== cep) return;
      if (!response.ok) throw new Error('cep_error');

      clearAutoFilledAddress();
      for (const [field, input] of Object.entries(addressFields)) {
        const value = String(data[field] || '').trim();
        if (input && !input.value.trim() && value) {
          input.value = field === 'state' ? value.toUpperCase().slice(0, 2) : value;
          autoFilledAddress[field] = input.value;
        }
      }
      lastKnownCep = cep;
      if (cepStatus) {
        cepStatus.textContent = 'Endereço encontrado. Confira o número e os demais dados.';
        cepStatus.className = 'field-inline-status is-ok';
      }
      refreshFreight();
    } catch {
      if (seq !== cepLookupSeq || onlyDigits(cepInput.value) !== cep) return;
      if (cepStatus) {
        cepStatus.textContent = 'Não encontramos o CEP. Preencha o endereço manualmente.';
        cepStatus.className = 'field-inline-status is-warning';
      }
    }
  };

  cepInput?.addEventListener('input', () => {
    const cep = onlyDigits(cepInput.value);
    cepInput.value = formatCep(cep);
    ++cepLookupSeq;
    ++freightRequestSeq;
    if (lastKnownCep !== cep) {
      clearAutoFilledAddress();
      lastKnownCep = '';
    }
    selectedShipping = null;
    freightOptions = [];
    freightProviderConfigured = false;
    updateGrandTotal();
    updateCheckoutAvailability();
    if (cep.length === 8) lookupCep();
    else {
      if (shippingBox) shippingBox.hidden = true;
      if (cepStatus) {
        cepStatus.textContent = cep.length ? 'Digite os 8 números do CEP.' : '';
        cepStatus.className = 'field-inline-status';
      }
    }
  });
  cepInput?.addEventListener('blur', lookupCep);

  checkoutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = apiItems();
    if (isSubmitting || !items.length) return;
    if (!checkoutForm.reportValidity()) return;
    isSubmitting = true;

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
    checkoutButton.textContent = checkoutProEnabled ? 'Preparando pagamento…' : 'Enviando…';
    setStatus('info', '<strong>Enviando seu pedido para a Center Cúpulas…</strong>');

    try {
      if (checkoutProEnabled) {
        if (!selectedShipping) throw new Error('shipping_required');
        const response = await fetch('/api/mercadopago/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ items, customer, shippingSelection: { code: selectedShipping.code } })
        });
        const data = await response.json();
        if (!response.ok || !data.checkout_url) throw new Error(data.error || 'payment_unavailable');
        const url = new URL(data.checkout_url);
        if (url.protocol !== 'https:' || !/(^|\.)mercadopago\.com(\.br)?$/.test(url.hostname)) {
          throw new Error('invalid_payment_url');
        }
        // Never treat the browser redirect as payment confirmation; the signed webhook decides.
        window.CenterCupulas?.sendWebEvent?.('cart_checkout_started', { placement: 'cart_checkout', ctaText: data.quote_code });
        window.location.assign(url.href);
        return;
      }
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ action: 'submit', items, customer, shippingSelection: selectedShipping ? { code: selectedShipping.code } : null })
      });
      const data = await response.json();
      if (!response.ok && (data.error === 'shipping_service_required' || data.error === 'shipping_service_invalid')) {
        if (Array.isArray(data.shipping_options)) {
          renderFreightState({ status: 'ok', provider: 'Frenet', options: data.shipping_options });
        } else {
          refreshFreight();
        }
        throw new Error('Escolha uma opção de frete antes de continuar.');
      }
      if (!response.ok || !data.submitted) throw new Error(data.error || 'checkout_error');

      cart.clear();
      const message = [
        'Olá! Acabei de montar um pedido pelo site da Center Cúpulas.',
        '',
        'Código: ' + data.quote_code,
        'Produtos: ' + money(data.product_total),
        'Frete: ' + (data.freight != null ? money(data.freight) : 'a confirmar'),
        'Total: ' + money(data.total),
        '',
        'Gostaria de confirmar os detalhes para produção.'
      ].join('\n');
      const wa = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);

      document.querySelector('[data-checkout-layout]')?.classList.add('is-complete');
      setStatus('success',
        '<strong>Pedido recebido!</strong>' +
        '<p>Seu código é <b>' + escapeHtml(data.quote_code) + '</b>. Produtos: <b>' + money(data.product_total) + '</b>' + (data.freight != null ? ' · Frete: <b>' + money(data.freight) + '</b> · Total: <b>' + money(data.total) + '</b>.' : '. O frete será confirmado pela equipe.') + '</p>' +
        '<a class="button button--whatsapp" href="' + wa + '" target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp <span aria-hidden="true">↗</span></a>'
      );
      window.CenterCupulas?.sendWebEvent?.('cart_checkout_submitted', { placement: 'cart_checkout', ctaText: data.quote_code });
    } catch (error) {
      const message = error?.message === 'shipping_required' ? 'Escolha um frete válido antes de pagar.'
        : error?.message === 'Escolha uma opção de frete antes de continuar.'
        ? 'Escolha uma opção de frete para enviar o pedido.'
        : 'Revise os dados e tente novamente. Se continuar, fale com a equipe pelo WhatsApp.';
      setStatus('error', '<strong>Não conseguimos enviar o pedido.</strong><p>' + escapeHtml(message) + '</p>');
      isSubmitting = false;
      checkoutButton.textContent = checkoutProEnabled ? 'Ir para pagamento seguro' : 'Enviar pedido para confirmação';
      updateCheckoutAvailability();
    }
  });

  // The payment flow is enabled only when the server confirms *all* required
  // production credentials and shipping settings. Otherwise keep WhatsApp quoting.
  (async () => {
    try {
      const response = await fetch('/api/mercadopago/status', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      checkoutProEnabled = data.checkout_enabled === true;
      if (flowNote) flowNote.textContent = checkoutProEnabled
        ? 'Pagamento seguro pelo Mercado Pago. O frete e os valores serão validados antes de cobrar. O pedido só é confirmado após a aprovação.'
        : 'Nenhum pagamento é cobrado nesta etapa. Nossa equipe confirma os detalhes e o frete antes da produção.';
      if (heroDescription) heroDescription.textContent = checkoutProEnabled
        ? 'Confira suas cúpulas e o endereço para calcular o frete. O pagamento será feito com segurança pelo Mercado Pago.'
        : 'Ajuste quantidades e confira os dados. O preço é calculado automaticamente e a entrega é confirmada antes da produção.';
      if (checkoutButton) checkoutButton.textContent = checkoutProEnabled
        ? 'Ir para pagamento seguro' : 'Enviar pedido para confirmação';
      updateCheckoutAvailability();
    } catch { /* the manual quote flow remains available */ }
  })();

  const paymentReturn = new URLSearchParams(window.location.search).get('payment');
  if (paymentReturn === 'return') {
    setStatus('info', '<strong>Você voltou do Mercado Pago.</strong><p>A compra será confirmada somente após a validação automática do pagamento. Guarde seu comprovante.</p>');
  } else if (paymentReturn === 'pending') {
    setStatus('info', '<strong>Pagamento em processamento.</strong><p>A confirmação acontece após a aprovação pelo Mercado Pago.</p>');
  } else if (paymentReturn === 'failed') {
    setStatus('warning', '<strong>Pagamento não concluído.</strong><p>Seu carrinho foi mantido para você tentar novamente.</p>');
  }
  renderItems();
  refreshPreview();
})();