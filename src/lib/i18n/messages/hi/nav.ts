import type en from "../en/nav";

const m: Record<keyof typeof en, string> = {
  "nav.dashboard": "डैशबोर्ड",
  "nav.schools": "स्कूल",
  "nav.visits": "विज़िट",
  "nav.feedback": "सुझाव",
  "nav.demonstrations": "करके दिखाना",
  "nav.followUps": "फ़ॉलो-अप",
  "nav.reports": "रिपोर्ट",
  "nav.publicContext": "सार्वजनिक जानकारी",
  "nav.practiceLibrary": "अभ्यास पुस्तकालय",
  "nav.settings": "सेटिंग",
  "nav.help": "मदद",
  "nav.primary": "मुख्य मेन्यू",
  "nav.open": "मेन्यू खोलें",
  "nav.close": "मेन्यू बंद करें",
  "nav.drawer": "मेन्यू",
  "nav.tagline": "संवाद · मेंटर का सहायक",
  "nav.fieldMode": "फ़ील्ड मोड (इंटरनेट के बिना भी चलता है)",
  "nav.signOut.pendingTitle": "इस डिवाइस के कुछ रिकॉर्ड अभी भेजे नहीं गए हैं",
  "nav.signOut.pendingBody": "इस डिवाइस पर सेव {n} रिकॉर्ड सर्वर तक नहीं पहुँचे हैं। साइन आउट करने से वे नहीं मिटते: वे इसी डिवाइस पर रहेंगे और {name} के रूप में दोबारा साइन इन करने पर भेजे जाएँगे।",
  "nav.signOut.openSync": "सिंक केंद्र खोलें",
  "nav.signOut.anyway": "फिर भी साइन आउट करें",
  "nav.signOut": "दूसरा व्यक्ति चुनें / साइन आउट",
};
export default m;
