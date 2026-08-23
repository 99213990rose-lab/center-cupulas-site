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

  window.CenterCupulas = { observeReveals };
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
      }, 3200);
    };

    previous?.addEventListener('click', () => { showSlide(current - 1); startAutoplay(); });
    next?.addEventListener('click', () => { showSlide(current + 1); startAutoplay(); });
    dots.forEach((dot) => dot.addEventListener('click', () => {
      showSlide(Number(dot.dataset.slideTo));
      startAutoplay();
    }));

    heroCarousel.addEventListener('mouseenter', () => { isHovered = true; stopAutoplay(); });
    heroCarousel.addEventListener('mouseleave', () => { isHovered = false; startAutoplay(); });
    heroCarousel.addEventListener('focusin', () => { hasFocus = true; stopAutoplay(); });
    heroCarousel.addEventListener('focusout', (event) => {
      if (heroCarousel.contains(event.relatedTarget)) return;
      hasFocus = false;
      startAutoplay();
    });
    heroCarousel.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
    });
    heroCarousel.addEventListener('pointerup', (event) => {
      if (pointerStartX === null || pointerStartY === null) return;
      const distanceX = event.clientX - pointerStartX;
      const distanceY = event.clientY - pointerStartY;
      pointerStartX = null;
      pointerStartY = null;
      if (Math.abs(distanceX) < 44 || Math.abs(distanceX) < Math.abs(distanceY)) return;
      showSlide(current + (distanceX < 0 ? 1 : -1));
      startAutoplay();
    });
    heroCarousel.addEventListener('pointercancel', () => {
      pointerStartX = null;
      pointerStartY = null;
    });
    document.addEventListener('visibilitychange', startAutoplay);
    reducedMotion.addEventListener?.('change', startAutoplay);

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
    duplicateSet.setAttribute('inert', '');
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
    let cycleWidth = 0;
    let offset = 0;
    let previousTimestamp = 0;
    let isHovered = false;
    let hasKeyboardFocus = false;
    let isDragging = false;
    let isInViewport = true;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let hasDragged = false;
    let suppressClick = false;

    const normalizeOffset = (value) => {
      if (!cycleWidth) return 0;
      return ((value % cycleWidth) + cycleWidth) % cycleWidth;
    };

    const render = () => {
      track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
    };

    const measure = () => {
      const progress = cycleWidth ? offset / cycleWidth : 0;
      cycleWidth = originalSet.getBoundingClientRect().width;
      offset = cycleWidth ? progress * cycleWidth : 0;
      render();
    };

    const canMove = () => (
      cycleWidth > 0
      && !reducedMotion.matches
      && !document.hidden
      && !isHovered
      && !hasKeyboardFocus
      && !isDragging
      && isInViewport
    );

    const animate = (timestamp) => {
      if (!previousTimestamp) previousTimestamp = timestamp;
      const elapsed = Math.min((timestamp - previousTimestamp) / 1000, 0.05);
      previousTimestamp = timestamp;
      if (canMove()) {
        offset = normalizeOffset(offset + SPEED * elapsed);
        render();
      }
      window.requestAnimationFrame(animate);
    };

    const shiftByCard = (direction) => {
      const gap = Number.parseFloat(getComputedStyle(originalSet).columnGap) || 22;
      const step = cards[0].getBoundingClientRect().width + gap;
      offset = normalizeOffset(offset + direction * step);
      previousTimestamp = performance.now();
      render();
    };

    previous?.addEventListener('click', () => shiftByCard(-1));
    next?.addEventListener('click', () => shiftByCard(1));
    carousel.addEventListener('mouseenter', () => { isHovered = true; });
    carousel.addEventListener('mouseleave', () => {
      isHovered = false;
      previousTimestamp = performance.now();
    });
    carousel.addEventListener('pointerdown', () => {
      hasKeyboardFocus = false;
    }, { capture: true });
    carousel.addEventListener('keydown', () => {
      hasKeyboardFocus = true;
    });
    carousel.addEventListener('focusin', (event) => {
      try {
        hasKeyboardFocus = event.target.matches(':focus-visible');
      } catch {
        hasKeyboardFocus = false;
      }
    });
    carousel.addEventListener('focusout', (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      hasKeyboardFocus = false;
      previousTimestamp = performance.now();
    });

    viewport.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      isDragging = true;
      dragStartX = event.clientX;
      dragStartOffset = offset;
      hasDragged = false;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture?.(event.pointerId);
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      const distance = event.clientX - dragStartX;
      if (Math.abs(distance) > 5) hasDragged = true;
      if (!hasDragged) return;
      if (event.cancelable) event.preventDefault();
      offset = normalizeOffset(dragStartOffset - distance);
      render();
    });

    const finishDrag = (event) => {
      if (!isDragging) return;
      suppressClick = hasDragged;
      isDragging = false;
      viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      previousTimestamp = performance.now();
    };

    viewport.addEventListener('pointerup', finishDrag);
    viewport.addEventListener('pointercancel', finishDrag);
    viewport.addEventListener('dragstart', (event) => event.preventDefault());
    viewport.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
      }
      suppressClick = false;
    }, { capture: true });

    document.addEventListener('visibilitychange', () => { previousTimestamp = performance.now(); });
    reducedMotion.addEventListener?.('change', () => { previousTimestamp = performance.now(); });

    if ('IntersectionObserver' in window) {
      const carouselObserver = new IntersectionObserver(([entry]) => {
        isInViewport = entry.isIntersecting;
        previousTimestamp = performance.now();
      }, { threshold: 0.05 });
      carouselObserver.observe(carousel);
    }

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(viewport);
      resizeObserver.observe(originalSet);
    }

    measure();
    window.requestAnimationFrame(animate);
  });
})();
