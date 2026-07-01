/* ============================================================
   THE LUMEN STANDARD, Version 2.0 — the deterministic rule
   Single source of truth for the Evidence Certainty rating. The Standard
   (readlumen.site/standard) requires the rating to be produced by a fixed,
   published rule applied to the five checks — never by editorial discretion —
   so that any reader can reconstruct it from a story's check fields.

   This file is the machine form of "Rule v2.0". It runs identically in:
     - Node   (build.js / lib/story-render.js require() it to bake pages)
     - Browser (assets/app.js and admin.html read window.LUMEN_STANDARD)
   Keep it dependency-free and side-effect-free so both hosts stay in lockstep.

   If you change the mapping, you are changing the RULE_VERSION. That is a
   Standard version bump: document it in the public changelog and never apply
   it retroactively to already-assessed entries. (See the Standard, "Versioning".)
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node
  if (root) root.LUMEN_STANDARD = api;                                    // browser
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STANDARD_VERSION = '2.0';
  var RULE_VERSION = 'v2.0';

  /* Check 1 — Source Tier. peer-reviewed/regulatory are full evidence;
     preprint caps the rating at Low; press-release is never rated. */
  var SOURCE_TIERS = [
    { value: 'peer-reviewed', label: 'Peer-reviewed' },
    { value: 'regulatory', label: 'Regulatory (FDA/EMA)' },
    { value: 'preprint', label: 'Preprint (not yet peer-reviewed)' },
    { value: 'press-release', label: 'Press release / unreviewed' }
  ];

  /* Check 2 — Study Type & Trial Phase. Each has a baseline certainty; this is
     the only check that sets the baseline (the others can only cap it). */
  var STUDY_TYPES = [
    { value: 'meta-analysis', label: 'Systematic review / meta-analysis of RCTs', baseline: 'High' },
    { value: 'phase3-multiple', label: 'Two or more concordant Phase 3 trials', baseline: 'High' },
    { value: 'phase3', label: 'Single Phase 3 randomized trial', baseline: 'Moderate' },
    { value: 'phase2', label: 'Phase 2', baseline: 'Low' },
    { value: 'phase1', label: 'Phase 1 (safety / first-in-human)', baseline: 'Low' },
    { value: 'observational', label: 'Observational / retrospective', baseline: 'Low' },
    { value: 'preclinical', label: 'Animal / preclinical', baseline: 'Insufficient' }
  ];

  /* Conflict of interest — a material, undisclosed or unmanageable COI caps at Low. */
  var CONFLICTS = [
    { value: 'none', label: 'None declared' },
    { value: 'disclosed', label: 'Disclosed and managed' },
    { value: 'undisclosed', label: 'Undisclosed or unmanageable' }
  ];

  /* the certainty lattice (higher = stronger). Insufficient and Not Assessable
     are first-class outcomes, not failures. */
  var ORDER = { 'Not Assessable': 0, 'Insufficient': 1, 'Low': 2, 'Moderate': 3, 'High': 4 };
  var BY_NUM = ['Not Assessable', 'Insufficient', 'Low', 'Moderate', 'High'];

  /* what each rating licenses (verbatim intent from the Standard, condensed to
     one line for the card's boundary text). */
  var BOUNDARY = {
    'High': 'Well supported by strong, consistent evidence, accurately represented. A reliable read of the current evidence, not a certification of truth, a prediction, or advice.',
    'Moderate': 'Supported by sound but not yet replicated or fully consistent evidence. Supports cautious reliance; further evidence could shift it. Not advice.',
    'Low': 'Rests on early-stage, associational, unreviewed, or incompletely reported evidence. Supports awareness only, not acting on the finding as established. Not advice.',
    'Insufficient': 'The evidence cannot support a human-applicable claim at this time (for example, a preclinical signal). Supports no reliance on the claim as a human result.',
    'Not Assessable': 'Rests on a source Lumen does not treat as evidence (a press release or unreviewed assertion). Recorded as an unverified claim; supports no reliance.'
  };

  function studyType(value) {
    for (var i = 0; i < STUDY_TYPES.length; i++) if (STUDY_TYPES[i].value === value) return STUDY_TYPES[i];
    return null;
  }
  function sourceTier(value) {
    for (var i = 0; i < SOURCE_TIERS.length; i++) if (SOURCE_TIERS[i].value === value) return SOURCE_TIERS[i];
    return null;
  }

  /* certaintyRating(story) — the deterministic Rule v2.0.
     Reads the check fields: studyType, sourceTier, effectIsRelativeOnly,
     conflictOfInterest. Returns the rating plus the reasoning needed to render
     and audit it. Missing/unknown inputs yield a null-safe "Not Assessable". */
  function certaintyRating(s) {
    s = s || {};
    var st = studyType(s.studyType);
    var src = s.sourceTier || '';
    var out = {
      standardVersion: STANDARD_VERSION, ruleVersion: RULE_VERSION,
      label: 'Not Assessable', num: 0, strength: 0,
      basis: '', boundary: '', caps: [], note: '', flagged: false
    };

    // A press-release/unreviewed source is never rated (overrides everything).
    if (src === 'press-release') {
      out.basis = 'Press release / unreviewed source';
      out.note = 'Recorded as an unverified claim: a press release is not treated as evidence.';
      out.boundary = BOUNDARY['Not Assessable'];
      return finalize(out);
    }
    // No usable study type yet → cannot rate.
    if (!st) {
      out.basis = 'Study type not set';
      out.boundary = BOUNDARY['Not Assessable'];
      return finalize(out);
    }

    var num = ORDER[st.baseline];
    out.basis = st.label;

    // Caps can only LOWER the baseline (min), never raise it. Ceiling = Low (2).
    if (src === 'preprint') { num = Math.min(num, ORDER.Low); out.caps.push('Preprint, not yet peer-reviewed'); }
    if (s.effectIsRelativeOnly) { num = Math.min(num, ORDER.Low); out.caps.push('Effect reported in relative terms only'); }
    if (s.conflictOfInterest === 'undisclosed') { num = Math.min(num, ORDER.Low); out.caps.push('Undisclosed or unmanageable conflict of interest'); out.flagged = true; }

    out.num = num;
    out.label = BY_NUM[num];
    out.boundary = BOUNDARY[out.label] || '';
    if (out.caps.length) out.note = out.caps.join('; ') + ' — rating capped at ' + BY_NUM[num] + '.';
    return finalize(out);
  }

  function finalize(out) {
    out.strength = out.num; // 0–4 segments (Not Assessable 0 … High 4)
    out.tier = out.basis + ' · Rule ' + RULE_VERSION;
    return out;
  }

  return {
    STANDARD_VERSION: STANDARD_VERSION, RULE_VERSION: RULE_VERSION,
    SOURCE_TIERS: SOURCE_TIERS, STUDY_TYPES: STUDY_TYPES, CONFLICTS: CONFLICTS,
    studyType: studyType, sourceTier: sourceTier, certaintyRating: certaintyRating
  };
});
