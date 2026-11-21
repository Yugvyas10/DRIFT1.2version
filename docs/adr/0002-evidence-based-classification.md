# ADR-0002: Evidence-based classification and confidence

Status: Accepted (2026-09-26). The confidence formula is finalised in M2 as an amendment to this ADR.
Date: 2026-09-26
Owner: P4

## Context

Structural diff tools already flag dangerous changes. Their "warning" class covers changes that cannot be confirmed programmatically. DRIFT's contribution is to _prove_ a break with concrete samples, and to be honest when it cannot.

## Decision

1. **BREAKING requires failing evidence.**
   - Request direction: a sample (recorded or synthetic) that is _valid under the old contract and invalid under the new one_.
   - Response direction: a sample generated from the new response schema that the old schema rejects.
   - A sample that is invalid under both contracts is _not_ evidence. It is reported as pre-existing non-conformance.
2. **RISKY** = the rules say the change is structurally dangerous, and no failing evidence was found. **Missing evidence never yields SAFE.**
3. **SAFE** = structurally safe under the direction rules (`PLAN.md` §4.2).
4. **Direction is explicit.** Narrowing what the server accepts (request) and widening what it returns (response) are both dangerous.
5. **Synthetic evidence** is tagged `synthetic: true` in every output and carries lower confidence than recorded evidence.
6. **Validation errors at a redacted JSON pointer** count as "unknown", never as failures.
7. **Confidence** in [0, 1] is derived from evidence coverage. Principles:
   - recorded failing evidence → 1.0;
   - synthetic-only failing evidence → below 1.0, and falling as more recorded samples reach the changed location without failing;
   - no failing evidence → grows with the number _n_ of recorded samples that reached the location, using the rule of three (0 failures in _n_ samples gives a 95% upper bound of 3/_n_ on the failing share);
   - _n_ = 0 → the label is marked `unverified`.
     All parameters are in the versioned rules file, not in code.

## Alternatives considered

- **Structural-only classification**, as in oasdiff. This is our baseline in the benchmark, not our method.
- **Treating "no failing samples" as SAFE.** Rejected: absence of evidence is not evidence of safety, especially with little traffic.
- **ML-based classification.** A non-goal in the core path. It would also be hard to explain and to reproduce.

## Consequences

- Verify must run before Classify, and Verify needs a corpus. When there is no traffic, synthetic generation fills the gap and is labelled as such.
- The mutation benchmark reports precision and recall for BREAKING and the RISKY rate, so this policy's trade-off is measured, not asserted.

## Questions an examiner might ask

- _Can DRIFT miss a break?_ Yes. A break that no sample exercises stays RISKY. That is why RISKY exists, and why `--fail-on risky` is available.
- _Why is one failing sample enough?_ Validation is deterministic: the sample is a concrete counterexample showing that the new contract rejects something the old one accepted.
- _Why the rule of three?_ It is the standard closed-form 95% bound for zero observed events in _n_ trials, and it is easy to explain and check.
