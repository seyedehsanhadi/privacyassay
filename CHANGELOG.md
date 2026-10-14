# Changelog

## 0.9.7 - 2026-10-14

- Preserve exposed values when repeated or frame reads fail; distinguish stable per-site changes from variation within one site. Volatile font lookup stays incomplete; incomplete comparisons earn no protection credit.
- Redact numeric readings and identity details in the page and saved reports; retain WebGL denial and collector-failure causes.
- Validate first-party storage controls before crediting ambiguous cross-site failures. Generic IndexedDB failures remain unknown.
- Score WebGPU features independently; isolate failed GPU metadata, clean up resources, and handle asynchronous lie probes without late report changes.
- Fix explicit local companion routing, result visibility, keyboard focus and scan timestamps. Recover first-run pages, including Vivaldi; wait for audit controls and verify candidate captures on both origins. Validate CLI arguments, bound startup and comparison time, and retain the full cross-site report.
- Read WebGPU fallback and subgroup details from `GPUAdapterInfo`, where current browsers expose them. Keep feature detection when site storage is blocked. Stop flagging Android Chrome's empty plugin list and treat iPadOS as mobile. Name Edge, Chrome and Firefox on Android and iOS. Unmeasured coherence probes no longer display as failures. CLI `--no-cross` now skips the second site, and a finished audit survives a cross-site wait that reaches `--timeout`. The WASM rows name what they test: the validate-only atomics opcode check is labelled `atomics`, not `threads`, and the `SharedArrayBuffer` bit is named; neither establishes that threaded WASM can run on the page.
- Expand regression checks across Chromium, Firefox, Mullvad, Tor, Windows WebKit and native macOS Safari. The added surface and scoring corrections make scores incompatible with 0.9.6.

## 0.9.6 - 2026-10-07

- Classify withheld client hints and unavailable WebGPU correctly; preserve denial, failure and repeat causes.
- Replace the wildcard reply introduced in 0.9.4 with a private MessagePort bound to the trusted origin and window.
- Let known exposure on either read or site override masking or refusal. Verify hidden and assumed-uniform readings through fresh frames or hit-testing before crediting them; affected scores can decrease from 0.9.5.
- Label uniformity as assumed and show the score without that assumption. Describe observed wrappers without naming extensions; disclose missing server probes.

## 0.9.5 - 2026-10-07

- Credit documented family-wide fixed values on both sites for Tor, Mullvad and resistFingerprinting browsers. Ordinary matching values earn nothing; single-site scores receive no uniformity credit.
- Cross-site scores for those families are incompatible with 0.9.4.

## 0.9.4 - 2026-10-07

- Treat WebGL readback `NotSupportedError` as refused, allowing Tor and Mullvad runs to complete where 0.9.3 could not.
- Add a wildcard companion-reply fallback for isolated first parties, retaining receiver checks. Removed in 0.9.6 because it exposed readings to untrusted embedding pages.
- Connect Tor automatically in the benchmark harness and permit loopback access.

## 0.9.3 - 2026-10-06

- Compare decoded canvas pixels across sites, eliminating false variation from PNG encoding. Canvas results are incompatible with 0.9.2.
- Require usable readings on both sites. Ambiguous Cookie Store failures require a successful first-party control; missing or invalid measurements remain unknown.
- Make DRM opt-in to avoid native prompts; distinguish availability, rejection, failure and timeout, and prevent late answers from changing results.

## 0.9.2 - 2026-09-05

- Validate storage and cache controls, await writes, read companion storage once, and keep rescoring and exports synchronized. Explicitly refused storage can complete; failed or unmeasured mechanisms remain unknown.
- Separate unknown readings from protection with coverage, score bounds and incomplete verdicts. Correct GPU and font classifications; repeat fingerprint stimuli and report missing contexts.
- Bind companion replies to the source window, run token and methodology version; use the same top-level comparison across browsers. Bound asynchronous probes and prevent late AI/WebGPU mutation.
- Add summary schema 1.1 and reject CLI thresholds on incomplete runs. Preserve bundled extensions and limit cleanup to launched processes.
- Remove unsupported Goanna identification; explain script blocking and correctly classify missing OPFS files and explicitly disabled GPU or voice APIs.
- Add the HTML methodology page, correct WebGPU fault-injection checks and indexing documentation, and retain historical charts with version labels while refreshing the social card.

## 0.9.1-beta - 2026-08-16

- Remove false credit for desktops without taskbars, previously worth up to 3 points; credit zeroed taskbars only for documented browser families. Measure CLI randomization and per-site changes rather than inferring them from browser names.
- Correct the linkability denominator, canvas FNV-1a probe and 500px letterbox detection. Expand the two-read blind spot from fifteen readings to seventeen.
- Redact identification text and bare numeric readings. Correct category hashes, tile counts, measuring-state messages and the coherence panel: eleven omitted checks, previously 23/23, actually 33/34.
- Preserve unknown timer measurements; describe disabled WebGL without naming an extension. Release leaked WebGL contexts.
- Support IPv6 loopback and add the favicon. Remove an unused hash function and overwritten category build; add regression tests.

## 0.9.0-beta

First public release.
