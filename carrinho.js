(() => {
  'use strict';

  const ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
  const PREVIEW_ENDPOINT = '/api/checkout/preview';
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
  const packagingFeeEl = document.querySelector('[data-cart-packaging-fee]');
  const freightEl = document.querySelector('[data-cart-freight]');
  const grandTotalEl = document.querySelector('[data-cart-grand-total]');
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

  const updateGrandTotal = () => {
    const productTotal = Number(preview?.product_total || 0);
    const freight = Number(selectedShipping?.price || 0);
    const boxes = Number(preview?.packaging_fee || 0);
    if (freightEl) freightEl.textContent = selectedShipping ? money(freight) : 'A confirmar';
    if (grandTotalEl) grandTotalEl.textContent = money(productTotal + boxes + freight);
  };

  const updateCheckoutAvailability = () => {
    if (!checkoutButton) return;
    if (!preview || preview.status !== 'ok') {
      checkoutButton.disabled = true;
      return;
    }
    // Somente interface de prévia nesta branch. Nunca criar orçamento com total
    // divergente do custo de embalagem e nunca cobrar antes da calibração.
    checkoutButton.disabled = preview.payment_eligible !== true ||
      preview.packaging?.status !== 'approved' ||
      !selectedShipping ||
      Boolean(freightProviderConfigured && freightOptions.length && !selectedShipping);
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
      shippingOptionsHost.innerHTML = '<p class="shipping-note"><strong>Cotação automática preparada.</strong> Falta apenas ativar a conexão com a transportadora. Por enquanto o frete será confirmado pela equipe.</p>';
      updateGrandTotal();
      updateCheckoutAvailability();
      return;
    }

    if (data?.status === 'no_options' || !freightOptions.length) {
      selectedShipping = null;
      if (shippingProvider) shippingProvider.textContent = data?.provider || 'transportadoras';
      shippingOptionsHost.innerHTML = '<p class="shipping-note">Nenhuma opção automática encontrada para este CEP. A equipe vai cotar o frete manualmente.</p>';
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
    }).join('') + '<p class="shipping-calibration-note">Frete calculado com a embalagem estimada e peso volumétrico conservador. A cobrança online continua bloqueada até a calibração logística.</p>';

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

    const seq = ++freightRequestSeq;
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
          shipmentValue: preview.subtotal_with_packaging || preview.product_total,
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
        renderFreightState({ status: 'no_options', provider: 'Frete' });
        return;
      }
      renderFreightState(data);
    } catch {
      if (seq !== freightRequestSeq) return;
      renderFreightState({ status: 'no_options', provider: 'Frete' });
    }
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
    if (packagingFeeEl) packagingFeeEl.textContent = money(data.packaging_fee);
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
          ? '<p class="packaging-warning">Este pedido não cabe com segurança nas caixas padrão e precisa de revisão manual.</p>'
          : '<p>Caixas padronizadas com custo estimado. Dimensões externas e peso real ainda serão medidos.</p>';
        packagingBody.innerHTML = '<strong>' + Number(data.packaging.package_count || packs.length) + ' volume(s) estimado(s)</strong>' + previewPacks + extra + warning;
      }
    }
    updateCheckoutAvailability();
    if (onlyDigits(cepInput?.value).length === 8) refreshFreight();
  };

  const refreshPreview = async () => {
    const items = apiItems();
    if (!items.length) {
      preview = null;
      selectedShipping = null;
      freightOptions = [];
      freightProviderConfigured = false;
      if (shippingBox) shippingBox.hidden = true;
      if (checkoutButton) checkoutButton.disabled = true;
      updateGrandTotal();
      return;
    }
    const seq = ++requestSeq;
    if (checkoutButton) checkoutButton.disabled = true;
    if (totalEl) totalEl.textContent = 'Calculando…';
    try {
      const response = await fetch(PREVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ items })
      });
      const data = await response.json();
      if (seq !== requestSeq) return;
      if (!response.ok || data.status !== 'ok') {
        setStatus('warning', '<strong>Este pedido precisa de revisão.</strong><p>Uma das configurações ainda não tem segurança suficiente para preço automático. Você pode falar com a equipe pelo WhatsApp.</p>');
        if (totalEl) totalEl.textContent = 'Sob consulta';
        return;
      }
      renderPreview(data);
      if (data.payment_eligible === false) {
        setStatus('info', '<strong>Prévia de compra em testes.</strong><p>Preço das cúpulas + caixas estimadas. A cobrança automática ainda depende da confirmação das embalagens, da precificação e do frete.</p>');
      } else if (statusBox) statusBox.hidden = true;
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
    selectedShipping = null;
    freightOptions = [];
    freightProviderConfigured = false;
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
      refreshFreight();
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
    selectedShipping = null;
    freightOptions = [];
    freightProviderConfigured = false;
    updateGrandTotal();
    if (onlyDigits(cepInput.value).length === 8) lookupCep();
    else if (shippingBox) shippingBox.hidden = true;
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
      const message = error?.message === 'Escolha uma opção de frete antes de continuar.'
        ? 'Escolha uma opção de frete para enviar o pedido.'
        : 'Revise os dados e tente novamente. Se continuar, fale com a equipe pelo WhatsApp.';
      setStatus('error', '<strong>Não conseguimos enviar o pedido.</strong><p>' + escapeHtml(message) + '</p>');
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Enviar pedido para confirmação';
    }
  });

  renderItems();
  refreshPreview();
})();