/**
 * COA parser types (JSDoc-only, no runtime overhead).
 *
 * @typedef {'measured' | 'declared' | 'derived'} Provenance
 *   measured  = point value from a signed COA (most reliable)
 *   declared  = manufacturer range ("up to 22% THC")
 *   derived   = computed from genetics prior (no COA)
 *
 * @typedef {Object} ParsedCOA
 * @property {string}              batchNo           - Grow batch number from COA
 * @property {string}              [sku]             - Commercial SKU / product code
 * @property {string}              [genetics]        - Display name for resolveGenetics
 * @property {string[]}            [parents]         - Parent strains if listed on COA
 * @property {string}              cultivator        - Manufacturer name
 * @property {string}              [cultivationMethod] - 'indoor'|'outdoor'|'greenhouse'|'hybrid_grow'
 * @property {boolean}             [irradiation]     - true if irradiated (mandatory on COA)
 * @property {string}              [growSeason]      - e.g. 'spring 2024'
 * @property {number}              [thcPct]          - THC %
 * @property {number}              [cbdPct]          - CBD %
 * @property {Record<string,number>} terpenes        - { myrcene: 0.8, limonene: 0.6, … }
 * @property {Provenance}          provenance
 * @property {string}              [coaUrl]          - Source URL of the COA
 * @property {string}              [rawText]         - Raw extracted text for audit
 *
 * @typedef {Object} COAParseResult
 * @property {ParsedCOA[]} batches                   - Zero or more parsed batches
 * @property {string[]}    warnings                  - Non-fatal parse issues
 * @property {string}      [error]                   - Fatal parse error message
 */

export {}; // marks this as an ES module
