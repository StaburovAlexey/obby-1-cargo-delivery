



const phrases = Object.freeze({
  "Получить": "Claim",
  "Получено": "Claimed",
  "В процессе": "In progress",
  "Готово к получению": "Ready to claim",
  "Доступные награды": "Available rewards",
  "Монеты": "Coins",
  "Первый заработок": "First earnings",
  "Успешно доставить первый груз": "Successfully deliver your first cargo",
  "За парту": "Back to class",
  "Провести в классе суммарно 60 секунд активной игры": "Spend a total of 60 active gameplay seconds studying in a classroom",
  "Первый тюнинг": "First tune-up",
  "Купить первое улучшение обычной машины": "Buy your first ordinary vehicle upgrade",
  "Начинающий курьер": "Beginner courier",
  "Выполнить 3 успешные доставки": "Complete 3 successful deliveries",
  "Обновление гаража": "Garage upgrade",
  "Купить первую машину после стартовой": "Buy your first vehicle after the starter vehicle",
  "Осторожный водитель": "Careful driver",
  "Доставить груз без столкновений": "Deliver cargo without collisions",
  "Навстречу лесу": "Into the forest",
  "Открыть лесной биом": "Discover the forest biome",
  "Лесной курьер": "Forest courier",
  "Успешно доставить груз в лесном биоме": "Successfully deliver cargo in the forest biome",
  "Следующий класс": "Next class",
  "Открыть второй класс": "Unlock the second classroom",
  "Бережём груз": "Cargo care",
  "Выполнить 3 успешные доставки без столкновений": "Complete 3 successful deliveries without collisions",
  "Горячие пески": "Hot sands",
  "Открыть пустыню": "Discover the desert",
  "Через барханы": "Across the dunes",
  "Успешно доставить груз в пустынном биоме": "Successfully deliver cargo in the desert biome",
  "Машина становится лучше": "A better vehicle",
  "Довести любую общую характеристику обычных машин до 5-го уровня": "Raise any shared ordinary vehicle upgrade to level 5",
  "Любознательный": "Curious learner",
  "Открыть третий класс": "Unlock the third classroom",
  "Опытный курьер": "Experienced courier",
  "Выполнить 10 успешных доставок": "Complete 10 successful deliveries",
  "Холодный край": "Cold frontier",
  "Открыть снежный биом": "Discover the snow biome",
  "Полярная доставка": "Polar delivery",
  "Успешно доставить груз в снежном биоме": "Successfully deliver cargo in the snow biome",
  "Отличник": "Top student",
  "Открыть четвёртый класс": "Unlock the fourth classroom",
  "Земля огня": "Land of fire",
  "Открыть вулканический биом": "Discover the volcanic biome",
  "Горячий заказ": "Hot delivery",
  "Успешно доставить груз в вулканическом биоме": "Successfully deliver cargo in the volcanic biome",
  "Высшее образование": "Higher education",
  "Открыть пятый класс": "Unlock the fifth classroom",
  "Весь путь позади": "The whole journey",
  "Завершить полный основной маршрут с успешной финальной доставкой": "Complete the entire main route with a successful final delivery",
  "Знакомство с каньоном": "Meet the canyon",
  "Завершить первый зачётный заезд в каньоне": "Finish your first eligible canyon run",
  "Первый занос": "First drift",
  "Набрать 5 000 очков за один завершённый зачётный заезд в каньоне": "Score 5,000 points in one completed eligible canyon run",
  "Дрифт: первый рубеж": "Drift: first milestone",
  "Набрать 10 000 очков за один завершённый зачётный заезд в каньоне": "Score 10,000 points in one completed eligible canyon run",
  "Дополнительная тяга": "Extra thrust",
  "Купить нитро": "Buy nitro",
  "На ускорении": "On boost",
  "Использовать 10 зарядов нитро": "Use 10 nitro charges",
  "Дрифт: уверенный контроль": "Drift: steady control",
  "Набрать 25 000 очков за один завершённый зачётный заезд в каньоне": "Score 25,000 points in one completed eligible canyon run",
  "Дрифт: мастерство": "Drift: mastery",
  "Набрать 35 000 очков за один завершённый зачётный заезд в каньоне": "Score 35,000 points in one completed eligible canyon run",
  "Дрифт: высшая лига": "Drift: top league",
  "Набрать 45 000 очков за один завершённый зачётный заезд в каньоне": "Score 45,000 points in one completed eligible canyon run",
  "Завсегдатай каньона": "Canyon regular",
  "Завершить 10 зачётных заездов в каньоне": "Finish 10 eligible canyon runs",
  "Большой гараж": "Big garage",
  "Собрать все 8 обычных машин": "Collect all 8 ordinary vehicles",
  "Полный заряд": "Fully charged",
  "Улучшить нитро до 5-го уровня": "Upgrade nitro to level 5",
  "Надёжный перевозчик": "Reliable hauler",
  "Выполнить 20 успешных доставок без столкновений": "Complete 20 successful deliveries without collisions",
  "Легенда доставки": "Delivery legend",
  "Выполнить 50 успешных доставок": "Complete 50 successful deliveries",
  'XP/сек': 'XP/s',
  'Все обычные машины': 'All ordinary vehicles',
  'Каньон · дрифт':'Canyon Drift',
  'Каньон пройден':'Canyon complete',
  'Пройдите основной маршрут':'Complete the main route',
  'Въезжайте на BMW':'Enter in your BMW',
  'Приготовьтесь':'Get ready',
  'Попытка прервана.':'Attempt interrupted.',
  'Попытка прервана':'Attempt interrupted',
  'Очки дрифта':'Drift score',
  'Контрольная точка и время':'Checkpoint and time',
  'Точка':'Checkpoint',
  'м':'m',
  'с':'s',
  'Время вышло. Вы возвращены в ангар.':'Time is up. You have been returned to the hangar.',
  'Угол':'Angle',
  'Угол: 0°':'Angle: 0°',
  'Ещё заезд':'Race again',
  'Новая попытка с начала дороги':'Restart by driving back to the start',
  'Продолжить движение':'Keep driving',
  'Таблица Яндекса':'Yandex leaderboard',
  'Войти в Яндекс':'Sign in to Yandex',
  'К результату':'Back to result',
  'Место':'Rank',
  'Игрок':'Player',
  'Очки':'Score',
  'Результат отправлен в таблицу Яндекса.':'Your score was submitted to the Yandex leaderboard.',
  'Ваш лучший результат уже в таблице Яндекса.':'Your best score is already on the Yandex leaderboard.',
  'Войдите в Яндекс, чтобы попасть в таблицу лидеров.':'Sign in to Yandex to join the leaderboard.',
  'Личный рекорд сохранён. Рейтинг доступен в Яндекс Играх.':'Personal best saved. Rankings are available on Yandex Games.',
  'Личный рекорд сохранён. Результат не отправлен.':'Personal best saved. The score was not submitted.',
  'Тренировочный заезд. Личный рекорд сохранён.':'Practice run. Personal best saved.',
  'Тренировочный заезд. Результат не сохраняется.':'Practice run. The score is not saved.',
  'Сохраняем результат…':'Saving your result…',
  'Таблица лидеров временно недоступна.':'The leaderboard is temporarily unavailable.',
  'Не удалось загрузить рейтинг. Попробуйте позже.':'Unable to load rankings. Try again later.',
  'Аккаунт изменился. Перезагрузите игру.':'Account changed. Reload the game.',
  'Ваш лучший заезд попадёт в эту таблицу.':'Your best run will appear on this leaderboard.',
  'Пока нет результатов.':'No scores yet.',
  'Загрузка…':'Loading…',
  "Открывайте биомы": "Discover biomes",
  "Не удалось загрузить игру": "Unable to load the game",
  "Прогресс и настройки сохраняются в облаке Яндекс Игр. Без соединения изменения останутся до закрытия страницы. Сам рейс и положение машины не сохраняются. Настройки, потеря фокуса и фоновая вкладка ставят игру и заработок на паузу.": "Progress and settings are saved in the Yandex Games cloud. Without a connection, changes last until this page is closed. The current trip and vehicle position are not saved. Settings, loss of focus and background tabs pause the game and earnings.",
  "Монета вверху показывает ваш баланс. Над машиной или персонажем она обозначает цену; у выгрузки — награду за груз. В ангаре подойдите к товару и нажмите «Купить». Обычные покупки используют игровые деньги. Последние шесть персонажей покупаются за портальную валюту Яндекс Игр; цена указана рядом с её значком.": "The top coin shows your balance. Above a vehicle or character it shows a price; at an unloading point it shows the cargo reward. Approach an item and press Buy. Ordinary purchases use game money. The last six characters use Yandex Games portal currency; the price is shown with its icon.",
  "Подключение к комнате…": "Connecting to a room…",
  "Одиночный режим": "Single player",
  "Покупки недоступны": "Purchases unavailable",
  "Изменения ещё не сохранены в облаке. При закрытии страницы они могут пропасть.": "Changes have not been saved to the cloud yet. They may be lost when this page closes.",


  "Как играть": "How to play",
  "Один рейс — один груз. Выбирайте, где забрать награду, и возвращайтесь за следующей доставкой.": "One trip, one cargo load. Choose where to collect your reward, then return for the next delivery.",
  "Сядьте в машину": "Get in a vehicle",
  "Подойдите к купленной машине в ангаре. Первая машина бесплатна. Вы автоматически появитесь на старте с полным баком и одним грузом.": "Approach an owned vehicle in the hangar. The first vehicle is free. You will automatically start on the road with a full tank and one cargo load.",
  "Доставить сейчас или ехать дальше": "Deliver now or drive farther",
  "По ходу пути слева находятся точки выгрузки с суммой награды. Въезд в такую точку сдаёт груз, выдаёт награду и возвращает в ангар. Хотите более дорогую доставку? Проезжайте мимо и везите тот же груз дальше.": "Unloading points with reward amounts are on the left as you travel away from the start. Enter one to deliver your cargo, receive the reward and return to the hangar. For a larger delivery reward, pass it and take the same cargo farther.",
  "Заправляйтесь справа": "Refuel on the right",
  "Справа находятся заправки: въедьте в зону, и бак бесплатно заполнится. Груз останется с вами. Топливо тратится при движении, в том числе назад; на месте расхода нет. Не ждите нулевого остатка.": "Fuel stations are on the right: enter the zone to refill for free and keep your cargo. Moving uses fuel, including reversing; standing still does not. Refuel before the tank reaches zero.",
  "Берегите груз": "Protect your cargo",
  "Пустой бак, падение с моста или кнопка «Ангар» заканчивают рейс без награды за груз. Столкновение само по себе не отнимает груз, но лишает бонуса «Без аварий». На узких мостах держите колёса на полотне, перед препятствиями отпускайте газ. Не съезжайте с дороги: выезд за маршрут может лишить груз оплаты.": "An empty tank, a fall from a bridge or the Hangar button ends the trip without a cargo reward. A collision alone does not lose the cargo, but removes the No collisions bonus. Keep your wheels on narrow bridges and release the accelerator before obstacles. Stay on the road: leaving the route can invalidate the cargo reward.",
  "Зарабатывайте и улучшайте": "Earn and upgrade",
  "Учитесь и выполняйте задания": "Study and complete missions",
  "В ангаре слева пять входов в класс. Первый бесплатен, остальные классы покупаются строго по очереди за монеты. Подойдите к доступному входу, чтобы сесть за свободную парту и получать XP; кнопка «Встать» или движение заканчивают обучение. Значок планшета в ангаре открывает все задания. Готовые награды забирайте кнопкой «Получить».": "Five classroom entrances are on the left in the hangar. The first is free; buy the remaining classes in order with coins. Approach an unlocked entrance to sit at an available desk and earn XP; Stand up or movement ends the lesson. The hangar clipboard opens all missions. Use Claim to collect completed mission rewards.",
  "Откройте золотую BMW": "Unlock the golden BMW",
  "Пройдите весь путь из ангара через пять биомов за один рейс и доставьте груз в последней точке после финиша. Не сдавайте его раньше. Золотая BMW откроется на подиуме в ангаре. Тестовые переходы награду не открывают.": "Drive the entire route from the hangar through all five biomes in one trip, then deliver at the last point beyond the finish. Do not unload earlier. The golden BMW will unlock on the hangar pedestal. Test teleports do not unlock it.",
  "Прогресс сохраняется в этом браузере. При предупреждении «Не сохранено» он может пропасть после закрытия страницы. Сам рейс и положение машины не сохраняются. Настройки, потеря фокуса и фоновая вкладка ставят игру и заработок на паузу.": "Progress is saved in this browser. A Not saved warning means it may be lost after closing the page. The current trip and vehicle position are not saved. Settings, loss of focus and background tabs pause the game and earnings.",
  "Значки и управление": "Icons and controls",
  "Ниже показаны настоящие значки и элементы интерфейса. Это примеры, нажимать на них не нужно. Некоторые кнопки появляются только в ангаре или в машине.": "These are the actual interface icons and controls. The examples are not buttons. Some controls appear only in the hangar or in a vehicle.",
  "Движение и камера": "Movement and camera",
  "Джойстик": "Joystick",
  "Пешком тяните круг слева. Чем дальше тянете, тем быстрее бежите. На клавиатуре: WASD или стрелки, Shift для бега.": "On foot, drag the circle on the left. Drag farther to run faster. Keyboard: WASD or arrow keys; Shift to run.",
  "Руль": "Steering wheel",
  "В машине вращайте руль пальцем или мышью. Клавиатура: A / D или ← / →. Руль сам не даёт газ.": "In a vehicle, turn the wheel with your finger or mouse. Keyboard: A / D or ← / →. Steering alone does not accelerate.",
  "Газ": "Accelerator",
  "Удерживайте синюю педаль, чтобы ехать вперёд; отпустите для наката. Клавиатура: W / ↑ / Space.": "Hold the blue pedal to drive forward; release it to coast. Keyboard: W / ↑ / Space.",
  "Задний ход": "Reverse",
  "Удерживайте педаль R для заднего хода. На BMW педаль R или S / ↓ на ходу включает ручник; газ можно держать одновременно. Чтобы поехать назад, остановитесь, отпустите и нажмите снова. Shift также включает ручник.": "Hold R to reverse. In the BMW, R or S / ↓ applies the handbrake while moving; you can keep holding the gas. To reverse, stop, release and press again. Shift also applies the handbrake.",
  "Ручник на ходу / задний ход после остановки": "Handbrake while moving / reverse after stopping",
  "Прыжок": "Jump",
  "Стрелка вверх подбрасывает персонажа пешком. Клавиша Space. В машине Space отвечает за газ, а не за прыжок.": "The up arrow makes the character jump on foot. Keyboard: Space. In a vehicle, Space accelerates instead of jumping.",
  "Встать": "Stand up",
  "Появляется во время обучения. Нажмите, чтобы выйти из-за парты; движение тоже прекращает обучение.": "Appears while studying. Press it to leave the desk; movement also ends studying.",
  "Занос: на скорости поворачивайте плавно. Если заднюю часть машины сносит, уменьшите газ и мягко поверните руль в сторону заноса; по мере выравнивания возвращайте руль к центру. Перед мостом заранее сбросьте скорость. Камера: проведите пальцем или перетащите мышью по свободной части 3D-сцены. Не начинайте жест на руле, педалях или джойстике. За рулём камера плавно возвращается после движения машины.": "Sliding: steer smoothly at speed. If the rear slides, ease off the throttle and gently steer into the slide; return the wheel toward the center as the car straightens. Slow down before a bridge. Camera: swipe or drag the mouse across an empty part of the 3D scene. Start away from the steering wheel, pedals and joystick. While driving, the camera eases back after the vehicle moves.",
  "Ресурсы и покупки": "Resources and purchases",
  "Деньги и цена": "Money and prices",
  "Монета вверху показывает ваш баланс. Над машиной или персонажем она обозначает цену; у выгрузки — награду за груз. В ангаре подойдите к товару и нажмите «Купить». Покупки используют только игровые деньги.": "The top coin shows your balance. Above a vehicle or character it shows a price; at an unloading point it shows the cargo reward. Approach an item in the hangar and press Buy. Purchases use game money only.",
  "XP": "XP",
  "Синий жетон XP вверху — запас валюты для улучшений. Такой же значок на кнопке улучшения обозначает его цену в XP.": "The blue XP badge at the top is your upgrade currency balance. The same icon on an upgrade button marks its price in XP.",
  "Топливо": "Fuel",
  "Канистра внизу рядом с полосой и числами: остаток / ёмкость бака. Если топлива мало, заезжайте на заправку справа.": "The canister at the bottom sits beside the fuel bar and remaining / tank capacity numbers. When fuel is low, visit a station on the right.",
  "Скорость на экране": "Speed readout",
  "Число внизу показывает текущую скорость в км/ч. Это индикатор, не кнопка.": "The bottom number shows current speed in km/h. This is a readout, not a button.",
  "Обучение": "Studying",
  "Книга с XP обозначает вход в класс. Число рядом с XP и «/сек» — скорость обучения. Более дорогие классы дают XP быстрее.": "The book with a XP marks a classroom entrance. The XP number with /s is the learning rate. More expensive classes earn XP faster.",
  "Закрытый класс": "Locked class",
  "Замок у входа означает, что доступ ещё не куплен. Подойдите и нажмите «Купить» за указанную сумму. Первый класс бесплатен; доступ к остальным покупается один раз.": "A lock at an entrance means access has not been purchased. Approach and press Buy for the shown amount. The first class is free; other classes require a one-time purchase.",
  "Меню и действия": "Menus and actions",
  "Ангар": "Hangar",
  "Вернуться в ангар": "Return to hangar",
  "Вернуться": "Return",
  "в ангар": "to hangar",
  "Домик возвращает вас в ангар. Если нажать во время рейса, груз пропадёт без награды.": "The building returns you to the hangar. Pressing it during a trip discards the cargo without a reward.",
  "Задания": "Missions",
  "Планшет в ангаре открывает список всех заданий. Готовые к получению поднимаются вверх, полученные уходят в конец. Красная точка и анимация значка напоминают о доступных наградах.": "The hangar clipboard opens all missions. Rewards ready to claim move to the top; claimed missions move to the bottom. A red dot and an animated icon remind you of available rewards.",
  "Улучшения машины": "Vehicle upgrades",
  "Настройки": "Settings",
  "Шестерёнка открывает это окно: громкость, язык, музыку, правила, значки и авторов. Закройте окно крестиком или клавишей Escape, чтобы продолжить.": "The gear opens this window: volume, language, music, instructions, icons and credits. Close it with the cross or Escape to resume.",
  "Звук": "Sound",
  "Динамик включает или выключает звук. Перечёркнутый динамик означает тишину. Точная громкость меняется ползунком в настройках.": "The speaker toggles sound. A crossed-out speaker means muted. Use the settings slider to adjust the volume.",
  "Закрыть окно": "Close window",
  "Крестик закрывает текущее окно. В настройках также работает Escape или нажатие на затемнение вокруг панели.": "The cross closes the current window. Settings also close with Escape or a click on the dimmed area around the panel.",
  "Деньги на все машины · тест": "Money for all cars · test",
  "Необязательная оранжевая кнопка в ангаре один раз добавляет недостающие деньги на обычные машины. BMW всё равно нужно открыть полным рейсом. После использования кнопка исчезает.": "The optional orange hangar button adds the missing funds for ordinary vehicles once. BMW still requires a complete delivery run. The button disappears after use.",
  "Четыре улучшения": "The four upgrades",
  "Молния · скорость": "Lightning · speed",
  "Ускоряет отклик руля и помогает удерживать и выравнивать машину в заносе.": "Improves steering response and helps hold and recover a slide.",
  "Шина · сцепление": "Tire · grip",
  "Повышает устойчивость к срыву в занос, улучшает восстановление сцепления и торможение.": "Raises the traction breakaway threshold and improves grip recovery and braking.",
  "Канистра · бак": "Canister · tank",
  "Разделы настроек": "Settings sections",
  "Значки": "Icons",
  "Авторы и лицензии": "Credits and licenses",
  "Содержимое настроек и справки": "Settings and help content",

  'Urban Route — процедурный город': 'Urban Route — procedural city',
  'Процедурный городской район, целиком собранный кодом на Three.js. Пять соединённых биомов, широкие дороги с развилками и управляемый грузовик. С выбором 17 персонажей, классом ПДД, восемью обычными машинами и заправками.': 'A procedural city built entirely in Three.js. Five connected biomes, branching roads and a drivable truck. Choose from 17 characters, attend driving school, collect eight ordinary vehicles and visit fuel stations.',
  'Интерактивная трёхмерная сцена городского района': 'Interactive 3D city scene',
  '3D город. Перетаскивайте, чтобы повернуть камеру.': '3D city. Drag to rotate the camera.',
  'ПЯТЬ БИОМОВ · ОДИН ГОРОД': 'FIVE BIOMES · ONE CITY',
  'Включить звук': 'Unmute sound', 'Выключить звук': 'Mute sound',
  'Обзор': 'Overview', 'Вернуться': 'Return', 'Ангар': 'Hangar',
  'Улучшения машины': 'Vehicle upgrades', 'Накопления на машину': 'Vehicle savings',
  'Задания': 'Missions', 'Задание': 'Mission', 'Заработанные деньги': 'Money earned',
  'XP': 'XP', 'Деньги на все машины': 'Funds for all vehicles', 'Тест · один раз': 'Test · one use',
  'Покупка за XP. Улучшается только эта машина.': 'Buy with XP. Upgrades apply only to this vehicle.',
  'Скорость': 'Speed', 'Управляемость': 'Handling', 'Управление': 'Handling',
  'Сцепление': 'Grip', 'Бак': 'Fuel tank', 'Закрыть': 'Close', 'Закрыть окно': 'Close window',
  'Коплю на машину': 'Saving for a vehicle', 'Выбери следующую машину': 'Choose your next vehicle',
  'Пикап': 'Pickup', 'Городской курьер': 'City courier', 'Внедорожник': 'Off-roader',
  'Лесовоз': 'Forest hauler', 'Фургон': 'Van', 'Песчаный разведчик': 'Desert scout',
  'Ледовый вездеход': 'Ice rover', 'Полярный экспресс': 'Polar express',
  'Лавовый тягач': 'Lava crawler', 'Пепельный караван': 'Ash hauler', 'BMW — награда': 'BMW — reward',
  'Все машины собраны': 'All vehicles collected', 'Заданий пока нет': 'No missions yet',
  'Сменить задание бесплатно': 'Switch mission for free', 'Сменить': 'Switch',
  'Груз доставлен': 'Cargo delivered', 'Закрыть итог доставки': 'Close delivery summary',
  'Награды за доставку': 'Delivery rewards', 'Награда': 'Reward', 'Игровые деньги': 'Game money',
  'Доставка': 'Delivery', 'Без аварий': 'No collisions', 'Сложный рейс': 'Hard route',
  'Первый визит': 'First visit', 'Всего': 'Total', 'Купить': 'Buy', 'Выбрать': 'Select',
  'Выбрать биом': 'Choose biome', 'Биом': 'Biome', 'Выбери биом': 'Choose a biome',
  'Тестовая поездка без оплаты груза. Новый рейс начинается в ангаре.': 'Test drive without cargo payment. Start a new delivery from the hangar.',
  'Город': 'City', 'Лес': 'Forest', 'Пустыня': 'Desert', 'Снег': 'Snow', 'Вулкан': 'Volcano',
  'Перед финишем': 'Before the finish', 'ТЕСТ · БЕЗ ОПЛАТЫ ГРУЗА': 'TEST · NO CARGO PAYMENT',
  'Не сохранено': 'Not saved', 'Сохранение сброшено': 'Save reset',
  'Локальное сохранение недоступно. Прогресс может пропасть после закрытия страницы.': 'Local saving is unavailable. Progress may be lost when you close this page.',
  'Сложная ветка: +15% за успешную доставку': 'Hard route: +15% for a successful delivery',
  '/сек': '/s', 'м/с': 'm/s', 'км/ч': 'km/h', 'м/с²': 'm/s²', 'мс': 'ms', 'ед.': 'units',
  'Разблокировать':'Unlock', 'Разблокировать секретную машину':'Unlock secret vehicle',
  'Секретная машина. Подойдите к маркеру и нажмите «Разблокировать».':'Secret vehicle. Approach the marker and press Unlock.',
  'Секретная машина пока заблокирована.':'This secret vehicle is locked for now.',
  'Заблокировано': 'Locked', 'Генерация района': 'District generation', 'Город из кода': 'A city made of code',
  'Seed генерации': 'Generation seed', 'Собрать другой вариант': 'Generate another layout',
  'Другой район': 'New district', 'Город · лес · пустыня · снег · вулкан': 'City · forest · desert · snow · volcano',
  'Управление персонажем': 'Character controls', 'Прыжок': 'Jump', 'Встать': 'Stand up',
  'Машина — выезд · Жёлтый круг слева — класс ПДД': 'Vehicle — drive out · Yellow circle on the left — driving school',
  'Тяните дальше — бег · WASD / Shift': 'Drag farther to run · WASD / Shift',
  'Джойстик движения персонажа': 'Character movement joystick', 'Управление машиной': 'Vehicle controls',
  'Поворачивайте руль пальцем.': 'Turn the wheel with your finger.',
  'Удерживайте газ, чтобы ехать вперёд.': 'Hold the accelerator to drive forward.',
  'Отпустите газ — накат.': 'Release the accelerator to coast.',
  'W / ↑ / пробел — газ · A / D / ← / → — руль': 'W / ↑ / Space — accelerate · A / D / ← / → — steer',
  'Руль': 'Steering wheel', 'Прямо': 'Straight', 'Газ: удерживайте для движения вперёд': 'Accelerator: hold to drive forward',
  'Задний ход: удерживайте для движения назад': 'Reverse: hold to drive backward', 'ГАЗ': 'GAS',
  'Запас топлива': 'Fuel level', 'Состояние движения': 'Driving status', 'СТОП': 'STOP',
  'Загрузка мира и сервера': 'Loading world and server',
  '. Изменены цвет, масштаб и оси колёс.': '. Color, scale and wheel axes modified.',
  'Изменены цвет, масштаб и оси колёс.': 'Color, scale and wheel axes modified.',
  'Не удалось открыть 3D': 'Unable to open 3D',
  'Для этой сцены нужен WebGL 2. Попробуйте другой современный браузер с включённым аппаратным ускорением.': 'This scene requires WebGL 2. Try a modern browser with hardware acceleration enabled.',
  'Повторить': 'Retry', 'УЛИЦА': 'STREET', 'ДИОРАМА': 'DIORAMA', 'ЛЕС / ПУСТЫНЯ': 'FOREST / DESERT',
  'СНЕГ / ВУЛКАН': 'SNOW / VOLCANO', 'Ракурс камеры': 'Camera view', 'Улица': 'Street',
  'Диорама': 'Diorama', 'Лес / песок': 'Forest / sand', 'Снег / вулкан': 'Snow / volcano',
  'Автоматическое вращение': 'Automatic rotation', 'Облёт': 'Orbit', 'Показать сетку': 'Show wireframe', 'Сетка': 'Wireframe',
  'Перетаскивайте для поворота · колесо или щипок для масштаба · два пальца для сдвига': 'Drag to rotate · scroll or pinch to zoom · two fingers to pan',
  'Три доставки': 'Three deliveries', 'Успешно доставь груз 3 раза': 'Successfully deliver cargo 3 times',
  'Два чистых моста': 'Two clean bridges', 'Пересеки 2 разных моста и доставь груз без столкновений': 'Cross 2 different bridges and deliver cargo without collisions',
  'Сложный маршрут': 'Hard route', 'Пройди сложную ветку целиком и доставь груз': 'Complete a hard route and deliver the cargo',
  'Можно купить в ангаре': 'Ready to buy in the hangar',
  'Открыта золотая BMW! Она ждёт на постаменте в ангаре.': 'Golden BMW unlocked! It is waiting on the pedestal in the hangar.',
  'Недостаточно денег. Выполните доставку на пикапе.': 'Not enough money. Complete a delivery in the pickup.',
  'Подойдите к машине для покупки.': 'Approach the vehicle to buy it.',
  'Образ куплен. Нажмите «Выбрать» или подойдите снова.': 'Outfit purchased. Press “Select” or approach again.',
  'Доступ открыт. Нажмите «Сесть» или подойдите снова.': 'Access unlocked. Press “Sit down” or approach again.',
  'Недостаточно игровых денег.': 'Not enough game money.', 'Подойдите к нужному маркеру.': 'Approach the required marker.',
  'Недостаточно XP. Езжайте или учитесь.': 'Not enough XP. Drive or study to earn more.',
  'Максимальный уровень.': 'Maximum level.', 'Улучшения доступны только в машине.': 'Upgrades are only available in a vehicle.',
  'Одноразовая выдача уже использована.': 'The one-time grant has already been used.',
  'Сохранение недоступно. Прогресс сохранится только до закрытия этой страницы.': 'Saving is unavailable. Progress will only last until this page is closed.',
  'Для выезда выбери машину': 'Choose a vehicle to drive out',
  'Класс ПДД · движение или «Встать», чтобы выйти из класса.': 'Driving school · move or press “Stand up” to leave the classroom.',
  'Все 20 мест заняты. Подойдите позже.': 'All 20 seats are occupied. Come back later.',
  'Вы рядом с классом. Выберите вход с нужной скоростью обучения.': 'You are beside the classroom. Choose an entrance with the learning rate you want.',
  'Сначала встаньте из-за парты': 'Stand up from the desk first', 'Для прыжка нужно немного места': 'You need some space to jump',
  'Стартовая полоса занята. Вы возвращены в ангар.': 'The starting lane is occupied. You have returned to the hangar.',
  'Вы в ангаре. За потерянный груз награда не начисляется.': 'You are in the hangar. Lost cargo earns no reward.',
  'Топливо закончилось. Вы в ангаре — выберите машину.': 'Out of fuel. You are in the hangar — choose a vehicle.',
  'Подойдите к купленной машине, чтобы сесть.': 'Approach a purchased vehicle to get in.',
  'Точка перехода недоступна': 'Destination unavailable',
  'Справа машины, слева класс ПДД, позади персонажи.': 'Vehicles are on the right, driving school on the left, and characters behind you.',
  'Не удалось полностью загрузить мир. Проверьте соединение и нажмите «Повторить».': 'Unable to finish loading the world. Check your connection and press “Retry”.',
  'Не удалось загрузить персонажа. Проверьте соединение и нажмите «Повторить».': 'Unable to load the character. Check your connection and press “Retry”.',
  'Модель не загрузилась. Текущий персонаж не изменён. Проверьте соединение и повторите загрузку.': 'The model failed to load. Your current character is unchanged. Check your connection and retry.',
  'Браузер потерял графический контекст. Нажмите «Повторить», чтобы пересобрать сцену.': 'The browser lost its graphics context. Press “Retry” to rebuild the scene.',
  'Машина упала с моста. Груз потерян.': 'The vehicle fell off the bridge. Cargo lost.',
  'МАКС': 'MAX', 'Сцепление: позже срыв в занос, быстрее восстановление и лучше торможение': 'Grip: later breakaway, faster recovery and stronger braking',
  'Меню': 'Menu', 'Игровое меню': 'Game menu', 'Открыть меню': 'Open menu', 'Закрыть меню': 'Close menu',
  'Настройки': 'Settings', 'Громкость': 'Volume', 'Громкость звука': 'Sound volume', 'Звук': 'Sound',
  'Язык': 'Language', 'Язык интерфейса': 'Interface language', 'Продолжить': 'Continue',
  'Продолжить игру': 'Resume game', 'Лицензии': 'Licenses', 'Авторы и лицензии': 'Credits and licenses',
  'Лицензии и авторы': 'Licenses and credits', 'Звуки': 'Sounds', 'Модели': 'Models',
  'Музыка и звуки': 'Music and sounds', 'Модели и текстуры': 'Models and textures',
  'Русский': 'Русский', 'Английский': 'English', 'Разработчик': 'Developer', 'Режим разработчика': 'Developer mode',
  'Тестовые инструменты': 'Test tools', 'Назад': 'Back', 'Открыть лицензию': 'View license',
  'Закрыть настройки': 'Close settings', 'Настройки игры': 'Game settings',
  'Все звуки игры. 0% — без звука.': 'All game sounds. 0% — muted.',
  'Двигатель: стерео WAV преобразован в моно Ogg Vorbis, 44,1 кГц. В игре изменяются громкость и высота звука.': 'Engine: stereo WAV converted to mono Ogg Vorbis, 44,1 kHz. Volume and pitch are adjusted in game.',
  'Обработка петли: qubodup. Шины: моно WAV, 96 кГц, преобразован в Ogg Vorbis, 44,1 кГц. В игре изменяются громкость и высота звука.': 'Loop processing: qubodup. Tires: mono WAV, 96 kHz, converted to Ogg Vorbis, 44,1 kHz. Volume and pitch are adjusted in game.',
  'Столкновения: impactMetal_heavy_001.ogg. Файл не изменён; громкость зависит от силы удара.': 'Collisions: impactMetal_heavy_001.ogg. The file is unchanged; volume depends on impact strength.',
  'Источник': 'Source', 'Автор': 'Author', 'Лицензия из набора': 'Included license',
  'Полные сведения о звуках и изменениях': 'Full sound credits and modifications', '3D-модели': '3D models',
  '10 машин. В игре изменены масштаб, ориентация, материалы и анимация колёс.': '10 vehicles. Scale, orientation, materials and wheel animation are modified in game.',
  'Изменения моделей': 'Model modifications',
  'Изменены масштаб и оси; добавлены анимация колёс, золотая окраска, отражения и настройка света и теней. Исходный GLB не изменён.': 'Scale and axes modified; wheel animation, gold paint, reflections, and lighting and shadow adjustments added. The source GLB is unchanged.',
  'Указание авторства не означает поддержку проекта автором или BMW. Лицензия модели не предоставляет прав на товарные знаки.': 'Attribution does not imply endorsement by the author or BMW. The model license does not grant trademark rights.',
  'Полные сведения и изменения': 'Full credits and modifications', 'Персонажи': 'Characters',
  '17 моделей из «Обби: Побег +1 Крылья». Разработчик страницы игры: GameMaster2000; авторы отдельных моделей не установлены.': '17 models from “Обби: Побег +1 Крылья”. Game-page developer: GameMaster2000; individual model authors are unverified.',
  'Лицензия на повторное использование и коммерческую публикацию не установлена. Доступность моделей не означает разрешение на их использование.': 'A license for reuse or commercial publication has not been established. Availability of the models does not imply permission to use them.',
  'Источник, указанный в README': 'Source listed in the README', 'Сведения о персонажах': 'Character information',
  "Общие улучшения всех обычных машин за XP. Новые машины сохраняют купленные уровни.": "Shared upgrades for all ordinary vehicles, paid with XP. Newly purchased vehicles keep the bought levels.",
  "Шины": "Tires",
  "Городские": "City",
  "Лесные": "Forest",
  "Пустынные": "Desert",
  "Зимние": "Winter",
  "Вулканические": "Volcanic",
  "Подходящие": "Suitable",
  "Куплено": "Owned",
  "Сначала предыдущие шины": "Buy previous tires first",
  "Недостаточно XP": "Not enough XP",
  "Нужна купленная обычная машина": "An owned ordinary vehicle is required",
  "Следующий комплект": "Next set",
  "Шины покупаются по порядку за XP и действуют на все обычные машины. Каждый комплект сохраняет свойства предыдущих.": "Buy tires in sequence with XP for all ordinary vehicles. Each set retains the benefits of previous sets.",
  "Сначала купите предыдущие шины.": "Buy the previous tires first.",
  "Эти шины уже куплены.": "These tires are already owned.",
  "Шины доступны в купленной обычной машине.": "Tires are available in an owned ordinary vehicle.",
  "Устойчивость": "Stability",
  "Деньги за доставки нужны для машин, персонажей и платных классов. XP начисляются за движение машины, обучение и бонусы доставки. За XP улучшайте все обычные машины: скорость, устойчивость, сцепление и бак, до 10 уровней каждого параметра. Уровни общие и сохраняются при покупке следующей машины.": "Delivery money buys vehicles, characters and paid classes. Earn XP by driving, studying and delivery bonuses. Use XP to upgrade speed, stability, grip and fuel tank for all ordinary vehicles, up to 10 levels each. The levels are shared and stay when you buy your next vehicle.",
  "Обычные машины покупаются по порядку в ангаре. За движение выбранной машины начисляется от 1 до 8 XP/сек: каждая следующая машина даёт на 1 XP/сек больше. У всех одинаковые начальные скорость 100 км/ч и запас хода 300 м. Купленные улучшения общие: скорость до 150 км/ч, дальность до 4700 м. Для дорогих биомов покупайте шины: лесные, пустынные, зимние и вулканические. Их свойства складываются. Груз можно сдать на любой обычной машине в любом биоме.": "Buy ordinary vehicles in sequence in the hangar. Earn 1 to 8 XP/s from the selected vehicle while moving: each next vehicle earns 1 more XP/s. All start at 100 km/h with a 300 m range. Shared upgrades raise speed to 150 km/h and range to 4700 m. Buy forest, desert, winter and volcanic tires for later biomes. Their benefits are cumulative. Any ordinary vehicle can deliver cargo in any biome.",
  "Гаечный ключ доступен пешком и в машине. Открывает четыре общих улучшения обычных машин и магазин шин за XP. Улучшения наградных машин покупаются отдельно.": "The wrench is available on foot and in a vehicle. It opens four shared ordinary-vehicle upgrades and a tire shop, paid with XP. Reward vehicle upgrades are purchased separately.",
  "Повышает максимальную скорость и разгон. Обычные машины: от 100 до 150 км/ч за 10 уровней.": "Raises top speed and acceleration. Ordinary vehicles: 100 to 150 km/h over 10 levels.",
  "Синий руль · устойчивость": "Blue wheel · stability",
  "Увеличивает ёмкость и дальность на одном баке. Обычные машины: от 300 до 4700 м за 10 уровней. С подходящими шинами и заправками по пути начального бака хватает до второй точки доставки; каждый уровень добавляет ещё одну или две доступные точки. Для финиша нужен 10-й уровень бака. На последнем перегоне его запас рассчитан на одну потерю 10% полного бака. При покупке добавляется новый объём бака; потраченное топливо не возвращается. Для полной заправки заезжайте на заправку.": "Increases fuel capacity and range. Ordinary vehicles: 300 to 4700 m over 10 levels. With suitable tires and refueling along the way, the stock tank reaches the second delivery point; each level adds one or two reachable destinations. Finishing requires tank level 10. Its reserve on the final leg allows for one loss of 10% of full-tank capacity. Buying the upgrade adds the new tank volume but does not restore fuel already spent. Visit a station to fill the tank.",
});

const quantity = String.raw`([+−-]?\d(?:[\d.,\u00a0\u202f ]*\d)?)`;
const rx = source => new RegExp('^' + source + '$', 'u');


const templates = [
  [/^Очки ×([2-5])!$/u,(_, multiplier)=>`Points ×${multiplier}!`],
  [/^Тормоз$/u,()=> 'Brake'],
  [/^Ручник$/u,()=> 'Handbrake'],
  [/^Проедьте немного дальше, чтобы открыть биом «(.+)»\.$/u, (_, biome) => `Drive a little farther to discover the ${translateCore(biome)} biome.`],
  [/^Сначала: (.+)$/u, (_, vehicle) => `First: ${translateCore(vehicle)}`],
  [/^Сначала купите (.+)\.$/u, (_, vehicle) => `Buy ${translateCore(vehicle)} first.`],
  [/^Открыт биом «(.+)»\. (.+) шины улучшают сцепление, скорость и расход топлива\. Доставка доступна на любой купленной машине\.$/u, (_, biome, tyres) => `${translateCore(biome)} biome discovered. ${translateCore(tyres)} tires improve grip, speed and fuel economy. Any owned vehicle can deliver cargo.`],
  [/^Текущие шины: (.+)$/u, (_, tyres) => `Current tires: ${translateCore(tyres)}`],
  [/^Без штрафа: (.+)$/u, (_, biomes) => `No penalty: ${biomes.split(', ').map(translateCore).join(', ')}`],
  [/^(.+): (Куплено|Сначала предыдущие шины|Недостаточно XP|Нужна купленная обычная машина|Следующий комплект)\. Цена: (\d+) XP\.$/u, (_, tyres, status, price) => `${translateCore(tyres)}: ${translateCore(status)}. Price: ${price} XP.`],
  [/^Шины куплены: (.+)\.$/u, (_, tyres) => `Tires purchased: ${translateCore(tyres)}.`],
  [/^Купить ([\d.,\s\u00a0\u202f]+[A-Za-zА-Яа-я₽$€¥]+)$/u, (_, price) => `Buy ${price}`],
  [/^Онлайн: (\d+)\/20$/u, (_, n) => `Online: ${n}/20`],
  [/^Игрок (.+)$/u, (_, id) => `Player ${id}`],
  [/^(.+)\. Покупка через Яндекс Игры\.$/u, (_, name) => `${name}. Purchase through Yandex Games.`],
  [/^(.+)\. Покупка через ВКонтакте\.$/u, (_, name) => `${name}. Purchase through VK.`],
  [/^Купить (.+) гол\.$/u, (_, price) => `Buy ${price} votes`],
  [/^(.+) гол\.$/u, (_, price) => `${price} votes`],
  [/^Класс (\d+)$/u, (_, n) => `Class ${n}`],
  [rx(`Купить ${quantity}`), (_, n) => `Buy ${n}`],
  [rx(`Купить (.+) за ${quantity}\\. (Средств достаточно|Недостаточно денег)`), (_, name, n, status) => `Buy ${translateCore(name)} for ${n}. ${status === 'Средств достаточно' ? 'Enough money' : 'Not enough money'}`],
  [rx(`Купить (.+) за ${quantity} игровых денег`), (_, name, n) => `Buy ${translateCore(name)} for ${n} game money`],
  [rx(`Осталось ${quantity}`), (_, n) => `${n} remaining`],
  [rx(`Заработанные деньги: ${quantity}`), (_, n) => `Money earned: ${n}`],
  [rx(`XP: ${quantity}`), (_, n) => `XP: ${n}`],
  [rx(`${quantity} из ${quantity}`), (_, n, total) => `${n} of ${total}`],
  [rx(`Накопления на (.+): ${quantity} из ${quantity}`), (_, name, n, total) => `Savings for ${translateCore(name)}: ${n} of ${total}`],
  [/^Задания: (.+)\. Прогресс ([\d\s\u202f/]+)$/u, (_, name, n) => `Missions: ${translateCore(name)}. Progress ${n}`],
  [/^(Три доставки|Два чистых моста|Сложный маршрут): ([\d\s\u202f/]+)$/u, (_, name, n) => `${translateCore(name)}: ${n}`],
  [rx(`(Награда|Груз доставлен): ${quantity} игровых денег и ${quantity} XP`), (_, label, cash, XP) => `${translateCore(label)}: ${cash} game money and ${XP} XP`],
  [rx(`(Доставка|Без аварий|Сложный рейс|Первый визит|Задание): ${quantity} игровых денег, ${quantity} XP`), (_, label, cash, XP) => `${translateCore(label)}: ${cash} game money, ${XP} XP`],
  [rx(`Сесть · \\+${quantity} XP/сек`), (_, n) => `Sit down · +${n} XP/s`],
  [rx(`(Класс \\d+) · \\+${quantity} XP/сек`), (_, name, n) => `${translateCore(name)} · +${n} XP/s`],
  [/^(Вправо|Влево) (\d+)%$/u, (_, direction, n) => `${direction === 'Вправо' ? 'Right' : 'Left'} ${n}%`],
  [/^([+−\-\d.,\s\u202f→()%]+) (км\/ч|м\/с²|м\/с|мс|ед\.|м)$/u, (_, n, unit) => `${n} ${unit === 'м' ? 'm' : phrases[unit]}`],
  [/^Разгон: (.+)$/u, (_, value) => `Acceleration: ${translateCore(value)}`],
  [/^Отклик руля: меньше — быстрее\. Контроль заноса и управление: ([\d.,\s→]+)$/u, (_, value) => `Steering response: lower is faster. Slide control and handling: ${value}`],
  [/^Отклик руля: меньше — быстрее\. Управление: ([\d.,\s→]+)$/u, (_, value) => `Steering response: lower is faster. Handling: ${value}`],
  [/^Объём бака: ([\d.,\s→]+) ед\.( \(\+[\d.,]+ м\))?\. Заправка отдельно\.$/u, (_, value, extra = '') => `Tank capacity: ${value} units${extra.replace(' м)', ' m)')}. Refuel at a station.`],
  [/^(Скорость|Устойчивость|Управление|Сцепление|Бак): максимальный уровень$/u, (_, stat) => `${translateCore(stat)}: maximum level`],
  [rx(`(Скорость|Устойчивость|Управление|Сцепление|Бак): уровень (\\d+), ${quantity} XP\\. (.+?)\\. (.+)`), (_, stat, level, price, value, detail) => `${translateCore(stat)}: level ${level}, ${price} XP. ${translateCore(value)}. ${translateCore(detail)}`],
  [/^(.+) · ([\d\s\u202f]+)$/u, (_, name, price) => `${translateCore(name)} · ${price}`],
  [/^(.+) \/ (КЛАСС ПДД|АНГАР|ПЕШКОМ)$/u, (_, name, place) => `${name} / ${{'КЛАСС ПДД': 'DRIVING SCHOOL', 'АНГАР': 'HANGAR', 'ПЕШКОМ': 'ON FOOT'}[place]}`],
  [/^(\d+)K \+ ГАРАЖ \/ 5 БИОМОВ$/u, (_, n) => `${n}K + GARAGE / 5 BIOMES`],
  [rx(`Груз доставлен! \\+${quantity} · Всего ${quantity}`), (_, reward, total) => `Cargo delivered! +${reward} · Total ${total}`],
  [/^Бак заправлен · ([\d.,/]+)\. (Тестовая поездка|Груз сохранён)\.$/u, (_, fuel, note) => `Tank refilled · ${fuel}. ${note === 'Тестовая поездка' ? 'Test drive' : 'Cargo retained'}.`],
  [rx(`(.+) · ${quantity}\\. (Покупка только кнопкой|Доступ покупается один раз)\\.`), (_, name, price, note) => `${translateCore(name)} · ${price}. ${note === 'Покупка только кнопкой' ? 'Use the button to purchase' : 'One-time access purchase'}.`],
  [/^(.+) куплен\. Отойдите и подойдите снова, чтобы сесть\.$/u, (_, name) => `${translateCore(name)} purchased. Step away and approach again to get in.`],
  [/^Улучшение куплено · уровень (\d+)$/u, (_, level) => `Upgrade purchased · level ${level}`],
  [rx(`Добавлено ${quantity} игровых денег\\. Одноразовая выдача использована\\.`), (_, amount) => `Added ${amount} game money. One-time grant used.`],
  [/^(.+) · груз загружен\. Слева выгрузка, справа заправка\.$/u, (_, name) => `${translateCore(name)} · cargo loaded. Unloading on the left, fuel on the right.`],
  [/^(.+) · тестовая поездка без оплаты груза\. Новый рейс — из ангара\.$/u, (_, name) => `${translateCore(name)} · test drive without cargo payment. Start a new delivery from the hangar.`],
  [/^(.+) уже выбран$/u, (_, name) => `${name} already selected`],
  [/^(.+) выбран$/u, (_, name) => `${name} selected`],
  [/^Загружаем (.+)…$/u, (_, name) => `Loading ${name}…`],
  [/^Не удалось загрузить сцену\. Проверьте поддержку WebGL 2 и откройте страницу через HTTP-сервер\. ([\s\S]*)$/u, (_, error) => `Unable to load the scene. Check WebGL 2 support and open the page through an HTTP server. ${error}`],
  [/^Звуки: ([\s\S]+)$/u, (_, credits) => `Sounds: ${credits}`],
];

function translateCore(text) {
  if (Object.hasOwn(phrases, text)) return phrases[text];
  for (const [pattern, replacement] of templates) {
    const match = pattern.exec(text);
    if (match) return replacement(...match);
  }
  return text;
}


export function translateGameText(value, language = 'en') {
  const text = String(value ?? '');
  if (language !== 'en' || !/[А-Яа-яЁё]/u.test(text)) return text;
  const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/u.exec(text);

  let translated = translateCore(core);
  if (translated === core) {
    const normalized = core.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');


    translated = Object.hasOwn(phrases, normalized) ? phrases[normalized] : core;
  }
  return translated === core ? text : before + translated + after;
}

const attributes = Object.freeze(['aria-label', 'aria-valuetext', 'title', 'alt', 'placeholder', 'content']);
const skippedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);
const isElement = node => node?.nodeType === 1 || (node?.nodeType == null && typeof node?.getAttribute === 'function');
const hasSkip = node => isElement(node) && (skippedTags.has(node.tagName?.toUpperCase()) || node.getAttribute?.('translate') === 'no' || node.getAttribute?.('data-i18n-skip') != null);
const isSkipped = node => {
  for (let current = isElement(node) ? node : node.parentNode; current; current = current.parentNode || current.parent) if (hasSkip(current)) return true;
  return false;
};







export function createLocalization(doc, { language = 'ru' } = {}) {
  if (!doc) throw new TypeError('A document is required');
  let currentLanguage = language === 'en' ? 'en' : 'ru', disposed = false;
  const originalText = new WeakMap(), originalAttributes = new WeakMap();
  const root = doc.documentElement || doc.body || doc;
  const Observer = root.nodeType ? doc.defaultView?.MutationObserver || globalThis.MutationObserver : null;
  const options = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes };
  let observer;

  const renderValue = (current, previous) => {
    const original = previous && current === previous.rendered ? previous.original : current;
    return { original, rendered: translateGameText(original, currentLanguage) };
  };
  const renderText = node => {
    const current = node.nodeValue ?? node.data ?? '';
    const record = renderValue(current, originalText.get(node));
    originalText.set(node, record);
    if (record.rendered !== current) node.nodeValue = record.rendered;
  };
  const renderAttributes = node => {
    let records = originalAttributes.get(node);
    if (!records) { records = new Map(); originalAttributes.set(node, records); }
    for (const name of attributes) {
      const current = node.getAttribute?.(name);
      if (current == null) { records.delete(name); continue; }

      if (name === 'content' && !(node.tagName?.toUpperCase() === 'META' && node.getAttribute('name') === 'description')) continue;
      const record = renderValue(current, records.get(name));
      records.set(name, record);
      if (record.rendered !== current) node.setAttribute(name, record.rendered);
    }
  };
  const walk = node => {
    if (!node || isSkipped(node)) return;
    if (node.nodeType === 3) { renderText(node); return; }
    if (isElement(node)) renderAttributes(node);

    if (!node.childNodes && typeof node.textContent === 'string') {
      const current = node.textContent, record = renderValue(current, originalText.get(node));
      originalText.set(node, record);
      if (record.rendered !== current) node.textContent = record.rendered;
    }
    for (const child of Array.from(node.childNodes || node.children || [])) walk(child);
  };
  const apply = (records, full = false) => {
    if (disposed) return;
    observer?.disconnect();
    try {
      if (full || !observer) walk(root);
      else {
        const changed = new Set();
        for (const record of records) {
          if (record.type === 'childList') for (const node of record.addedNodes || []) changed.add(node);
          else changed.add(record.target);
        }
        for (const node of changed) if (node.isConnected !== false) walk(node);
      }
      if (doc.documentElement && root.lang !== currentLanguage) root.lang = currentLanguage;
    } finally { if (!disposed) observer?.observe(root, options); }
  };
  if (Observer) observer = new Observer(records => apply(records));
  apply([], true);
  return {
    get language() { return currentLanguage; },
    setLanguage(next) {
      if (disposed || (next !== 'ru' && next !== 'en')) return currentLanguage;
      const pending = observer?.takeRecords() || [];
      if (currentLanguage === next) { apply(pending); return currentLanguage; }
      currentLanguage = next;
      apply(pending, true);
      return currentLanguage;
    },
    refresh() { if (!disposed) apply(observer?.takeRecords() || []); },
    translate(value) { return translateGameText(value, currentLanguage); },
    dispose() { if (disposed) return; disposed = true; observer?.disconnect(); },
  };
}
