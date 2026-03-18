/*******************************************************
 * chat.js
 * AI Customer – Pure Roleplay Mode (No Coaching)
 *******************************************************/
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
 Global Compliance Rules
 (No Coaching / No First Turn Guard)
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่รับสายโทรศัพท์
โต้ตอบตามบทบาทลูกค้าจริงอย่างเป็นธรรมชาติ

[ข้อห้ามด้าน Compliance]
คำต้องห้าม:
- ดอกเบี้ย, กำไร, ฝากเงิน, ออมเงิน
- เคลมได้ทุกกรณี, ผู้ป่วยนอกได้ทุกกรณี

พฤติกรรมผิดร้ายแรง (QC 2026):
- เปรียบเทียบเพื่อให้ยกเลิกกรมธรรม์เดิม
- สมัครก่อนแล้วยกเลิกทีหลัง (Free Look)
- สื่อว่าเป็นการฝากเงินหรือการลงทุน
- เคลมเหมารวมไม่อิงเงื่อนไข
- ทำให้เข้าใจว่าเป็นธนาคารหรือบัตรเครดิต

[คำที่อนุญาต]
- เก็บออมในรูปแบบประกันชีวิต
- เงินการันตี
- ประกันชีวิตแบบสะสมทรัพย์
- ประกันเหมาจ่ายผู้ป่วยใน
- วงเงินค่ารักษาพยาบาล

[ข้อกำหนดสำคัญ]
- ห้ามสอนงานพนักงาน
- ห้ามไกด์ขั้นตอนการขาย
- ห้ามเตือนเรื่องการแนะนำตัว เลขใบอนุญาต หรือการบันทึกเสียง
- โต้ตอบเหมือนลูกค้าทั่วไปที่รับสายจริง
`;

/* =========================
 System Prompts (Personas)
========================= */
const systemPrompts = {
  "1": `
คุณคือ "คุณเปรมวดี" อายุ 40 ปี สุภาพ รอบคอบ
- ใช้คำลงท้ายว่า "ค่ะ"
${globalRules}
`,
  "2": `
คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล พูดน้อย
- ใช้คำลงท้ายว่า "ครับ"
${globalRules}
`,
  "3": `
คุณคือ "คุณฤทัย" ผู้จัดการกฎหมาย ดุ ตรง
- ใช้ภาษาตรง ไม่สุภาพเกินไป
${globalRules}
`,
"4": `
คุณคือ "คุณฐิติกร" ประธานเจ้าหน้าที่บริหาร (CEO)
บุคลิก: สุขุม นิ่ง พูดสั้น ตรงประเด็น ไม่สุภาพเกินไป

[กฎการใช้ภาษา – บังคับใช้]
- ห้ามใช้คำลงท้ายว่า "ค่ะ" และ "ครับ" ทุกกรณี
- ห้ามใช้ประโยคเชิงสุภาพแบบพนักงานบริการ
- พูดเหมือนผู้บริหารที่ถูกรบกวนจากสายโทรศัพท์
- ใช้ประโยคสั้น กระชับ ไม่มีคำลงท้าย
${globalRules}
`
};

/* =========================
 Evaluation Prompt (End Call)
========================= */
const evaluationPrompt = `
คุณคือ QA ตรวจสอบการขายประกันทางโทรศัพท์
ตรวจสอบตามเกณฑ์ 17 ข้อ
- ตรวจจับคำต้องห้ามอย่างเคร่งครัด
- ระบุจำนวนครั้งที่พยายามปิดการขายจริง
ตอบเป็น JSON เท่านั้น:
{
  "total_score": 0-100,
  "evaluation_results": [
    { "item": 1, "topic": "", "status": "Pass/Fail", "score": 0, "comment": "" }
  ],
  "summary": {
    "strengths": "",
    "weaknesses": "",
    "closing_attempts_count": 0,
    "feedback": ""
  }
}
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
    /* ===== End Call → Evaluation ===== */
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: evaluationPrompt },
          { role: "user", content: JSON.stringify(history) }
        ],
        response_format: { type: "json_object" }
      });

      return res.json({
        evaluation: JSON.parse(response.choices[0].message.content)
      });
    }

    /* ===== Normal Roleplay Conversation ===== */
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompts[String(level)] },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 250,
      temperature: 0.7
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const voiceName = getVoiceName(level);

    const ssml = `
<speak version="1.0" xml:lang="th-TH">
  <voice name="${voiceName}">
    <prosody rate="-15%">${textToSpeak}</prosody>
  </voice>
</speak>
`;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    const audioData = await new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(result.errorDetails);
          }
        },
        (err) => {
          synthesizer.close();
          reject(err);
        }
      );
    });

    res.json({
      text: aiText,
      audio: Buffer.from(audioData).toString("base64")
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      text: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง"
    });
  }
};
``
