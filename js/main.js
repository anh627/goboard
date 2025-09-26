// js/main.js
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    html.setAttribute('data-theme', currentTheme === 'light' ? 'dark' : 'light');
  });

  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.style.display = 'block';
  setTimeout(() => {
    loadingOverlay.style.display = 'none';
  }, 1000);
});
