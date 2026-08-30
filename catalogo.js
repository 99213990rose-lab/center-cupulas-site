(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5512983216069';

  // O terceiro valor é reservado ao arquivo exclusivo da referência, por exemplo "referencias/ref-01.webp".
  // Enquanto estiver ausente, o card usa apenas o tratamento gráfico neutro.
  const references = [
    ['01', '11 × 27 × 18', 'referencias/ref-01.webp', 1920, 1080, 'conica'], ['02', '13 × 30 × 20', 'referencias/ref-02.webp', 1920, 1080, 'conica'], ['03', '35 × 35 × 23', 'referencias/ref-03.webp', 1920, 1080, 'drum'],
    ['04', '28 × 28 × 19', 'referencias/ref-04.webp', 1920, 1080, 'drum'], ['05', '43 × 43 × 27', 'referencias/ref-05.webp', 1920, 1080, 'drum'], ['06', '18 × 45 × 31', 'referencias/ref-06.webp', 1920, 1080, 'bell'],
    ['07', '50 × 50 × 31', 'referencias/ref-07.webp', 1920, 1080, 'drum'], ['08', '25 × 60 × 35', 'referencias/ref-08.webp', 1920, 1080, 'piramidal-quadrada'], ['09', '26 × 26 × 17', 'referencias/ref-09.webp', 1920, 1080, 'cubo'],
    ['10', '30 × 30 × 20', 'referencias/ref-10.webp', 1920, 1080, 'octogonal'], ['11', '13 × 35 × 23', 'referencias/ref-11.webp', 1672, 941, 'conica'], ['12', '20 × 35 × 25', 'referencias/ref-12.webp', 1672, 941, 'conica'],
    ['13', '10 × 30 × 15', 'referencias/ref-13.webp', 1672, 941, 'conica'], ['14', '10 × 35 × 23', 'referencias/ref-14.webp', 1672, 941, 'conica'], ['15', '30 × 40 × 35', 'referencias/ref-15.webp', 1672, 941, 'conica'],
    ['16', '30 × 40 × 30', 'referencias/ref-16.webp', 1672, 941, 'conica'], ['17', '35 × 50 × 40', 'referencias/ref-17.webp', 1672, 941, 'conica'], ['18', '15 × 50 × 33', 'referencias/ref-18.webp', 1672, 941, 'conica'],
    ['19', '11 × 50 × 27', 'referencias/ref-19.webp', 1672, 941, 'conica'], ['20', '25 × 45 × 33', 'referencias/ref-20.webp', 1672, 941, 'conica'], ['21', '20 × 40 × 30', 'referencias/ref-21.webp', 1920, 1080, 'conica'],
    ['22', '22 × 55 × 36', 'referencias/ref-22.webp', 1920, 1080, 'piramidal-retangular'], ['23', '22 × 50 × 34', 'referencias/ref-23.webp', 1920, 1080, 'conica'], ['24', '15 × 40 × 27', 'referencias/ref-24.webp', 1920, 1080, 'piramidal-retangular'],
    ['25', '10 × 55 × 28', 'referencias/ref-25.webp', 1920, 1080, 'conica'], ['26', '15 × 45 × 26', 'referencias/ref-26.webp', 1920, 1080, 'conica'], ['27', '22 × 22 × 16', 'referencias/ref-27.webp', 1920, 1080, 'drum'],
    ['28', '15 × 30 × 20', 'referencias/ref-28.webp', 1920, 1080, 'piramidal-quadrada'], ['29', '08 × 19 × 14', 'referencias/ref-29.webp', 1920, 1080, 'piramidal-quadrada'], ['30', '11 × 30 × 16', 'referencias/ref-30.webp', 1920, 1080, 'conica'],
    ['31', '08 × 15 × 11', 'referencias/ref-31.webp', 1920, 1080, 'conica'], ['32', '20 × 25 × 20', 'referencias/ref-32.webp', 1920, 1080, 'conica'], ['33', '27 × 35 × 26', 'referencias/ref-33.webp', 1920, 1080, 'conica'],
    ['34', '27 × 45 × 33', 'referencias/ref-34.webp', 1920, 1080, 'conica'], ['35', '30 × 40 × 25', 'referencias/ref-35.webp', 1920, 1080, 'conica'], ['36', '25 × 25 × 15', 'referencias/ref-36.webp', 1920, 1080, 'drum'],
    ['37', '26 × 30 × 20', 'referencias/ref-37.webp', 1920, 1080, 'conica'], ['38', '40 × 40 × 25', 'referencias/ref-38.webp', 1920, 1080, 'drum'], ['39', '45 × 45 × 30', 'referencias/ref-39.webp', 1920, 1080, 'drum'],
    ['40', '40 × 50 × 35', 'referencias/ref-40.webp', 1920, 1080, 'conica']
  ].map(([reference, measure, image = null, imageWidth = 1200, imageHeight = 675, formatKey = 'conica']) => {
    const dimensions = measure.split('×').map((value) => Number.parseFloat(value.trim()));
    return {
      reference,
      measure,
      dimensions,
      image,
      imageWidth,
      imageHeight,
      formatKey,
      expectedImage: 'ref-' + reference + '.webp'
    };
  });

  const CATALOG_IMAGE_ROOT = 'assets/catalogo/';

  // Cada formato possui uma fotografia de apresentação e variantes por material e cor.
  // As chaves seguem o padrão "material__cor" normalizado.
  const catalogImages = {
    conica: {
      fallback: 'variants/conica-tricoline-bege.webp',
      variants: {
        juta__jutanatural: 'variants/conica-juta-natural.webp',
        tricoline__preto: 'variants/conica-tricoline-preto.webp',
        tricoline__branco: 'variants/conica-tricoline-branco.webp',
        tricoline__bege: 'variants/conica-tricoline-bege.webp',
        tricoline__offwhite: 'variants/conica-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/conica-tricoline-gelo.webp',
        tricoline__cinza: 'variants/conica-tricoline-cinza.webp',
        tricoline__colorido: 'variants/conica-tricoline-colorido.webp'
      }
    },
    drum: {
      fallback: 'variants/drum-tricoline-offwhite.webp',
      variants: {
        juta__jutanatural: 'variants/drum-juta-natural.webp',
        tricoline__preto: 'variants/drum-tricoline-preto.webp',
        tricoline__branco: 'variants/drum-tricoline-branco.webp',
        tricoline__bege: 'variants/drum-tricoline-bege.webp',
        tricoline__offwhite: 'variants/drum-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/drum-tricoline-gelo.webp',
        tricoline__cinza: 'variants/drum-tricoline-cinza.webp',
        tricoline__colorido: 'variants/drum-tricoline-colorido.webp'
      }
    },
    bell: {
      fallback: 'variants/bell-tricoline-gelo.webp',
      variants: {
        juta__jutanatural: 'variants/bell-juta-natural.webp',
        tricoline__preto: 'variants/bell-tricoline-preto.webp',
        tricoline__branco: 'variants/bell-tricoline-branco.webp',
        tricoline__bege: 'variants/bell-tricoline-bege.webp',
        tricoline__offwhite: 'variants/bell-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/bell-tricoline-gelo.webp',
        tricoline__cinza: 'variants/bell-tricoline-cinza.webp',
        tricoline__colorido: 'variants/bell-tricoline-colorido.webp'
      }
    },
    oval: {
      fallback: 'variants/oval-tricoline-cinza.webp',
      variants: {
        juta__jutanatural: 'variants/oval-juta-natural.webp',
        tricoline__preto: 'variants/oval-tricoline-preto.webp',
        tricoline__branco: 'variants/oval-tricoline-branco.webp',
        tricoline__bege: 'variants/oval-tricoline-bege.webp',
        tricoline__offwhite: 'variants/oval-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/oval-tricoline-gelo.webp',
        tricoline__cinza: 'variants/oval-tricoline-cinza.webp',
        tricoline__colorido: 'variants/oval-tricoline-colorido.webp'
      }
    },
    'piramidal-quadrada': {
      fallback: 'variants/piramidal-quadrada-juta-natural.webp',
      variants: {
        juta__jutanatural: 'variants/piramidal-quadrada-juta-natural.webp',
        tricoline__preto: 'variants/piramidal-quadrada-tricoline-preto.webp',
        tricoline__branco: 'variants/piramidal-quadrada-tricoline-branco.webp',
        tricoline__bege: 'variants/piramidal-quadrada-tricoline-bege.webp',
        tricoline__offwhite: 'variants/piramidal-quadrada-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/piramidal-quadrada-tricoline-gelo.webp',
        tricoline__cinza: 'variants/piramidal-quadrada-tricoline-cinza.webp',
        tricoline__colorido: 'variants/piramidal-quadrada-tricoline-colorido.webp'
      }
    },
    'piramidal-retangular': {
      fallback: 'variants/piramidal-retangular-tricoline-branco.webp',
      variants: {
        juta__jutanatural: 'variants/piramidal-retangular-juta-natural.webp',
        tricoline__preto: 'variants/piramidal-retangular-tricoline-preto.webp',
        tricoline__branco: 'variants/piramidal-retangular-tricoline-branco.webp',
        tricoline__bege: 'variants/piramidal-retangular-tricoline-bege.webp',
        tricoline__offwhite: 'variants/piramidal-retangular-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/piramidal-retangular-tricoline-gelo.webp',
        tricoline__cinza: 'variants/piramidal-retangular-tricoline-cinza.webp',
        tricoline__colorido: 'variants/piramidal-retangular-tricoline-colorido.webp'
      }
    },
    cubo: {
      fallback: 'variants/box-reto-tricoline-preto.webp',
      variants: {
        juta__jutanatural: 'variants/box-reto-juta-natural.webp',
        tricoline__preto: 'variants/box-reto-tricoline-preto.webp',
        tricoline__branco: 'variants/box-reto-tricoline-branco.webp',
        tricoline__bege: 'variants/box-reto-tricoline-bege.webp',
        tricoline__offwhite: 'variants/box-reto-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/box-reto-tricoline-gelo.webp',
        tricoline__cinza: 'variants/box-reto-tricoline-cinza.webp',
        tricoline__colorido: 'variants/box-reto-tricoline-colorido.webp'
      }
    },
    hexagonal: {
      fallback: 'variants/hexagonal-juta-natural.webp',
      variants: {
        juta__jutanatural: 'variants/hexagonal-juta-natural.webp',
        tricoline__preto: 'variants/hexagonal-tricoline-preto.webp',
        tricoline__branco: 'variants/hexagonal-tricoline-branco.webp',
        tricoline__bege: 'variants/hexagonal-tricoline-bege.webp',
        tricoline__offwhite: 'variants/hexagonal-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/hexagonal-tricoline-gelo.webp',
        tricoline__cinza: 'variants/hexagonal-tricoline-cinza.webp',
        tricoline__colorido: 'variants/hexagonal-tricoline-colorido.webp'
      }
    },
    octogonal: {
      fallback: 'variants/octogonal-tricoline-offwhite.webp',
      variants: {
        juta__jutanatural: 'variants/octogonal-juta-natural.webp',
        tricoline__preto: 'variants/octogonal-tricoline-preto.webp',
        tricoline__branco: 'variants/octogonal-tricoline-branco.webp',
        tricoline__bege: 'variants/octogonal-tricoline-bege.webp',
        tricoline__offwhite: 'variants/octogonal-tricoline-offwhite.webp',
        tricoline__gelo: 'variants/octogonal-tricoline-gelo.webp',
        tricoline__cinza: 'variants/octogonal-tricoline-cinza.webp',
        tricoline__colorido: 'variants/octogonal-tricoline-colorido.webp'
      }
    },
    personalizado: { fallback: 'variants/projeto-personalizado.webp', variants: {} }
  };

  const formats = [
    { key: 'conica', label: 'Cônica / Empire', alt: 'Cúpula cônica em perspectiva' },
    { key: 'drum', label: 'Drum / Cilíndrica', alt: 'Cúpula cilíndrica em perspectiva' },
    { key: 'bell', label: 'Bell / Sino', alt: 'Cúpula estilo sino em perspectiva' },
    { key: 'oval', label: 'Oval', alt: 'Cúpula oval em perspectiva' },
    { key: 'piramidal-quadrada', label: 'Piramidal quadrada', alt: 'Cúpula piramidal quadrada em perspectiva' },
    { key: 'piramidal-retangular', label: 'Piramidal retangular', alt: 'Cúpula piramidal retangular em perspectiva' },
    { key: 'cubo', label: 'Box reto / Quadrada', alt: 'Cúpula box reta quadrada em perspectiva' },
    { key: 'hexagonal', label: 'Hexagonal', alt: 'Cúpula hexagonal em perspectiva' },
    { key: 'octogonal', label: 'Octogonal', alt: 'Cúpula octogonal em perspectiva' },
    { key: 'personalizado', label: 'Projeto personalizado', alt: 'Conceito de cúpula personalizada com geometria futurista' }
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
    const format = getFormat(item.formatKey);
    const imageAlt = 'Cúpula ' + format.label + ' da REF. ' + item.reference + ', medida ' + item.measure + ' cm';
    const visual = item.image
      ? [
          '<span class="model-card__media" data-asset-status="existing">',
            '<img src="' + CATALOG_IMAGE_ROOT + item.image + '" alt="' + imageAlt + '" width="' + item.imageWidth + '" height="' + item.imageHeight + '" loading="lazy" decoding="async">',
          '</span>'
        ].join('')
      : [
          '<span class="model-card__media model-card__media--pending" data-asset-status="pending" data-expected-image="' + item.expectedImage + '" data-reference="' + item.reference + '" aria-hidden="true">',
            '<span class="reference-placeholder"><i></i><i></i><i></i></span>',
          '</span>'
        ].join('');

    card.className = 'model-card';
    card.dataset.reference = item.reference;
    card.dataset.format = format.key;
    card.dataset.search = normalize(item.reference + ' ref ' + item.reference + ' ' + item.measure + ' ' + format.key + ' ' + format.label);
    card.dataset.reveal = 'up';
    card.style.setProperty('--reveal-delay', String((index % 6) * 45) + 'ms');
    card.innerHTML = [
      '<button class="model-card__main" type="button" data-card-open aria-label="Configurar REF. ' + item.reference + ', formato ' + format.label + ', medida ' + item.measure + ' centímetros">',
        visual,
        '<span class="model-card__body">',
          '<span class="model-card__eyebrow">REF. ' + item.reference + '</span>',
          '<strong>' + item.measure + ' <small>cm</small></strong>',
          '<span class="model-card__order">Superior × Inferior × Altura</span>',
          '<span class="model-card__link" aria-hidden="true">↗</span>',
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
    const formatMarkup = formats.map((format, index) => {
      const visual = getCatalogVisual(format);
      const mediaAlt = format.key === 'personalizado' ? visual.alt : '';
      const media = '<img src="' + visual.image + '" alt="' + mediaAlt + '" loading="lazy" decoding="async">';

      return [
        '<label class="format-choice">',
          '<input type="radio" name="' + prefix + '-format" value="' + format.key + '" data-field="format"' + (index === 0 ? ' checked' : '') + '>',
          '<span class="format-choice__card">', media, '<b>' + format.label + '</b></span>',
        '</label>'
      ].join('');
    }).join('');

    const colorMarkup = colors.map((color, index) => [
      '<label class="color-choice">',
        '<input type="radio" name="' + prefix + '-color" value="' + color + '" data-field="color"' + (index === 0 ? ' checked' : '') + '>',
        '<span><i class="color-swatch ' + swatchClass(color) + '"></i><b>' + color + '</b></span>',
      '</label>'
    ].join('')).join('');

    return [
      '<form class="configuration-form configuration-wizard" data-configuration-form novalidate>',
        '<div class="configuration-form__heading">',
          '<p class="eyebrow" data-configuration-eyebrow>' + (isDialog ? 'Configuração da referência' : 'Configurador de produto') + '</p>',
          '<h2' + (isDialog ? ' id="configurator-title"' : '') + ' data-configuration-title>' + (isDialog ? 'Configure esta medida' : 'Defina sua cúpula') + '</h2>',
        '</div>',
        '<ol class="config-progress" aria-label="Etapas da configuração">',
          '<li class="is-current" data-step-indicator="0" aria-current="step"><span>1</span><b>Formato</b></li>',
          '<li data-step-indicator="1"><span>2</span><b>Material e cor</b></li>',
          '<li data-step-indicator="2"><span>3</span><b>Medidas</b></li>',
          '<li data-step-indicator="3"><span>4</span><b>Resumo</b></li>',
        '</ol>',
        '<div class="config-panels">',
          '<section class="config-panel" data-config-panel="0">',
            '<fieldset aria-describedby="' + prefix + '-error-0">',
              '<legend tabindex="-1" data-step-title><span>Etapa 1</span> Escolha o formato</legend>',
              '<div class="format-options">' + formatMarkup + '</div>',
              '<label class="form-field custom-format-field" hidden><span>Descreva o formato desejado</span><input type="text" maxlength="100" data-field="custom-format" placeholder="Ex.: formato orgânico assimétrico"></label>',
            '</fieldset>',
            '<p class="config-error" id="' + prefix + '-error-0" data-step-error role="alert" hidden></p>',
          '</section>',
          '<section class="config-panel" data-config-panel="1" hidden>',
            '<fieldset aria-describedby="' + prefix + '-error-1">',
              '<legend tabindex="-1" data-step-title><span>Etapa 2</span> Escolha o material e a cor</legend>',
              '<div class="material-options">',
                '<label><input type="radio" name="' + prefix + '-material" value="Juta" data-field="material" checked><span><b>Juta</b><small>Acabamento natural</small></span></label>',
                '<label><input type="radio" name="' + prefix + '-material" value="Tricoline" data-field="material"><span><b>Tricoline</b><small>Disponível em várias cores</small></span></label>',
              '</div>',
              '<p class="material-note" data-material-note>Juta é oferecida somente na cor natural.</p>',
              '<div class="juta-color" data-juta-color><span class="color-swatch swatch--natural-juta"></span><b>Juta natural</b></div>',
              '<div class="color-options" data-tricoline-colors hidden>' + colorMarkup + '</div>',
              '<label class="form-field custom-color-field" hidden><span>Cor desejada</span><input type="text" maxlength="60" data-field="custom-color" placeholder="Ex.: azul petróleo"></label>',
            '</fieldset>',
            '<p class="config-error" id="' + prefix + '-error-1" data-step-error role="alert" hidden></p>',
          '</section>',
          '<section class="config-panel" data-config-panel="2" hidden>',
            '<fieldset aria-describedby="' + prefix + '-error-2">',
              '<legend tabindex="-1" data-step-title><span>Etapa 3</span> Informe as medidas <button class="measure-help__toggle" type="button" aria-label="Como informar as medidas" aria-expanded="false" aria-controls="' + prefix + '-measure-help" data-measure-help-toggle><span aria-hidden="true">ⓘ</span></button></legend>',
              '<div class="measure-help" id="' + prefix + '-measure-help" data-measure-help hidden>',
                '<div class="measure-help__header"><strong>Superior × Inferior × Altura</strong><button type="button" aria-label="Fechar ajuda sobre as medidas" data-measure-help-close>×</button></div>',
                '<dl>',
                  '<div><dt>Superior</dt><dd>Medida da parte superior da cúpula.</dd></div>',
                  '<div><dt>Inferior</dt><dd>Medida da parte inferior da cúpula.</dd></div>',
                  '<div><dt>Altura</dt><dd>Distância vertical entre a parte superior e a inferior.</dd></div>',
                '</dl>',
                '<p>Todas as medidas são informadas em centímetros.</p>',
              '</div>',
              '<div class="measure-mode">',
                '<label><input type="radio" name="' + prefix + '-measure-mode" value="suggested" data-field="measure-mode" checked><span><b>Usar referência sugerida</b><small>Escolha uma das 40 medidas</small></span></label>',
                '<label><input type="radio" name="' + prefix + '-measure-mode" value="custom" data-field="measure-mode"><span><b>Medidas personalizadas</b><small>Informe as três dimensões</small></span></label>',
              '</div>',
              '<label class="select-field suggested-measure-field"><span>Referência sugerida</span><select data-field="reference">' + referenceOptions + '</select></label>',
              '<div class="custom-measures" hidden>',
                '<label><span>Superior <small>(cm)</small></span><input type="number" min="1" step="1" inputmode="numeric" data-field="upper" placeholder="Ex.: 20"></label>',
                '<label><span>Inferior <small>(cm)</small></span><input type="number" min="1" step="1" inputmode="numeric" data-field="lower" placeholder="Ex.: 40"></label>',
                '<label><span>Altura <small>(cm)</small></span><input type="number" min="1" step="1" inputmode="numeric" data-field="height" placeholder="Ex.: 30"></label>',
              '</div>',
              '<p class="field-help"><strong>Ordem obrigatória:</strong> Superior × Inferior × Altura, em centímetros.</p>',
              '<label class="form-field observations-field"><span>Observações <small>(opcional)</small></span><textarea rows="3" maxlength="500" data-field="observations" placeholder="Inclua somente detalhes relevantes para a avaliação."></textarea></label>',
            '</fieldset>',
            '<p class="config-error" id="' + prefix + '-error-2" data-step-error role="alert" hidden></p>',
          '</section>',
          '<section class="config-panel" data-config-panel="3" hidden>',
            '<div class="config-summary" aria-label="Resumo da configuração" aria-live="polite">',
              '<div class="config-summary__heading" tabindex="-1" data-step-title><span>Etapa 4</span><h3>Revise sua configuração</h3></div>',
              '<dl>',
                '<div><dt>Formato</dt><dd data-summary="format"></dd></div>',
                '<div><dt>Material</dt><dd data-summary="material"></dd></div>',
                '<div><dt>Cor</dt><dd data-summary="color"></dd></div>',
                '<div data-reference-summary><dt>Referência</dt><dd data-summary="reference"></dd></div>',
                '<div><dt>Medida</dt><dd data-summary="measure"></dd></div>',
                '<div class="summary-observations"><dt>Observações</dt><dd data-summary="observations"></dd></div>',
              '</dl>',
              '<p class="viability-notice">Formatos e medidas personalizados passam por avaliação técnica da fábrica antes da confirmação do pedido.</p>',
            '</div>',
          '</section>',
        '</div>',
        '<div class="config-navigation">',
          '<button class="button button--secondary" type="button" data-step-previous hidden>Anterior</button>',
          '<span data-step-status aria-live="polite">Etapa 1 de 4</span>',
          '<button class="button button--dark" type="button" data-step-next>Continuar <span aria-hidden="true">→</span></button>',
          '<button class="button button--whatsapp" type="submit" data-step-submit hidden>Solicitar avaliação pelo WhatsApp <span aria-hidden="true">↗</span></button>',
        '</div>',
      '</form>'
    ].join('');
  };

  const setupConfigurator = (host, index) => {
    const mode = host.dataset.mode;
    const prefix = 'config-' + mode + '-' + index;
    host.innerHTML = formMarkup(prefix, mode);

    const form = host.querySelector('[data-configuration-form]');
    const preview = host.closest('.builder-layout, .configurator__shell')?.querySelector('[data-product-preview]');
    const panels = [...form.querySelectorAll('[data-config-panel]')];
    const indicators = [...form.querySelectorAll('[data-step-indicator]')];
    const previousButton = form.querySelector('[data-step-previous]');
    const nextButton = form.querySelector('[data-step-next]');
    const submitButton = form.querySelector('[data-step-submit]');
    const stepStatus = form.querySelector('[data-step-status]');
    const fields = {
      format: [...form.querySelectorAll('[data-field="format"]')],
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
      observations: form.querySelector('[data-field="observations"]'),
      measureHelpToggle: form.querySelector('[data-measure-help-toggle]'),
      measureHelp: form.querySelector('[data-measure-help]'),
      measureHelpClose: form.querySelector('[data-measure-help-close]'),
      headingEyebrow: form.querySelector('[data-configuration-eyebrow]'),
      headingTitle: form.querySelector('[data-configuration-title]')
    };
    let currentStep = 0;
    const defaultEyebrow = mode === 'reference' ? 'Configuração da referência' : 'Configurador de produto';
    const defaultTitle = mode === 'reference' ? 'Configure esta medida' : 'Defina sua cúpula';

    const checkedValue = (items) => items.find((item) => item.checked)?.value;
    const getPositiveInteger = (input) => {
      const rawValue = input.value.trim();
      if (!/^\d+$/.test(rawValue)) return null;
      const value = Number(rawValue);
      return Number.isInteger(value) && value > 0 ? value : null;
    };
    const summary = (key, value) => {
      const element = form.querySelector('[data-summary="' + key + '"]');
      if (element) element.textContent = value;
    };

    const getConfiguration = () => {
      const formatKey = checkedValue(fields.format) || 'conica';
      const selectedFormat = getFormat(formatKey);
      const material = checkedValue(fields.material) || 'Juta';
      const selectedColor = checkedValue(fields.color) || 'Preto';
      const color = material === 'Juta'
        ? 'Juta natural'
        : selectedColor === 'Colorido'
          ? (fields.customColor.value.trim() || 'Colorido — cor a informar')
          : selectedColor;
      const measureMode = checkedValue(fields.measureMode) || 'suggested';
      const reference = getReference(fields.reference.value);
      const dimensions = measureMode === 'suggested'
        ? reference.measure.split('×').map((value) => value.trim())
        : [fields.upper, fields.lower, fields.height].map((input) => {
            const value = getPositiveInteger(input);
            return value === null ? '' : String(value);
          });

      return {
        format: formatKey === 'personalizado' && fields.customFormat.value.trim()
          ? 'Projeto personalizado — ' + fields.customFormat.value.trim()
          : selectedFormat.label,
        formatData: selectedFormat,
        material,
        color,
        visualColor: material === 'Juta' ? 'Juta natural' : selectedColor,
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
      const visual = getCatalogVisual(configuration.formatData, configuration.material, configuration.visualColor);
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
      const formatKey = checkedValue(fields.format) || 'conica';
      const isJuta = material === 'Juta';
      const isColorful = !isJuta && selectedColor === 'Colorido';
      const customFormat = formatKey === 'personalizado';
      const customMeasure = checkedValue(fields.measureMode) === 'custom';
      const configuration = getConfiguration();

      fields.customFormatField.hidden = !customFormat;
      fields.customFormat.required = customFormat;
      fields.headingEyebrow.textContent = customFormat ? 'Projeto personalizado' : defaultEyebrow;
      fields.headingTitle.textContent = customFormat ? 'Defina seu projeto' : defaultTitle;
      fields.jutaColor.hidden = !isJuta;
      fields.tricolineColors.hidden = isJuta;
      fields.color.forEach((input) => { input.disabled = isJuta; });
      fields.customColorField.hidden = !isColorful;
      fields.customColor.required = isColorful;
      fields.materialNote.textContent = isJuta
        ? 'Juta é oferecida somente na cor natural.'
        : 'Tricoline permite escolher entre as cores disponíveis ou informar outra cor.';
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
      summary('reference', customMeasure ? '' : 'REF. ' + configuration.reference.reference);
      summary('measure', [configuration.upper, configuration.lower, configuration.height].join(' × ') + (configuration.upper === 'A informar' ? '' : ' cm'));
      summary('observations', configuration.observations || 'Sem observações');
      const referenceSummary = form.querySelector('[data-reference-summary]');
      if (referenceSummary) referenceSummary.hidden = customMeasure;
      updatePreview(configuration);
    };

    const clearStepError = (step) => {
      const panel = panels[step];
      const error = panel?.querySelector('[data-step-error]');
      if (error) {
        error.hidden = true;
        error.textContent = '';
      }
      panel?.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-describedby');
      });
    };

    const validateStep = (step) => {
      update();
      clearStepError(step);
      const panel = panels[step];
      if (step === 2 && checkedValue(fields.measureMode) === 'custom') {
        const measureFields = [fields.upper, fields.lower, fields.height];
        const invalidMeasures = measureFields.filter((field) => getPositiveInteger(field) === null);
        if (invalidMeasures.length) {
          const error = panel.querySelector('[data-step-error]');
          error.textContent = 'Informe as três medidas usando apenas números inteiros em centímetros.';
          error.hidden = false;
          invalidMeasures.forEach((field) => {
            field.setAttribute('aria-invalid', 'true');
            field.setAttribute('aria-describedby', error.id);
          });
          invalidMeasures[0].focus();
          return false;
        }
      }
      const invalidField = [...panel.querySelectorAll('input:enabled, select:enabled, textarea:enabled')]
        .find((field) => !field.checkValidity());
      if (!invalidField) return true;

      const error = panel.querySelector('[data-step-error]');
      error.textContent = invalidField.validationMessage || 'Revise o campo indicado antes de continuar.';
      error.hidden = false;
      invalidField.setAttribute('aria-invalid', 'true');
      invalidField.setAttribute('aria-describedby', error.id);
      invalidField.focus();
      return false;
    };

    const showStep = (step, focusHeading = true) => {
      currentStep = Math.max(0, Math.min(step, panels.length - 1));
      panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== currentStep; });
      indicators.forEach((indicator, indicatorIndex) => {
        indicator.classList.toggle('is-current', indicatorIndex === currentStep);
        indicator.classList.toggle('is-complete', indicatorIndex < currentStep);
        if (indicatorIndex === currentStep) indicator.setAttribute('aria-current', 'step');
        else indicator.removeAttribute('aria-current');
      });
      previousButton.hidden = currentStep === 0;
      nextButton.hidden = currentStep === panels.length - 1;
      submitButton.hidden = currentStep !== panels.length - 1;
      stepStatus.textContent = 'Etapa ' + (currentStep + 1) + ' de ' + panels.length;
      update();
      if (focusHeading) panels[currentStep].querySelector('[data-step-title]')?.focus({ preventScroll: true });
    };

    const setMeasureHelpOpen = (open, restoreFocus = false) => {
      fields.measureHelp.hidden = !open;
      fields.measureHelpToggle.setAttribute('aria-expanded', String(open));
      if (!open && restoreFocus) fields.measureHelpToggle.focus();
    };

    form.addEventListener('input', (event) => {
      if (event.target.matches('[aria-invalid="true"]')) clearStepError(currentStep);
      update();
    });
    form.addEventListener('change', update);
    fields.measureHelpToggle.addEventListener('click', () => {
      setMeasureHelpOpen(fields.measureHelp.hidden);
    });
    fields.measureHelpToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setMeasureHelpOpen(fields.measureHelp.hidden);
    });
    fields.measureHelpClose.addEventListener('click', () => {
      setMeasureHelpOpen(false, true);
    });
    fields.measureHelpClose.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setMeasureHelpOpen(false, true);
    });
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || fields.measureHelp.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      setMeasureHelpOpen(false, true);
    });
    previousButton.addEventListener('click', () => showStep(currentStep - 1));
    nextButton.addEventListener('click', () => {
      if (validateStep(currentStep)) showStep(currentStep + 1);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (currentStep < panels.length - 1) {
        if (validateStep(currentStep)) showStep(currentStep + 1);
        return;
      }

      for (let step = 0; step < panels.length - 1; step += 1) {
        showStep(step, false);
        if (!validateStep(step)) {
          return;
        }
      }
      showStep(panels.length - 1, false);

      const configuration = getConfiguration();
      const lines = [
        'Olá, vim pelo catálogo da Center Cúpulas e gostaria de solicitar a avaliação desta configuração.',
        '',
        'Formato: ' + configuration.format,
        'Material: ' + configuration.material,
        'Cor: ' + configuration.color
      ];

      if (configuration.measureMode === 'suggested') lines.push('Referência: REF. ' + configuration.reference.reference);
      lines.push('Medida (Superior × Inferior × Altura): ' + configuration.upper + ' × ' + configuration.lower + ' × ' + configuration.height + ' cm');
      if (configuration.observations) lines.push('Observações: ' + configuration.observations);
      lines.push('', 'Formatos e medidas personalizados passam por avaliação técnica da fábrica antes da confirmação do pedido.');

      window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener,noreferrer');
    });

    const setConfiguration = (configuration = {}) => {
      const reference = getReference(configuration.reference || fields.reference.value);
      const formatKey = getFormat(configuration.format).key;
      fields.reference.value = reference.reference;
      fields.format.forEach((input) => { input.checked = input.value === formatKey; });
      fields.material.forEach((input) => { input.checked = input.value === (configuration.material || 'Juta'); });
      fields.color.forEach((input) => { input.checked = input.value === (configuration.color || 'Preto'); });
      fields.measureMode.forEach((input) => { input.checked = input.value === (configuration.measureMode || 'suggested'); });
      fields.customFormat.value = configuration.customFormat || '';
      fields.customColor.value = configuration.customColor || '';
      fields.upper.value = configuration.upper || '';
      fields.lower.value = configuration.lower || '';
      fields.height.value = configuration.height || '';
      fields.observations.value = configuration.observations || '';
      panels.forEach((panel, step) => clearStepError(step));
      showStep(0, false);
    };

    setConfiguration({
      reference: '01',
      format: 'conica',
      material: 'Juta',
      color: 'Preto',
      measureMode: mode === 'custom' ? 'custom' : 'suggested'
    });
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
      format: settings.format || reference.formatKey || 'conica',
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
