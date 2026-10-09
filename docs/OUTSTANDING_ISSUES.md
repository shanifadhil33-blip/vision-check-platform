# Outstanding issues

Known problems in the vision check that aren't fixed yet, with what happens and how each one gets fixed. New items go at the bottom.

## 1. A letter can repeat after the main screen is reloaded mid-letter

Type: defect, fixable.

What happens: if the main screen is reloaded while a letter is showing, that letter doesn't count and a fresh letter at the same size replaces it, as agreed. After a reload, though, the main screen no longer knows which letter was showing, so the fresh letter can turn out to be the same one the person just saw.

Effect on the result: the five letters that count at each size are still all different from each other, and the interrupted letter is never scored. The fresh letter does count, so the person may answer a letter they had a brief look at before the reload.

Fix: the main screen keeps a note of the letter on display in the browser, so the fresh letter can avoid it after a reload. No change to the stored test records. Planned for a later milestone at no charge.

Agreed with John on 8 October 2026 to keep this on the list.
