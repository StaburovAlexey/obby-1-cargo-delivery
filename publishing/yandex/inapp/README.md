# Материалы инап-покупок

Пять постоянных товаров. ID совпадают с `PREMIUM_SKIN_IDS` и `premiumProductId()` в `dist/premium-skins.js`; переименовывать их в консоли отдельно от кода нельзя.

| Иконка | Персонаж | ID товара | PNG |
| --- | --- | --- | --- |
| <img src="icons/skin_dancing-npc-girl.png" width="96" height="96" alt="Dancing NPC Girl"> | Dancing NPC Girl | `skin_dancing-npc-girl` | [Скачать](icons/skin_dancing-npc-girl.png) |
| <img src="icons/skin_jandel.png" width="96" height="96" alt="Jandel"> | Jandel | `skin_jandel` | [Скачать](icons/skin_jandel.png) |
| <img src="icons/skin_kreekcraft.png" width="96" height="96" alt="KreekCraft"> | KreekCraft | `skin_kreekcraft` | [Скачать](icons/skin_kreekcraft.png) |
| <img src="icons/skin_spyder-sammy.png" width="96" height="96" alt="Spyder Sammy"> | Spyder Sammy | `skin_spyder-sammy` | [Скачать](icons/skin_spyder-sammy.png) |
| <img src="icons/skin_spider-man.png" width="96" height="96" alt="Spider-Man"> | Spider-Man | `skin_spider-man` | [Скачать](icons/skin_spider-man.png) |

[products.csv](products.csv) содержит обязательные поля для импорта: `id`, `price`, `title_en`, `description_en`, `title_ru`, `description_ru`. Описания короче 200 символов. Цена 39 указана в портальной валюте; для целевой стоимости 39 рублей проверьте региональную стоимость в Консоли Яндекс Игр. Изображения загружаются отдельно в карточке каждого товара после импорта CSV.

Формат финальных иконок: PNG, 256×256, непрозрачный фон, без текста, цен и значков валюты. Размер подтверждён по [документации консоли](https://yandex.ru/dev/games/doc/ru/console/purchases). Эти файлы предназначены для консоли и не включаются в игровой `build/`.

Иконки созданы встроенным инструментом `imagegen` по референсам, отрисованным из пяти исходных GLB. Сохранены внешний вид, костюмы и аксессуары; выбраны крупные портреты на общем сине-бирюзовом фоне с золотистым светом. У текущего `spider-man` гладкая серая голова без лица и чёрный костюм; его иконка следует этой модели. Оригиналы 1254×1254 сохранены в [masters](masters/); для консоли используйте версии из `icons/`. Точные промпты: [generation-prompts.json](generation-prompts.json).

Перед публикацией проверьте активность всех пяти товаров, их ID, персональные иконки, фактическую стоимость и восстановление постоянных прав после повторного входа.
