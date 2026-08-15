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
    let isPaused = false;

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
      if (autoplay) window.clearInterval(autoplay);
      autoplay = 0;
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (reducedMotion.matches || isPaused || document.hidden) return;
      autoplay = window.setInterval(() => showSlide(current + 1), 6500);
    };

    previous?.addEventListener('click', () => { showSlide(current - 1); startAutoplay(); });
    next?.addEventListener('click', () => { showSlide(current + 1); startAutoplay(); });
    dots.forEach((dot) => dot.addEventListener('click', () => {
      showSlide(Number(dot.dataset.slideTo));
      startAutoplay();
    }));

    heroCarousel.addEventListener('mouseenter', () => { isPaused = true; stopAutoplay(); });
    heroCarousel.addEventListener('mouseleave', () => { isPaused = false; startAutoplay(); });
    heroCarousel.addEventListener('focusin', () => { isPaused = true; stopAutoplay(); });
    heroCarousel.addEventListener('focusout', (event) => {
      if (heroCarousel.contains(event.relatedTarget)) return;
      isPaused = false;
      startAutoplay();
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
    const track = carousel.querySelector('[data-carousel-track]');
    const previous = carousel.querySelector('[data-carousel-prev]');
    const next = carousel.querySelector('[data-carousel-next]');
    if (!track) return;

    const scroll = (direction) => {
      const firstCard = track.firstElementChild;
      const amount = firstCard ? firstCard.getBoundingClientRect().width + 22 : track.clientWidth * .8;
      track.scrollBy({ left: amount * direction, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    };

    previous?.addEventListener('click', () => scroll(-1));
    next?.addEventListener('click', () => scroll(1));
  });
})();
