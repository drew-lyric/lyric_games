# Lyric Defense

A playable browser prototype: answer trivia questions to fund B-cell cultures, place polymer walls to defend your reactor, and send enemies to an opponent. The browser game uses HTML, CSS, and plain JavaScript. Bot matches and the sandbox work directly from disk; real opponents play through the bundled LAN server. No dependencies or build step are needed.

## Play against someone on your LAN

Install **Node.js 22 or newer** on the computer hosting the match. Node is already installed on the development computer. In this folder, double-click **start-lan.bat**, or run:

```text
node server.js
```

Keep that terminal open while playing. It prints a localhost address and the available LAN addresses, such as `http://192.168.1.20:3000`.

1. On the host computer, open `http://localhost:3000` in Chrome or Edge. Enter a name and choose **Create room**.
2. On the other computer, open the host's printed **LAN address** using the same Wi-Fi or wired network. Enter a name and the room code, then choose **Join room**. Use the host's IP address on this computer; `localhost` refers to the computer you are currently using.
3. The countdown begins when both players connect. Each player answers trivia, controls their own reactor, earns their own currency, and sends purchased microbes to the other player's reactor.

If Windows asks whether Node may communicate on the network, allow it on your **Private** network. If the other computer cannot open the page, confirm both computers are on the same network, the host terminal is still running, and the network allows devices to communicate. Guest Wi-Fi sometimes isolates devices.

The server supports several independent two-player rooms. Both players must choose **Rematch** before a new round starts. A disconnected player has 30 seconds to reconnect; the match pauses during that grace period. Refreshing the same tab restores its seat when browser session storage is available. Leaving a room concedes an active match. Switching to another tab does not pause a connected LAN match.

Use `node server.js --port 3001` if port 3000 is occupied. Stop the host with **Ctrl+C**. Rooms and match state are held in memory and are cleared when the server stops. Opening `index.html` directly still offers the bot and sandbox; LAN create/join controls require the server's HTTP address.

## Play

Open **index.html** in Chrome or Edge, then choose **Bot match** or **Sandbox**. A three-second countdown starts the match. Use a desktop mouse and keyboard.

- Type a trivia answer and press **Enter**. Answers can contain numbers, spaces, and punctuation. A correct answer earns one IgG of the question's difficulty tier (1–4) and immediately supplies another question. Incorrect guesses cost nothing.
- Use **Skip** for a difficult question. Start with two charges; automatic recharge restores a charge every 30 seconds while your balance is below two. **Rapid Recall** halves that recharge.
- **CLUES → Skip Bank → Bank a Skip** costs one IgG1 per charge and can be purchased repeatedly without a storage cap. Buying 30 charges from zero gives **30 / 2**; buying them from the starting two gives **32 / 2**. The denominator is the automatic recharge limit. Purchased charges remain available until spent, and recharge resumes once the total falls below two.
- Inspect an item in the shop, then buy it. Tabs separate **CULTURE**, **OFFENSE**, **LASER**, and **CLUES**. Locked nodes can be inspected; their prerequisites must be purchased first.
- Move the cursor over the reactor to preview a polymer circle; click to place it. Circles are free, with a 1.25-second laser recharge. A wall cannot form through an enemy's body. An invalid cast does not consume recharge.
- Outside enemies take a route around walls. Enclosed enemies attack the material until it breaks. Uncoated polymer **only delays** enemies; **Ethanol Coating** is the first damaging upgrade.
- New circles inherit purchased upgrades. Circles already on screen retain their previous properties. Overlapping coatings use the strongest damage rate rather than adding together.
- The **LASER → Image → 3×3 Ring Array** upgrade costs two IgG2 plus one IgG3. It projects nine smaller, reddish-orange rings with one click and one recharge, following the supplied fluorescence reference. Each ring breaks and expires independently. If any circumference intersects an enemy, the entire shot is rejected without spending recharge.
- Buy B-cell components for passive IgG production, and OFFENSE items to send enemies into the opponent's reactor. The preview shows the results of your attacks.
- Manually craft IVIG using **6 IgG1 + 3 IgG2 + 2 IgG3 + 1 IgG4**. One IVIG buys an emergency sterilization of your reactor; it does not undo existing contamination.

An enemy reaching the culture zone adds contamination. The first reactor to reach 100% loses; simultaneous losses are a draw. Natural enemies become faster and more frequent as match time increases. The bot answers trivia on a timer, purchases items with its actual wallet, and intentionally has imperfect defense.

## Lyric theme and microbes

The navy/steel interface uses the actual supplied Lyric wordmark and blue icon, preserved in `assets/branding/lyric-logo.jpg`. The laboratory image reference is preserved in `assets/references/polymer-grid.png`. Polymer rings have a 26-pixel radius (down from 40), a red-orange glow, and 72-pixel array spacing. These values remain editable in `js/config.js`.

| Microbe | Role | Health | Speed | Wall damage/s | Contamination | Send cost |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Staphylococcus epidermidis | Normal coccus | 12 | 14 | 4 | 2% | 1 IgG1 |
| Pseudomonas aeruginosa | Fast, fragile rod | 8 | 56 | 1.5 | 5% | 1 IgG2 |
| Bacillus subtilis | Slow, resilient spore former | 64 | 8 | 12 | 20% | 2 IgG3 |
| Mycoplasma hyorhinis | Violet, irregular IVIG threat | 100 | 48 | 14 | 30% | 1 IVIG |
| Escherichia coli (E. coli) | Lime rod, polymer breaker | 22 | 18 | 48 | 1% | 1 IgG4 |

The names reflect laboratory contamination: [Thermo Fisher describes skin-associated Staphylococcus epidermidis](https://assets.thermofisher.com/TFS-Assets/BPD/Reference-Materials/benefits-DNA-sequencing-microbial-identification.pdf); [ATCC documents motile Pseudomonas aeruginosa](https://www.atcc.org/products/700829) and [a Bacillus subtilis isolate recovered as laboratory contamination](https://www.atcc.org/products/43223). [ATCC lists Mycoplasma hyorhinis among major cell-culture contaminants](https://www.atcc.org/the-science/authentication/mycoplasma-contamination). Movement, damage, health, colors, and contamination percentages are game-balance choices, rather than biological measurements. Sandbox spawning and offense purchases expose all five microbes; the bot can send the heavier types as it acquires their currencies. E. coli's 48 damage/second breaks a full-health starting polymer wall in approximately one second of continuous attack, but a breach adds only 1% contamination.

Pause and restart are available throughout a **local bot or sandbox** match. Hiding the browser tab automatically pauses those modes. Local restart begins a new countdown and clears the old match's commands; previously seen questions remain tracked where browser storage permits. LAN matches use the reconnect and mutual-rematch behavior described above.

## Sandbox

Choose Sandbox to reveal the developer controls. You can grant currency, reveal or answer the current question, spawn any of the five enemies in either reactor, switch natural spawning or the bot on/off, and set contamination to test endings. These commands are rejected in normal bot and LAN matches.

## Structure and editing

| File | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Browser entrypoint, local/LAN lobby, layout, accessible controls, shop trees |
| `js/config.js` | Tunable constants, enemy definitions, shop item catalog, random generator |
| `js/trivia-expanded-bank.js`, `js/trivia.js` | Active 5,000-question bank, independent 64-question fallback, normalization, no-repeat provider |
| `trivia-review.html`, `js/trivia-review.js` | Searchable bank browser with difficulty/topic filters, 50-question pages and optional answer reveals |
| `js/trivia-bank.js` | Preserved 98,149-question TriviaQA archive; not loaded during play |
| `js/clue-bank.js`, `js/clues.js` | Preserved crossword bank, fallback, and provider for future reuse |
| `js/navigation.js` | Physical circular-wall collision and grid navigation |
| `js/simulation.js` | Authoritative game state, currency, production, commands, combat, effects |
| `js/transport.js` | Local command/snapshot/event adapter with optional simulated latency |
| `js/lan-transport.js` | HTTP commands, streamed authoritative snapshots, connection recovery |
| `server.js`, `start-lan.bat` | Dependency-free LAN host, rooms, player seats, reconnects, rematches |
| `js/bot.js` | Timed questions, normal purchases, attacks, imperfect wall placement |
| `js/assets.js`, `js/render.js` | Replaceable sprite manifest, procedural pixels, canvas animation |
| `js/ui.js` | Input and fixed-step animation loop; no economy or combat rules |
| `tests/` | Dependency-free simulation and direct-file browser tests |
| `scripts/import-clues.js` | Optional development-time clue-bank regeneration |
| `scripts/import-trivia.js` | Optional development-time regeneration of the preserved TriviaQA archive |
| `scripts/import-trivia-expanded.js` | Deterministic regeneration of the active, curated 5,000-question bank |

Scripts use the shared `globalThis.LyricDefense` namespace and classic deferred script tags, so local play works under `file://`. The simulation runs at 30 Hz and the canvas renders using `requestAnimationFrame`. LAN play runs the same simulation on the host and streams snapshots to both browsers. Assets and question banks are bundled; no CDN or runtime internet downloads are used.

### Balance and mechanics

Edit `LD.Config`, `LD.Enemies`, and `LD.Items` in `js/config.js`. Prices are currency-to-quantity objects. Item definitions include a stable ID, tab, tree, prerequisites, description, sprite key, repeatability, and a named effect. The shop derives its sections, details, and unlock state from this catalog.

To add an upgrade, add its item definition and implement its named handler in **LD.Effects** in `js/simulation.js`. For functionalization changes, ensure new walls snapshot the relevant properties. For new enemy abilities, add the definition and simulation behavior, then a sprite key. Keep rules in the simulation and keep canvas rendering read-only. Add a meaningful test for the new behavior rather than relying on a visual preview alone.

Wall movement uses geometric collision checks plus an eight-pixel navigation grid. Free-space shortest paths lead to the culture boundary. Enemies with no free route select a blocking wall to attack. Navigation rebuilds when walls form, break, or expire; overlapping obstacles retain their independent contributions.

### Replace artwork

Edit **LD.AssetManifest** in `js/assets.js` to point a sprite key to a local image or sprite sheet. Entries define source, frame dimensions, frame sequence, and frame timing. The renderer disables image smoothing and supplies animated procedural pixel placeholders if an image is missing or fails to load. Put custom files under `assets/`; use relative paths and retain the semantic keys used by the catalogs.

```js
'enemy-basic': {
  src: 'assets/enemy-basic.png',
  frameWidth: 16, frameHeight: 16, fps: 6,
  animations: { idle: [0], walk: [0, 1, 2, 1], attack: [2, 3] },
  fallback: 'enemy'
}
```

Frame indices count across a sheet from left to right, then top to bottom. Custom images also refresh shop icons when they finish loading. Catalog enemy `sprite` keys are used by the reactor renderer.

The canvas has an 800×360 logical coordinate system. CSS scales it; pointer input maps the displayed bounding rectangle back to logical coordinates. Artwork changes must not change collision geometry implicitly.

### Active trivia bank

The game now uses **5,000 distinct trivia questions**: **479 Easy**, **1,101 Medium**, **2,020 Hard**, and **1,400 Expert**. Open **trivia-review.html** directly, or choose **Browse the trivia question bank** in the lobby. The bank browser filters by tier and topic, searches question wording and IDs, and displays 50 questions per page with optional answer reveals. Use **Download JSON** for the complete list, also saved as `assets/trivia/expanded-questions.json`. The same page is available at `/trivia-review.html` on a running LAN host. Refresh the game after updating files; restart a running LAN server to load the new bank.

Answers remain **typed**. Familiar questions retain the easier baseline of the original review sample, while harder tiers include more specific geography, history, science, literature, music, film, and games. Difficulty is assigned from source labels and editorial question-level review, with explicit corrections. Imported ratings remain estimates and will benefit from playtesting; neither answer length nor answer-frequency quartiles determine the active tiers.

The bank combines a pinned Open Trivia Database snapshot, individually screened selections from the preserved TriviaQA archive, the original review questions recalibrated for this edition, and 32 newly written harder questions. True/false, choice-dependent, damaged, ambiguous, conflicting and duplicate prompts are filtered or rejected. The source and editorial decisions are retained for regeneration. Source facts have not all been independently verified; see `assets/trivia/SOURCE.md` and `expanded-manifest.json` for exact counts, provenance, licenses and review coverage.

Question records in `js/trivia-expanded-bank.js` contain `{id, text, answer, acceptedAnswers, tier, category, source, sourceDifficulty}`. Metadata in `LD.TriviaBankInfo` records the exact size, tier counts and source counts. Keep IDs stable across wording and difficulty edits, and assign a new ID for a genuinely new question. For reproducible edits, update the relevant editorial decision file and regenerate rather than editing the generated script alone. The original 100-question review snapshot and its JSON export remain archived unchanged.

The game independently selects tiers with **6:3:2:1** weights. `new LyricDefense.TriviaProvider({seed, storage})` returns `next(tier)` records shaped as `{id, text, answer, acceptedAnswers, tier, kind: 'trivia'}`. A tier draws without replacement and recycles only after its own exhaustion. Stable IDs support best-effort no-repeat history separately from crossword history. Bots use independent decks, and each LAN room retains its decks across rematches. Missing or invalid bank data selects an independent **64-question fallback**, with 16 per tier and harder material in tiers 3 and 4.

Matching compares whole normalized answers, including accepted aliases. It folds case, accents, whitespace, and ordinary punctuation while retaining digits and meaningful numeric separators, so `1969` is valid and `4/6` differs from `46`. Surnames, familiar abbreviations, and spelled-out numbers are accepted where explicitly listed and unambiguous. Meaningful programming-language symbols and Unicode minus signs are retained, so `C++`, `C#`, `C`, `-40`, and `40` stay distinct. Incorrect guesses remain free. All questions are bundled for offline play; acquisition and regeneration are development tasks, never gameplay downloads.

### Preserved TriviaQA archive

The former **98,149-question** bank remains at `js/trivia-bank.js`, with its source hashes, Apache 2.0 license statement, and regeneration documentation preserved in `assets/trivia/TRIVIAQA-ARCHIVE.md`, `manifest.json`, `LICENSE.txt`, and `UPSTREAM-README.md`. It is not loaded by the game, tests, or LAN server. Regenerating it with `node scripts/import-trivia.js` only updates that archive; the active expanded bank is separate. Normal play never downloads questions.

### Archived crossword bank

The bundled bank contains **44,968** unique clue texts from the pinned CC0 English data in `node-open-crossword-bank`, plus an independent **64-clue curated fallback** (16 per tier). See `assets/clues/SOURCE.md` for the pin, filtering, source metadata, and regeneration commands; the data license is preserved in `assets/clues/LICENSE.txt`.

Answer normalization removes diacritics, folds case, and ignores nonletters. The import removes normalized clue texts associated with conflicting answers and consolidates duplicates. Source difficulties 4 and 5 map to game tier 4. Source difficulty and semantic quality are provisional: structural filtering does not make every definition unambiguous or every difficulty rating accurate. Maintain a blacklist/curated replacement set when reviewing content.

Difficulty draws are independent with weights **6:3:2:1**. Each tier draws without replacement; displayed clue IDs are saved on a best-effort basis. Browser storage can be unavailable or differ between local file locations, so persistence has an in-memory fallback. Only an exhausted tier recycles. Move or rename the folder with that limitation in mind.

## Networking implementation

The offline in-memory transport accepts the same gameplay commands as the LAN transport:

```js
const transport = new LyricDefense.LocalTransport(game, { latencyMs: 150 });
transport.send('p1', { type: 'buy', payload: { itemId: 'send-basic' } });
const unsubscribe = transport.subscribeState(snapshot => render(snapshot));
transport.subscribeEvents(event => showFeedback(event));
transport.step(1 / 30);
transport.dispose(); // drops queued commands and subscriptions
```

Other command types are `answer` (`clueId`, `answer`), `skip`, `craft`, and `cast` (`x`, `y`). `pause` and `resume` are local session controls. Snapshots are detached from the authoritative simulation state. The default latency is zero, so normal UI commands return immediate validation results.

For LAN matches, **server.js** owns both reactors, trivia validation, wallets, spawning, wall placement, and match outcomes. **js/lan-transport.js** uses same-origin JSON HTTP requests for commands and an EventSource stream for state and game events. Each seat has an opaque token; the host determines which player a request controls. Snapshots omit answers, accepted aliases, and the opponent's question. Debug, manual pause, and local reset commands are rejected. A match identifier rejects commands from an earlier round after a rematch.

The room API creates and joins rooms, opens the event stream, validates commands, records rematch readiness, and leaves seats. The browser receives updated connection status and reconnects its stream automatically. No browser simulates an authoritative LAN match. The transport's subscription/disposal interface remains available for a future hosted adapter. See [Node's HTTP API](https://nodejs.org/api/http.html) and [MDN's server-sent event documentation](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) for the underlying APIs.

This version is intended for trusted players on a local network. The offline question banks remain bundled in the browser, so omitting live answers from snapshots is not competitive anti-cheat. Internet matchmaking, accounts, encrypted hosting, and production deployment are separate work.

## Verification

With Node installed, run:

```text
node tests/run.js
node tests/lan-tests.js
```

Or open **tests/browser.html** directly in Chrome or Edge. The suite checks economy, stale answers, skips, manual IVIG recipes, prerequisites, passive production, attacks, physical walls and detours, coating snapshots/nonstacking, contamination outcomes, transport disposal, bot spending, and clue integrity/storage failures.

Browser launch/render/input checks can also be run with:

```text
node scripts/browser-smoke.js
node scripts/lan-browser-smoke.js
```

This uses the installed Chrome and Edge with temporary headless profiles. Results and screenshots are written to `tests/artifacts/`; they are development artifacts and are not required to play. The helper uses only Node's built-in APIs.

LAN integration tests cover authoritative commands, seat binding, snapshot filtering, rate-limit recovery, reconnects, rematches, and HTTP routing. The LAN browser smoke test hosts a temporary server and plays a round between the installed Chrome and Edge, including purchases and casts from both seats, invalid room codes, tab refreshes, leaving, and unavailable session storage. The original browser smoke test verifies that bot and sandbox modes remain available directly from disk. These checks use two browsers on one computer; a second physical computer still depends on your network and firewall allowing access to the host.

This is a scaffold for testing the proposed mechanics with a bot or a real LAN opponent. Art, balancing, more enemy abilities and shop branches, production deployment, and internet multiplayer can be developed independently through the interfaces above.
