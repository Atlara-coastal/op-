/**
 * JocoAdmin - Lightweight GSAP animation helpers.
 * Kept intentionally simple: entrance transitions for tab content and modals.
 */

export function animateTabIn(container) {
  if (!window.gsap || !container) return;
  const items = container.children.length ? Array.from(container.children) : [container];
  window.gsap.fromTo(
    items,
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.05, clearProps: 'transform' }
  );
}

export function animateModalIn(modalEl) {
  if (!window.gsap || !modalEl) return;
  const panel = modalEl.querySelector(':scope > div');
  window.gsap.fromTo(
    modalEl,
    { opacity: 0 },
    { opacity: 1, duration: 0.25, ease: 'power1.out' }
  );
  if (panel) {
    window.gsap.fromTo(
      panel,
      { opacity: 0, y: 16, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.6)' }
    );
  }
}

// App shell entrance after login / session restore: header drops in, mobile tab bar rises.
export function animateShellIn() {
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const header = document.querySelector('#app-shell header');
  const bottomNav = document.getElementById('bottom-nav');
  if (header) window.gsap.fromTo(header, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'transform,opacity' });
  if (bottomNav) window.gsap.fromTo(bottomNav, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, delay: 0.1, ease: 'power2.out', clearProps: 'transform,opacity' });
}

export function animateLoginIn() {
  if (!window.gsap) return;
  const form = document.getElementById('login-form');
  if (!form) return;
  window.gsap.fromTo(
    form,
    { opacity: 0, y: 20, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out' }
  );
}
