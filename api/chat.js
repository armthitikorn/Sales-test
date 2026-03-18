/**************************************************
 * chat.js
 * AI Customer + Compliance Monitor (FAST VERSION)
 **************************************************/

const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

/* =========================
   Azure OpenAI Client
========================= */
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: "2024-05-01-preview"
});

/* =========================
   Azure Speech Config
========================= */
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

/* =========================
   Utilities
========================= */
const cleanTextForSpeech = (text) =>
  text.replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .trim();

const getVoiceName = (level) => {
  const voices = {
    "1": "th-TH-PremwadeeNeural",
    "2": "th-TH-NiwatNeural",
    "3": "th-TH-AcharaNeural",
    "4": "th-TH-NiwatNeural"
  };
  return voices[String(level)] || voices["1"];
};

/* =========================
   Global Rules
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่รับสายโทรศัพท์ และยังไม่รู้ว่าใครโทรมา
คุณต้องโต้ตอบอย่างเป็นธรรมชาติ แต่มีหน้าที่ตรวจสอบคำพูดการขาย

[กฎเหล็ก – ต้องตักเตือนทันที]
คำต้องห้าม:
- ดอกเบี้ย, กำไร, ฝากเงิน, ออมเงิน
- เคลมได้ทุกกรณี, ผู้ป่วยนอกได้ทุกกรณี

[Performance Constraint]
- ตอบสั้นที่สุดเท่าที่ถูกต้อง
- ห้ามอธิบายยาว
`;

/* =========================
   System Prompts
========================= */
const systemPrompts = {
  "1": `
คุณคือ "คุณเปรมวดี" สุภาพ รอบคอบ
- ใช้คำลงท้าย "ค่ะ"
${globalRules}
`,
  "2": `
คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล
- ใช้คำลงท้าย "ครับ"
${globalRules}
`,
  "3": `
คุณคือ "คุณฤทัย" ดุ ตรง
- ไม่จำเป็นต้องใช้คำลงท้าย
${globalRules}
`,
  "4": `
คุณคือ "คุณฐิติกร" CEO
- ห้ามใช้ ค่ะ / ครับ
- พูดสั้น ตรง
ตัวอย่าง: "โทรจากบริษัทอะไร"
${globalRules}
`
};

/* =========================
   Evaluation Prompt
========================= */
const evaluationPrompt = `
คุณคือ QA ตรวจสอบการขายประกันทางโทรศัพท์
ตอบเป็น JSON เท่านั้น
`;

/* =========================
   API Handler
========================= */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { message, history, level, isEnding } = req.body;

  try {
    /* ===== End Call ===== */
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: evaluationPrompt },
          { role: "user", content: JSON.stringify(history || []) }
        ],
        response_format: { type: "json_object" }
      });

      return res.json({
        evaluation: JSON.parse(response.choices[0].message.content)
      });
    }

    /* ===== FAST PATCH ===== */
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-4)
      : [];

    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompts[String(level)] },
        ...trimmedHistory,
        { role: "user", content: message }
      ],
      max_tokens: 80,
      temperature: 0.3
    });

    const aiText = completion.choices[0].message.content;

    /* ===== Send text immediately ===== */
    res.json({ text: aiText });

    /* ===== TTS (non-blocking) ===== */
    setTimeout(() => {
      try {
        const textToSpeak = cleanTextForSpeech(aiText);
        const voiceName = getVoiceName(level);

        const ssml = `
<speak version="1.0" xml:lang="th-TH">
  <voice name="${voiceName}">
    <prosody rate="-15%">${textToSpeak}</prosody>
  </voice>
</speak>`;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        synthesizer.speakSsmlAsync(
          ssml,
          () => synthesizer.close(),
          () => synthesizer.close()
        );
      } catch (_) {}
    }, 0);

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      text: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง"
    });
  }
};
``
