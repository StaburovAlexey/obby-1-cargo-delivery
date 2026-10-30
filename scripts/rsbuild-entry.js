import '../dist/style.css';
import '../dist/vehicle-controls.css';
import '../dist/progression-ui.css';
import '../dist/settings-menu.css';
import '../dist/hangar-drift-leaderboard.css';
import '../dist/vehicle-livery-shop.css';
import '../dist/online-ui.css';
import '../dist/canyon-ui.css';
import '../dist/modal-ui.css';
import '../dist/ui-icons.css';


import('@game-bootstrap').catch(error => {
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden = false;
  document.getElementById('error-text').textContent =
    'Не удалось загрузить игру. Проверьте соединение и нажмите «Повторить». ' +
    error.message;
  console.error(error);
});
