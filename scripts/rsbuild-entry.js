import '../dist/style.css';
import '../dist/vehicle-controls.css';
import '../dist/progression-ui.css';
import '../dist/settings-menu.css';

// Preserve the startup error UI used by the unbundled HTML entry.
import('../dist/app.js').catch(error => {
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden = false;
  document.getElementById('error-text').textContent =
    'Не удалось загрузить сцену. Проверьте поддержку WebGL 2 и откройте страницу через HTTP-сервер. ' +
    error.message;
  console.error(error);
});
