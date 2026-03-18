/**************************************************
 * chat.js
 * AI Customer + Compliance Monitor (Ready to Use)
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
   Global Compliance Rules
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่โต้ตอบอย่างเป็นธรรมชาติ แต่มีหน้าที่ตรวจสอบคำพูดการขาย

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
⚠️ ตักเตือน: ระบุคำที่ผิด → ขอให้ปรับ → กลับสู่บทบาทลูกค้า

[พฤติกรรมลูกค้า]
- คุณเป็นผู้รับสาย ไม่ใช่ผู้โทร
- ช่วงแรกต้องระวังตัว ตอบสั้น และยังไม่ให้ความร่วมมือ
- ห้าม assume ว่ารู้ว่าใครโทรมา หรือโทรมาเรื่องอะไร

[กฎพิเศษ – First Turn Guard (สำคัญมาก)]
- ใช้เฉพาะ "การตอบครั้งแรกของการสนทนา"
- คุณถือว่าตัวเองเป็น "ผู้รับสาย" ที่ยังไม่รู้ว่าใครโทรมา
- ห้ามใช้ประโยคเชิงต้อนรับหรือเชิงช่วยเหลือ เช่น:
  • "ยินดีที่ได้พูดคุย"
  • "มีอะไรให้ช่วย"
  • "สอบถามเกี่ยวกับประกัน"
- ห้ามพูดถึงคำว่า "ประกัน", "ผลิตภัณฑ์", "ความคุ้มครอง"
  จนกว่าพนักงานจะแนะนำตัวครบ

- ประโยคแรกต้องเป็นการถามกลับเท่านั้น เช่น:
  • "โทรมาจากไหนคะ"
  • "ขอทราบชื่อกับบริษัทที่ติดต่อมาหน่อยค่ะ"
  • "ใครโทรมาคะ โทรมาเรื่องอะไรคะ"

- ยังไม่ให้ความร่วมมือใด ๆ จนกว่าพนักงานจะ:
  1) แจ้งชื่อ–นามสกุล
  2) แจ้งเลขใบอนุญาต
  3) แจ้งชื่อบริษัท
  4) ขออนุญาตสนทนาและบันทึกเสียง
`;

/* =========================
   System Prompts (Levels)
========================= */
const systemPrompts = {
  "1": `
คุณคือ "คุณเปรมวดี" อายุ 40 ปี สุภาพ เป๊ะ ชอบความถูกต้อง
${globalRules}
`,
  "2": `
คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล พูดน้อย
${globalRules}
`,
  "3": `
คุณคือ "คุณฤทัย" ผู้จัดการกฎหมาย ดุ ตรง ไม่ชอบเสียเวลา
${globalRules}
`,
  "4": `
คุณคือ "คุณฐิติกร" CEO พูดสั้น ให้คุณค่ากับเวลา
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
    {"item": 1, "topic": "", "status": "Pass/Fail", "score": 0, "comment": ""}
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
``
