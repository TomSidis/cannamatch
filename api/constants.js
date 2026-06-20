// Shared server-side constants — never exported to the client.

export const DEFAULT_DNA = {
  indications:      [],
  target_genetics:  {},
  target_terpenes:  {},
  trigger_terpenes: {},
  target_vector:    new Array(12).fill(0),
  report_count:     0,
};

export const CHECKIN_REPLIES = {
  anxious: [
    "קלטתי שהראש דוהר 🏎️ העליתי לך לינלול וחסמתי טרפינולן להיום. תנשום, אני שומר עליך.",
    "ראש עמוס היום? הגברתי את המרגיעים בפרופיל. אל תיגע בסאטיבות עכשיו — תסמוך עליי.",
  ],
  calm: [
    "אהבתי, רגוע ושליו 😌 שומר על הפרופיל יציב. יום טוב, אלוף.",
    "ראש נקי = יום טוב. לא נוגעים במה שעובד. 💚",
  ],
  high: [
    "כאב תפס אותך היום 💥 חיזקתי קריופילן ומירצן — אלה החברים שלך לכאב.",
    "תפוס וכואב? עדכנתי את הפרופיל לכיוון משכך. בוא נטפל בזה ביחד.",
  ],
};

export const pickReply = (arr) => arr[Math.floor(Math.random() * arr.length)];
