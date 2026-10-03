# Historical City35 turn-assistance snapshots

The user requested a handling rollback in City36. These text snapshots and the original City35 QA reports document the removed feature; they are not current tests or production modules. The complete runnable City35 source is Git commit c7c6e00266c2622f338c2b7df7bd72636146e92c.

Current driving-model.js exactly matches Site34 commit 3f53dc9c685a5a514c02ea790887b86ba7061253. The taller hills remain. Current regression restores the original vehicle-dynamics assertions, keeps the independent hill geometry assertions in tests/hills-independent.mjs, and verifies exact rollback behavior in tests/handling-rollback.mjs.
