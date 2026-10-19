(() => {
  'use strict';

  const ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
  const CEP_ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cep-lookup';
  const WHATSAPP_NUMBER = '5512983216069';
  const cart = window.CenterCupulasCart;

  const itemsHost = document.querySelector('[data-cart-items]');
  const emptyState = document.querySelector('[data-cart-empty]');
  const summary = document.querySelector('[data-cart-summary]');
  const assurance = document.querySelector('[data-cart-assurance]');
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
    if (assurance) assurance.hidden = empty;
    if (checkoutForm) checkoutForm.closest('.checkout-card').hidden = empty;
    if (!itemsHost) return;

    itemsHost.innerHTML = items.map((item) => {
      const snapshot = item.quote_snapshot;
      const rough = snapshot?.unit_price ? money(snapshot.unit_price) + ' / un.' : 'Preço será recalculado';
      // Pictures are only visual references; quote/payment data remains server-calculated.
      const safeImage = /^assets\/catalogo\/variants\/[a-z0-9-]+\.webp$/.test(String(item.preview_image || ''))
        ? item.preview_image : '';
      return '<article class="cart-item" data-cart-id="' + escapeHtml(item.id) + '">' +
        '<div class="cart-item__main">' +
          (safeImage ? '<div class="cart-item__visual"><img src="' + escapeHtml(safeImage) + '" width="112" height="112" loading="lazy" decoding="async" alt="Referência visual da configuração escolhida"><small>Referência visual</small></div>' : '') +
          '<div class="cart-item__details">' +
            '<span class="cart-item__eyebrow">' + escapeHtml(formatLabel(item)) + '</span>' +
            '<h3>' + escapeHtml(item.top + ' × ' + item.bottom + ' × ' + item.height + ' cm') + '</h3>' +
            '<p>' + escapeHtml(item.material + (item.color ? ' · ' + item.color : '')) + '</p>' +
            (item.reference ? '<small>REF. ' + escapeHtml(item.reference) + '</small>' : '') +
          '</div>' +
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
    if (grandTotalLabel) grandTotalLabel.textContent = hasFreight ? 'Total com frete' : 'Total (frete a confirmar)';
    if (grandTotalEl) grandTotalEl.textContent = !Number.isFinite(productTotal)
      ? 'Calculando…' : hasFreight ? money(productTotal + freight) : money(productTotal) + ' + frete';
    if (freightNote) freightNote.textContent = hasFreight
      ? 'Frete da transportadora selecionada, incluído no total do pedido.'
      : 'O valor exibido não inclui a entrega. Nossa equipe confirmará o frete quando não houver cotação automática.';
  };

  const updateCheckoutAvailability = () => {
    if (!checkoutButton) return;
    if (isSubmitting || previewLoading || !preview || preview.status !== 'ok') {
      checkoutButton.disabled = true;
      return;
    }
    checkoutButton.disabled = checkoutProEnabled
      ? (!selectedShipping || preview?.packaging?.status !== 'estimated')
      : Boolean(freightProviderConfigured && freightOptions.length && !selectedShipping);
  };

  const renderFreightState = (data) => {
    if (!shippingBox || !shippingOptionsHost) return;
    shippingBox.hidden = false;
    freightOptions = Array.isArray(data?.options) ? data.options : [];
    freightProviderConfigured = data?.status === 'ok' || data?.status === 'no_options';

    if (data?.error === 'frenet_not_configured') {
      freightProviderConfigured = false;
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = 'em ativação';
      shippingOptionsHost.innerHTML = '<p class="shipping-note"><strong>Frete sob consulta.</strong> Nossa equipe confirmará as opções de transporte e o valor antes de finalizar o pedido.</p>';
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    if (freightOptions.length && data?.calibration !== false) {
      // Show the mean and range of the REAL Frenet offers for this CEP and the
      // estimated packages. They are references only, never payment options.
      const indicative = data?.indicative_estimate;
      const validEstimate = indicative?.payable === false &&
        Number.isInteger(indicative.count) && indicative.count === freightOptions.length &&
        indicative.count > 0 &&
        [indicative.min_price,indicative.mean_price,indicative.max_price].every(value=>
          typeof value === 'number' && Number.isFinite(value) && value >= 0) &&
        indicative.min_price <= indicative.mean_price &&
        indicative.mean_price <= indicative.max_price;
      freightOptions = [];
      freightProviderConfigured = false;
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = 'Frenet · estimativa';
      shippingOptionsHost.innerHTML = validEstimate
        ? '<div class="shipping-note"><strong>Frete estimado: média ' + money(indicative.mean_price) + '.</strong> ' +
          'Faixa de ' + money(indicative.min_price) + ' a ' + money(indicative.max_price) +
          ' em ' + indicative.count + ' opção' + (indicative.count === 1 ? '' : 'ões') + ' da Frenet.' +
          '<p>Consulta para este CEP e a embalagem prevista. O valor final, o serviço e o prazo ' +
          'serão confirmados pela equipe antes de qualquer cobrança. Esta média não é uma tarifa garantida.</p></div>'
        : '<p class="shipping-note"><strong>Frete sob consulta.</strong> A Frenet retornou serviços, ' +
          'mas ainda não há uma estimativa confiável para exibir. A equipe confirmará a entrega.</p>';
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
        '<span class="shipping-option__main"><b>' + escapeHtml(option.carrier || option.service) + '</b><small>' + escapeHtml(option.service || '') + (prazo ? ' · prazo informado: ' + prazo + ' dia' + (prazo === 1 ? '' : 's') : '') + '</small></span>' +
        '<strong>' + money(option.price) + '</strong>' +
      '</label>';
    }).join('') + '<p class="shipping-calibration-note">Escolha a opção de entrega e confira o total antes de pagar.</p>';

    shippingOptionsHost.querySelectorAll('input[name="shipping-service"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedShipping = freightOptions.find((option) => String(option.code) === String(input.value)) || null;
        if (selectedShipping) window.CenterCupulas?.sendWebEvent?.('shipping_option_selected', {
          placement: 'cart_shipping', ctaText: 'option_selected'
        });
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
        progressEl.textContent = discountLabel + ' de desconto aplicado ao valor de fabricação.';
        progressEl.className = 'cart-progress cart-progress--ok';
      } else {
        progressEl.hidden = false;
        progressEl.textContent = 'Faltam ' + money(data.discount?.amount_to_unlock || 0) + ' em produtos para liberar ' + discountLabel + ' de desconto sobre a fabricação.';
        progressEl.className = 'cart-progress';
      }
    }
    if (totalEl) totalEl.textContent = money(data.product_total);
    updateGrandTotal();
    if (packagingSummary && packagingBody) {
      packagingSummary.hidden = false;
      packagingBody.innerHTML = '<p><strong>Embalagem já incluída no preço das cúpulas.</strong> O número de volumes e os detalhes do envio serão definidos pela equipe antes do despacho.</p>';
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
    window.CenterCupulas?.sendWebEvent?.('checkout_attempt', {
      placement: 'cart_checkout', ctaText: checkoutProEnabled ? 'mercado_pago' : 'manual_quote'
    });

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
    setStatus('info', checkoutProEnabled
      ? '<strong>Preparando seu pagamento seguro…</strong><p>Você será direcionado ao Mercado Pago.</p>'
      : '<strong>Enviando seu pedido para a Center Cúpulas…</strong>');

    try {
      if (checkoutProEnabled) {
        if (!selectedShipping) throw new Error('shipping_required');
        const response = await fetch('/api/mercadopago/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ items, customer, shippingSelection: { code: selectedShipping.code, price: Number(selectedShipping.price), productTotal: Number(preview.product_total) } })
        });
        const data = await response.json();
        if (!response.ok || !data.checkout_url) throw new Error(data.error || 'payment_unavailable');
        const url = new URL(data.checkout_url);
        if (url.protocol !== 'https:' || !/(^|\.)mercadopago\.com(\.br)?$/.test(url.hostname)) {
          throw new Error('invalid_payment_url');
        }
        // Save only the signed receipt reference in this browser tab, never personal data.
        // The payment redirect is not proof of an approved transaction.
        try {
          if(data.status_reference && data.status_proof){
            sessionStorage.setItem('center-cupulas-payment-receipt',JSON.stringify({
              reference:data.status_reference,proof:data.status_proof,code:data.quote_code,at:Date.now()
            }));
          }
        } catch { /* Private browsing may disable session storage. Payment still works. */ }
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
      // Never send addresses, contact fields or raw error strings to analytics.
      window.CenterCupulas?.sendWebEvent?.('checkout_error', {
        placement: 'cart_checkout', ctaText: 'checkout_failed'
      });
      const message = error?.message === 'payment_account_authentication_failed'
        ? 'O pagamento está temporariamente indisponível. Nossa equipe está ajustando a conexão com o Mercado Pago.'
        : error?.message === 'payment_account_verification_required'
        ? 'O Mercado Pago solicitou uma atualização cadastral da loja. Tente novamente mais tarde.'
        : error?.message === 'payment_provider_unavailable'
        ? 'O Mercado Pago não conseguiu iniciar o pagamento. Tente novamente em alguns instantes.'
        : error?.message === 'quote_unavailable'
        ? 'Não foi possível concluir a preparação do pedido. Tente novamente.'
        : error?.message === 'price_changed' ? 'O valor foi atualizado. Confira novamente o frete e o total antes de pagar.'
        : error?.message === 'shipping_required' ? 'Escolha um frete válido antes de pagar.'
        : error?.message === 'Escolha uma opção de frete antes de continuar.'
        ? 'Escolha uma opção de frete para enviar o pedido.'
        : 'Revise os dados e tente novamente. Se continuar, fale com a equipe pelo WhatsApp.';
      if (error?.message === 'price_changed') refreshPreview();
      setStatus('error', '<strong>Confira os dados do pedido.</strong><p>' + escapeHtml(message) + '</p>');
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
  const receiptKey = 'center-cupulas-payment-receipt';
  let receipt = null;
  if(['return','pending','failed'].includes(paymentReturn)){
    try {
      const stored=JSON.parse(sessionStorage.getItem(receiptKey)||'null');
      if(stored && typeof stored.reference==='string' && typeof stored.proof==='string' &&
         Number.isFinite(stored.at) && Date.now()-stored.at<24*60*60*1000) receipt=stored;
    } catch { /* no stored receipt */ }
  }

  let statusAttempts=0;
  let statusTimer=null;
  let checkingStatus=false;
  const checkPaymentStatus = async () => {
    if(!receipt || checkingStatus) return;
    checkingStatus=true;
    statusAttempts++;
    try{
      const response=await fetch('/api/mercadopago/order-status',{
        method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
        cache:'no-store',
        body:JSON.stringify({reference:receipt.reference,proof:receipt.proof})
      });
      const result=await response.json();
      if(response.ok && result.state==='confirmed'){
        if(statusTimer)window.clearTimeout(statusTimer);
        try{sessionStorage.removeItem(receiptKey)}catch{}
        receipt=null;
        // Only a verified paid order registered in the production queue clears the cart.
        cart.clear();
        renderItems();
        setStatus('success','<strong>Pagamento confirmado!</strong><p>Pedido '+
          escapeHtml(result.order_code||result.reference_code||'')+
          ' registrado e encaminhado à fila de produção. Obrigado por comprar na Center Cúpulas.</p>');
        return;
      }
      if(response.ok && result.state==='processing'){
        setStatus('info','<strong>Pagamento identificado.</strong><p>Estamos finalizando o registro do pedido na produção. '+
          'Você não precisa pagar novamente.</p><button type="button" class="button" data-check-payment-status>Consultar situação</button>');
      } else if(response.ok && result.state==='pending'){
        setStatus('info','<strong>Aguardando confirmação do Mercado Pago.</strong><p>Se você pagou, '+
          'a atualização pode levar alguns instantes. Não realize outro pagamento enquanto aguarda.</p>'+
          '<button type="button" class="button" data-check-payment-status>Consultar situação</button>');
      } else {
        setStatus('info','<strong>Não foi possível consultar o pedido agora.</strong><p>Seu pagamento '+
          'não será presumido como aprovado. Tente consultar novamente.</p>'+
          '<button type="button" class="button" data-check-payment-status>Consultar situação</button>');
      }
    }catch {
      setStatus('info','<strong>Consulta temporariamente indisponível.</strong>'+
        '<p>Se você pagou, aguarde a confirmação. Não pague novamente enquanto verifica.</p>'+
        '<button type="button" class="button" data-check-payment-status>Consultar situação</button>');
    }finally{
      checkingStatus=false;
      if(receipt && statusAttempts<24 && document.visibilityState!=='hidden'){
        statusTimer=window.setTimeout(checkPaymentStatus,5000);
      }
    }
  };
  statusBox?.addEventListener('click',(event)=>{
    if(event.target?.closest?.('[data-check-payment-status]')){
      if(statusTimer)window.clearTimeout(statusTimer);
      statusAttempts=0;
      void checkPaymentStatus();
    }
  });

  if(paymentReturn==='return'||paymentReturn==='pending'){
    setStatus('info','<strong>Consultando a confirmação do pedido…</strong>'+
      '<p>O Mercado Pago confirma a compra antes da entrada em produção.</p>');
    if(receipt)void checkPaymentStatus();
    else setStatus('info','<strong>Você voltou do Mercado Pago.</strong><p>A confirmação '+
      'depende da aprovação do pagamento. Se pagou, guarde o comprovante.</p>');
  }else if(paymentReturn==='failed'){
    setStatus('warning','<strong>Pagamento não concluído.</strong>'+
      '<p>Seu carrinho foi mantido. Confira a situação no Mercado Pago antes de tentar novamente.</p>');
  }
  renderItems();
  if (cart.read().length) window.CenterCupulas?.sendWebEvent?.('cart_view', {
    placement: 'cart', ctaText: 'cart_has_items'
  });
  refreshPreview();
})();
