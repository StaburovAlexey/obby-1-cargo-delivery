import '../dist/style.css';
import '../dist/vehicle-controls.css';
import '../dist/progression-ui.css';
import '../dist/settings-menu.css';
import '../dist/online-ui.css';

// Preserve the startup error UI used by the unbundled HTML entry.
import('../dist/bootstrap.js').catch(error => {
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden = false;
  document.getElementById('error-text').textContent =
    'Не удалось загрузить игру. Проверьте соединение и нажмите «Повторить». ' +
    error.message;
  console.error(error);
});
