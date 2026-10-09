# Bundled crossword clues

The game includes **44,968 unique clue texts** and a separate original fallback of **64 clues (16 per tier)**. The bundled dataset is local: playing does not contact a clue service, install packages, or require a web server. The original fallback works when `js/clue-bank.js` cannot be loaded.

## Source and permission

- Repository: https://github.com/tamino-martinius/node-open-crossword-bank
- Pinned commit: https://github.com/tamino-martinius/node-open-crossword-bank/commit/b82d6a3899db8437366b618d3c217e9eb942de99
- Source package version: 1.0.2; commit dated July 21, 2026.
- English source leaves: https://github.com/tamino-martinius/node-open-crossword-bank/tree/b82d6a3899db8437366b618d3c217e9eb942de99/src/data/en/enriched
- Data license: https://github.com/tamino-martinius/node-open-crossword-bank/blob/b82d6a3899db8437366b618d3c217e9eb942de99/src/data/LICENSE

The source data is dedicated to the public domain under CC0 1.0 Universal. Its complete license text is preserved in `LICENSE.txt`. The upstream software has a separate MIT license; this project imports data only, and does not copy or execute the upstream library. The source maintainer describes the clues as LLM-assisted and reviewed. The 64 fallback clues are original text created for this prototype.

## Import policy

The 21 pinned English leaves contain 17,997 source entries and 51,083 clue variants. `scripts/import-clues.js` verifies their Git blob hashes against a fixed manifest, extracts individual JSON lines without evaluating TypeScript, and validates source records before writing outputs.

Answers are normalized with NFKD, combining-mark removal, uppercase conversion, and removal of non-A-Z characters. Accented spellings are therefore accepted without accents. Six accented source variants normalize to answers already present in ASCII form.

Clue text is compared globally after trimming, lowercasing, and collapsing whitespace. Every group whose text refers to multiple different normalized answers is excluded, regardless of answer length. This removes 6,114 clue variants in 2,561 groups. Identical clue-text/answer pairs are consolidated with the minimum source difficulty, removing one further variant. The remaining bank has 44,968 unique literal clues and 17,954 normalized answers. IDs use the canonical source entry ID and source clue index, so regenerating the pinned bank preserves IDs.

Source difficulties 1, 2, and 3 map to game tiers 1, 2, and 3; source difficulties 4 and 5 map to game tier 4. Final tier counts are 7,467 / 20,733 / 13,054 / 3,714. The source `freqTier` measures word frequency and is not used as clue difficulty. Game tier selection is independent of these pool sizes.

**Clue quality and difficulty are provisional.** Structural validation and known-ambiguity filtering cannot prove that a clue has one correct English answer. The source still contains vague name clues, inconsistent difficulty judgments, and potential semantic mistakes. Treat the fallback as the dependable development sample; curate or blacklist records before a competitive release. Skipping provides a way past a problematic clue without awarding currency.

## Offline use and replacement

`js/clue-bank.js` is a classic script assigning `LyricDefense.ClueBank` to records shaped as `{id, text, answer, tier, length}`. Developer-provided clue banks may use the same shape. Keep IDs stable and clue texts globally unique; tiers must be integers from 1 to 4, and normalized answers must contain 3–15 ASCII letters. The provider validates records and uses the full curated fallback if a supplied bank lacks a usable tier.

`new LyricDefense.ClueProvider({seed, storage})` returns clues with `next(tier)`. Each tier is shuffled without replacement. Displayed IDs are saved under `lyric-defense.clues.v1.tier-N`, best-effort, so later matches continue unseen clues. Browser storage denial or quota errors do not prevent play; the current page keeps its progress in memory. Pass `storage: null` for independent, repeatable tests or a bot that should not affect human clue history. Only an exhausted tier recycles its deck. Removing the saved keys resets clue history.

To regenerate the checked-in bank, use Node 18 or newer with network access:

```text
node scripts/import-clues.js
```

This optional maintainer command contacts the pinned source and writes only `js/clue-bank.js` and `assets/clues/LICENSE.txt`. It checks downloads, source hashes, the data license, and the expected count before writing. It is unnecessary to launch or play the game. Source download failure leaves the existing bank untouched.
