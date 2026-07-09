# Distillation experiment: gpt-5.5 → Qwen3.5-2B (LoRA)

**Question:** can a 2B local model *learn* graph-extraction behavior (valid JSON,
correct edge direction) from a strong teacher's worked examples, when three
rounds of prompt engineering showed it cannot *reason* its way there?

**Answer: substantially yes, with 39 training examples.**

## Setup

- **Teacher:** gpt-5.5 (via a pi RPC session; one fresh session per doc), labeling
  through the byte-exact production prompt, outputs cleaned by the repo's own
  parse → validate → enforceGraphLimits pipeline so labels are
  distribution-identical to CLI output.
- **Student:** LM Studio's local `Qwen3.5-2B-6bit` MLX weights, QLoRA
  (8 layers, 2.8M trainable params, 80 iters ≈ 2 epochs, lr 1e-4,
  seq 2688, `--grad-checkpoint`).
- **Data:** 45 Wikipedia docs truncated to ~2.2k chars (44 labeled ok) →
  39 train / 5 valid pairs. Test: Alan Turing / Apollo 11 / CRISPR (never trained
  on), scored against gpt-5.5 references.
- Final train loss 0.295, val 0.591 (from 1.525 initial).

## Results (held-out test docs, raw MLX generation, no grammar constraints)

| Metric                    | Base 2B | LoRA 2B |
|---------------------------|---------|---------|
| JSON validity             | 0/3     | **3/3** |
| Node F1 vs teacher        | 0.00    | **0.53** |
| Edge F1 (typed, directed) | 0.00    | 0.07    |
| Edge pair F1 (directed)   | 0.00    | 0.18    |
| Edge pair F1 (undirected) | 0.00    | 0.21    |
| Generation time per doc   | ~200s (rambles, then unparseable) | **~15s** |

(An earlier baseline on full-length docs managed 1/3 validity / node F1 0.23;
the matched 2k-doc baseline above went 0/3.)

Manual review of tuned output: **edge direction is consistently correct**
(e.g. *Turing works_for GC&CS*, *Turing born_in London* — never inverted),
which the base model and prompt engineering could not achieve. Remaining
errors are relation-type over-application ("works_for World War II"), i.e.
pairing/typing, not direction.

## Field notes (see worklog.jsonl for the full timeline)

- 4096-token training sequences hit a Metal memory cliff (3 iters > 10 min);
  2688 runs ~30-40s/iter. Unified-memory contention with LM Studio's loaded
  models also froze the host desktop at one point.
- mlx-lm git-main crashed at ~iter 15 with `[metal::malloc] Resource limit
  (499000) exceeded` (buffer-count accumulation); `--grad-checkpoint` fixes it.
- gpt-5.5 teacher: ~40-85s/doc, 47/48 labels ok, edge direction near-perfect.
  Local 31B teacher (gemma-4-31b heretic): comparable label quality on spot
  checks, ~4x slower; ablation abandoned after host interruptions.

## Next steps if pursued

- Scale data (hundreds of docs), full-length docs once the long-seq training
  cliff is understood, more epochs.
- Score the tuned 2B through LM Studio + json_schema (grammar constraints on
  top of learned behavior) against production configs.
- Edge typing needs either more data or a constrained relation vocabulary in
  training targets.
