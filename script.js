(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.body.classList.add('reveal-ready');

  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const header = document.querySelector('[data-header]');
  let headerFrame = 0;

  const updateHeader = () => {
    headerFrame = 0;
    header?.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  window.addEventListener('scroll', () => {
    if (headerFrame) return;
    headerFrame = window.requestAnimationFrame(updateHeader);
  }, { passive: true });
  updateHeader();

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');

  const closeNav = () => {
    nav?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.setAttribute('aria-label', 'Abrir menu');
  };

  navToggle?.addEventListener('click', () => {
    const isOpen = nav?.classList.toggle('is-open') ?? false;
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));

  document.addEventListener('click', (event) => {
    if (!nav?.classList.contains('is-open')) return;
    if (nav.contains(event.target) || navToggle?.contains(event.target)) return;
    closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav?.classList.contains('is-open')) {
      closeNav();
      navToggle?.focus();
    }
  });

  const revealObserver = 'IntersectionObserver' in window && !reducedMotion.matches
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.09, rootMargin: '0px 0px -5% 0px' })
    : null;

  const observeReveals = (root = document) => {
    root.querySelectorAll('[data-stagger]').forEach((container) => {
      [...container.children].forEach((child, index) => {
        if (!child.hasAttribute('data-reveal')) return;
        child.style.setProperty('--reveal-delay', `${Math.min(index % 8, 7) * 65}ms`);
      });
    });

    root.querySelectorAll('[data-reveal]').forEach((element) => {
      if (element.dataset.revealObserved === 'true') return;
      element.dataset.revealObserved = 'true';
      if (revealObserver) revealObserver.observe(element);
      else element.classList.add('is-visible');
    });
  };

  const TRACKING_ENDPOINT = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/center-web-event';

  const safeStorage = {
    get(storage, key) {
      try { return storage.getItem(key); } catch { return null; }
    },
    set(storage, key, value) {
      try { storage.setItem(key, value); } catch {}
    }
  };

  const randomToken = (size = 8) => {
    const bytes = new Uint8Array(size);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('').slice(0, size * 2);
  };

  const getSessionId = () => {
    const key = 'centerCupulasSessionId';
    let value = safeStorage.get(window.sessionStorage, key);
    if (!value) {
      value = 'cc-session-' + randomToken(8);
      safeStorage.set(window.sessionStorage, key, value);
    }
    return value;
  };

  const normalizeHost = (value) => String(value || '').replace(/^www\./i, '').toLowerCase();

  const inferReferrerAttribution = () => {
    let host = '';
    try { host = normalizeHost(new URL(document.referrer).hostname); } catch {}
    if (!host || host === 'centercupulas.com.br') return { source: 'direct', medium: 'none', referrerHost: host };

    if (/(^|\.)google\./.test(host)) return { source: 'google', medium: 'organic', referrerHost: host };
    if (host === 'bing.com' || host.endsWith('.bing.com')) return { source: 'bing', medium: 'organic', referrerHost: host };
    if (host === 'l.instagram.com' || host.endsWith('.instagram.com')) return { source: 'instagram', medium: 'referral', referrerHost: host };
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) return { source: 'facebook', medium: 'referral', referrerHost: host };
    if (host === 'com.google.android.gm' || host === 'mail.google.com') return { source: 'gmail', medium: 'email', referrerHost: host };
    return { source: host, medium: 'referral', referrerHost: host };
  };

  const readAttribution = () => {
    const params = new URLSearchParams(window.location.search);
    const referrer = inferReferrerAttribution();
    const hasGoogleClick = Boolean(params.get('gclid') || params.get('gbraid') || params.get('wbraid'));
    const hasMetaClick = Boolean(params.get('fbclid'));

    const explicit = {
      source: params.get('utm_source') || (hasGoogleClick ? 'google' : ''),
      medium: params.get('utm_medium') || (hasGoogleClick ? 'cpc' : ''),
      campaign: params.get('utm_campaign') || '',
      content: params.get('utm_content') || '',
      term: params.get('utm_term') || '',
      referrerHost: referrer.referrerHost || '',
      hasGoogleClick,
      hasMetaClick
    };

    const hasExplicit = Boolean(explicit.source || explicit.medium || explicit.campaign || hasGoogleClick || hasMetaClick);
    const current = hasExplicit ? explicit : {
      ...explicit,
      source: referrer.source || 'direct',
      medium: referrer.medium || 'none'
    };

    const firstKey = 'centerCupulasFirstTouch';
    const lastKey = 'centerCupulasAttribution';
    const existingFirst = safeStorage.get(window.localStorage, firstKey);

    if (!existingFirst) {
      safeStorage.set(window.localStorage, firstKey, JSON.stringify({
        ...current,
        landingPage: window.location.pathname + window.location.search,
        capturedAt: new Date().toISOString()
      }));
    }

    safeStorage.set(window.sessionStorage, lastKey, JSON.stringify(current));

    let firstTouch = null;
    try { firstTouch = JSON.parse(safeStorage.get(window.localStorage, firstKey) || 'null'); } catch {}

    return {
      ...current,
      firstTouch: firstTouch && typeof firstTouch === 'object' ? firstTouch : null
    };
  };

  const attribution = readAttribution();
  const sessionId = getSessionId();
  const landingPage = attribution.firstTouch?.landingPage || window.location.pathname + window.location.search;

  const placementFor = (element) => {
    if (!element) return 'unknown';
    if (element.dataset?.trackPlacement) return element.dataset.trackPlacement;
    if (element.closest('.floating-whatsapp')) return 'floating_whatsapp';
    if (element.closest('.site-header')) return 'header';
    if (element.closest('.hero')) return 'hero';
    if (element.closest('.catalog-hero')) return 'catalog_hero';
    if (element.closest('.contact-cta')) return 'contact_cta';
    if (element.closest('.footer')) return 'footer';
    if (element.closest('.configurator')) return 'configurator_dialog';
    if (element.closest('[data-configuration-form]')) return 'configurator_page';
    return 'content';
  };

  const sendWebEvent = (eventType, details = {}) => {
    const payload = {
      event_id: 'cc-' + Date.now().toString(36) + '-' + randomToken(5),
      session_id: sessionId,
      lead_ref: details.leadRef || null,
      event_type: eventType,
      page: window.location.pathname,
      placement: details.placement || 'page',
      source: attribution.source || 'direct',
      medium: attribution.medium || 'none',
      campaign: attribution.campaign || '',
      content: attribution.content || '',
      term: attribution.term || '',
      referrer_host: attribution.referrerHost || '',
      landing_page: landingPage,
      occurred_at: new Date().toISOString(),
      metadata: {
        has_google_click_id: Boolean(attribution.hasGoogleClick),
        has_meta_click_id: Boolean(attribution.hasMetaClick),
        cta_text: details.ctaText || '',
        page_title: document.title
      }
    };

    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon(TRACKING_ENDPOINT, new Blob([body], { type: 'application/json' }));
        if (sent) return payload;
      }
    } catch {}

    fetch(TRACKING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit'
    }).catch(() => {});

    return payload;
  };

  const createLeadRef = () => 'CC-' + randomToken(4).toUpperCase();

  const trackWhatsAppConversion = (details = {}) => {
    const leadRef = details.leadRef || createLeadRef();

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', { send_to: 'AW-18466593229/dGyVCITQ_IAdEM2zx-VE' });
    }

    if (typeof window.va === 'function') {
      window.va('event', {
        name: 'WhatsApp Click',
        data: {
          page: window.location.pathname,
          source: attribution.source || 'direct',
          medium: attribution.medium || 'none',
          campaign: attribution.campaign || 'none',
          placement: details.placement || 'unknown'
        }
      });
    }

    sendWebEvent(details.eventType || 'whatsapp_click', {
      leadRef,
      placement: details.placement || 'unknown',
      ctaText: details.ctaText || ''
    });

    return leadRef;
  };

  const appendLeadRefToWhatsAppUrl = (href, leadRef) => {
    try {
      const url = new URL(href);
      if (url.hostname !== 'wa.me') return href;
      const message = url.searchParams.get('text') || '';
      if (!message.includes(leadRef)) {
        const suffix = (message ? '\n\n' : '') + 'Código de atendimento: ' + leadRef;
        url.searchParams.set('text', message + suffix);
      }
      return url.toString();
    } catch {
      return href;
    }
  };

  if (typeof window.va === 'function' && attribution.source !== 'direct') {
    window.va('event', {
      name: 'Campaign Visit',
      data: {
        page: window.location.pathname,
        source: attribution.source || 'unknown',
        medium: attribution.medium || 'unknown',
        campaign: attribution.campaign || 'unknown'
      }
    });
  }

  sendWebEvent('page_view', { placement: 'page' });

  window.CenterCupulas = {
    observeReveals,
    trackWhatsAppConversion,
    readAttribution,
    sendWebEvent,
    createLeadRef,
    placementFor
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="https://wa.me/"]');
    if (!link) return;
    const placement = placementFor(link);
    const ctaText = (link.textContent || link.getAttribute('aria-label') || '').trim().slice(0, 120);
    const leadRef = trackWhatsAppConversion({ placement, ctaText, eventType: 'whatsapp_click' });
    link.href = appendLeadRefToWhatsAppUrl(link.href, leadRef);
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href^="mailto:"],a[href^="tel:"]');
    if (!link) return;
    sendWebEvent('contact_click', {
      placement: placementFor(link),
      ctaText: (link.textContent || '').trim().slice(0, 120)
    });
  });

  observeReveals();

  const hydrateDeferredImages = (root) => {
    root.querySelectorAll('img[data-src]').forEach((image) => {
      if (!image.src) image.src = image.dataset.src;
      image.removeAttribute('data-src');
    });
  };

  const heroCarousel = document.querySelector('[data-hero-carousel]');
  if (heroCarousel) {
    const slides = [...heroCarousel.querySelectorAll('[data-slide]')];
    const dots = [...heroCarousel.querySelectorAll('[data-slide-to]')];
    const previous = heroCarousel.querySelector('[data-hero-prev]');
    const next = heroCarousel.querySelector('[data-hero-next]');
    const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
    let current = 0;
    let autoplay = 0;
    let isHovered = false;
    let hasFocus = false;
    let pointerStartX = null;
    let pointerStartY = null;

    const loadSlide = (index) => {
      const image = slides[index]?.querySelector('img[data-src]');
      if (!image) return;
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    };

    const showSlide = (index) => {
      current = (index + slides.length) % slides.length;
      loadSlide(current);
      loadSlide((current + 1) % slides.length);

      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === current;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', String(!isActive));
        slide.inert = !isActive;
      });

      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === current;
        dot.classList.toggle('is-active', isActive);
        if (isActive) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    };

    const stopAutoplay = () => {
      if (autoplay) window.clearTimeout(autoplay);
      autoplay = 0;
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (reducedMotion.matches || isHovered || hasFocus || document.hidden) return;
      autoplay = window.setTimeout(() => {
        showSlide(current + 1);
        startAutoplay();
      }, 4800);
    };

    previous?.addEventListener('click', (event) => {
      showSlide(current - 1);
      if (event.detail > 0) isHovered = false;
      startAutoplay();
    });
    next?.addEventListener('click', (event) => {
      showSlide(current + 1);
      if (event.detail > 0) isHovered = false;
      startAutoplay();
    });
    dots.forEach((dot) => dot.addEventListener('click', () => {
      showSlide(Number(dot.dataset.slideTo));
      startAutoplay();
    }));

    heroCarousel.addEventListener('mouseenter', () => {
      if (!hoverCapable.matches) return;
      isHovered = true;
      stopAutoplay();
    });
    heroCarousel.addEventListener('mouseleave', () => {
      if (!hoverCapable.matches) return;
      isHovered = false;
      startAutoplay();
    });
    heroCarousel.addEventListener('focusin', (event) => {
      if (pointerStartX !== null) {
        hasFocus = false;
        return;
      }
      try {
        hasFocus = event.target.matches(':focus-visible');
      } catch {
        hasFocus = true;
      }
      if (hasFocus) stopAutoplay();
    });
    heroCarousel.addEventListener('focusout', (event) => {
      if (heroCarousel.contains(event.relatedTarget)) return;
      hasFocus = false;
      startAutoplay();
    });
    heroCarousel.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      stopAutoplay();
    });
    heroCarousel.addEventListener('pointerup', (event) => {
      if (pointerStartX === null || pointerStartY === null) return;
      const distanceX = event.clientX - pointerStartX;
      const distanceY = event.clientY - pointerStartY;
      pointerStartX = null;
      pointerStartY = null;
      if (Math.abs(distanceX) < 44 || Math.abs(distanceX) < Math.abs(distanceY)) {
        startAutoplay();
        return;
      }
      showSlide(current + (distanceX < 0 ? 1 : -1));
      startAutoplay();
    });
    heroCarousel.addEventListener('pointercancel', () => {
      pointerStartX = null;
      pointerStartY = null;
      startAutoplay();
    });
    heroCarousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showSlide(current - 1);
        startAutoplay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showSlide(current + 1);
        startAutoplay();
      }
    });
    document.addEventListener('visibilitychange', startAutoplay);
    reducedMotion.addEventListener?.('change', startAutoplay);
    hoverCapable.addEventListener?.('change', (event) => {
      if (event.matches) return;
      isHovered = false;
      startAutoplay();
    });

    showSlide(0);

    window.addEventListener('load', () => {
      const defer = window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 350));
      defer(() => hydrateDeferredImages(heroCarousel));
      startAutoplay();
    }, { once: true });
  }

  document.querySelectorAll('[data-product-carousel]').forEach((carousel) => {
    const viewport = carousel.querySelector('[data-carousel-viewport]');
    const track = carousel.querySelector('[data-carousel-track]');
    const previous = carousel.querySelector('[data-carousel-prev]');
    const next = carousel.querySelector('[data-carousel-next]');
    if (!viewport || !track || !track.children.length) return;

    const cards = [...track.children];
    const originalSet = document.createElement('div');
    originalSet.className = 'product-track__set';
    originalSet.dataset.carouselSet = 'original';
    cards.forEach((card) => originalSet.append(card));

    const duplicateSet = originalSet.cloneNode(true);
    duplicateSet.dataset.carouselSet = 'duplicate';
    duplicateSet.setAttribute('aria-hidden', 'true');
    // Keep pointer/touch links usable in the visible copy; only originals join the Tab order.
    duplicateSet.querySelectorAll('[data-reveal]').forEach((element) => {
      element.removeAttribute('data-reveal');
      element.removeAttribute('data-reveal-observed');
      element.style.removeProperty('--reveal-delay');
    });
    duplicateSet.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((element) => {
      element.setAttribute('tabindex', '-1');
    });
    track.replaceChildren(originalSet, duplicateSet);

    const SPEED = 36;
    const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let animation = null;
    let cycleWidth = 0;
    let duration = 0;
    let buttonFrame = 0;
    let isHovered = false;
    let hasKeyboardFocus = false;
    let isInViewport = true;
    let pointerInitiatedFocus = false;
    let gesture = null;
    let suppressClick = false;

    const wrap = (value, length) => length ? ((value % length) + length) % length : 0;
    const position = () => wrap(Number(animation?.currentTime || 0), duration) * SPEED / 1000;
    const setPosition = (value) => {
      if (animation) animation.currentTime = wrap(value, cycleWidth) * 1000 / SPEED;
    };
    const syncPlayback = () => {
      if (!animation) return;
      const paused = reducedMotion.matches || document.hidden || !isInViewport
        || isHovered || hasKeyboardFocus || gesture?.axis === 'horizontal' || buttonFrame;
      if (paused) animation.pause();
      else if (animation.playState !== 'running') animation.play();
    };
    const cancelButtonMove = () => {
      if (buttonFrame) window.cancelAnimationFrame(buttonFrame);
      buttonFrame = 0;
    };

    const measure = () => {
      const width = originalSet.getBoundingClientRect().width;
      if (!width || Math.abs(width - cycleWidth) < .1) return;
      const progress = cycleWidth ? position() / cycleWidth : 0;
      cancelButtonMove();
      animation?.cancel();
      cycleWidth = width; // Includes the trailing gap, identical in both sets.
      duration = cycleWidth / SPEED * 1000;
      animation = track.animate([
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(-' + cycleWidth + 'px, 0, 0)' }
      ], { duration, iterations: Infinity, easing: 'linear' });
      animation.pause();
      setPosition(progress * cycleWidth);
      if (gesture) {
        gesture.offset = position();
        gesture.x = gesture.lastX;
        gesture.y = gesture.lastY;
      }
      syncPlayback();
    };

    // Like changePosition in the reference carousel, seek the SAME animation.
    // Only the short manual transition uses RAF; autoplay runs on the compositor.
    const shiftByCard = (direction) => {
      if (!animation) return;
      cancelButtonMove();
      const gap = Number.parseFloat(getComputedStyle(originalSet).columnGap) || 0;
      const distance = cards[0].getBoundingClientRect().width + gap;
      const start = position();
      animation.pause();
      if (reducedMotion.matches) {
        setPosition(start + direction * distance);
        syncPlayback();
        return;
      }
      const startedAt = performance.now();
      const moveFrame = (now) => {
        const progress = Math.min((now - startedAt) / 420, 1);
        const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        setPosition(start + direction * distance * eased);
        if (progress < 1) buttonFrame = window.requestAnimationFrame(moveFrame);
        else {
          buttonFrame = 0;
          syncPlayback();
        }
      };
      buttonFrame = window.requestAnimationFrame(moveFrame);
    };

    previous?.addEventListener('click', () => shiftByCard(-1));
    next?.addEventListener('click', () => shiftByCard(1));
    carousel.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse' || !hoverPointer.matches) return;
      isHovered = true;
      syncPlayback();
    });
    carousel.addEventListener('pointerleave', () => {
      isHovered = false;
      syncPlayback();
    });
    carousel.addEventListener('pointerdown', () => {
      pointerInitiatedFocus = true;
      hasKeyboardFocus = false;
      syncPlayback();
    }, { capture: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') pointerInitiatedFocus = false;
    });
    carousel.addEventListener('keydown', () => {
      pointerInitiatedFocus = false;
      hasKeyboardFocus = true;
      syncPlayback();
    });
    carousel.addEventListener('focusin', (event) => {
      hasKeyboardFocus = !pointerInitiatedFocus && event.target.matches(':focus-visible');
      if (hasKeyboardFocus) {
        const card = event.target.closest('.showcase-card');
        if (card && originalSet.contains(card)) {
          cancelButtonMove();
          const bounds = card.getBoundingClientRect();
          const frame = viewport.getBoundingClientRect();
          if (bounds.left < frame.left || bounds.right > frame.right) {
            setPosition(bounds.left - originalSet.getBoundingClientRect().left);
          }
        }
      }
      syncPlayback();
    });
    carousel.addEventListener('focusout', (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      pointerInitiatedFocus = false;
      hasKeyboardFocus = false;
      syncPlayback();
    });

    viewport.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      suppressClick = false;
      gesture = {
        id: event.pointerId, axis: null,
        x: event.clientX, y: event.clientY,
        lastX: event.clientX, lastY: event.clientY, offset: position()
      };
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        if (gesture.axis === 'horizontal') {
          cancelButtonMove();
          gesture.offset = position();
          syncPlayback();
          viewport.setPointerCapture(event.pointerId);
          viewport.classList.add('is-dragging');
        }
      }
      if (gesture.axis !== 'horizontal') return;
      // Native vertical panning remains untouched until horizontal intent is clear.
      if (event.cancelable) event.preventDefault();
      setPosition(gesture.offset - dx);
    }, { passive: false });

    const finishDrag = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      suppressClick = gesture.axis === 'horizontal';
      gesture = null;
      viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      syncPlayback();
    };
    viewport.addEventListener('pointerup', finishDrag);
    viewport.addEventListener('pointercancel', finishDrag);
    viewport.addEventListener('lostpointercapture', finishDrag);
    viewport.addEventListener('pointerleave', (event) => {
      if (gesture?.axis !== 'horizontal') finishDrag(event);
    });
    viewport.addEventListener('dragstart', (event) => event.preventDefault());
    viewport.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
      }
      suppressClick = false;
    }, { capture: true });

    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', () => {
      cancelButtonMove();
      syncPlayback();
    });
    hoverPointer.addEventListener('change', () => {
      isHovered = false;
      syncPlayback();
    });
    if ('IntersectionObserver' in window) {
      const carouselObserver = new IntersectionObserver(([entry]) => {
        isInViewport = entry.isIntersecting;
        syncPlayback();
      }, { threshold: .05 });
      carouselObserver.observe(carousel);
    }
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(viewport);
      resizeObserver.observe(originalSet);
    }
    measure();
  });
})();
