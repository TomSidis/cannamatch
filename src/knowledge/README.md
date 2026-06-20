# CannaMatch Knowledge Base

Clinical and academic cannabis research structured for AI agent consumption.
Imported directly into `buildAgentContext()` in `CannaMatch.jsx` for personalized AI guidance.

## Files

| File | Contents | Source Basis |
|------|----------|-------------|
| `indications.json` | 9 Israeli-approved indications with clinical evidence, T/C recommendations, terpene guidance, and routes per indication | PubMed, Israeli MOH, Tikun Olam Research, Cochrane |
| `terpene_science.json` | 9 major terpenes: receptors, mechanisms, clinical applications, vaporizer temps, strain examples | Russo 2011, Gertsch 2008, Buchbauer 2002, GW Pharma |
| `cannabinoid_profiles.json` | THC, CBD, CBN, CBG, CBC, THCA, CBDA profiles + Israeli T/C product categories + entourage effect | WHO 2019, McPartland & Russo, IMCA 2022 |
| `routes_of_administration.json` | Vaporizer, oil, oral, topical, suppository: PK, indications, special populations, Israeli law | Grotenhermen 2003, Huestis 2007, Israeli MOH 2023 |
| `israeli_products.json` | 6 cultivators × ~15 products: genetics → terpene → indication mapping + quickmap per indication | MOH licensed cultivators list, iCan 2023, pharmacy data |

## Indication IDs (match `ans.reasons` keys)

`chronic_pain` · `ptsd` · `oncology` · `epilepsy` · `crohns_ibd` · `ms` · `sleep` · `anxiety` · `parkinsons`

## How the AI Agent Uses This

`buildKnowledgeContext(ans)` in `CannaMatch.jsx`:
1. Filters `indications.json` to user's `ans.reasons`
2. Maps `ans.cats` to `cannabinoid_profiles.json` product categories
3. Pulls `israeli_products.json` quickmap recommendations per indication
4. Extracts terpene science for user's flavor preferences

Result is injected as a structured section in the Claude system prompt — evidence-based, personalized, Hebrew-facing.
