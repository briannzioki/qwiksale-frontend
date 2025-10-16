(() => {
  const now = () => Math.round(performance.now());
  const id = location.pathname.split('/').filter(Boolean).pop();
  const isService = location.pathname.includes('/service/');
  const api = isService ? `/api/services/${id}` : `/api/products/${id}`;

  const t0 = performance.now();
  fetch(api, { cache: 'no-store' })
    .then(r => (console.log("API", { status: r.status, ms: Math.round(performance.now() - t0), gallery: (r.headers.get("content-length")||"") }), r.json()))
    .then(j => {
      const apiCount = (j.gallery||[]).length;
      const urls = [...document.querySelectorAll('[data-gallery-wrap] img')].map(i => i.currentSrc || i.src);
      const clean = urls.filter(u => u && !u.includes('/placeholder/') && !/picsum\.photos|images\.unsplash\.com|plus\.unsplash\.com/.test(u));
      const nextOptim = [...document.querySelectorAll('img[src*="/_next/image"]')].length;
      console.log("UI gallery", { uiCount: clean.length, apiCount, urls: clean });
      console.log(nextOptim ? "WARN optimizer in dev" : "PASS unoptimized in dev", {});
      console.log("fill parent positions", [...document.querySelectorAll('img')].map(i => getComputedStyle(i.parentElement).position));
    })
})();
