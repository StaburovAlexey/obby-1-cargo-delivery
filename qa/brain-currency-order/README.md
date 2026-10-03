# Brain balance order

The top-right brain HUD now reads left to right as the brain icon, then the whole-number balance. The existing DOM order already matches this; only its flex direction changes from row-reverse to row. Right anchoring now applies to the number's right edge. Icon dimensions, numeric tabular font, digit-based responsive sizing, integer flooring and fractional income remain unchanged. Money and all other runtime files are unchanged.

Verification: renderer-free brain HUD checks cover 320×568, 390×844, 844×390 and 1366×900, digit boundaries, fractional accrual and the maximum balance. The test's obsolete fourth-school rate expectation was reconciled from 4.5 to the unchanged current 2.6. Browser/GPU QA was not performed.

The historical bare-currency HUD suite still rejects the reward car's intentional locked label at vehicle-price-value-11; this unrelated check is not changed.

Settings/help/localization/audio checks and integer-fuel checks pass. The historical progression HUD suite retains an unrelated obsolete school purchase expectation (Купить Класс 2 · 500 versus current Купить 1000). No school prices or purchase text were changed.
