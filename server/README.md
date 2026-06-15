# Triage-Feedback server

Backend for the pediatric triage-feedback tool. Right now it contains the **deterministic
rule engine** — the core that turns a case into a triage color plus the real explanation
(the rules that fired). No LLM and no UI yet.

## Layout

```
rules/triage-rules.yaml     # clinician-editable rule set (PROVISIONAL — needs sign-off)
src/engine/
  types.ts                  # shared types
  age.ts                    # age-unit conversion + band resolution
  loadRules.ts              # parse + validate the YAML rule set
  evaluate.ts               # evaluate a case → color, fired rules, decisive rule
  index.ts                  # public exports
test/evaluate.test.ts       # unit + integration tests against the shipped YAML
```

## Use

```ts
import { loadRuleSet, evaluate } from "./src/engine/index.js";

const rules = loadRuleSet(); // reads rules/triage-rules.yaml
const result = evaluate(
  { age: { value: 2, unit: "months" }, vitals: { temp: 38.5 } },
  rules,
);
// → { color: "ORANGE", decisive: { name: "fever_young_infant", ... }, fired: [...], ... }
```

## Engine contract

- A rule fires when **all** its conditions hold.
- A case's color is the **highest color** among fired rules (most-urgent-finding-wins;
  findings never sum).
- The **decisive rule** is the highest-color rule that fired; ties broken by file order.
- The result's `fired` + `decisive` **are** the explanation — nothing is generated separately.
- Unknown data never fires a numeric rule (no guessing).

## Commands

```
npm install
npm test          # run the test suite once
npm run test:watch
npm run typecheck
```
