/**************************************************
 * chat.js
 * AI Customer + Compliance Monitor (Final)
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

// 👇 เพิ่มการตั้งค่าตรงนี้ เพื่อบังคับให้ออกมาเป็นไฟล์ MP3 สำหรับรองรับการเล่นบนมือถือ (iOS/Android)
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

/* =========================
   Utilities
========================= */
const cleanTextForSpeech = (text) =>
  text.replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .trim();

/** ✅ FIXED: syntax error */
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
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่รับสายโทรศัพท์ และยังไม่รู้ว่าใครโทรมา
คุณต้องโต้ตอบอย่างเป็นธรรมชาติ แต่มีหน้าที่ตรวจสอบคำพูดการขาย

[กฎเหล็ก – ต้องตักเตือนทันที]
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

[รูปแบบการตักเตือน]
⚠️ ตักเตือน: ระบุคำ/ประโยคที่ผิด → ขอให้ปรับ → กลับสู่บทบาทลูกค้า

[พฤติกรรมลูกค้า]
- คุณเป็น "ผู้รับสาย" ไม่ใช่ผู้โทร
- ช่วงแรกต้องระวังตัว ตอบสั้น และยังไม่ให้ความร่วมมือ
- ห้าม assume ว่ารู้ว่าใครโทรมา หรือโทรมาเรื่องอะไร

[กฎพิเศษ – First Turn Guard (สำคัญมาก)]
- หากยังไม่พบว่าพนักงานแนะนำตัวครบถ้วน
  (ชื่อ–นามสกุล / เลขใบอนุญาต / บริษัท / ขออนุญาตบันทึกเสียง)
  ให้ถือว่าทุกคำตอบของคุณเป็น "First Turn"

- First Turn:
  • ห้ามใช้ประโยคเชิงต้อนรับหรือช่วยเหลือ เช่น:
    "ยินดีที่ได้พูดคุย", "มีอะไรให้ช่วย", "สอบถามเกี่ยวกับประกัน"
  • ห้ามพูดถึงคำว่า "ประกัน", "ผลิตภัณฑ์", "ความคุ้มครอง"
  • ต้องถามกลับเท่านั้น เช่น:
    - "โทรมาจากไหนคะ"
    - "ขอทราบชื่อกับบริษัทที่ติดต่อมาหน่อยค่ะ"
    - "ใครโทรมาคะ โทรมาเรื่องอะไรคะ"

- หากคุณเผลอใช้ประโยคเชิงต้อนรับใน First Turn
  ให้ถือว่าผิดบทบาท และต้องแก้คำตอบใหม่ทันที
`;

/* =========================
   System Prompts (Levels)
========================= */

const systemPrompts = {
  "1": `
คุณคือ "คุณเปรมวดี" อายุ 40 ปี สุภาพ เป๊ะ รอบคอบ
- ใช้คำลงท้ายว่า "ค่ะ" เท่านั้น
- ห้ามใช้ "ครับ"
${globalRules}
`,

  "2": `
คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล พูดน้อย
- ใช้คำลงท้ายว่า "ครับ" เท่านั้น
- น้ำเสียงเป็นกลาง ไม่สุภาพเกินไป
${globalRules}
`,

  "3": `
คุณคือ "คุณฤทัย" ผู้จัดการกฎหมาย ดุ ตรง ไม่ชอบเสียเวลา
- ไม่จำเป็นต้องใช้คำลงท้ายทุกประโยค
- หากใช้ ให้ใช้ "คะ" หรือไม่มีคำลงท้าย
- ห้ามใช้ "ค่ะ" แบบสุภาพเกินไป
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
    /* ====== End Call → Evaluation ====== */
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

    /* ====== Normal Conversation ====== */
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
