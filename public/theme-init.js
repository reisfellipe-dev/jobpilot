/**
 * Aplica o tema antes da primeira pintura.
 *
 * Precisa ser um arquivo separado e sincrono: o CSP do projeto usa
 * script-src 'self', que bloqueia script inline. Carregado no <head> sem
 * defer, roda antes do CSS pintar e evita o flash de tema errado.
 */
(function () {
  try {
    var saved = localStorage.getItem('jobpilot.theme');
    var theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#08090c');
  } catch (e) {
    /* localStorage bloqueado: segue no escuro, que e o padrao do <html>. */
  }
})();
