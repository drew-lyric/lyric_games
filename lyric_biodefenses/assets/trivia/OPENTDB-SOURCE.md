# Open Trivia Database snapshot and attribution

Question authors: the Open Trivia Database contributor community. Database: https://opentdb.com/ . Snapshot mirror maintained by leakyhose: https://github.com/leakyhose/open-trivia-dataset . No endorsement is implied.

Pinned snapshot commit: `77d8e3cb5c8e264d50220eee75cfe08d233b1910`.
Raw file: https://raw.githubusercontent.com/leakyhose/open-trivia-dataset/77d8e3cb5c8e264d50220eee75cfe08d233b1910/data/all_questions.json
Bundled raw copy: `opentdb-source.json`.
SHA-256: `40aae7eab2644d73e9f97b164499cc98ca4f8226e03a2991469e4a5bef7caaba`.

The snapshot contains 4,738 question records, including true/false questions. Initial structural selection retained 2,650 multiple-choice source records for further adaptation to standalone typed answers. Final selection counts and exclusions are recorded in `expanded-manifest.json`.

OpenTDB states its API data is available under **Creative Commons Attribution-ShareAlike 4.0 International**: https://opentdb.com/api_config.php . The applicable license and warranty disclaimer are preserved in `OPENTDB-LICENSE.txt`; the license URL is https://creativecommons.org/licenses/by-sa/4.0/ . OpenTDB-derived adaptations in this bank are distributed under that same license. Preserve this attribution, license and change notices when redistributing those records.

Changes for this game: true/false and unsuitable choice/media questions removed; HTML entities decoded; questions screened for ambiguity and temporal scope; selected wording and answers corrected; typed aliases added; prompts deduplicated; and source difficulties adapted into four editorial game tiers. Source labels and original wording remain on each imported record, while explicit decisions are stored in `editorial-opentdb-*.json`.

All 879 initial source-easy candidate rows were individually screened (some share IDs). An additional first-125 medium and first-125 hard sample received editorial review, with explicit changes/exclusions recorded, followed by a full 200-row medium sample at source indexes 600-799. This screening does not mean every fact has been independently verified against a primary source. Medium/hard records outside those samples retain source quality and difficulty uncertainty.
