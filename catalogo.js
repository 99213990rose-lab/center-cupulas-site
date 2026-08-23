(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5512983216069';

  // O terceiro valor é reservado ao arquivo exclusivo da referência, por exemplo "ref-01.png".
  // Enquanto estiver ausente, o card usa apenas o tratamento gráfico neutro.
  const references = [
    ['01', '10 × 20 × 11'], ['02', '08 × 12 × 11'], ['03', '10 × 20 × 15'],
    ['04', '16 × 28 × 19'], ['05', '17 × 43 × 27'], ['06', '18 × 45 × 31'],
    ['07', '20 × 50 × 31'], ['08', '25 × 60 × 35'], ['09', '10 × 26 × 17'],
    ['10', '11 × 30 × 20'], ['11', '13 × 35 × 23'], ['12', '20 × 35 × 25'],
    ['13', '10 × 30 × 15'], ['14', '10 × 35 × 23'], ['15', '30 × 40 × 35'],
    ['16', '30 × 40 × 30'], ['17', '35 × 50 × 40'], ['18', '15 × 50 × 33'],
    ['19', '11 × 50 × 27'], ['20', '25 × 45 × 33'], ['21', '20 × 40 × 30'],
    ['22', '22 × 55 × 36'], ['23', '22 × 50 × 34'], ['24', '15 × 40 × 27'],
    ['25', '10 × 55 × 28'], ['26', '15 × 45 × 26'], ['27', '15 × 22 × 16'],
    ['28', '15 × 30 × 20'], ['29', '08 × 19 × 14'], ['30', '11 × 30 × 16'],
    ['31', '08 × 15 × 11'], ['32', '20 × 25 × 20'], ['33', '27 × 35 × 26'],
    ['34', '27 × 45 × 33'], ['35', '30 × 40 × 25'], ['36', '25 × 25 × 15'],
    ['37', '30 × 30 × 20'], ['38', '40 × 40 × 25'], ['39', '45 × 45 × 30'],
    ['40', '50 × 50 × 35']
  ].map(([reference, measure, image = null]) => {
    const dimensions = measure.split('×').map((value) => Number.parseFloat(value.trim()));
    return {
      reference,
      measure,
      dimensions,
      image,
      expectedImage: 'ref-' + reference + '.png'
    };
  });

  const CATALOG_IMAGE_ROOT = 'assets/catalogo/';

  // Cada formato possui uma fotografia de apresentação e pode receber variantes específicas no futuro.
  // Use chaves no padrão "material__cor" normalizado, por exemplo:
  // variants: { tricoline__preto: 'conica-tricoline-preto.png' }
  const catalogImages = {
    conica: { fallback: 'conica-tricoline-bege.png', variants: {} },
    drum: { fallback: 'drum-tricoline-offwhite.png', variants: {} },
    bell: { fallback: 'bell-tricoline-gelo.png', variants: {} },
    oval: { fallback: 'oval-tricoline-cinza.png', variants: {} },
    'piramidal-quadrada': { fallback: 'piramidal-quadrada-juta.png', variants: {} },
    'piramidal-retangular': { fallback: 'piramidal-retangular-branca.png', variants: {} },
    cubo: { fallback: 'box-reto-preto.png', variants: {} },
    hexagonal: { fallback: 'hexagonal-juta.png', variants: {} },
    octogonal: { fallback: 'octogonal-offwhite.png', variants: {} },
    personalizado: { fallback: '../hero-workshop.jpg', variants: {} }
  };

  const formats = [
    { key: 'conica', label: 'Cônica / Empire', alt: 'Cúpula cônica em perspectiva' },
    { key: 'drum', label: 'Drum / Cilíndrica', alt: 'Cúpula cilíndrica em perspectiva' },
    { key: 'bell', label: 'Bell / Sino', alt: 'Cúpula estilo sino em perspectiva' },
    { key: 'oval', label: 'Oval', alt: 'Cúpula oval em perspectiva' },
    { key: 'piramidal-quadrada', label: 'Piramidal quadrada', alt: 'Cúpula piramidal quadrada em perspectiva' },
    { key: 'piramidal-retangular', label: 'Piramidal retangular', alt: 'Cúpula piramidal retangular em perspectiva' },
    { key: 'cubo', label: 'Cubo / Box reto', alt: 'Cúpula box reta em perspectiva' },
    { key: 'hexagonal', label: 'Hexagonal', alt: 'Cúpula hexagonal em perspectiva' },
    { key: 'octogonal', label: 'Octogonal', alt: 'Cúpula octogonal em perspectiva' },
    { key: 'personalizado', label: 'Projeto personalizado', alt: 'Referência visual de projeto personalizado' }
  ];

  const colors = ['Preto', 'Branco', 'Bege', 'Off White', 'Gelo', 'Cinza', 'Colorido'];
  const colorValues = {
    Preto: '#292827',
    Branco: '#f8f6f0',
    Bege: '#cbb797',
    'Off White': '#ece6d8',
    Gelo: '#dce1df',
    Cinza: '#8d8d8b',
    Colorido: '#a65343',
    'Natural / Juta': '#b9925e'
  };

  const normalize = (value) => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×X]/g, 'x')
    .replace(/[.,;:]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  const getFormat = (key) => formats.find((format) => format.key === key) || formats[0];
  const getCatalogVisual = (format, material = 'Tricoline', color = '') => {
    const imageSet = catalogImages[format.key] || catalogImages.conica;
    const variantKey = normalize(material) + '__' + normalize(color);
    const filename = imageSet.variants[variantKey] || imageSet.fallback;
    return {
      image: CATALOG_IMAGE_ROOT + filename,
      alt: format.alt
    };
  };
  const getReference = (value) => references.find((item) => item.reference === String(value).padStart(2, '0')) || references[0];
  const formatOptions = formats.map((format) => '<option value="' + format.key + '">' + format.label + '</option>').join('');
  const referenceOptions = references.map((item) => '<option value="' + item.reference + '">REF. ' + item.reference + ' - ' + item.measure + ' cm</option>').join('');
  const swatchClass = (color) => 'swatch--' + normalize(color).replace('/', '-');

  const grid = document.querySelector('#catalog-grid');
  const count = document.querySelector('#catalog-count');
  const emptyState = document.querySelector('#empty-state');
  const search = document.querySelector('#catalog-search');
  const clearButton = document.querySelector('[data-clear-catalog]');
  const dialog = document.querySelector('#configurator');
  const closeDialogButton = document.querySelector('[data-dialog-close]');

  if (!grid || !count || !search) return;

  const state = {
    search: '',
    trigger: null
  };

  const createCard = (item, index) => {
    const card = document.createElement('article');
    const visual = item.image
      ? [
          '<span class="model-card__media" data-asset-status="existing">',
            '<img src="' + CATALOG_IMAGE_ROOT + item.image + '" alt="Cúpula correspondente à referência ' + item.reference + ', medida ' + item.measure + ' centímetros" loading="lazy" decoding="async">',
          '</span>'
        ].join('')
      : [
          '<span class="model-card__media model-card__media--pending" data-asset-status="pending" data-expected-image="' + item.expectedImage + '" data-reference="' + item.reference + '" aria-hidden="true">',
            '<span class="reference-placeholder"><i></i><i></i><i></i></span>',
          '</span>'
        ].join('');

    card.className = 'model-card';
    card.dataset.reference = item.reference;
    card.dataset.search = normalize(item.reference + ' ref ' + item.reference + ' ' + item.measure);
    card.dataset.reveal = 'up';
    card.style.setProperty('--reveal-delay', String((index % 6) * 45) + 'ms');
    card.innerHTML = [
      '<button class="model-card__main" type="button" data-card-open aria-label="Configurar referência ' + item.reference + ', medida ' + item.measure + ' centímetros">',
        visual,
        '<span class="model-card__body">',
          '<span class="model-card__eyebrow">REF. ' + item.reference + '</span>',
          '<strong>' + item.measure + ' <small>cm</small></strong>',
          '<span class="model-card__order">Superior × Inferior × Altura</span>',
          '<span class="model-card__link">Configurar esta medida <span aria-hidden="true">↗</span></span>',
        '</span>',
      '</button>'
    ].join('');

    return card;
  };

  const cardFragment = document.createDocumentFragment();
  references.forEach((item, index) => cardFragment.append(createCard(item, index)));
  grid.append(cardFragment);
  grid.setAttribute('aria-busy', 'false');
  window.CenterCupulas?.observeReveals(grid);

  const applySearch = () => {
    const query = normalize(state.search);
    let visible = 0;

    [...grid.children].forEach((card) => {
      const matchesSearch = !query || card.dataset.search.includes(query);
      const show = matchesSearch;
      card.hidden = !show;
      card.setAttribute('aria-hidden', String(!show));
      if (show) visible += 1;
    });

    if (visible === 0) count.textContent = 'Nenhuma referência corresponde à busca';
    else if (query) count.textContent = visible === 1 ? '1 referência encontrada' : visible + ' referências encontradas';
    else count.textContent = references.length + ' referências sugeridas';
    emptyState.hidden = visible !== 0;
  };

  search.addEventListener('input', () => {
    state.search = search.value;
    applySearch();
  });

  clearButton?.addEventListener('click', () => {
    state.search = '';
    search.value = '';
    applySearch();
    search.focus();
  });

  const formMarkup = (prefix, mode) => {
    const isDialog = mode === 'reference';
    const colorMarkup = colors.map((color, index) => [
      '<label>',
        '<input type="radio" name="' + prefix + '-color" value="' + color + '" data-field="color"' + (index === 0 ? ' checked' : '') + '>',
        '<span class="color-swatch ' + swatchClass(color) + '"></span>',
        '<b>' + color + '</b>',
      '</label>'
    ].join('')).join('');

    return [
      '<form class="configuration-form" data-configuration-form novalidate>',
        '<div class="configuration-form__heading">',
          '<p class="eyebrow">' + (isDialog ? 'Ficha da referência' : 'Configurador completo') + '</p>',
          '<h2' + (isDialog ? ' id="configurator-title"' : '') + '>' + (isDialog ? 'Configure este modelo' : 'Defina sua configuração') + '</h2>',
          '<p>Formatos e medidas personalizados passam por avaliação técnica da fábrica antes da confirmação do pedido.</p>',
        '</div>',
        '<fieldset class="config-step">',
          '<legend><span>01</span> Formato</legend>',
          '<label class="select-field"><span>Geometria / formato</span><select data-field="format">' + formatOptions + '</select></label>',
          '<label class="form-field custom-format-field" hidden><span>Descreva o formato desejado</span><input type="text" maxlength="100" data-field="custom-format" placeholder="Ex.: formato orgânico assimétrico"></label>',
        '</fieldset>',
        '<fieldset class="config-step">',
          '<legend><span>02</span> Material</legend>',
          '<div class="segmented-options">',
            '<label><input type="radio" name="' + prefix + '-material" value="Juta" data-field="material" checked><span><b>Juta</b><small>Natural e rústica</small></span></label>',
            '<label><input type="radio" name="' + prefix + '-material" value="Tricoline" data-field="material"><span><b>Tricoline</b><small>Tecido em cores variadas</small></span></label>',
          '</div>',
          '<p class="material-note" data-material-note>Juta possui cor natural única e trama aberta.</p>',
        '</fieldset>',
        '<fieldset class="config-step color-fieldset" data-color-step>',
          '<legend><span>03</span> Cor</legend>',
          '<div class="juta-color" data-juta-color><span class="color-swatch swatch--natural-juta"></span><b>Natural / Juta</b></div>',
          '<div class="color-options" data-tricoline-colors hidden>' + colorMarkup + '</div>',
          '<label class="form-field custom-color-field" hidden><span>Qual cor você procura?</span><input type="text" maxlength="60" data-field="custom-color" placeholder="Ex.: azul petróleo"></label>',
        '</fieldset>',
        '<fieldset class="config-step">',
          '<legend><span>04</span> Medidas</legend>',
          '<div class="measure-mode">',
            '<label><input type="radio" name="' + prefix + '-measure-mode" value="suggested" data-field="measure-mode" checked><span>Usar medida sugerida</span></label>',
            '<label><input type="radio" name="' + prefix + '-measure-mode" value="custom" data-field="measure-mode"><span>Informar minhas medidas</span></label>',
          '</div>',
          '<label class="select-field suggested-measure-field"><span>Referência sugerida</span><select data-field="reference">' + referenceOptions + '</select></label>',
          '<div class="custom-measures" hidden>',
            '<label><span>Medida superior <small>(cm)</small></span><input type="number" min="0.1" step="0.1" inputmode="decimal" data-field="upper" placeholder="Ex.: 20"></label>',
            '<label><span>Medida inferior <small>(cm)</small></span><input type="number" min="0.1" step="0.1" inputmode="decimal" data-field="lower" placeholder="Ex.: 40"></label>',
            '<label><span>Altura <small>(cm)</small></span><input type="number" min="0.1" step="0.1" inputmode="decimal" data-field="height" placeholder="Ex.: 30"></label>',
          '</div>',
          '<p class="field-help">As medidas seguem a ordem: superior × inferior × altura.</p>',
        '</fieldset>',
        '<fieldset class="config-step">',
          '<legend><span>05</span> Observações</legend>',
          '<label class="form-field"><span>Detalhes adicionais <small>(opcional)</small></span><textarea rows="4" maxlength="500" data-field="observations" placeholder="Descreva detalhes importantes para a avaliação."></textarea></label>',
        '</fieldset>',
        '<section class="config-summary" aria-label="Resumo da configuração" aria-live="polite">',
          '<p><span>06</span> Resumo</p>',
          '<dl>',
            '<div><dt>Formato</dt><dd data-summary="format"></dd></div>',
            '<div><dt>Material</dt><dd data-summary="material"></dd></div>',
            '<div><dt>Cor</dt><dd data-summary="color"></dd></div>',
            '<div><dt>Referência</dt><dd data-summary="reference"></dd></div>',
            '<div><dt>Medida superior</dt><dd data-summary="upper"></dd></div>',
            '<div><dt>Medida inferior</dt><dd data-summary="lower"></dd></div>',
            '<div><dt>Altura</dt><dd data-summary="height"></dd></div>',
            '<div class="summary-observations"><dt>Observações</dt><dd data-summary="observations"></dd></div>',
          '</dl>',
        '</section>',
        '<p class="viability-notice"><strong>Atenção:</strong> a configuração será analisada pela fábrica para confirmação da viabilidade de produção.</p>',
        '<button class="button button--whatsapp button--full" type="submit">Solicitar avaliação pelo WhatsApp <span aria-hidden="true">↗</span></button>',
      '</form>'
    ].join('');
  };

  const setupConfigurator = (host, index) => {
    const mode = host.dataset.mode;
    const prefix = 'config-' + mode + '-' + index;
    host.innerHTML = formMarkup(prefix, mode);

    const form = host.querySelector('[data-configuration-form]');
    const preview = host.closest('.builder-layout, .configurator__shell')?.querySelector('[data-product-preview]');
    const fields = {
      format: form.querySelector('[data-field="format"]'),
      customFormat: form.querySelector('[data-field="custom-format"]'),
      customFormatField: form.querySelector('.custom-format-field'),
      material: [...form.querySelectorAll('[data-field="material"]')],
      color: [...form.querySelectorAll('[data-field="color"]')],
      customColor: form.querySelector('[data-field="custom-color"]'),
      customColorField: form.querySelector('.custom-color-field'),
      jutaColor: form.querySelector('[data-juta-color]'),
      tricolineColors: form.querySelector('[data-tricoline-colors]'),
      materialNote: form.querySelector('[data-material-note]'),
      measureMode: [...form.querySelectorAll('[data-field="measure-mode"]')],
      reference: form.querySelector('[data-field="reference"]'),
      suggestedMeasureField: form.querySelector('.suggested-measure-field'),
      customMeasures: form.querySelector('.custom-measures'),
      upper: form.querySelector('[data-field="upper"]'),
      lower: form.querySelector('[data-field="lower"]'),
      height: form.querySelector('[data-field="height"]'),
      observations: form.querySelector('[data-field="observations"]')
    };

    const checkedValue = (items) => items.find((item) => item.checked)?.value;
    const summary = (key, value) => {
      const element = form.querySelector('[data-summary="' + key + '"]');
      if (element) element.textContent = value;
    };

    const getConfiguration = () => {
      const selectedFormat = getFormat(fields.format.value);
      const material = checkedValue(fields.material) || 'Juta';
      const selectedColor = checkedValue(fields.color) || 'Preto';
      const color = material === 'Juta'
        ? 'Natural / Juta'
        : selectedColor === 'Colorido'
          ? (fields.customColor.value.trim() || 'Colorido — cor a informar')
          : selectedColor;
      const measureMode = checkedValue(fields.measureMode) || 'suggested';
      const reference = getReference(fields.reference.value);
      const dimensions = measureMode === 'suggested'
        ? reference.dimensions.map(String)
        : [fields.upper.value.trim(), fields.lower.value.trim(), fields.height.value.trim()];

      return {
        format: fields.format.value === 'personalizado' && fields.customFormat.value.trim()
          ? 'Projeto personalizado — ' + fields.customFormat.value.trim()
          : selectedFormat.label,
        formatData: selectedFormat,
        material,
        color,
        measureMode,
        reference,
        upper: dimensions[0] || 'A informar',
        lower: dimensions[1] || 'A informar',
        height: dimensions[2] || 'A informar',
        observations: fields.observations.value.trim()
      };
    };

    const updatePreview = (configuration) => {
      if (!preview) return;
      const image = preview.querySelector('[data-preview-image]');
      const format = preview.querySelector('[data-preview-format]');
      const material = preview.querySelector('[data-preview-material]');
      const visual = getCatalogVisual(configuration.formatData, configuration.material, configuration.color);
      image.src = visual.image;
      image.alt = visual.alt;
      format.textContent = configuration.format;
      material.textContent = configuration.material + ' · ' + configuration.color;
      preview.dataset.material = configuration.material.toLowerCase();
      preview.style.setProperty('--selected-color', colorValues[configuration.color] || colorValues.Colorido);
    };

    const update = () => {
      const material = checkedValue(fields.material) || 'Juta';
      const selectedColor = checkedValue(fields.color) || 'Preto';
      const isJuta = material === 'Juta';
      const isColorful = !isJuta && selectedColor === 'Colorido';
      const customFormat = fields.format.value === 'personalizado';
      const customMeasure = checkedValue(fields.measureMode) === 'custom';
      const configuration = getConfiguration();

      fields.customFormatField.hidden = !customFormat;
      fields.customFormat.required = customFormat;
      fields.jutaColor.hidden = !isJuta;
      fields.tricolineColors.hidden = isJuta;
      fields.color.forEach((input) => { input.disabled = isJuta; });
      fields.customColorField.hidden = !isColorful;
      fields.customColor.required = isColorful;
      fields.materialNote.textContent = isJuta
        ? 'Juta possui cor natural única e trama aberta.'
        : 'Tricoline possui trama mais fechada e permite cores variadas.';
      fields.suggestedMeasureField.hidden = customMeasure;
      fields.reference.disabled = customMeasure;
      fields.customMeasures.hidden = !customMeasure;
      [fields.upper, fields.lower, fields.height].forEach((input) => {
        input.disabled = !customMeasure;
        input.required = customMeasure;
      });

      summary('format', configuration.format);
      summary('material', configuration.material);
      summary('color', configuration.color);
      summary('reference', customMeasure ? 'Não utilizada' : 'REF. ' + configuration.reference.reference);
      summary('upper', configuration.upper + (configuration.upper === 'A informar' ? '' : ' cm'));
      summary('lower', configuration.lower + (configuration.lower === 'A informar' ? '' : ' cm'));
      summary('height', configuration.height + (configuration.height === 'A informar' ? '' : ' cm'));
      summary('observations', configuration.observations || 'Sem observações');
      updatePreview(configuration);
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      update();
      if (!form.reportValidity()) return;

      const configuration = getConfiguration();
      const lines = [
        'Olá! Montei uma configuração no site da Center Cúpulas e gostaria de solicitar uma avaliação/orçamento.',
        '',
        'Formato: ' + configuration.format,
        'Material: ' + configuration.material,
        'Cor: ' + configuration.color,
        'Medida superior: ' + configuration.upper + ' cm',
        'Medida inferior: ' + configuration.lower + ' cm',
        'Altura: ' + configuration.height + ' cm'
      ];

      if (configuration.measureMode === 'suggested') lines.push('Referência: REF. ' + configuration.reference.reference);
      if (configuration.observations) lines.push('Observações: ' + configuration.observations);
      lines.push('', 'Estou ciente de que a configuração será avaliada pela fábrica para confirmação da viabilidade de produção.');

      window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener,noreferrer');
    });

    const setConfiguration = (configuration = {}) => {
      const reference = getReference(configuration.reference || fields.reference.value);
      fields.reference.value = reference.reference;
      fields.format.value = getFormat(configuration.format).key;
      fields.material.forEach((input) => { input.checked = input.value === (configuration.material || 'Juta'); });
      fields.color.forEach((input) => { input.checked = input.value === (configuration.color || 'Preto'); });
      fields.measureMode.forEach((input) => { input.checked = input.value === (configuration.measureMode || 'suggested'); });
      fields.customFormat.value = '';
      fields.customColor.value = configuration.customColor || '';
      fields.upper.value = '';
      fields.lower.value = '';
      fields.height.value = '';
      fields.observations.value = '';
      update();
    };

    setConfiguration({ reference: '01', format: 'conica', material: 'Juta', color: 'Preto' });
    return { form, setConfiguration, update };
  };

  const configurators = [...document.querySelectorAll('[data-configurator-host]')].map(setupConfigurator);
  const dialogConfigurator = configurators.find((item) => item.form.closest('dialog'));
  const pageConfigurator = configurators.find((item) => !item.form.closest('dialog'));

  const openConfigurator = (reference, trigger, settings = {}) => {
    if (!dialog || !dialogConfigurator) return;
    state.trigger = trigger;
    dialogConfigurator.setConfiguration({
      reference: reference.reference,
      format: settings.format || 'conica',
      material: settings.material || 'Juta',
      color: settings.color || 'Preto'
    });
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
    if (!event.target.closest('[data-card-open]')) return;
    const reference = getReference(card.dataset.reference);
    openConfigurator(reference, event.target.closest('button'));
  });

  closeDialogButton?.addEventListener('click', closeConfigurator);
  dialog?.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    state.trigger?.focus();
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closeConfigurator();
  });

  applySearch();

  const requestedReference = new URLSearchParams(window.location.search).get('ref');
  if (requestedReference) {
    const reference = getReference(requestedReference);
    const requestedCard = grid.querySelector('[data-reference="' + reference.reference + '"]');
    if (requestedCard) window.setTimeout(() => openConfigurator(reference, requestedCard.querySelector('[data-card-open]')), 180);
  }

  document.querySelector('a[href="#monte"]')?.addEventListener('click', () => {
    window.setTimeout(() => pageConfigurator?.form.querySelector('[data-field="format"]')?.focus(), 450);
  });
})();
