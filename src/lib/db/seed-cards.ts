import type { LocalizedCard } from "../types";

/**
 * ILLUSTRATIVE practice cards for the demo. They are written for SAMVAAD to show the workflow and are
 * NOT official NCERT / SCERT / DIET publications. Real deployment requires DIET-curated, officially
 * sourced cards and expert review of both the English and Hindi text.
 */
export interface SeedCard {
  id: string;
  title: string;
  domain: string;
  grade_min: number;
  grade_max: number;
  subject: string;
  teaching_language: "any" | "en" | "hi";
  description: string;
  steps: string[];
  example_prompts: string[];
  next_step: string;
  variation: string | null;
  example_dialogue: string[];
  tlm: string[];
  tags: string[];
  hi: LocalizedCard;
  status: "approved" | "draft" | "rejected";
  review_notes?: string;
}

export const SOURCE = {
  source_org: "SAMVAAD demo content (illustrative)",
  source_title: "Illustrative practice card: not an official NCERT/SCERT/DIET publication",
  source_type: "illustrative",
};

export const SEED_CARDS: SeedCard[] = [
  {
    id: "R-14",
    title: "Read-aloud with meaning questions",
    domain: "Reading comprehension",
    grade_min: 1, grade_max: 3, subject: "Hindi", teaching_language: "any",
    description:
      "After a short story is read aloud, the teacher pauses and asks a few open questions about meaning (why something happened, what might happen next, how a character felt) so learners practise understanding the story, not only reading the words.",
    steps: [
      "Choose a short story or passage that learners can follow.",
      "Read it aloud, or let pairs read it, and pause at one or two natural points.",
      "After reading, ask three open questions: one “why”, one “what happens next”, one about a character's feelings.",
      "Wait about three seconds and accept answers in the learners' own words.",
      "Ask one learner to say another learner's answer in different words.",
    ],
    example_prompts: ["Why did the character do that?", "What do you think happens next?", "How do you think the character felt? What makes you say that?"],
    next_step: "After each read-aloud this week, ask three short “why” or “what happens next” questions and give learners time to answer in their own words.",
    variation: "Grade 1: ask one question after each short passage and let learners answer with a word or gesture first. Grade 3: add a question asking learners to point to the line in the text that supports their answer.",
    example_dialogue: [
      "Teacher: Why did the little bird fly away?",
      "Learner A (fictional): Because it was scared.",
      "Teacher: What makes you think it was scared?",
      "Learner B (fictional): The cat came near.",
      "Teacher: What do you think happens next?",
    ],
    tlm: ["A short story book or story card"],
    tags: ["RC-01", "meaning", "questions", "read-aloud", "story", "understand", "comprehension", "why", "next", "कहानी", "समझ", "अर्थ", "सवाल"],
    hi: {
      title: "कहानी पढ़ने के बाद अर्थ पर आधारित प्रश्न",
      summary: "कहानी पढ़ने के बाद शिक्षक रुककर कुछ खुले प्रश्न पूछते हैं (ऐसा क्यों हुआ, आगे क्या होगा, पात्र को कैसा लगा) ताकि बच्चे सिर्फ़ शब्द पढ़ना नहीं, कहानी समझना भी सीखें।",
      next_step: "इस सप्ताह हर कहानी पढ़ने के बाद 3 छोटे प्रश्न पूछें (“क्यों?” और “आगे क्या होगा?”) और बच्चों को अपने शब्दों में उत्तर देने का समय दें।",
      steps: [
        "बच्चों के स्तर की एक छोटी कहानी चुनें।",
        "कहानी ज़ोर से पढ़ें या जोड़ियों में पढ़वाएँ, और एक-दो जगह रुकें।",
        "पढ़ने के बाद तीन खुले प्रश्न पूछें: एक “क्यों”, एक “आगे क्या होगा”, और एक पात्र की भावना पर।",
        "लगभग तीन सेकंड रुकें और बच्चों के अपने शब्दों में दिए उत्तर स्वीकार करें।",
        "किसी एक बच्चे से कहें कि वह दूसरे बच्चे का उत्तर अपने शब्दों में दोहराए।",
      ],
      prompts: ["ऐसा क्यों हुआ?", "आपको क्या लगता है आगे क्या होगा?", "पात्र को कैसा लगा होगा? आपको ऐसा क्यों लगता है?"],
      dialogue: [
        "शिक्षक: छोटी चिड़िया उड़कर क्यों चली गई?",
        "बच्चा क (काल्पनिक): क्योंकि वह डर गई थी।",
        "शिक्षक: आपको ऐसा क्यों लगा कि वह डर गई थी?",
        "बच्चा ख (काल्पनिक): बिल्ली पास आ गई थी।",
        "शिक्षक: आपके अनुसार आगे क्या होगा?",
      ],
    },
    status: "approved",
  },
  {
    id: "R-07",
    title: "Story retelling in own words",
    domain: "Reading comprehension",
    grade_min: 1, grade_max: 3, subject: "Hindi", teaching_language: "any",
    description:
      "Learners retell a story they have heard or read, in order and in their own words, with simple prompts such as “first”, “then” and “at the end”. Retelling shows how much of the story has been understood and builds spoken language.",
    steps: [
      "Read or tell a short story with a clear beginning, middle and end.",
      "Show three picture or word cards: first, then, at the end.",
      "Ask a volunteer to retell the story using the cards; let others add what is missing.",
      "Thank the retelling and ask: “What was your favourite part, and why?”",
    ],
    example_prompts: ["What happened first?", "Then what happened?", "How did the story end?"],
    next_step: "After one story this week, ask two or three learners to retell it using “first, then, at the end” and let their classmates add missing parts.",
    variation: null,
    example_dialogue: [
      "Teacher: Who can tell us what happened first?",
      "Learner A (fictional): The girl found a lost puppy.",
      "Teacher: Then what happened?",
      "Learner B (fictional): She took it home and gave it water.",
    ],
    tlm: ["Three simple cards: first / then / at the end"],
    tags: ["RC-02", "retell", "retelling", "sequence", "story", "own", "words", "order", "पुनः", "कथन", "कहानी"],
    hi: {
      title: "कहानी को अपने शब्दों में दोहराना",
      summary: "बच्चे सुनी या पढ़ी हुई कहानी को क्रम से और अपने शब्दों में दोहराते हैं (“पहले”, “फिर”, “अंत में”)। इससे पता चलता है कि कहानी कितनी समझी गई और बोलने का अभ्यास होता है।",
      next_step: "इस सप्ताह एक कहानी के बाद दो-तीन बच्चों से उसे “पहले, फिर, अंत में” के साथ दोहराने को कहें और बाकी बच्चों को छूटा हुआ भाग जोड़ने दें।",
      steps: [
        "स्पष्ट शुरुआत, मध्य और अंत वाली छोटी कहानी सुनाएँ।",
        "तीन कार्ड दिखाएँ: पहले, फिर, अंत में।",
        "एक बच्चे से कार्ड की मदद से कहानी दोहराने को कहें; बाकी बच्चे छूटा भाग जोड़ें।",
        "पूछें: “आपको कहानी का कौन-सा भाग सबसे अच्छा लगा, और क्यों?”",
      ],
      prompts: ["सबसे पहले क्या हुआ?", "फिर क्या हुआ?", "कहानी का अंत कैसे हुआ?"],
      dialogue: [
        "शिक्षक: सबसे पहले क्या हुआ, कौन बताएगा?",
        "बच्चा क (काल्पनिक): लड़की को एक खोया हुआ पिल्ला मिला।",
        "शिक्षक: फिर क्या हुआ?",
        "बच्चा ख (काल्पनिक): वह उसे घर ले गई और पानी पिलाया।",
      ],
    },
    status: "approved",
  },
  {
    id: "R-21",
    title: "Picture walk and prediction before reading",
    domain: "Reading comprehension",
    grade_min: 1, grade_max: 2, subject: "Hindi", teaching_language: "any",
    description:
      "Before reading, learners look at the pictures in the book and guess what the story may be about. This activates what they already know and gives them a reason to read and check their guess.",
    steps: [
      "Show the cover and two or three pictures from the story.",
      "Ask: “What do you see? What do you think the story is about?”",
      "Write two or three guesses on the board.",
      "Read the story, then return to the guesses: “Which guess was close?”",
    ],
    example_prompts: ["What do you see in this picture?", "What do you think this story is about?", "Was our guess right?"],
    next_step: "Before the next story this week, spend two minutes on a picture walk and ask learners to guess what the story is about; check the guesses after reading.",
    variation: null,
    example_dialogue: [
      "Teacher: Look at the picture. What do you see?",
      "Learner A (fictional): A boy and a big tree.",
      "Teacher: What do you think the story is about?",
      "Learner B (fictional): Maybe the boy is climbing the tree.",
    ],
    tlm: ["Picture book or story chart"],
    tags: ["RC-02", "picture", "prediction", "predict", "guess", "before", "reading", "चित्र", "अनुमान", "कहानी"],
    hi: {
      title: "पढ़ने से पहले चित्र-चर्चा और अनुमान",
      summary: "पढ़ने से पहले बच्चे किताब के चित्र देखकर अनुमान लगाते हैं कि कहानी किस बारे में होगी। इससे उनकी पहले की जानकारी जुड़ती है और पढ़ने का एक कारण मिलता है।",
      next_step: "इस सप्ताह अगली कहानी से पहले दो मिनट चित्र-चर्चा करें, बच्चों से अनुमान पूछें, और पढ़ने के बाद उन अनुमानों को जाँचें।",
      steps: [
        "कहानी का आवरण और दो-तीन चित्र दिखाएँ।",
        "पूछें: “आप क्या देख रहे हैं? कहानी किस बारे में होगी?”",
        "दो-तीन अनुमान श्यामपट्ट पर लिखें।",
        "कहानी पढ़ने के बाद अनुमानों पर लौटें: “कौन-सा अनुमान सही के करीब था?”",
      ],
      prompts: ["इस चित्र में आप क्या देख रहे हैं?", "आपको क्या लगता है यह कहानी किस बारे में है?", "क्या हमारा अनुमान सही था?"],
      dialogue: [
        "शिक्षक: चित्र को देखिए। आपको क्या दिख रहा है?",
        "बच्चा क (काल्पनिक): एक लड़का और बड़ा पेड़।",
        "शिक्षक: आपको क्या लगता है कहानी किस बारे में होगी?",
        "बच्चा ख (काल्पनिक): शायद लड़का पेड़ पर चढ़ रहा है।",
      ],
    },
    status: "approved",
  },
  {
    id: "R-03",
    title: "Partner reading with a listening task",
    domain: "Early reading fluency",
    grade_min: 2, grade_max: 4, subject: "Hindi", teaching_language: "any",
    description:
      "Learners read a short passage in pairs, taking turns. The listening partner has a job: to point to the words, help with a stuck word and retell one thing from what was read. Every learner reads more, and listeners stay engaged.",
    steps: [
      "Form pairs; give each pair one short passage.",
      "Partner A reads a sentence or paragraph while Partner B follows with a finger.",
      "Partner B helps with one difficult word and says one thing they heard.",
      "Swap roles. Move around and note words that many pairs find difficult.",
    ],
    example_prompts: ["Follow the words with your finger.", "Help your partner with one hard word.", "Tell your partner one thing you heard."],
    next_step: "In the next reading lesson, give listeners one job (follow with a finger and tell one thing they heard) while a partner reads.",
    variation: null,
    example_dialogue: [
      "Teacher: Partner B, follow the words with your finger while Partner A reads.",
      "Teacher: Now tell your partner one thing you heard.",
      "Learner B (fictional): The farmer lost his goat.",
    ],
    tlm: ["One short passage per pair"],
    tags: ["DC-02", "pair", "partner", "reading", "aloud", "fluency", "fluent", "turn", "listen", "listening", "जोड़ी", "पढ़ना"],
    hi: {
      title: "सुनने के काम के साथ जोड़ी में पठन",
      summary: "बच्चे जोड़ियों में बारी-बारी से छोटा अंश पढ़ते हैं। सुनने वाले साथी का भी काम होता है: उँगली से शब्द देखना, अटके शब्द में मदद करना और सुनी हुई एक बात बताना। इससे हर बच्चा ज़्यादा पढ़ता है।",
      next_step: "अगली पठन कक्षा में एक साथी के पढ़ते समय सुनने वाले को एक काम दें: उँगली से शब्द देखना और सुनी हुई एक बात बताना।",
      steps: [
        "जोड़ियाँ बनाएँ और हर जोड़ी को एक छोटा अंश दें।",
        "साथी क पढ़े और साथी ख उँगली से शब्द देखे।",
        "साथी ख एक कठिन शब्द में मदद करे और सुनी हुई एक बात बताए।",
        "भूमिकाएँ बदलें। घूमकर देखें कि किन शब्दों में कई जोड़ियों को कठिनाई है।",
      ],
      prompts: ["उँगली से शब्दों को देखते जाइए।", "अपने साथी को एक कठिन शब्द में मदद कीजिए।", "अपने साथी को एक सुनी हुई बात बताइए।"],
      dialogue: [
        "शिक्षक: साथी ख, साथी क के पढ़ते समय उँगली से शब्द देखिए।",
        "शिक्षक: अब अपने साथी को एक सुनी हुई बात बताइए।",
        "बच्चा ख (काल्पनिक): किसान की बकरी खो गई थी।",
      ],
    },
    status: "approved",
  },
  {
    id: "P-05",
    title: "Sound of the day routine",
    domain: "Early reading fluency",
    grade_min: 1, grade_max: 2, subject: "Hindi", teaching_language: "any",
    description:
      "Each day begins with one letter and its sound. Learners say the sound, think of words that start with it, and find the letter in a short line. Linking letters to sounds and words builds decoding for beginning readers.",
    steps: [
      "Write one letter on the board and say its sound clearly.",
      "Learners repeat the sound, then say words that begin with it.",
      "Write two or three of those words and underline the letter.",
      "Ask learners to find the letter in a short line on the board.",
    ],
    example_prompts: ["What sound does this letter make?", "Who can say a word that begins with this sound?", "Can you find this letter in the line?"],
    next_step: "Start each Hindi lesson this week with a two-minute “sound of the day”: say the sound, collect words that start with it, and find the letter in a line.",
    variation: null,
    example_dialogue: [
      "Teacher: This letter says /ka/. Say it with me.",
      "Learners: /ka/.",
      "Teacher: Who can say a word that begins with /ka/?",
      "Learner A (fictional): Kamal!",
    ],
    tlm: ["Chalkboard", "Letter cards (optional)"],
    tags: ["DC-01", "letter", "sound", "phonics", "words", "begin", "वर्ण", "अक्षर", "मात्रा", "ध्वनि"],
    hi: {
      title: "आज की ध्वनि",
      summary: "हर दिन एक अक्षर और उसकी ध्वनि से शुरुआत करें। बच्चे ध्वनि बोलते हैं, उससे शुरू होने वाले शब्द सोचते हैं और एक छोटी पंक्ति में वह अक्षर ढूँढते हैं। इससे अक्षर, ध्वनि और शब्द आपस में जुड़ते हैं।",
      next_step: "इस सप्ताह हर हिंदी कक्षा की शुरुआत दो मिनट की “आज की ध्वनि” से करें: ध्वनि बोलें, उससे शुरू होने वाले शब्द इकट्ठा करें, और एक पंक्ति में अक्षर ढूँढें।",
      steps: [
        "श्यामपट्ट पर एक अक्षर लिखें और उसकी ध्वनि स्पष्ट बोलें।",
        "बच्चे ध्वनि दोहराएँ, फिर उससे शुरू होने वाले शब्द बताएँ।",
        "दो-तीन शब्द लिखें और अक्षर के नीचे रेखा खींचें।",
        "बच्चों से एक छोटी पंक्ति में वह अक्षर ढूँढने को कहें।",
      ],
      prompts: ["यह अक्षर कौन-सी ध्वनि बताता है?", "इस ध्वनि से शुरू होने वाला शब्द कौन बताएगा?", "क्या आप इस पंक्ति में यह अक्षर ढूँढ सकते हैं?"],
      dialogue: [
        "शिक्षक: यह अक्षर /क/ बोलता है। मेरे साथ बोलिए।",
        "बच्चे: /क/।",
        "शिक्षक: /क/ से शुरू होने वाला शब्द कौन बताएगा?",
        "बच्चा क (काल्पनिक): कमल!",
      ],
    },
    status: "approved",
  },
  {
    id: "N-09",
    title: "Counting with concrete objects",
    domain: "Foundational numeracy",
    grade_min: 1, grade_max: 2, subject: "Mathematics", teaching_language: "any",
    description:
      "Learners count, group and compare real objects (stones, seeds, sticks) before using written numbers. Handling objects helps them connect a number name to a quantity.",
    steps: [
      "Give each group a handful of objects (for example 20 seeds).",
      "Ask learners to count them one by one, touching each object.",
      "Ask them to make groups of ten and count the leftovers.",
      "Ask: “Which group has more? How do you know?” and then write the number.",
    ],
    example_prompts: ["Count the seeds and touch each one.", "Can you make a group of ten?", "Which group has more? How do you know?"],
    next_step: "In the next maths lesson, let each group count a handful of real objects, make groups of ten and say which group has more before writing the numbers.",
    variation: null,
    example_dialogue: [
      "Teacher: Count your seeds. Touch each one as you say the number.",
      "Learner A (fictional): Sixteen!",
      "Teacher: Can you make a group of ten? What is left?",
      "Learner A (fictional): Ten and six more.",
    ],
    tlm: ["Seeds, stones or sticks for each group"],
    tags: ["NM-01", "counting", "count", "objects", "concrete", "material", "seeds", "sticks", "numbers", "गिनती", "वस्तुएँ"],
    hi: {
      title: "वास्तविक वस्तुओं से गिनती",
      summary: "बच्चे लिखी हुई संख्याओं से पहले असली वस्तुओं (कंकड़, बीज, तीलियाँ) को गिनते, समूह बनाते और तुलना करते हैं। वस्तुओं को छूकर गिनने से संख्या का नाम मात्रा से जुड़ता है।",
      next_step: "अगली गणित कक्षा में हर समूह को मुट्ठी भर असली वस्तुएँ गिनने दें, दस-दस के समूह बनवाएँ और संख्या लिखने से पहले बताने को कहें कि किस समूह में ज़्यादा हैं।",
      steps: [
        "हर समूह को मुट्ठी भर वस्तुएँ (जैसे 20 बीज) दें।",
        "बच्चे हर वस्तु को छूकर एक-एक करके गिनें।",
        "दस-दस के समूह बनवाएँ और बचे हुए गिनवाएँ।",
        "पूछें: “किस समूह में ज़्यादा हैं? आपको कैसे पता?” फिर संख्या लिखवाएँ।",
      ],
      prompts: ["हर बीज को छूकर गिनिए।", "क्या आप दस का समूह बना सकते हैं?", "किस समूह में ज़्यादा हैं? आपको कैसे पता?"],
      dialogue: [
        "शिक्षक: अपने बीज गिनिए। संख्या बोलते हुए हर बीज को छूइए।",
        "बच्चा क (काल्पनिक): सोलह!",
        "शिक्षक: क्या आप दस का समूह बना सकते हैं? कितने बचे?",
        "बच्चा क (काल्पनिक): दस और छह।",
      ],
    },
    status: "approved",
  },
  {
    id: "N-12",
    title: "Number talk: “How did you get that?”",
    domain: "Foundational numeracy",
    grade_min: 2, grade_max: 4, subject: "Mathematics", teaching_language: "any",
    description:
      "After a learner gives an answer, the teacher asks how they found it and invites other methods. Hearing different strategies helps learners understand why methods work, not only copy steps.",
    steps: [
      "Write one short problem on the board (for example 18 + 7).",
      "Give learners a moment to solve it silently.",
      "Ask two or three learners: “How did you get your answer?” Write each method.",
      "Ask: “Did anyone do it differently?” and compare the methods together.",
    ],
    example_prompts: ["How did you get your answer?", "Did anyone do it a different way?", "Which way was quickest for this problem?"],
    next_step: "On two or three problems in each maths lesson this week, ask “How did you get that?” and let a second learner share a different method.",
    variation: "Grade 2: use small numbers and let learners show their method with objects. Grade 4: include a problem with two steps.",
    example_dialogue: [
      "Teacher: What is 18 plus 7? Think quietly first.",
      "Learner A (fictional): Twenty-five.",
      "Teacher: How did you get that?",
      "Learner A (fictional): I took 2 from the 7 to make 20, then added 5.",
      "Teacher: Did anyone do it a different way?",
    ],
    tlm: ["Chalkboard"],
    tags: ["NM-02", "explain", "method", "strategy", "how", "thinking", "answer", "addition", "समझाना", "तरीका", "गणित"],
    hi: {
      title: "संख्या-चर्चा: “आपने यह कैसे निकाला?”",
      summary: "जब कोई बच्चा उत्तर बताए तो शिक्षक पूछते हैं कि उसने कैसे निकाला और दूसरे तरीके भी माँगते हैं। अलग-अलग तरीके सुनकर बच्चे समझते हैं कि विधि क्यों काम करती है, सिर्फ़ चरण नक़ल नहीं करते।",
      next_step: "इस सप्ताह हर गणित कक्षा में दो-तीन प्रश्नों पर पूछें “आपने यह कैसे निकाला?” और किसी दूसरे बच्चे से अलग तरीका बताने को कहें।",
      steps: [
        "श्यामपट्ट पर एक छोटा प्रश्न लिखें (जैसे 18 + 7)।",
        "बच्चों को चुपचाप हल करने का समय दें।",
        "दो-तीन बच्चों से पूछें: “आपने कैसे निकाला?” हर तरीका लिखें।",
        "पूछें: “क्या किसी ने अलग तरीके से किया?” और तरीकों की तुलना करें।",
      ],
      prompts: ["आपने उत्तर कैसे निकाला?", "क्या किसी ने अलग तरीके से किया?", "इस प्रश्न के लिए कौन-सा तरीका सबसे तेज़ रहा?"],
      dialogue: [
        "शिक्षक: 18 और 7 कितने हुए? पहले चुपचाप सोचिए।",
        "बच्चा क (काल्पनिक): पच्चीस।",
        "शिक्षक: आपने यह कैसे निकाला?",
        "बच्चा क (काल्पनिक): मैंने 7 में से 2 लेकर 20 बनाया, फिर 5 जोड़ा।",
        "शिक्षक: क्या किसी ने अलग तरीके से किया?",
      ],
    },
    status: "approved",
  },
  {
    id: "N-15",
    title: "Place value with bundles of sticks",
    domain: "Foundational numeracy",
    grade_min: 2, grade_max: 3, subject: "Mathematics", teaching_language: "any",
    description:
      "Learners tie sticks into bundles of ten and keep single sticks as ones, then build two-digit numbers. Seeing tens and ones as real bundles and singles makes place value meaningful before it is written as digits.",
    steps: [
      "Give each group 30–40 sticks and some string.",
      "Ask them to tie bundles of ten and keep the leftover single sticks.",
      "Call a number such as 27: groups show 2 bundles and 7 singles.",
      "Write 27 and show that 2 stands for the bundles (tens) and 7 for the singles (ones).",
    ],
    example_prompts: ["Show 27 with bundles and single sticks.", "How many tens? How many ones?", "What happens if we add one more stick?"],
    next_step: "In the next place-value lesson, let groups build two-digit numbers with bundles of ten and single sticks before writing the digits.",
    variation: null,
    example_dialogue: [
      "Teacher: Show me 27 with your sticks.",
      "Learner A (fictional): Two bundles and seven single sticks.",
      "Teacher: How many tens and how many ones?",
      "Learner A (fictional): Two tens and seven ones.",
    ],
    tlm: ["Sticks or straws", "String or rubber bands"],
    tags: ["NM-03", "place", "value", "tens", "ones", "bundle", "bundles", "sticks", "digit", "two-digit", "स्थानीय", "मान", "दहाई", "इकाई"],
    hi: {
      title: "तीलियों के बंडल से स्थानीय मान",
      summary: "बच्चे तीलियों के दस-दस के बंडल बनाते हैं और बची तीलियाँ इकाई के रूप में रखते हैं, फिर दो अंकों की संख्याएँ बनाते हैं। अंक लिखने से पहले दहाई और इकाई को बंडल और खुली तीलियों के रूप में देखने से स्थानीय मान समझ में आता है।",
      next_step: "अगली स्थानीय-मान कक्षा में अंक लिखने से पहले समूहों को दस के बंडल और खुली तीलियों से दो अंकों की संख्याएँ बनाने दें।",
      steps: [
        "हर समूह को 30–40 तीलियाँ और धागा दें।",
        "दस-दस के बंडल बनवाएँ और बची तीलियाँ अलग रखवाएँ।",
        "27 जैसी संख्या बोलें: समूह 2 बंडल और 7 खुली तीलियाँ दिखाएँ।",
        "27 लिखें और बताएँ कि 2 बंडल (दहाई) और 7 खुली तीलियाँ (इकाई) हैं।",
      ],
      prompts: ["27 को बंडल और खुली तीलियों से दिखाइए।", "कितनी दहाई? कितनी इकाई?", "एक तीली और जोड़ें तो क्या होगा?"],
      dialogue: [
        "शिक्षक: अपनी तीलियों से 27 दिखाइए।",
        "बच्चा क (काल्पनिक): दो बंडल और सात खुली तीलियाँ।",
        "शिक्षक: कितनी दहाई और कितनी इकाई?",
        "बच्चा क (काल्पनिक): दो दहाई और सात इकाई।",
      ],
    },
    status: "approved",
  },
  {
    id: "I-02",
    title: "Wait time: the three-second pause",
    domain: "Classroom interaction",
    grade_min: 1, grade_max: 5, subject: "Any", teaching_language: "any",
    description:
      "After asking a question, the teacher waits about three seconds in silence before choosing someone to answer. The pause gives more learners time to think, so more of them take part and answers tend to be fuller.",
    steps: [
      "Ask a question to the whole class.",
      "Wait silently for about three seconds (count in your head). Do not call on anyone yet.",
      "Choose a learner who has not spoken, or ask learners to whisper an answer to a partner first.",
      "Thank the answer and, if useful, ask “What makes you say that?”",
    ],
    example_prompts: ["Take a moment to think before you answer.", "Tell your partner your answer in a whisper.", "What makes you say that?"],
    next_step: "This week, after each question, count silently to three before choosing a learner, and choose someone who has not answered yet.",
    variation: null,
    example_dialogue: [
      "Teacher: What would happen if it did not rain for a month? Think for a moment.",
      "(Teacher waits about three seconds.)",
      "Teacher: Meena, what do you think?",
      "Learner (fictional): The plants would dry up.",
    ],
    tlm: [],
    tags: ["CI-01", "wait", "time", "pause", "participation", "same", "learners", "volunteer", "hands", "questions", "प्रतीक्षा", "भागीदारी"],
    hi: {
      title: "प्रतीक्षा-समय: तीन सेकंड का विराम",
      summary: "प्रश्न पूछने के बाद शिक्षक उत्तर के लिए किसी को चुनने से पहले लगभग तीन सेकंड चुप रहते हैं। इस विराम से ज़्यादा बच्चों को सोचने का समय मिलता है, इसलिए ज़्यादा बच्चे भाग लेते हैं।",
      next_step: "इस सप्ताह हर प्रश्न के बाद किसी बच्चे को चुनने से पहले मन में तीन तक गिनें, और ऐसे बच्चे को चुनें जिसने अभी उत्तर नहीं दिया है।",
      steps: [
        "पूरी कक्षा से एक प्रश्न पूछें।",
        "लगभग तीन सेकंड चुप रहें (मन में गिनें)। अभी किसी को न बुलाएँ।",
        "ऐसे बच्चे को चुनें जिसने अभी नहीं बोला, या पहले साथी से धीरे-से उत्तर बाँटने को कहें।",
        "उत्तर के लिए धन्यवाद दें और ज़रूरत हो तो पूछें “आपको ऐसा क्यों लगा?”",
      ],
      prompts: ["उत्तर देने से पहले एक पल सोचिए।", "अपने साथी को धीरे-से अपना उत्तर बताइए।", "आपको ऐसा क्यों लगा?"],
      dialogue: [
        "शिक्षक: अगर एक महीने बारिश न हो तो क्या होगा? एक पल सोचिए।",
        "(शिक्षक लगभग तीन सेकंड प्रतीक्षा करते हैं।)",
        "शिक्षक: मीना, आपको क्या लगता है?",
        "बच्चा (काल्पनिक): पौधे सूख जाएँगे।",
      ],
    },
    status: "approved",
  },
  {
    id: "I-06",
    title: "Think–pair–share",
    domain: "Classroom interaction",
    grade_min: 1, grade_max: 5, subject: "Any", teaching_language: "any",
    description:
      "Learners first think alone, then talk to a partner, then share with the class. Every learner gets to say their idea to someone, including those who rarely speak in front of the whole class.",
    steps: [
      "Ask one open question and give a moment of silent thinking time.",
      "Ask learners to turn to a partner and share their idea for one minute.",
      "Invite two or three pairs to share what they discussed.",
    ],
    example_prompts: ["Think quietly for a moment.", "Tell your partner what you think.", "Who would like to share what your partner said?"],
    next_step: "Once in each lesson this week, use think–pair–share: a moment to think, one minute with a partner, then two or three pairs share.",
    variation: null,
    example_dialogue: [
      "Teacher: Why do we wash our hands before eating? Think quietly.",
      "Teacher: Now tell your partner your idea.",
      "Teacher: Who would like to share what your partner said?",
    ],
    tlm: [],
    tags: ["CI-03", "pair", "group", "discuss", "talk", "partner", "peer", "share", "जोड़ी", "चर्चा"],
    hi: {
      title: "सोचें–जोड़ी में बताएँ–कक्षा में बाँटें",
      summary: "बच्चे पहले अकेले सोचते हैं, फिर साथी से बात करते हैं, फिर कक्षा में बाँटते हैं। हर बच्चे को अपना विचार किसी को बताने का मौका मिलता है, उन्हें भी जो पूरी कक्षा के सामने कम बोलते हैं।",
      next_step: "इस सप्ताह हर पाठ में एक बार “सोचें–जोड़ी में बताएँ–बाँटें” करें: सोचने का एक पल, साथी के साथ एक मिनट, फिर दो-तीन जोड़ियाँ बताएँ।",
      steps: [
        "एक खुला प्रश्न पूछें और चुपचाप सोचने का समय दें।",
        "बच्चों से साथी की ओर मुड़कर एक मिनट अपना विचार बताने को कहें।",
        "दो-तीन जोड़ियों से उनकी चर्चा बताने को कहें।",
      ],
      prompts: ["एक पल चुपचाप सोचिए।", "अपने साथी को बताइए आप क्या सोचते हैं।", "आपके साथी ने क्या कहा, कौन बताएगा?"],
      dialogue: [
        "शिक्षक: खाने से पहले हम हाथ क्यों धोते हैं? चुपचाप सोचिए।",
        "शिक्षक: अब अपने साथी को अपना विचार बताइए।",
        "शिक्षक: आपके साथी ने क्या कहा, कौन बताएगा?",
      ],
    },
    status: "approved",
  },
  {
    id: "A-04",
    title: "Exit slate: three-question quick check",
    domain: "Assessment for learning",
    grade_min: 1, grade_max: 5, subject: "Any", teaching_language: "any",
    description:
      "At the end of a lesson, learners answer three short questions on slates and hold them up. A quick look shows the teacher which idea needs another try tomorrow, without any marking or scoring of individual learners.",
    steps: [
      "Prepare three short questions on the lesson's main idea.",
      "Learners write each answer on a slate and hold it up together.",
      "Scan the room and note the idea many learners found difficult.",
      "Use that note to plan a short revisit at the start of the next lesson.",
    ],
    example_prompts: ["Write your answer on the slate and hold it up.", "Which question did most learners find difficult?"],
    next_step: "At the end of two lessons this week, ask three quick questions on slates, note which idea was hardest, and revisit it at the start of the next lesson.",
    variation: null,
    example_dialogue: [
      "Teacher: Question one. Write your answer on your slate, then hold it up when I say.",
      "Teacher: I see many slates with the same mistake here. We will look at this again tomorrow.",
    ],
    tlm: ["Slates and chalk"],
    tags: ["AL-01", "check", "understanding", "exit", "slate", "quick", "assessment", "revision", "checked", "आकलन", "स्लेट"],
    hi: {
      title: "निकास-स्लेट: तीन प्रश्नों की त्वरित जाँच",
      summary: "पाठ के अंत में बच्चे तीन छोटे प्रश्नों के उत्तर स्लेट पर लिखकर ऊपर उठाते हैं। एक नज़र में शिक्षक देख लेते हैं कि कल किस विचार को दोबारा करना है, बिना किसी बच्चे को अंक दिए।",
      next_step: "इस सप्ताह दो पाठों के अंत में स्लेट पर तीन त्वरित प्रश्न पूछें, देखें कि कौन-सा विचार सबसे कठिन रहा, और अगले पाठ की शुरुआत में उसे दोहराएँ।",
      steps: [
        "पाठ के मुख्य विचार पर तीन छोटे प्रश्न तैयार करें।",
        "बच्चे हर उत्तर स्लेट पर लिखें और एक साथ ऊपर उठाएँ।",
        "कक्षा पर नज़र डालें और वह विचार नोट करें जो कई बच्चों को कठिन लगा।",
        "उस नोट से अगले पाठ की शुरुआत में छोटा पुनरावलोकन योजना बनाएँ।",
      ],
      prompts: ["स्लेट पर उत्तर लिखिए और ऊपर उठाइए।", "कौन-सा प्रश्न ज़्यादातर बच्चों को कठिन लगा?"],
      dialogue: [
        "शिक्षक: पहला प्रश्न। स्लेट पर उत्तर लिखिए, और मेरे कहने पर ऊपर उठाइए।",
        "शिक्षक: यहाँ कई स्लेटों पर एक ही गलती दिख रही है। कल हम इसे फिर देखेंगे।",
      ],
    },
    status: "approved",
  },
  {
    id: "T-08",
    title: "Story cards from waste material",
    domain: "Teaching-learning material",
    grade_min: 1, grade_max: 3, subject: "Hindi", teaching_language: "any",
    description: "Teachers and learners make simple story cards from cartons and old calendars to retell and sequence stories.",
    steps: ["Cut cartons into card-sized pieces.", "Draw or paste one story scene on each card.", "Use the cards to put the story in order."],
    example_prompts: ["Which card comes first?"],
    next_step: "Make a set of five story cards with learners and use them to sequence a story this week.",
    variation: null,
    example_dialogue: [],
    tlm: ["Cartons", "Old calendars", "Glue"],
    tags: ["story", "cards", "material", "sequence"],
    hi: {
      title: "बेकार सामग्री से कहानी-कार्ड",
      summary: "डिब्बों और पुराने कैलेंडर से सरल कहानी-कार्ड बनाकर कहानी का क्रम समझाना।",
      next_step: "बच्चों के साथ पाँच कहानी-कार्ड बनाएँ और इस सप्ताह कहानी का क्रम लगाने में उनका उपयोग करें।",
      steps: ["डिब्बों को कार्ड के आकार में काटें।", "हर कार्ड पर कहानी का एक दृश्य बनाएँ या चिपकाएँ।", "कार्डों से कहानी को क्रम में लगाएँ।"],
      prompts: ["कौन-सा कार्ड पहले आएगा?"],
      dialogue: [],
    },
    status: "draft",
    review_notes: "Drafted by curator; awaiting review of the steps and materials.",
  },
  {
    id: "I-09",
    title: "Question basket",
    domain: "Classroom interaction",
    grade_min: 1, grade_max: 5, subject: "Any", teaching_language: "any",
    description: "Learners put questions they have into a basket and the teacher answers some each day.",
    steps: ["Place a basket in the room.", "Learners drop questions into it.", "Answer two questions each day."],
    example_prompts: ["Who has a question for the basket?"],
    next_step: "Place a question basket in the classroom and answer two learner questions each day this week.",
    variation: null,
    example_dialogue: [],
    tlm: ["A basket", "Paper slips"],
    tags: ["questions", "basket", "curiosity"],
    hi: {
      title: "प्रश्न-टोकरी",
      summary: "बच्चे अपने प्रश्न टोकरी में डालते हैं और शिक्षक रोज़ कुछ प्रश्नों के उत्तर देते हैं।",
      next_step: "कक्षा में प्रश्न-टोकरी रखें और इस सप्ताह रोज़ दो प्रश्नों के उत्तर दें।",
      steps: ["कक्षा में एक टोकरी रखें।", "बच्चे प्रश्न लिखकर उसमें डालें।", "रोज़ दो प्रश्नों के उत्तर दें।"],
      prompts: ["टोकरी के लिए किसके पास प्रश्न है?"],
      dialogue: [],
    },
    status: "rejected",
    review_notes: "Rejected: steps are too general and do not say how the teacher chooses or answers questions. Revise with a clear routine.",
  },
];

export interface SeedRubricTag {
  code: string; domain: string; label: string; description: string; keywords: string[];
}

export const SEED_RUBRIC: SeedRubricTag[] = [
  { code: "RC-01", domain: "Reading comprehension", label: "Questions about meaning after reading", description: "Learners are asked why / what next / how a character felt after a story or passage.", keywords: ["understood", "understand", "comprehension", "meaning", "why question", "what next", "read aloud", "read-aloud", "story", "समझ", "अर्थ", "कहानी"] },
  { code: "RC-02", domain: "Reading comprehension", label: "Prediction and retelling", description: "Learners predict from pictures or retell a story in their own words.", keywords: ["retell", "retelling", "predict", "prediction", "guess", "picture", "sequence", "अनुमान", "चित्र"] },
  { code: "RC-03", domain: "Reading comprehension", label: "Vocabulary in context", description: "New words are explored through the story context.", keywords: ["new word", "vocabulary", "word meaning", "शब्द का अर्थ"] },
  { code: "DC-01", domain: "Early reading fluency", label: "Letter–sound routines", description: "Letters are linked to sounds and words.", keywords: ["letter", "sound", "phonics", "blend", "matra", "मात्रा", "वर्ण", "अक्षर"] },
  { code: "DC-02", domain: "Early reading fluency", label: "Paired and fluent reading practice", description: "Learners get regular reading practice in pairs or groups.", keywords: ["pair", "partner", "fluent", "fluency", "aloud", "turn", "जोड़ी"] },
  { code: "NM-01", domain: "Foundational numeracy", label: "Concrete materials for number sense", description: "Real objects are used to count and compare.", keywords: ["counting", "count", "objects", "concrete", "beads", "sticks", "seeds", "गिनती"] },
  { code: "NM-02", domain: "Foundational numeracy", label: "Learners explain their thinking", description: "Learners are asked how they found an answer.", keywords: ["explain", "how did you", "strategy", "mental", "method", "how they found", "तरीका"] },
  { code: "NM-03", domain: "Foundational numeracy", label: "Place value understanding", description: "Tens and ones are shown with materials before digits.", keywords: ["place value", "tens", "ones", "bundle", "two-digit", "digit", "दहाई", "इकाई"] },
  { code: "CI-01", domain: "Classroom interaction", label: "Wait time and wide participation", description: "Learners get time to think; many learners take part.", keywords: ["wait time", "pause", "same learners", "few learners", "same three", "participation", "volunteer", "raised a hand", "भागीदारी"] },
  { code: "CI-02", domain: "Classroom interaction", label: "Variety of questions", description: "Mix of recall and open questions.", keywords: ["recall", "closed question", "yes or no", "one-word", "open question"] },
  { code: "CI-03", domain: "Classroom interaction", label: "Peer talk", description: "Learners discuss with partners or groups.", keywords: ["discuss", "talk to", "peer", "group work", "चर्चा"] },
  { code: "AL-01", domain: "Assessment for learning", label: "Quick checks for understanding", description: "The teacher checks understanding during or at the end of the lesson.", keywords: ["check understanding", "exit", "slate", "quick check", "revision", "checked whether"] },
];
