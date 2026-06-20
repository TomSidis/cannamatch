// דמיון וקטורי בין פרופילי DNA — לזיהוי "תאומים גנטיים"
import { cosine } from "./scoring.js";

function computeIndicationOverlapRatio(a = [], b = []) {
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...a, ...b]).size || 1;
  return inter / union;
}

// 70% דמיון טרפנים + 30% חפיפת התוויות
function twinScore(profA, profB) {
  const vecSim = cosine(profA.target_vector || [], profB.target_vector || []);
  const indSim = computeIndicationOverlapRatio(profA.indications, profB.indications);
  return 0.7 * Math.max(0, vecSim) + 0.3 * indSim;
}

export { computeIndicationOverlapRatio, twinScore };
