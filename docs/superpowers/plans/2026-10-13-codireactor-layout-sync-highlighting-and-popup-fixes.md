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
  - Verify all 261 tests pass with zero failures.

- [x] **Step 2: Execute extension & web app builds**
  - Command: `npm run build:ext` and `npm run build:web`
  - Verify bundle generation in `dist/`, `dist-extension/`, and `dist-web/`.

- [x] **Step 3: Push commits to remote**
  - `git push origin personal/main`
