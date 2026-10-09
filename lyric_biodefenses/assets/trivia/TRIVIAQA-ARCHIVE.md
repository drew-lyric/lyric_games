# Preserved TriviaQA archive

This is the former bank, retained for provenance and future reference. It is not loaded by current gameplay. The active easier sample is documented in `SOURCE.md`. The former 64-question fallback has also been replaced with easier original questions.

The offline bank contains **98,149 distinct TriviaQA questions**, rather than generated templates or repeated aliases counted as new questions. The separate original fallback contains 64 questions, with 16 in each tier. The historical crossword bank and provider remain separate.

TriviaQA was created by Mandar Joshi, Eunsol Choi, Daniel Weld, and Luke Zettlemoyer for their ACL 2017 paper, *TriviaQA: A Large Scale Distantly Supervised Challenge Dataset for Reading Comprehension*. Its questions were authored by trivia enthusiasts. This game uses only question text and answer data; it does not ship evidence documents, web search snippets, or Wikipedia articles.

- Project and paper: <https://nlp.cs.washington.edu/triviaqa/>
- Source repository: <https://github.com/mandarjoshi90/triviaqa>
- Pinned upstream README and license revision: `ca43b5820b107f3970cf4b7d67f7db7a98117b79`
- Explicit code-and-data Apache 2.0 statement: <https://github.com/mandarjoshi90/triviaqa/blob/ca43b5820b107f3970cf4b7d67f7db7a98117b79/README.md>
- Source license: <https://github.com/mandarjoshi90/triviaqa/blob/ca43b5820b107f3970cf4b7d67f7db7a98117b79/LICENSE>

`LICENSE.txt` preserves the Apache 2.0 license, and `UPSTREAM-README.md` preserves the pinned license statement and citation. The University of Washington project page also states that the university does not own the copyright of the included questions and documents. This attribution reports the dataset maintainers' explicit license; it is not a claim that this project authored or individually verified the source questions.

## Snapshot and transformations

The source is the dataset author's `mandarjoshi/trivia_qa` Hugging Face mirror, configuration `unfiltered.nocontext`, pinned at revision **`0f7faf33a3908546c6fd5b73a660e0f8ff173c2f`**:

<https://huggingface.co/datasets/mandarjoshi/trivia_qa/tree/0f7faf33a3908546c6fd5b73a660e0f8ff173c2f/unfiltered.nocontext>

| File | Source rows | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `train-00000-of-00001.parquet` | 87,622 | 33,210,864 | `0a7253ec32dbf5b6fb07d71ce344d028e38f9cf86a27082033ce8957f5709100` |
| `validation-00000-of-00001.parquet` | 11,313 | 4,390,956 | `58925ac87e2e2031154899e9c1226f15d81e1675237da1a308e234b77b7bdcaf` |

The importer verifies the pinned byte sizes and hashes before parsing. It retains the source question and canonical answer, decodes a small set of HTML entities, and collapses whitespace. It excludes empty or excessively long records, questions over 400 characters, answers over 512 characters, HTML/URL-dependent prompts, and obvious references to unavailable media or current-relative facts. There were 51 invalid or long records and 735 media/current-relative records in this snapshot.

Question text is grouped globally after NFKC normalization, trimming, case folding, and whitespace collapse. Identical prompts with conflicting normalized canonical answers are removed entirely. Identical prompts with equivalent answers become one question. This snapshot had no such duplicate or conflicting groups after filtering. IDs are stable SHA-256 prefixes of normalized question text, independent of tier and array position. `manifest.json` records the source hashes, counts, license hashes, and generated bank hash.

The original source includes noisy entity aliases. The importer accepts only aliases equivalent under the answer normalizer, or a multiword canonical name with single-letter middle initials inserted. For example, Harry S. Truman can accompany Harry Truman; Mary Jane Truman cannot. It does not automatically accept a surname, nickname, title, partial substring, or unrelated Wikipedia redirect. Some questions therefore require the full source answer. The original 64-question fallback has additional individually reviewed aliases, including spelled-out numbers and familiar abbreviations.

## Provisional difficulty

The source has no human-rated four-tier difficulty. Imported tiers are a **provisional familiarity proxy**, not validated difficulty scores. Questions sort by decreasing frequency of their canonical normalized answer in the usable bank; ties sort by increasing answer word count, answer character count, question length, and stable ID. The sorted bank is divided into four near-equal groups:

| Tier | Questions | Interpretation |
| --- | ---: | --- |
| 1 | 24,538 | Most frequent or compact answers by this proxy |
| 2 | 24,537 | Second quarter |
| 3 | 24,537 | Third quarter |
| 4 | 24,537 | Least frequent or longest answers by this proxy |

Question obscurity can differ from answer familiarity. A difficult question about a common answer can land in tier 1, and an easy question about a rare answer can land in tier 4. Source questions also reflect the interests, regional knowledge, spelling, and time period of their authors. Automated filters are not a complete editorial or factual review. Developer review, explicit difficulty overrides, and answer corrections are appropriate before competitive release.

## Runtime and regeneration

`js/trivia-bank.js` is a classic script defining `LyricDefense.TriviaBank`. Load it before `js/trivia.js`. The provider validates and caches the bank's pools by array reference, and falls back to all 64 original questions if the bank is missing, invalid, or lacks any tier. It never downloads anything during gameplay.

`new LyricDefense.TriviaProvider({ seed, storage })` provides `.next(tier)`, returning `{ id, text, answer, acceptedAnswers, tier, kind: 'trivia' }`. Display answers retain spaces, punctuation, accents, and digits. Returned aliases are copied. Shuffle decks do not repeat within a tier until that tier is exhausted; only that tier then recycles. Displayed IDs persist best-effort under `lyric-defense.trivia.v1.tier-N`, separate from crossword history. Denied or full storage uses current-page memory. `storage: null` explicitly creates independent nonpersistent decks, suitable for a bot or reproducible tests.

`normalizeTriviaAnswer` compares whole normalized answers. It folds case, accents, spacing, ordinary punctuation, and one leading `the` when another non-`the` token follows. It preserves a standalone `A`, `THE`, and the band name `The The`. Digits remain significant. Decimal points, fraction slashes, numeric colons, date/range hyphens, and leading minus signs remain significant: `4.2` differs from `42`, `4/6` from `46`, and `-1` from `1`. Leading decimals normalize to a zero-prefixed form, so `.5` equals `0.5`. Thousands commas fold. No fuzzy, substring, or semantic matching is performed.

Regenerate with Node 20 or newer and network access:

```text
node scripts/import-trivia.js
```

The importer uses the small MIT-licensed Hyparquet 1.31.2 reader vendored in `scripts/vendor`; it needs no npm install and is never loaded by the game. Both source files and the pinned license metadata must validate before output is written. The importer never executes source question text.

For local Parquet files, use `--source-dir PATH`; the directory must contain the two filenames in the table, and their pinned hashes still apply. License metadata is fetched from the pinned source revision. For a temporary verified regeneration cache, use `--keep-cache`; `--cache assets/trivia/.source-cache.json.gz` then regenerates offline and verifies cache and license hashes against the manifest. The cache is a development artifact and is not shipped.

Provider checks run in the browser test page or with `node tests/trivia-tests.js`. The main project test runner also includes them.
