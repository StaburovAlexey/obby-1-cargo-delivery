# Neon underglow

Eight permanent, globally selected colors in Shop → Neon lighting. Browsing previews does not equip a color. Buy/Select equips it on every loaded vehicle, including cars loaded later; No underglow disables it without losing ownership. Selection and ownership use the existing career/cloud save.

The random allocation was fixed once for this release; it never rerolls per player, vehicle, purchase or reload. There are no random rewards.

| Color | Payment | Product ID |
| --- | --- | --- |
| Red | Yandex catalog price 39 | neon_red |
| Orange | Yandex catalog price 39 | neon_orange |
| Cyan | Yandex catalog price 39 | neon_cyan |
| Purple | Yandex catalog price 39 | neon_purple |
| Yellow | 50,000 in-game money | — |
| Green | 50,000 in-game money | — |
| Blue | 50,000 in-game money | — |
| Pink | 50,000 in-game money | — |

The Yandex console labels its base currency as yans. In-game paid prices and currency images come from getCatalog(), not hardcoded ruble/TST labels. The four products were created with Russian and English descriptions and show Active in application 631371. The console also states that purchases are not connected; production activation remains an external requirement.

Neon is non-consumable: getPurchases() restores entitlement; consumePurchase() is never called. A cancelled/unconfirmed purchase cannot grant a color. Coin purchases charge once; selecting an owned color is free. The shared fleet effect uses unlit strips and one small glow texture without lights/bloom.

Verification: node --test tests/vehicle-neon.mjs tests/livery-shop-ui.mjs tests/livery-app-integration.mjs tests/livery-neon-preview.mjs tests/premium-skins.mjs tests/cloud-career.mjs.
