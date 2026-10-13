# CodiReactor Architecture Plan: Language Reactor 5.1.8_0 Source Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve 100% architectural and visual parity with Language Reactor v5.1.8_0 (`ref/languagereactor/5.1.8_0`): fix the YouTube sidebar positioning regressions (exact `#secondary` prepending in Default Mode and right-docked `#player-theater-container` in Theater Mode), eliminate orphan fragments via Language Reactor's `we()` timedtext merge algorithm, implement 60fps real-time spoken-word highlighting (karaoke style with full sentiment visible) using `tOffsetMs`, and enforce Tippy-grade singleton lifecycle for dictionary popups (`ref/image copy 5.png` & `ref/image copy 9.png`).

**Architecture:**
1. **Sidebar Docking (LR `updateVVPosition` Parity):**
   - **Default Mode (`ref/image copy 7.png`):** Mount into YouTube's `#secondary.ytd-watch-flexy` via `prepend()`. Set height to `Math.max(videoElement.offsetHeight, 450)px`. Never touch `#player` or `#player-container-outer`, preventing bottom-bar collapse.
   - **Theater Mode (`ref/image copy 8.png`):** Mount into `#player-theater-container` (or `#full-bleed-container`) with `order: 2 !important; width: 380px; height: 100% !important;` and video with `order: 1 !important; width: calc(100% - 380px) !important;`.
2. **Sentiment & TimedText Consolidation (LR `we()` & `Se()` Parity):**
   - Parse YouTube JSON3 `segs` using LR's `Se()` algorithm extracting `tOffsetMs` (`start_ms = tStartMs + (seg.tOffsetMs || 0)`).
   - Merge adjacent continuous rolling events (`event[n+1].begin - event[n].end <= 10ms`) into complete 2-clause sentences (`translate.pdf` parity).
   - Clamp previous cue's `end` to current cue's `begin` (`prevCue.end > current.begin -> prevCue.end = current.begin`), eliminating overlapping duplicate cues.
   - Filter orphan roll-off fragments (`The`, `This`, `Canada.`, `Ocean.`, `video.`).
3. **Spoken Word Highlighting (LR 60fps rAF `T()` Engine with Karaoke Style):**
   - Run LR's 60fps `requestAnimationFrame(T)` loop with `S = 125ms` audio-lead offset (`cue.begin - 125ms`).
   - Store word-level `[startMs, endMs]` on each `EnrichedToken`.
   - Dynamically highlight the active spoken word with `.cr-speaking-word` while preserving the complete sentence and CEFR token colors.
4. **Dictionary Balloon Singleton Lifecycle (LR Tippy-grade dismissal):**
   - Monotonic `balloonRequestId` + synchronous DOM sweeping of all `.cr-hover-balloon` elements.
   - Automatic dismissal on outside click, word change, or video seek.

**Tech Stack:** TypeScript, Web Extensions Manifest V3, Closed Shadow DOM, YouTube Polymer DOM API, 60fps rAF Loop, Vitest.

**Spec & Evidence Sources:**
- Decompiled Language Reactor source: `ref/languagereactor/5.1.8_0/` (`content_youtube.js`, `pageScript_lly.min.js`, `content_dictionary.js`).
- Reference UI screens: `ref/image copy 7.png` (Default mode), `ref/image copy 8.png` (Theater mode), `ref/image copy 5.png` (Blue dictionary balloon), `translate.pdf` (Clean 1-to-1 cue export).
- Regression bug evidence: `ref/image copy 9.png` (overlapping balloons) and User screenshots (left floaty sidebar, bottom stretched bar, subtitle delay).

## Global Constraints
- Target test video: `https://www.youtube.com/watch?v=vLijZb9BpkE`.
- Do not apply code modifications until user explicitly approves this plan.
- Maintain passing state across all 251 existing Vitest tests.
- Strictly adhere to YouTube Trusted Types Content Security Policy (no `innerHTML = ...`).
- Never suppress YouTube native captions until authoritative CodiReactor captions are verified.

## Review Focus
1. **Default Mode Sidebar (`ref/image copy 7.png`):** Prepended to `#secondary.ytd-watch-flexy`, aligned with video height, recommendations below it.
2. **Theater Mode Sidebar (`ref/image copy 8.png`):** Flawlessly docked on the RIGHT edge of `#player-theater-container`, video takes `calc(100% - 380px)`.
3. **No Orphan Fragment Cues:** Verify cues matching `translate.pdf` with zero single-word fragments (`The`, `Canada.`, `Ocean.`, `This`).
4. **Active Spoken Word Karaoke Highlighting:** Entire sentence readable; currently spoken word highlighted at 60fps matching audio cadence with 125ms lead.
5. **Zero Overlapping Dictionary Balloons:** Rapid clicking across words never leaves orphan or duplicate `.cr-hover-balloon` elements.

---

## Detailed Task Breakdown

### Task 1: YouTube Sidebar Docking Parity (LR `updateVVPosition` Architecture)

**Files:**
- Modify: `src/adapters/YouTubeAdapter.ts:620-760`
- Modify: `src/ui/SidebarPanel.ts:65-115`
- Test: `tests/adapters/YouTubeAdapter.test.ts`

**LR Source Blueprint:**
In Language Reactor `pageScript_lly.min.js` (line 1140653):
```js
if (isTheater) {
  let e = $("#full-bleed-container") || $("#player-theater-container");
  e.prepend(sidebar);
  sidebar.height(e.height());
} else if ($("#secondary.ytd-watch-flexy").length) {
  let e = Math.max(video && $(video).height() || 0, 450);
  $("#secondary.ytd-watch-flexy").prepend(sidebar);
  sidebar.height(e);
}
```

- [x] **Step 1: Write unit tests verifying LR docking selectors**
  - Test Default Mode prepends to `#secondary.ytd-watch-flexy` with height synced to video.
  - Test Theater Mode docks rightwards inside `#player-theater-container` with `order: 2`.
  - Test Fullscreen mode hides `#codireactor-sidebar-root`.

- [x] **Step 2: Run tests to verify failure**
  - Run: `npx vitest run tests/adapters/YouTubeAdapter.test.ts`
  - Expected: FAIL.

- [x] **Step 3: Implement LR docking in `YouTubeAdapter.ts`**
  - Update `repositionSidebar(sidebarEl: HTMLElement)`:
    - Default Mode:
      Find `document.querySelector('#secondary.ytd-watch-flexy') || document.querySelector('#secondary')`.
      Prepend `sidebarEl` as first child.
      Set `sidebarEl.style.width = '100%'`.
      Calculate `targetHeight = Math.max(video?.offsetHeight || 0, 450)`.
      Set `sidebarEl.style.height = `${targetHeight}px``.
      Attach a `ResizeObserver` on `#movie_player` to update `sidebarEl.style.height` dynamically.
    - Theater Mode:
      Mount into `#player-theater-container`.
      Apply CSS:
      ```css
      ytd-watch-flexy[theater] #player-theater-container {
        display: flex !important;
        flex-direction: row !important;
        justify-content: flex-end !important;
        overflow: visible !important;
      }
      ytd-watch-flexy[theater] #player-theater-container #movie_player {
        width: calc(100% - 380px) !important;
        height: 100% !important;
        order: 1 !important;
        flex: 1 1 auto !important;
      }
      ytd-watch-flexy[theater] #player-theater-container #codireactor-sidebar-root {
        width: 380px !important;
        min-width: 380px !important;
        max-width: 380px !important;
        height: 100% !important;
        order: 2 !important;
        flex: 0 0 380px !important;
      }
      ```
    - Fullscreen:
      `ytd-watch-flexy[fullscreen] #codireactor-sidebar-root { display: none !important; }`

- [x] **Step 4: Run tests to verify pass**
  - Run: `npx vitest run tests/adapters/YouTubeAdapter.test.ts`
  - Expected: PASS.

- [x] **Step 5: Commit**
  - `git add src/adapters/YouTubeAdapter.ts src/ui/SidebarPanel.ts tests/adapters/YouTubeAdapter.test.ts`
  - `git commit -m "fix(layout): match Language Reactor updateVVPosition layout docking"`

---

### Task 2: Sentiment Separation & TimedText Parsing (LR `we()` & `Se()` Architecture)

**Files:**
- Modify: `src/core/parser/subtitleParser.ts:180-250`
- Modify: `src/core/parser/sentenceSegmenter.ts:70-150`
- Test: `tests/core/parser/subtitleParser.test.ts`

**LR Source Blueprint:**
In Language Reactor `pageScript_lly.min.js` (line 1297649):
```js
function Se(segs, tStartMs) {
  return segs.map(seg => ({
    start_ms: tStartMs + (seg.tOffsetMs || 0),
    ac: seg.acAsrConf,
    text: seg.utf8
  }));
}
// Clause merging for continuous events:
if (event[n+1] && (event[n+1].begin - event[n].end <= 10)) {
  merged = { begin: event[n].begin, end: event[n+1].end, text: event[n].text + " " + event[n+1].text };
}
// Overlap clamping:
if (prevCue && prevCue.end > current.begin) prevCue.end = current.begin;
```

- [x] **Step 1: Write failing tests for LR JSON3 parsing & clause consolidation**
  - Test fixture of YouTube ASR rolling events (`vLijZb9BpkE`).
  - Assert that adjacent sub-cues with <=10ms gaps are consolidated into complete sentences matching `translate.pdf`.
  - Assert that orphan single-word cues (`The`, `This`, `Canada.`, `Ocean.`) are absorbed or pruned.
  - Assert that `prevCue.end` is clamped to `current.begin`.

- [x] **Step 2: Run test to verify failure**
  - Run: `npx vitest run tests/core/parser/subtitleParser.test.ts`
  - Expected: FAIL.

- [x] **Step 3: Implement LR `we()` & `Se()` in `subtitleParser.ts`**
  - Implement segment offset extraction (`tOffsetMs` -> `wordTimings`).
  - Implement continuous clause consolidation (`gap <= 10ms` -> merge text).
  - Implement strict timestamp boundary clamping (`endMs = Math.min(endMs, nextStartMs)`).
  - Filter out events with `aAppend === 1` unless they introduce new distinct tokens.

- [x] **Step 4: Run test to verify pass**
  - Run: `npx vitest run tests/core/parser/subtitleParser.test.ts`
  - Expected: PASS.

- [x] **Step 5: Commit**
  - `git add src/core/parser/subtitleParser.ts src/core/parser/sentenceSegmenter.ts tests/core/parser/subtitleParser.test.ts`
  - `git commit -m "feat(parser): implement Language Reactor we() and Se() sentiment segmentation"`

---

### Task 3: 60FPS Spoken Word Highlighting (LR `T()` Engine & Karaoke Style)

**Files:**
- Modify: `src/core/types.ts:40-60`
- Modify: `src/ui/OverlayManager.ts:150-240`
- Modify: `src/ui/ContentOrchestrator.ts:375-410`
- Modify: `src/ui/overlay.css:120-170`
- Test: `tests/ui/OverlayManager.test.ts`

**LR Source Blueprint:**
In Language Reactor `pageScript_lly.min.js` (line 1700000 `function T()`):
- `let S = 125;` (125ms audio-lead offset).
- Subtitle activates at `cue.begin - 125ms`.
- Subtitle lingers for `400ms` during transit between sentences.
- Active word is determined from word-level offsets (`tOffsetMs`).

- [x] **Step 1: Write failing tests for karaoke-style word highlighting**
  - Verify that `EnrichedToken` carries `startMs` and `endMs`.
  - Verify that `OverlayManager.updateActiveSpokenWord(timeMs)` applies `.cr-speaking-word` exclusively to the token currently spoken.
  - Verify that the full sentence remains visible at all times.

- [x] **Step 2: Run test to verify failure**
  - Run: `npx vitest run tests/ui/OverlayManager.test.ts`
  - Expected: FAIL.

- [x] **Step 3: Implement 125ms lead & active spoken word highlighting**
  - In `ContentOrchestrator.ts`:
    - Incorporate LR's `S = 125ms` audio-lead offset (`cue.startMs - 125`).
    - In `handleTimeUpdate(timeMs)`: pass `timeMs` to `this.overlay.updateActiveSpokenWord(timeMs)`.
  - In `OverlayManager.ts`:
    - Store rendered word spans mapped to their `[startMs, endMs]`.
    - In `updateActiveSpokenWord(timeMs)`: find the active span, toggle `.cr-speaking-word`.
  - In `overlay.css`:
    ```css
    .cr-word.cr-speaking-word {
      background: rgba(255, 255, 255, 0.28) !important;
      border-radius: 4px !important;
      text-shadow: 0 0 10px rgba(125, 249, 194, 0.8), 0 0 18px rgba(125, 249, 194, 0.4) !important;
      transform: scale(1.06);
      font-weight: 800 !important;
      transition: background 0.08s ease, transform 0.08s ease;
    }
    ```

- [x] **Step 4: Run test to verify pass**
  - Run: `npx vitest run tests/ui/OverlayManager.test.ts`
  - Expected: PASS.

- [x] **Step 5: Commit**
  - `git add src/core/types.ts src/ui/OverlayManager.ts src/ui/ContentOrchestrator.ts src/ui/overlay.css tests/ui/OverlayManager.test.ts`
  - `git commit -m "feat(sync): add Language Reactor 125ms audio lead and karaoke spoken word highlighting"`

---

### Task 4: Fix Overlapping Stuck Dictionary Balloons (LR Tippy-grade Singleton Lifecycle)

**Files:**
- Modify: `src/ui/OverlayManager.ts:394-556`
- Test: `tests/ui/OverlayManager.test.ts`

**LR Source Blueprint:**
In Language Reactor `pageScript_lly.min.js` (line 1297000):
```js
// Tippy-grade singleton:
hideOnClick: true;
// On any new trigger, previous popper is immediately hidden and destroyed:
_e(e) { if (!ue.props.interactive || !Y.contains(e.target)) ue.hide(); }
```

- [x] **Step 1: Write failing tests for rapid sequential word clicking**
  - Test clicking word 1 ("your"), then immediately clicking word 2 ("become").
  - Assert that exactly ONE `.cr-hover-balloon` exists in the Shadow DOM at all times.

- [x] **Step 2: Run test to verify failure**
  - Run: `npx vitest run tests/ui/OverlayManager.test.ts`
  - Expected: FAIL.

- [x] **Step 3: Implement atomic balloon singleton in `OverlayManager.ts`**
  - Add monotonic `private currentBalloonRequestId = 0`.
  - In `showWordBalloon(word, lemma, anchor, isPinned)`:
    - Increment `const reqId = ++this.currentBalloonRequestId`.
    - Synchronously remove ALL `.cr-hover-balloon` elements from `this.shadowRoot`.
    - Remove `.cr-active-word` from previous anchor.
    - Fetch translation.
    - Guard: `if (reqId !== this.currentBalloonRequestId || !this.shadowRoot) return;`
    - Before appending, sweep `this.shadowRoot.querySelectorAll('.cr-hover-balloon').forEach(el => el.remove())`.
    - Append and position balloon.
  - In container click listener:
    - If click is not inside the balloon, synchronously dismiss and destroy all balloons.

- [x] **Step 4: Run test to verify pass**
  - Run: `npx vitest run tests/ui/OverlayManager.test.ts`
  - Expected: PASS.

- [x] **Step 5: Commit**
  - `git add src/ui/OverlayManager.ts tests/ui/OverlayManager.test.ts`
  - `git commit -m "fix(balloon): enforce atomic singleton lifecycle preventing overlapping popups"`

---

### Task 5: Full Build & Regression Verification

**Files:**
- Verify: Unit test suite (`npm run test:unit`)
- Verify: Chrome extension build (`npm run build:ext`)
- Verify: Standalone web app build (`npm run build:web`)

- [x] **Step 1: Execute Vitest unit test suite**
  - Command: `npm test`
  - Verify all 268 tests pass with zero failures.

- [x] **Step 2: Execute extension & web app builds**
  - Command: `npm run build:ext` and `npm run build:web`
  - Verify bundle generation in `dist/`, `dist-extension/`, and `dist-web/`.

- [x] **Step 3: Push commits to remote**
  - `git push origin personal/main`

---

## 🚀 Phase 2: Language Reactor Semantic Parity, 100% Native Highlighting Sync & Larger Typography

### Task 6: Semantic Sentiment Segmentation Architecture (`translate.pdf` Parity)

**Root Cause:**
YouTube ASR captions emit rolling 2-line windows with large durations (~4–5s). Without Language Reactor's exact `fixedEnd` calculation and ASR clause pairing, sentences split incorrectly (e.g. `this point.` separated from `I started posting some grammar lessons,`) or merge arbitrarily with following clauses (`some tips and tricks`), causing semantic misalignment and delayed transitions.

**LR Blueprint (`pageScript_lly.min.js:1296339`):**
```js
// fixedEnd caps lingering YouTube ASR duration to 1.3s after final spoken syllable:
let s = Math.min(r, lastWord.start_ms + 1300);
// Overlap clamping prevents earlier cues from lingering into new ones:
if (prev.end > i) prev.end = i;
if (prev.fixedEnd !== undefined && prev.fixedEnd > i) prev.fixedEnd = i;
// Clause consolidation merges crawling events when gap <= 10ms:
if (e[n+1] && !(e[n+1].begin - e[n].end > 10)) {
  a = { begin: e[n].begin, end: e[n+1].fixedEnd || e[n+1].end, text: e[n].text + " " + e[n+1].text };
  n += 2;
}
```

- [x] **Step 1: Write unit tests in `tests/subtitleParser.test.ts`**
  - Test `translate.pdf` sequence for video `vLijZb9BpkE`:
    - Cue 1 (5:37): `this point. I started posting some grammar lessons,`
    - Cue 2 (5:40): `some tips and tricks on uh vocabulary, idioms, slang, that kind of thing. As`
    - Cue 3 (5:48): `I'm sure you know, you've seen my videos, probably. If this is your first`
  - Assert that `fixedEnd` caps duration at `lastWord.startMs + 1300`.
  - Assert that continuous crawling events (`gap <= 10ms`) merge into consolidated 2-clause sentences without requiring sentence terminator punctuation.

- [x] **Step 2: Implement LR `we()` and `Se()` in `src/core/parser/subtitleParser.ts`**
  - Implement exact `fixedEnd` computation on ASR events.
  - Implement boundary clamping across all adjacent cues (`prev.endMs = Math.min(prev.endMs, current.startMs)`).
  - Implement unconditional clause pair merging for `gap <= 10ms`.
  - Carry through `wordTimings` for each word with clamped end boundaries.

- [x] **Step 3: Run Vitest to verify pass**
  - Command: `npx vitest run tests/subtitleParser.test.ts`

---

### Task 7: 100% Real-Time Word & Subtitle Synchronization (Eliminate 1.0–1.5s Delay)

**Root Cause:**
In `ContentOrchestrator.ts:handleTimeUpdate`, the active cue lookup was:
`c => effectiveTime >= c.startMs && timeMs <= c.endMs`
Because `timeMs` (without lead) was checked against `c.endMs`, when a new cue started, the orchestrator stayed locked to the old cue until `timeMs` caught up to `c.endMs` (1.0–1.5s delay). Additionally, single words in `OverlayManager.ts` lacked tight timing bounds.

**LR Blueprint (`pageScript_lly.min.js:1798345` `A(subtitles, timeMs)`):**
```js
// Active cue search uses effectiveTime across BOTH bounds:
function A(e, t) {
  for (let a = 0; a < e.subtitles.length; a++) {
    let n = e.subtitles[a];
    if (n.end > t && n.begin <= t) return a;
    if (n.begin > t) break;
  }
  return "TRANSIT";
}
```

- [x] **Step 1: Write unit tests in `tests/overlayManager.test.ts`**
  - Verify instantaneous cue transition at `startMs - 125ms` with zero lag.
  - Verify active spoken word karaoke highlights strictly when `effectiveTime` is within `[word.startMs, word.endMs]`.
  - Verify that the previous cue's word highlight is completely purged when moving to the next cue.

- [x] **Step 2: Update `ContentOrchestrator.ts` & `OverlayManager.ts`**
  - In `ContentOrchestrator.ts`:
    - Apply LR's search algorithm where `cue.startMs <= effectiveTime && effectiveTime < cue.endMs`.
    - Instantaneously switch cues as soon as `effectiveTime` hits `nextCue.startMs`.
    - Hold previous cue during transit gaps for up to 400ms before clearing.
    - Pass `effectiveTime` to `updateActiveSpokenWord(effectiveTime)`.
  - In `OverlayManager.ts`:
    - Clamp word span intervals tightly: `wEnd = nextWord ? Math.min(wStart + 500, nextWord.startMs) : Math.min(cue.endMs, wStart + 400)`.
    - Toggle `.cr-speaking-word` on active spoken word, removing from all other words.

- [x] **Step 3: Run Vitest to verify pass**
  - Command: `npx vitest run tests/overlayManager.test.ts`

---

### Task 8: In-Player Subtitle Typography & Prominence Enlargement

**Goal:**
Enlarge in-player subtitle text significantly so that it matches the prominence and scale of native YouTube subtitles (`~28px - 34px`), with crisp Arabic translation and luminous word karaoke glow.

- [x] **Step 1: Update `src/ui/overlay.css`**
  - Enlarge `.cr-subtitle-target`:
    - `font-size: clamp(1.65rem, 2.6vw, 2.15rem);` (~30px–34px).
    - `font-weight: 700;`
    - `line-height: 1.35;`
    - `text-shadow: 0 2px 8px rgba(0, 0, 0, 0.98), 0 0 4px rgba(0, 0, 0, 0.98);`
  - Enlarge `.cr-subtitle-translation`:
    - `font-size: clamp(1.25rem, 1.9vw, 1.55rem);` (~22px–25px).
    - `font-weight: 600;`
    - `margin-top: 6px;`
    - `text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);`
  - Enhance `.cr-word.cr-speaking-word`:
    - `background: rgba(255, 255, 255, 0.32) !important;`
    - `text-shadow: 0 0 12px rgba(125, 249, 194, 0.95), 0 0 22px rgba(125, 249, 194, 0.5) !important;`
    - `transform: scale(1.08);`
    - `font-weight: 800 !important;`
  - Enhance `.cr-subtitle-box`:
    - `padding: 8px 22px;`
    - `bottom: 42px;`
    - `border-radius: 8px;`

---

### Task 9: Right Sidebar Transcript Translation Rows & Organization

**Goal:**
Organize the right-side transcript panel cards so that each card displays both the English sentence (with CEFR token colors) and its corresponding Arabic translation below it, exactly like Language Reactor and `translate.pdf`.

- [x] **Step 1: Update `src/ui/SidebarPanel.ts`**
  - In `renderCues()`, append an Arabic translation container (`.cr-sidebar-trans-row`) below `textWrapper` in each card.
  - If `cue.translatedText` is available, render immediately.
  - If not yet available, trigger asynchronous sentence translation and populate smoothly.
  - Update `setActiveTime(timeMs)` to use crisp boundary checking (`timeMs >= c.startMs && timeMs < c.endMs`).

- [x] **Step 2: Update unit tests in `tests/sidebarPanel.test.ts`**
  - Verify translation lines render in transcript rows.
  - Verify active card highlights synchronously without lingering.

---

### Task 10: MAIN World Official JSON3 Interception & `pot` Extraction

**Goal:**
Ensure CodiReactor always acquires official YouTube JSON3 caption tracks with complete `tOffsetMs` word timings across all videos.

- [ ] **Step 1: Update `src/adapters/YouTubeAdapter.ts`**
  - In `injectFetchProxy()`, capture `pot` ("proof of origin token") from `/timedtext?` requests.
  - In `probeOfficialTracks()`, fetch `track.baseUrl + '&fmt=json3'` directly from the MAIN world context (passing `&c=WEB&pot=` if captured).
  - Relay the parsed JSON3 cues immediately via `CR_SUBTITLE_DATA`.
  - In `video.textTracks` fallback: apply strict overlap clamping, clause pairing, and syllable-spaced word timings.

---

### Task 11: End-to-End Verification & Builds

- [ ] **Step 1: Execute Vitest test suite**
  - `npm test` (all tests passing).
- [ ] **Step 2: Build extension and web artifacts**
  - `npm run build:ext` and `npm run build:web`.
- [ ] **Step 3: Update `PROJECT_STATE_MEMORY.md` and commit**

