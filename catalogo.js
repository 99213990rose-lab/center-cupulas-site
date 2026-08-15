(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5512983216069';

  const references = [
    ['01', '10 × 20 × 11'],
    ['02', '08 × 12 × 11'],
    ['03', '10 × 20 × 15'],
    ['04', '16 × 28 × 19'],
    ['05', '17 × 43 × 27'],
    ['06', '18 × 45 × 31'],
    ['07', '20 × 50 × 31'],
    ['08', '25 × 60 × 35'],
    ['09', '10 × 26 × 17'],
    ['10', '11 × 30 × 20'],
    ['11', '13 × 35 × 23'],
    ['12', '20 × 35 × 25'],
    ['13', '10 × 30 × 15'],
    ['14', '10 × 35 × 23'],
    ['15', '30 × 40 × 35'],
    ['16', '30 × 40 × 30'],
    ['17', '35 × 50 × 40'],
    ['18', '15 × 50 × 33'],
    ['19', '11 × 50 × 27'],
    ['20', '25 × 45 × 33'],
    ['21', '20 × 40 × 30'],
    ['22', '22 × 55 × 36'],
    ['23', '22 × 50 × 34'],
    ['24', '15 × 40 × 27'],
    ['25', '10 × 55 × 28'],
    ['26', '15 × 45 × 26'],
    ['27', '15 × 22 × 16'],
    ['28', '15 × 30 × 20'],
    ['29', '08 × 19 × 14'],
    ['30', '11 × 30 × 16'],
    ['31', '08 × 15 × 11'],
    ['32', '20 × 25 × 20'],
    ['33', '27 × 35 × 26'],
    ['34', '27 × 45 × 33'],
    ['35', '30 × 40 × 25'],
    ['36', '25 × 25 × 15'],
    ['37', '30 × 30 × 20'],
    ['38', '40 × 40 × 25'],
    ['39', '45 × 45 × 30'],
    ['40', '50 × 50 × 35']
  ];

  const formats = [
    { key: 'redonda', label: 'Redonda', artClass: 'shade-art--round' },
    { key: 'quadrada', label: 'Quadrada/Retangular', artClass: 'shade-art--square' }
  ];

  const visualThemes = [
    { tone: 'tone--black', background: '#d8d2ca' },
    { tone: 'tone--white', background: '#e6ddd1' },
    { tone: 'tone--beige', background: '#eee1ce' },
    { tone: 'tone--offwhite', background: '#d9d0c2' },
    { tone: 'tone--ice', background: '#dce2df' },
    { tone: 'tone--gray', background: '#d2d0cc' },
    { tone: 'tone--terracotta', background: '#e3c2b8' },
    { tone: 'tone--blue', background: '#c7d9dd' },
    { tone: 'tone--green', background: '#d2ddd2' },
    { tone: 'tone--gold', background: '#e8d5b7' }
  ];

  const normalize = (value) => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×X]/g, 'x')
    .replace(/\s+/g, '')
    .toLowerCase();

  const products = references.flatMap(([reference, measure], referenceIndex) => (
    formats.map((format, formatIndex) => {
      const theme = visualThemes[(referenceIndex * 2 + formatIndex * 3) % visualThemes.length];
      return {
        reference,
        measure,
        format: format.key,
        formatLabel: format.label,
        artClass: format.artClass,
        tone: theme.tone,
        background: theme.background,
        proportion: `proportion--${referenceIndex % 5}`,
        search: normalize(`${reference} ref ${reference} ${measure} ${format.label}`)
      };
    })
  ));

  const grid = document.querySelector('#catalog-grid');
  const count = document.querySelector('#catalog-count');
  const emptyState = document.querySelector('#empty-state');
  const search = document.querySelector('#catalog-search');
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const clearButton = document.querySelector('[data-clear-catalog]');

  if (!grid || !count || !search) return;

  const state = {
    filter: 'todos',
    search: '',
    selected: null,
    trigger: null
  };

  const createCard = (product, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'model-card';
    card.dataset.format = product.format;
    card.dataset.reference = product.reference;
    card.dataset.search = product.search;
    card.dataset.reveal = 'up';
    card.style.setProperty('--reveal-delay', `${(index % 8) * 45}ms`);
    card.setAttribute('aria-label', `Configurar cúpula ${product.formatLabel}, referência ${product.reference}, medida ${product.measure} centímetros`);
    card.innerHTML = `
      <span class="model-card__visual" data-reference="${product.reference}" style="--card-bg:${product.background}">
        <span class="shade-art ${product.artClass} ${product.tone} ${product.proportion}" aria-hidden="true"><span></span></span>
      </span>
      <span class="model-card__body">
        <span class="model-card__format"><span>${product.formatLabel}</span><span>Ref. ${product.reference}</span></span>
        <strong>${product.measure}</strong>
        <span class="model-card__link">Ver e configurar <span aria-hidden="true">↗</span></span>
      </span>`;
    return card;
  };

  const fragment = document.createDocumentFragment();
  products.forEach((product, index) => fragment.append(createCard(product, index)));
  grid.append(fragment);
  grid.setAttribute('aria-busy', 'false');
  window.CenterCupulas?.observeReveals(grid);

  const applyFilters = () => {
    const query = normalize(state.search);
    let visible = 0;

    [...grid.children].forEach((card) => {
      const matchesFormat = state.filter === 'todos' || card.dataset.format === state.filter;
      const matchesSearch = !query || card.dataset.search.includes(query);
      const show = matchesFormat && matchesSearch;
      card.hidden = !show;
      card.setAttribute('aria-hidden', String(!show));
      if (show) visible += 1;
    });

    count.textContent = `${visible} ${visible === 1 ? 'modelo encontrado' : 'modelos encontrados'}`;
    emptyState.hidden = visible !== 0;
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      applyFilters();
    });
  });

  search.addEventListener('input', () => {
    state.search = search.value;
    applyFilters();
  });

  clearButton?.addEventListener('click', () => {
    state.filter = 'todos';
    state.search = '';
    search.value = '';
    filterButtons.forEach((button) => {
      const active = button.dataset.filter === 'todos';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    applyFilters();
    search.focus();
  });

  const dialog = document.querySelector('#configurator');
  const form = document.querySelector('#configurator-form');
  const closeDialogButton = document.querySelector('[data-dialog-close]');
  const preview = document.querySelector('[data-config-preview]');
  const customColorField = document.querySelector('.custom-color-field');
  const customColorInput = document.querySelector('#custom-color');
  const observations = document.querySelector('#observations');
  const colorInputs = [...document.querySelectorAll('input[name="cor"]')];

  const fields = {
    selectedFormat: document.querySelector('[data-selected-format]'),
    selectedReference: document.querySelector('[data-selected-ref]'),
    selectedMeasure: document.querySelector('[data-selected-measure]'),
    summaryFormat: document.querySelector('[data-summary-format]'),
    summaryReference: document.querySelector('[data-summary-ref]'),
    summaryMeasure: document.querySelector('[data-summary-measure]'),
    summaryColor: document.querySelector('[data-summary-color]')
  };

  const colorTone = {
    Preto: 'tone--black',
    Branco: 'tone--white',
    Bege: 'tone--beige',
    'Off White': 'tone--offwhite',
    Gelo: 'tone--ice',
    Cinza: 'tone--gray',
    Colorido: 'tone--terracotta'
  };

  const getSelectedColor = () => colorInputs.find((input) => input.checked)?.value ?? 'Preto';

  const getColorDescription = () => {
    const selectedColor = getSelectedColor();
    if (selectedColor !== 'Colorido') return selectedColor;
    const customColor = customColorInput.value.trim();
    return customColor ? `Colorido — ${customColor}` : 'Colorido — cor a informar';
  };

  const renderPreview = () => {
    if (!state.selected || !preview) return;
    const tone = colorTone[getSelectedColor()] ?? state.selected.tone;
    preview.innerHTML = `<span class="shade-art ${state.selected.artClass} ${tone} ${state.selected.proportion}" aria-hidden="true"><span></span></span>`;
  };

  const updateSummary = () => {
    if (!state.selected) return;
    fields.summaryFormat.textContent = state.selected.formatLabel;
    fields.summaryReference.textContent = state.selected.reference;
    fields.summaryMeasure.textContent = `${state.selected.measure} cm`;
    fields.summaryColor.textContent = getColorDescription();
    renderPreview();
  };

  const updateColorField = () => {
    const isCustom = getSelectedColor() === 'Colorido';
    customColorField.hidden = !isCustom;
    customColorInput.required = isCustom;
    if (!isCustom) customColorInput.setCustomValidity('');
    updateSummary();
  };

  const openConfigurator = (product, trigger) => {
    if (!dialog || !form) return;
    state.selected = product;
    state.trigger = trigger;
    form.reset();
    customColorField.hidden = true;
    customColorInput.required = false;

    fields.selectedFormat.textContent = product.formatLabel;
    fields.selectedReference.textContent = product.reference;
    fields.selectedMeasure.textContent = `${product.measure} cm`;
    updateSummary();

    document.body.classList.add('dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  const closeConfigurator = () => {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      document.body.classList.remove('dialog-open');
      state.trigger?.focus();
    }
  };

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('.model-card');
    if (!card) return;
    const product = products.find((item) => item.reference === card.dataset.reference && item.format === card.dataset.format);
    if (product) openConfigurator(product, card);
  });

  closeDialogButton?.addEventListener('click', closeConfigurator);
  dialog?.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    state.trigger?.focus();
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closeConfigurator();
  });

  colorInputs.forEach((input) => input.addEventListener('change', updateColorField));
  customColorInput?.addEventListener('input', updateSummary);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.selected) return;

    if (getSelectedColor() === 'Colorido' && !customColorInput.value.trim()) {
      customColorInput.setCustomValidity('Informe a cor desejada.');
    } else {
      customColorInput.setCustomValidity('');
    }

    if (!form.reportValidity()) return;

    const observationText = observations.value.trim();
    const lines = [
      'Olá! Vim pelo catálogo da Center Cúpulas e gostaria de solicitar um orçamento.',
      '',
      `Formato: ${state.selected.formatLabel}`,
      `Referência: ${state.selected.reference}`,
      `Medida: ${state.selected.measure} cm`,
      `Cor: ${getColorDescription()}`,
      `Observações: ${observationText || 'Sem observações'}`
    ];

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const params = new URLSearchParams(window.location.search);
  const requestedFormat = params.get('formato');
  const requestedReference = params.get('ref')?.padStart(2, '0');

  if (requestedFormat && formats.some((format) => format.key === requestedFormat)) {
    state.filter = requestedFormat;
    filterButtons.find((button) => button.dataset.filter === requestedFormat)?.click();
  }

  applyFilters();

  if (requestedFormat && requestedReference) {
    const requestedProduct = products.find((product) => product.format === requestedFormat && product.reference === requestedReference);
    const requestedCard = [...grid.children].find((card) => card.dataset.format === requestedFormat && card.dataset.reference === requestedReference);
    if (requestedProduct && requestedCard) window.setTimeout(() => openConfigurator(requestedProduct, requestedCard), 180);
  }
})();
