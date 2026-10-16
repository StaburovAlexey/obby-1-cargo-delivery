# Новые текстуры персонажей · 15 октября 2026

Установлены новые костюмы и цвета в стиле Roblox для 16 персонажей. Jeff the Killer сохранён побайтно. 31 отдельный PNG покрывает 33 слота: одинаковые исходные изображения Jandel и Spyder Sammy используют общие новые карты. Spider-Man получил две новые карты, включая маску.

- [Все 16 персонажей спереди](front-preview.png)
- [Все 16 персонажей сзади](back-preview.png)
- [PNG, описания костюмов и промпты](../../art/character-textures/README.md)

## Проверка результата

Браузерная QA-галерея использует настоящий игровой `createCharacterDisplay` и финальные GLB. Все 17 персонажей просмотрены спереди и сзади, ошибок загрузки нет. В сборке `build:demo` дополнительно проверены готовность мира, активный Bacon и все 17 витрин: цветовые карты каждого материала декодированы с положительными размерами. Данные проверки: [game-materials.json](game-materials.json). Это локальный SDK в памяти и отдельный браузерный контекст, а не проверка опубликованной игры или производительности мобильного устройства.

Проверки `npm run test:character-textures` охватывают замену PNG, соответствие встроенных карт исходникам, полный набор слотов, белый tint Spider-Man, SHA/размеры каталога, сохранение исходного бинарного префикса, геометрии, UV, иерархии, скелета и клипов. `character.mjs` проверяет движение и ввод; `character-catalog.mjs` валидирует все 17 моделей Khronos Validator и проверяет движение, посадку, геометрию витрин и кэш. [Результат](character-tests.log).

`npm run build` завершён с кодом 0: [лог](build.log). `npm run build:demo` также завершён с кодом 0. Отдельно прошёл `node --test tests/premium-skins.mjs`: [лог](premium-tests.log).

## Существующие сбои общего набора

Общий `npm test` дошёл до следующих ошибок `tests/physics-app-integration.mjs` и был прерван после их фиксации (exit 130; оставшаяся часть общего набора не завершена):

1. `Held wheel plus a second-pointer gear change brakes before rolling in reverse` — `startingSpeed > 1`.
2. `Blur, resize and hidden-tab safety resets clear every planar momentum channel` — `linearSpeed > 0`.

Обе ошибки воспроизведены на отдельном экспорте чистого HEAD `dcdd8b23e056827657834c3bf2dd99252746e6ed`. В baseline дополнительно успела упасть `Overview pause, garage return and re-entry clear stale forces, spin and teleport distance` — `true !== false`; затем baseline также прерван с кодом 130. [Общий запуск](full-tests.log), [baseline](physics-baseline.log), [сводка baseline](physics-baseline-summary.json). Файлы физики, управления и приложения этой задачей не изменены.

При расширенной проверке `tests/character-row.mjs` обнаружен прежний селектор исходного текста `populateDisplays()`, который уже не соответствует функции `populateDisplays({required=false}={})` в HEAD. В диагностическом запуске после временного исправления селектора проверки 17 моделей, размеров и подходов к витринам прошли, затем проверка цены premium-персонажа ожидала `5400` вместо фактического `—`. [Лог диагностического запуска](extended-character-row-tests.log). Тест возвращён к исходному состоянию; цены и правила покупок не менялись.

## Повторный просмотр

Запустите HTTP-сервер из корня репозитория и откройте `/qa/character-retexture/?group=0&view=front`. Доступны группы 0–2 и вид `back`; `ids=bacon,spider-man` выбирает конкретных персонажей. Галерея добавляет параметр к URL модели, чтобы при проверке замены не использовать старый браузерный кэш.
