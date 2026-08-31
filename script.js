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
