import { pool } from "../db.js";

// LLM-based genetics inference is disabled in local mode.
// The function is preserved for API compatibility but always returns null
// so callers fall back to the local fuzzy catalog (menuParser.js).
async function fetchUnknownStrainGenetics(_strainName) {
  return null;
}

export { fetchUnknownStrainGenetics };
