# graph-extract: Small LLM Training Feasibility Report

**Date:** 2026-03-22  
**Scope:** Training/adapting a 1B–7B model for graph extraction, as a demo under graph-extract  
**Status:** Research-phase design only — no implementation

---

## Executive Summary

**Training a small LLM (3B–8B) to outperform its base model on graph extraction is highly feasible within 1–2 weeks of focused effort.** The critical enablers already exist:

1. **Proven pipelines.** Distill-SynthKG (ICLR 2026) demonstrated that an 8B model distilled from GPT-4o outperforms models 8× its size on KG construction. OneKE (ZJUNLP/ACL 2024) proved that schema-guided instruction tuning on the IEPile corpus produces small models that beat general-purpose LLMs on IE tasks.

2. **Cheap compute.** QLoRA fine-tuning of a 7B model on 100K examples costs ~$5–6 on a rented RTX 4090 (~12 hours). With Unsloth on an A100, the same job runs in ~4 hours for ~$5.

3. **graph-extract already defines the output schema.** The project's `Graph` type (nodes with typed entities + edges with typed relations, JSON format) is exactly the output format these training pipelines target. The prompt template is a ready-made starting point for instruction-tuning data.

**Recommended first path:** Generate 10K–50K synthetic training examples using Claude/GPT-4o as teacher → QLoRA-tune Llama 3.2 3B or Qwen 2.5 3B using Unsloth → evaluate on held-out test set against the base model. Total calendar time: ~5–7 days. Total compute cost: <$20.

---

## 1. Candidate Base Models

| Model | Params | Context | License | Structured Output | QLoRA VRAM | Best For | Tradeoffs |
|-------|--------|---------|---------|-------------------|------------|----------|-----------|
| **Llama 3.2 1B** | 1.23B | 128K | Llama 3.2 Community (commercial OK, <700M MAU) | Native JSON mode + tool calling | ~2.5 GB | High-throughput edge inference; initial proof-of-concept | Limited reasoning; struggles with complex multi-hop relations |
| **Llama 3.2 3B** | 3.21B | 128K | Llama 3.2 Community | Native JSON mode + tool calling | ~3.5 GB | **Sweet spot for first experiment.** Enough capacity for typed entity/relation extraction | Ceiling on open-schema (novel relation discovery) |
| **Qwen 2.5 3B** | 3B | 32K (128K extended) | Apache 2.0 | Strong JSON adherence | ~3.5 GB | Most permissive license; good multilingual | Smaller community; fewer LoRA recipes available |
| **Phi-3.5 Mini** | 3.8B | 128K | MIT | Good structured output | ~4 GB | Strong reasoning per parameter; MIT license | Microsoft ecosystem; less community fine-tuning support |
| **Llama 3.1 8B** | 8B | 128K | Llama 3.1 Community | Excellent JSON + tool calling | ~6 GB | Best quality ceiling; OneKE already has LoRA weights | 2× the compute of 3B class; overkill for simple schemas |
| **Mistral v0.3 7B** | 7.3B | 32K | Apache 2.0 | Good function calling | ~6 GB | Apache 2.0; battle-tested for SFT | Smaller context than Llama; slightly older architecture |
| **Qwen 2.5 7B** | 7B | 128K | Apache 2.0 | Strong structured output | ~6 GB | Best open license at 7B; strong extraction benchmarks | Less community tooling than Llama |

### Recommendation
**Start with Llama 3.2 3B.** It has the best ratio of quality-to-cost for a first experiment, native JSON/tool-calling support, 128K context, and extensive Unsloth/LoRA support. If results are promising, scale to Llama 3.1 8B for the v2 model.

**Fallback:** Qwen 2.5 3B if Apache 2.0 licensing matters.

---

## 2. Data Sources

### 2a. Public Datasets for Relation/Triple Extraction

| Dataset | Size | Task | Relations | License | URL |
|---------|------|------|-----------|---------|-----|
| **IEPile** (ZJUNLP) | 2M+ instances, 0.32B tokens | NER + RE + EE unified | 33 source datasets, bilingual | Apache 2.0 | [HF](https://huggingface.co/datasets/zjunlp/IEPile) / [GitHub](https://github.com/zjunlp/IEPile) |
| **REBEL** (Babelscape) | 1M–10M instances | End-to-end triple extraction | 220 relation types | CC BY-SA | [HF](https://huggingface.co/datasets/Babelscape/rebel-dataset) |
| **InstructIE** (ZJUNLP) | Large, bilingual | Schema-guided IE | 12 domains | Apache 2.0 | [HF](https://huggingface.co/datasets/zjunlp/InstructIE) |
| **DocRED** | 5K documents | Document-level RE | 96 relation types | MIT | [GitHub](https://github.com/thunlp/DocRED) |
| **TACRED** | 106K sentences | Sentence-level RE | 42 relation types | LDC (restricted) | [LDC](https://catalog.ldc.upenn.edu/LDC2018T24) |
| **FewRel 2.0** | 70K sentences | Few-shot RE | 100 relations | MIT | [GitHub](https://github.com/thunlp/FewRel) |
| **WebNLG** | 25K+ | Triple ↔ text | 15+ DBpedia categories | CC BY-NC | [HF](https://huggingface.co/datasets/web_nlg) |
| **ACE 2005** | 599 documents | Joint NER + RE + EE | 7 entity types, 6 relation types | LDC (restricted) | [LDC](https://catalog.ldc.upenn.edu/LDC2006T06) |

**Licensing notes:**
- IEPile and REBEL are the most practical starting points (open license, large scale, directly relevant format)
- TACRED and ACE 2005 require LDC agreements — avoid for a quick MVP
- IEPile is specifically designed for instruction-tuning small LLMs — it's the closest match to our use case

### 2b. Synthetic Data Strategy

See §3 below for the full pipeline.

---

## 3. Distillation / Synthetic Data Pipeline

### Blueprint: Teacher-Student with Verification

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: Corpus Preparation                                  │
│                                                                │
│  Raw text corpus (Wikipedia paragraphs, news articles,         │
│  domain docs) → chunk into 200-500 word segments               │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: Teacher Extraction (GPT-4o / Claude)                │
│                                                                │
│  For each chunk:                                               │
│  1. Prompt teacher with graph-extract's prompt template        │
│     + graph-extract's JSON schema                              │
│  2. Teacher outputs: { nodes: [...], edges: [...] }            │
│  3. Store as (text, graph) pair                                │
│                                                                │
│  Prompt template matches graph-extract's existing format:      │
│  - Entity types from DEFAULT_ENTITY_TYPES                      │
│  - Relation types from DEFAULT_RELATION_TYPES                  │
│  - Output as graph-extract Graph JSON                          │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 3: Automatic Verification & Filtering                  │
│                                                                │
│  For each (text, graph) pair:                                  │
│  1. Schema validation — run graph-extract's validate()         │
│  2. Grounding check — verify entities appear in source text    │
│     (exact/fuzzy string match)                                 │
│  3. NLI check (optional) — use NLI model to verify each        │
│     (subject, relation, object) is entailed by the text        │
│  4. Completeness heuristic — flag if entity count < expected   │
│     density for text length                                    │
│  5. Discard samples failing validation; log rejection reasons  │
│                                                                │
│  Target: 60-80% pass rate → 10K-50K clean examples            │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 4: Format as Instruction-Tuning Data                   │
│                                                                │
│  Convert to chat format:                                       │
│  {                                                             │
│    "messages": [                                               │
│      { "role": "system", "content": "You are a graph          │
│        extraction assistant..." },                             │
│      { "role": "user", "content": "<prompt template           │
│        with text and schema>" },                               │
│      { "role": "assistant", "content": "<JSON graph>" }       │
│    ]                                                           │
│  }                                                             │
│                                                                │
│  Split: 90% train / 5% val / 5% test                          │
│  Ensure test split uses different source documents             │
│  (not just different chunks from same doc)                     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 5: Student Fine-Tuning                                 │
│                                                                │
│  Model: Llama 3.2 3B (or 8B)                                  │
│  Method: QLoRA (4-bit) via Unsloth                             │
│  Config: rank=64, alpha=128, target all linear layers          │
│  Epochs: 2-3                                                   │
│  LR: 2e-4 with cosine scheduler                               │
│  Batch: 4 (gradient accumulation to effective 16)              │
│  Hardware: single RTX 4090 or A100                             │
└──────────────────────────────────────────────────────────────┘
```

### Prompt Template for Teacher (reuses graph-extract format)

```
Extract all entities and relationships from the following text as a JSON knowledge graph.

TEXT:
{chunk}

ENTITY TYPES: person, organization, location, date, product, event, concept, other

RELATIONSHIP TYPES: works_for, founded, acquired, located_in, born_in, died_in,
married_to, subsidiary_of, created, member_of, produced_by, part_of, owns, related_to

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "nodes": [
    {"id": "node_1", "label": "Entity Name", "type": "entity_type"}
  ],
  "edges": [
    {"id": "edge_1", "source": "node_1", "target": "node_2",
     "type": "relation_type", "label": "human readable"}
  ]
}

RULES:
1. Output ONLY valid JSON
2. Every edge source and target must reference an existing node ID
3. Deduplicate entities
4. Use sequential IDs: node_1, node_2, ..., edge_1, edge_2, ...
5. Extract ALL entities and relationships present in the text
```

### Verification Script (pseudocode)

```python
def verify_sample(text: str, graph: dict) -> tuple[bool, list[str]]:
    issues = []

    # 1. Schema validity (reuse graph-extract's validate())
    node_ids = {n["id"] for n in graph["nodes"]}
    for edge in graph["edges"]:
        if edge["source"] not in node_ids:
            issues.append(f"dangling source: {edge['source']}")
        if edge["target"] not in node_ids:
            issues.append(f"dangling target: {edge['target']}")

    # 2. Grounding: every entity label should appear in text
    text_lower = text.lower()
    for node in graph["nodes"]:
        if node["label"].lower() not in text_lower:
            issues.append(f"ungrounded entity: {node['label']}")

    # 3. Density check
    word_count = len(text.split())
    if len(graph["nodes"]) < word_count / 100:
        issues.append("suspiciously few entities")

    return len(issues) == 0, issues
```

### Cost Estimate for Synthetic Data Generation

| Scale | Teacher API Cost (GPT-4o) | Teacher API Cost (Claude Sonnet) | Notes |
|-------|--------------------------|--------------------------------------|-------|
| 10K samples | ~$15–25 | ~$10–15 | MVP scale |
| 50K samples | ~$75–125 | ~$50–75 | Solid training set |
| 100K samples | ~$150–250 | ~$100–150 | Diminishing returns for 3B model |

---

## 4. Evaluation Plan & Success Criteria

### 4a. Metrics

| Metric | What It Measures | How to Compute |
|--------|-----------------|----------------|
| **Entity F1** (micro) | Precision/recall on extracted entities | Match by normalized label + type; partial credit for label-only match |
| **Relation F1** (micro) | Precision/recall on extracted relations | Match by (source_label, relation_type, target_label) triple |
| **Strict Triple F1** | End-to-end extraction accuracy | Triple correct only if both entities AND relation type all match |
| **Schema Validity Rate** | % of outputs that are valid JSON matching the Graph schema | Run graph-extract's `validate()` on every output |
| **Grounding Rate** | % of extracted entities that appear in source text | Fuzzy string matching |
| **Graph Structural Metrics** | Density, connectivity, # components | Compare structural properties between teacher and student graphs |
| **Latency** | Tokens/sec at inference | Measure on target hardware (local GPU or CPU) |

### 4b. Baselines to Compare

1. **Base model (no fine-tuning)** — Llama 3.2 3B-Instruct with graph-extract's standard prompt
2. **Teacher model** — GPT-4o / Claude with same prompt (quality ceiling)
3. **REBEL (BART-based)** — Existing specialized extraction model (non-LLM baseline)
4. **OneKE checkpoint** — ZJUNLP's pre-trained IE model (existing fine-tuned baseline)

### 4c. Test Split Design (Avoiding Leakage)

| Split | Source | Purpose |
|-------|--------|---------|
| **Train** (90%) | Synthetic teacher outputs on Corpus A (e.g., Wikipedia subset) | Model training |
| **Val** (5%) | Synthetic teacher outputs on Corpus A (held-out docs, not chunks) | Hyperparameter tuning, early stopping |
| **Test-Synthetic** (5%) | Synthetic teacher outputs on Corpus B (entirely different source domain) | Generalization to unseen domains |
| **Test-Human** (200–500 samples) | Human-annotated using graph-extract's schema | Ground truth quality measurement |
| **Test-Public** | REBEL / DocRED test splits reformatted to graph-extract schema | Comparison with published benchmarks |

**Key leakage prevention:**
- Train/val split by **document**, not by chunk (chunks from the same document never appear in different splits)
- Test-Synthetic uses a **different source corpus** entirely
- Test-Human is annotated independently, never seen by teacher or student

### 4d. Success Criteria

| Criterion | Threshold | Notes |
|-----------|-----------|-------|
| Schema validity rate | ≥95% (vs. base model ~60-80%) | Constrained decoding (Outlines) may get this to 100% |
| Strict Triple F1 vs base model | ≥+15 points absolute improvement | e.g., base=35 → tuned≥50 |
| Strict Triple F1 vs teacher | ≥70% of teacher quality | e.g., teacher=75 → tuned≥52 |
| Grounding rate | ≥90% | Fewer hallucinated entities |
| Latency on RTX 4090 | ≤2 sec per paragraph (200 words) | Practical for pipeline use |

---

## 5. Experiment Plan

### Phase 1: Baseline + Data Generation (Days 1–3)

**Goal:** Establish baselines and generate training data.

| Task | Time | Compute | Cost |
|------|------|---------|------|
| Run base Llama 3.2 3B on 500 test paragraphs, score all metrics | 2 hrs | Local GPU | $0 |
| Run teacher (Claude) on same 500 paragraphs for quality ceiling | 1 hr | API | ~$5 |
| Generate 10K synthetic training examples via teacher | 4–6 hrs | API | ~$15 |
| Run verification pipeline, filter to ~7K clean examples | 1 hr | Local CPU | $0 |
| Hand-annotate 100 test samples (or validate teacher outputs) | 3 hrs | Human time | $0 |

**Deliverable:** Baseline metrics + clean training dataset + test sets

### Phase 2: Fine-Tuning + Evaluation (Days 4–6)

**Goal:** Train and evaluate the first model.

| Task | Time | Compute | Cost |
|------|------|---------|------|
| QLoRA fine-tune Llama 3.2 3B on 7K examples (2 epochs) | 3–4 hrs | RTX 4090 or A100 | $3–5 |
| Run tuned model on all test sets | 1 hr | Same GPU | $0 |
| Compare metrics: tuned vs base vs teacher | 1 hr | Analysis | $0 |
| Error analysis: categorize failure modes | 2 hrs | Human time | $0 |

**Deliverable:** Tuned model + metric comparison + error analysis

### Phase 3: Iteration + Scaling (Days 7–10)

**Goal:** Address failure modes, optionally scale up.

| Task | Time | Compute | Cost |
|------|------|---------|------|
| Generate targeted synthetic data for failure modes (2K–5K more) | 2 hrs | API | ~$5 |
| Retrain with augmented dataset | 3 hrs | GPU | $3–5 |
| (Optional) Train Llama 3.1 8B variant for quality comparison | 4 hrs | GPU | $5–8 |
| (Optional) Add constrained decoding via Outlines | 2 hrs | Dev time | $0 |
| Final evaluation and report | 2 hrs | Analysis | $0 |

**Deliverable:** Improved model + final metrics + recommendation for productionization

### Total Budget

| Resource | Estimate |
|----------|----------|
| **API costs (teacher)** | $20–30 |
| **GPU rental** | $10–20 |
| **Human annotation time** | 8–10 hours |
| **Calendar time** | 7–10 days |
| **Total cash outlay** | **<$50** |

### Training Stack

| Component | Recommended Tool | Alternative |
|-----------|-----------------|-------------|
| Fine-tuning framework | **Unsloth** | LLaMA-Factory |
| Method | **QLoRA** (4-bit, rank 64) | Full LoRA if GPU allows |
| Dataset format | **ChatML / ShareGPT JSON** | Alpaca format |
| Constrained decoding | **Outlines** | llama.cpp grammar mode |
| Experiment tracking | **Weights & Biases** (free tier) | MLflow |
| Model hosting | **Ollama** or **llama.cpp** | vLLM, LM Studio |
| Evaluation | Custom script + graph-extract's `validate()` | — |

### Infrastructure Options

| Option | Specs | Cost | Best For |
|--------|-------|------|----------|
| **Local RTX 4090** | 24GB VRAM | $0 (if owned) | All phases; full control |
| **RunPod A100** | 80GB VRAM, spot | ~$1.10/hr | Fast iteration; large batch sizes |
| **Lambda Cloud A100** | 80GB VRAM | ~$1.30/hr | Reliable availability |
| **Google Colab Pro** | A100 40GB, limited hours | $10/month | Cheapest cloud option |
| **Vast.ai RTX 4090** | 24GB VRAM, spot | ~$0.30–0.50/hr | Budget option |

---

## 6. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Teacher outputs are noisy** — systematic errors in synthetic data | Medium | High | Multi-step verification (§3); NLI grounding check; start with 10K and inspect before scaling |
| **Small model can't learn JSON format reliably** | Low | High | Constrained decoding (Outlines/grammar) guarantees valid JSON at inference regardless of training quality |
| **Overfitting to synthetic templates** | Medium | Medium | Diverse source corpora; domain-shifted test set; template variation in prompts |
| **Entity normalization failures** — model uses different surface forms | High | Medium | Fuzzy matching in eval; post-processing normalization layer |
| **Insufficient improvement over base model** | Low-Medium | High | If 3B doesn't improve enough, scale to 8B; if SFT alone insufficient, add DPO/preference tuning |
| **Compute bottleneck** | Low | Low | QLoRA on 3B model fits on any 8GB+ GPU; cloud rental is cheap |

---

## 7. MVP Recommendation

### Single Best First Path

> **QLoRA-tune Llama 3.2 3B-Instruct on 10K synthetic examples generated by Claude Sonnet, using graph-extract's existing prompt template and JSON schema as the output format.**

**Why this specific combination:**

1. **Llama 3.2 3B** — Already distilled from Llama 3.1 8B/70B for structured output. Native JSON mode. 128K context. Runs on any GPU with 4GB+ VRAM (quantized). Extensive Unsloth support.

2. **Claude as teacher** — graph-extract already supports Anthropic as a provider. Using Claude means you can generate training data through the same API graph-extract already uses. Claude's structured output quality is high.

3. **graph-extract's own schema** — No need to design a new output format. The training data IS the output format the library already expects. The `validate()` function already exists for quality filtering.

4. **10K samples** — Large enough to see meaningful improvement on a 3B model, small enough to generate in one afternoon for ~$15.

5. **QLoRA via Unsloth** — Fits in 3.5GB VRAM. Training completes in 2–3 hours. Well-documented, battle-tested.

### Implementation Sketch

```bash
# 1. Generate synthetic data
python generate_training_data.py \
  --teacher claude-sonnet \
  --corpus wikipedia-paragraphs-10k \
  --schema graph-extract-default \
  --output training_data.jsonl

# 2. Verify and filter
python verify_samples.py \
  --input training_data.jsonl \
  --output clean_data.jsonl \
  --reject-log rejected.jsonl

# 3. Fine-tune
python train.py \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --data clean_data.jsonl \
  --method qlora \
  --framework unsloth \
  --epochs 2 \
  --output ./models/graph-extract-3b-v1

# 4. Evaluate
python eval.py \
  --model ./models/graph-extract-3b-v1 \
  --test-set test_human.jsonl test_synthetic.jsonl \
  --baselines base-3b,claude-teacher \
  --output eval_report.md

# 5. Export for graph-extract
python export_gguf.py \
  --model ./models/graph-extract-3b-v1 \
  --output graph-extract-3b-v1.Q4_K_M.gguf
```

---

## 8. Optional v2 Path (If MVP Works)

If the MVP shows ≥+15 F1 improvement over the base model:

### Scale Up
1. **Increase to 50K training examples** — generate from diverse domains (science, business, biography, technical docs)
2. **Train Llama 3.1 8B variant** — higher quality ceiling, still cheap to train
3. **Add DPO/preference tuning** — generate multiple extractions per text, rank by quality, train on preferences

### Specialize
4. **Domain-specific adapters** — separate LoRA weights for different domains (medical, legal, technical)
5. **Schema-conditioned training** — train on varying schemas (different entity/relation type subsets per sample), matching OneKE's approach
6. **Hard negative mining** — generate adversarial examples where base model fails, add to training set

### Productionize
7. **Constrained decoding integration** — integrate Outlines into graph-extract for guaranteed valid JSON
8. **GGUF export** — publish as a downloadable model for Ollama/LM Studio
9. **Benchmark suite** — publish graph-extract-bench as a reusable evaluation harness
10. **Model card + HuggingFace release** — open-source the fine-tuned model with eval results

### Advanced Techniques (v3+)
- **Spectrum fine-tuning** — SNR-based layer selection for even more efficient training ([arXiv:2406.06623](https://arxiv.org/abs/2406.06623))
- **GRIP** — graph-aware LoRA for models that need to reason about existing graph structure
- **Multi-pass extraction** — train model to do iterative refinement (extract → self-critique → re-extract)

---

## Key References

| Resource | URL | Relevance |
|----------|-----|-----------|
| Distill-SynthKG paper | [arXiv:2410.16597](https://arxiv.org/abs/2410.16597) | Core distillation methodology |
| OneKE framework | [GitHub](https://github.com/zjunlp/OneKE) | Schema-guided extraction for small LLMs |
| IEPile dataset | [HuggingFace](https://huggingface.co/datasets/zjunlp/IEPile) | 2M instruction-tuning examples for IE |
| IEPile paper | [arXiv:2402.14710](https://arxiv.org/abs/2402.14710) | Dataset construction methodology |
| REBEL dataset | [HuggingFace](https://huggingface.co/datasets/Babelscape/rebel-dataset) | 220-relation triple extraction |
| Spectrum paper | [arXiv:2406.06623](https://arxiv.org/abs/2406.06623) | SNR-based layer selection for efficient FT |
| Unsloth | [GitHub](https://github.com/unslothai/unsloth) | 2-4× faster QLoRA training |
| LLaMA-Factory | [GitHub](https://github.com/hiyouga/LLaMA-Factory) | Alternative fine-tuning framework |
| Outlines | [GitHub](https://github.com/outlines-dev/outlines) | Constrained decoding for valid JSON |
| InstructIE dataset | [HuggingFace](https://huggingface.co/datasets/zjunlp/InstructIE) | Bilingual IE instructions |
| Llama 3.2 model card | [HuggingFace](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct) | Base model details |
| DocRED | [GitHub](https://github.com/thunlp/DocRED) | Document-level RE benchmark |
| DataDreamer | [GitHub](https://github.com/datadreamer-dev/DataDreamer) | Reproducible synthetic data workflows |

---

## Uncertainty Notes

- **Exact F1 improvements** from fine-tuning are domain-dependent. The "+15 points" target is based on Distill-SynthKG results but mileage may vary on graph-extract's specific schema.
- **Spectrum** is promising but has limited community adoption — stick with standard QLoRA for MVP.
- **GRIP** (in-parameter graph reasoning) is research-stage; not recommended for first experiment.
- **IEPile's format** doesn't exactly match graph-extract's JSON schema — conversion work is needed to use it directly, but the effort is modest (a few hours of scripting).
- **Teacher model choice** (Claude vs GPT-4o) — both work well for synthetic data generation. Claude may produce slightly more consistent JSON; GPT-4o has `response_format: json_object` built in. Use whichever API you already have set up.
