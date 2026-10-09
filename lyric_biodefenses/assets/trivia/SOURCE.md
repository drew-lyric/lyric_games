# Active expanded trivia bank

Gameplay and the LAN host load **5,000 questions** from `js/trivia-expanded-bank.js`. The metadata object `LD.TriviaBankInfo` and `assets/trivia/expanded-manifest.json` record the version, exact tier and source counts, source pins, hashes and editorial coverage. No runtime downloads are required.

Open `trivia-review.html` from disk or from the LAN host to browse every question, category, difficulty, source, canonical answer and accepted variant. Filters and search operate on the full bank; 50 cards are rendered per page. Refresh the browser and restart a running LAN server after replacing the bank.

## Difficulty and typed-answer policy

| Game tier | Target recall | Questions |
| --- | --- | ---: |
| 1 - Easy | Familiar everyday facts and widely recognizable popular knowledge | 479 |
| 2 - Medium | Common general knowledge requiring some recall | 1,101 |
| 3 - Hard | Specific historical, scientific, geographical, literary and cultural knowledge | 2,020 |
| 4 - Expert | Less familiar details and specialist trivia with a precise answer | 1,400 |

The user's [Open Trivia Database browse page](https://opentdb.com/browse.php?page=7) supplied the easier baseline. The original review questions were mostly easy to medium in practice, so the active copies have been recalibrated. Hard and Expert now contain more demanding questions. Source labels inform the initial mapping, and editorial decisions override them for typed recall; an obscure game-release date is not automatically Easy because its multiple-choice source says easy.

Difficulty remains an editorial estimate, not a measured success rate. The active importer does not use the archived answer-frequency/answer-length quartile heuristic. Playtesting can identify useful future tier changes. The game still draws difficulties independently with weights **6:3:2:1**, so more than half of ordinary draws are Easy.

Answers are typed. True/false and prompts requiring invisible answer choices or images are excluded. Structural filters screen scope, temporal claims, answer alternatives and damaged records. Individually reviewed source selections correct or reject ambiguous wording and false premises, add appropriate surnames, short titles, number words and abbreviations, and assign semantic difficulty. Whole-answer matching folds case, accents, spaces and ordinary punctuation while preserving meaningful numeric separators. It uses explicit aliases rather than fuzzy partial matching.

Question-level editorial screening checks wording, expected answers and difficulty. It is not independent primary-source fact verification of all 5,000 records. Medium/hard imported source facts and semantic quality remain provisional. The manifest distinguishes review coverage from structural filtering and source labels.

## Sources and licenses

- **Open Trivia Database**: the pinned snapshot from [leakyhose/open-trivia-dataset](https://github.com/leakyhose/open-trivia-dataset/tree/77d8e3cb5c8e264d50220eee75cfe08d233b1910), ultimately sourced from OpenTDB. [OpenTDB's API documentation](https://opentdb.com/api_config.php) states the data license is **CC BY-SA 4.0**. OpenTDB-derived question adaptations retain that license, attribution, source difficulty and original snapshot provenance. See `OPENTDB-SOURCE.md`, `OPENTDB-LICENSE.txt` and the expanded manifest for attribution, the pin and hashes.
- **TriviaQA**: a selected and individually screened supplement from the preserved 98,149-question archive. Its existing **Apache 2.0** license statement, source pins and hashes remain in `TRIVIAQA-ARCHIVE.md`, `manifest.json`, `LICENSE.txt` and `UPSTREAM-README.md`. The old archive's calculated difficulty ratings are ignored when selecting active records.
- **Original project questions**: the archived 100-question review sample plus 32 new harder originals in `harder-originals.json`. The original sample/export are preserved unchanged; active copies receive current difficulty corrections. The harder-original metadata records selected reference checks.

Source attribution on each record identifies the corresponding subset; inclusion in a compiled collection does not erase the source's applicable license. Preserve these notices, source metadata and editorial modifications when distributing or adapting the bank.

## Reproducible editing

Run `node scripts/import-trivia-expanded.js` to regenerate the active script, JSON list and expanded manifest. Run `node scripts/import-trivia-expanded.js --check` to compare all generated output byte for byte. Inputs are the bundled `expanded-source-records.json`, original sample and harder originals, explicit `editorial-*.json` decisions, pinned raw OpenTDB snapshot, and the preserved TriviaQA archive (source hashes are verified). Generated output is deterministic; the active game's startup never invokes the importer or accesses an online API.

For wording, canonical-answer, alias or difficulty changes, edit the corresponding `editorial-*.json` decision and regenerate. Explicit `acceptedAnswers` replacements supersede old aliases when a correction changes the question's expected answer. Keep stable IDs for the same question; use a new ID for a new fact. Preserve source text and source-difficulty provenance separately from final game wording and tiers. Review changed records in the bank browser after regeneration.

`node scripts/import-trivia.js` only regenerates the older full TriviaQA archive. It does not overwrite the active expanded bank. The first 100 original questions remain in `js/trivia-review-bank.js` and `review-sample.json` as an archive of the earlier review checkpoint.

## Runtime and fallback

Classic ordered scripts load the bank before `js/trivia.js`. Each tier uses its own shuffle deck and recycles only after exhaustion. Best-effort displayed-ID history stays under `lyric-defense.trivia.v1.tier-N`, separate from crossword history; denied storage falls back to memory. Bots have independent decks, and LAN rooms preserve decks across rematches. Unknown IDs from prior editions are ignored safely.

A separate 64-question fallback supplies 16 questions per tier when the bundled bank is missing or invalid. Its higher tiers use the new harder originals; its IDs are independently versioned. The crossword repository and its 44,968-clue CC0 bank remain intact in `js/clue-bank.js` and `assets/clues/`.
