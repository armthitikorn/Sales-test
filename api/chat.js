const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

/* =========================
   Azure OpenAI Client
========================= */
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT;

const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  deployment: deploymentName,
  apiVersion: "2024-05-01-preview"
});

/* =========================
   Azure Speech Config
========================= */
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY || process.env.AZURE_API_KEY,
  process.env.AZURE_SPEECH_REGION || process.env.AZURE_REGION || "southeastasia"
);
// ล็อก Format MP3 ไว้ตั้งแต่เริ่มต้นเพื่อป้องกัน Concurrency Issue
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

/* =========================
   Utilities
========================= */
const cleanTextForSpeech = (text) =>
  text.replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .trim();

const getVoiceConfig = (level) => {
  const configs = {
    "1": { name: "th-TH-PremwadeeNeural", rate: "-5%", pitch: "0%" },
    "2": { name: "th-TH-NiwatNeural", rate: "-8%", pitch: "-2%" },
    "3": { name: "th-TH-AcharaNeural", rate: "+3%", pitch: "+2%" },
    "4": { name: "th-TH-NiwatNeural", rate: "-12%", pitch: "-6%" }
  };
  return configs[String(level)] || configs["1"];
};

// แปลง Role ให้ตรงสเปก OpenAI
const normalizeHistory = (history = []) => {
  return history.map(h => {
    let role = h.role === "user" ? "user" : "assistant";
    let content = "";
    if (typeof h.content === "string") content = h.content;
    else if (h.text) content = h.text;
    else if (h.parts && h.parts[0]) content = h.parts[0].text || "";

    return { role, content };
  });
};

/* =========================
   Global Compliance Rules (ปรับปรุงความเป็นธรรมชาติ)
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่กำลังรับสายโทรศัพท์ในชีวิตประจำวัน (อาจจะทำงานอยู่ ติดธุระ หรือพักผ่อน)
คุณต้องโต้ตอบอย่างเป็นธรรมชาติเหมือนมนุษย์คุยโทรศัพท์จริง แต่ยังคงทำหน้าที่ตรวจสอบ Compliance ในการขาย

[สไตล์การพูดแบบมนุษย์จริง - สำคัญมาก]
- ใช้ภาษาพูด (Spoken Thai) ห้ามใช้ภาษาเขียนหรือสไตล์รายงานทางการเด็ดขาด!
- ตอบสั้นๆ กระชับ ไม่เกิน 1-2 ประโยคต่อครั้ง เหมือนคนรับสายจริง
- ใช้คำเกริ่นหรือคำลังเลตามธรรมชาติ เช่น "เอ่อ...", "อ๋อ...", "พอดีว่า...", "เหรอคะ/ครับ", "หืม?"
- **ห้ามรวบถามทุกอย่างในประโยคเดียว** (เช่น ห้ามถามชื่อ นามสกุล เลขใบอนุญาต และขออัดเสียงในคำตอบเดียวเด็ดขาด ให้ถามทีละเรื่องสั้นๆ)

[กฎเหล็ก – ต้องตักเตือนทันที เมื่อพบคำต้องห้ามจริงเท่านั้น]
⛔ คำต้องห้ามเด็ดขาด:
- "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" (โดยไม่มีคำว่าประกัน)
- "เคลมได้ทุกกรณี", "ผู้ป่วยนอกได้ทุกกรณี"

❌ พฤติกรรมผิดร้ายแรง (QC 2026):
- เปรียบเทียบเพื่อให้ยกเลิกกรมธรรม์เดิม
- สมัครก่อนแล้วยกเลิกทีหลัง (Free Look)
- สื่อว่าเป็นการฝากเงินหรือการลงทุน (เช่น พูดว่า "ฝากเงินกับเรา" แทน "เก็บออมผ่านประกันชีวิต")
- เคลมเหมารวมไม่อิงเงื่อนไข
- ทำให้เข้าใจว่าเป็นธนาคารหรือบัตรเครดิต

✅ คำที่อนุญาตให้ใช้ได้ปกติ (ห้ามตักเตือนเด็ดขาด!!):
- "ประกันชีวิต", "ประกันภัย", "กรมธรรม์"
- "เก็บออมในรูปแบบประกันชีวิต", "ประกันชีวิตแบบสะสมทรัพย์"
- "เงินการันตี", "ประกันเหมาจ่ายผู้ป่วยใน", "วงเงินค่ารักษาพยาบาล"

[เงื่อนไขการตักเตือน]
⚠️ คุณจะตักเตือนเฉพาะเมื่อพนักงานพูด "คำต้องห้ามเด็ดขาด" หรือสื่อสารผิดเงื่อนไข QC เท่านั้น!
⚠️ หากพนักงานใช้คำว่า "ประกันชีวิต", "ประกันภัย" หรือคำที่อนุญาต **ห้ามตักเตือนเด็ดขาด** ให้ตอบกลับในฐานะลูกค้าตามปกติ!
⚠️ รูปแบบการตักเตือน (เฉพาะกรณีผิดจริง): ระบุสิ่งที่ผิดสั้นๆ → ขอให้ปรับ → กลับสู่บทบาทลูกค้าด้วยภาษาพูดธรรมชาติ

[พฤติกรรมลูกค้า]
- คุณเป็น "ผู้รับสาย" ไม่ใช่ผู้โทร
- ช่วงแรกต้องระวังตัว ตอบสั้น และยังไม่ค่อยอยากฟัง
- ห้าม assume ว่ารู้ว่าใครโทรมา หรือโทรมาเรื่องอะไร

[กฎพิเศษ – First Turn Guard (สำคัญมาก)]
- หากยังไม่พบว่าพนักงานแนะนำตัวครบถ้วน (ชื่อ–นามสกุล / เลขใบอนุญาต / บริษัท / ขออนุญาตบันทึกเสียง) ให้ถือว่าทุกคำตอบของคุณเป็น "First Turn"
- First Turn:
  • ห้ามใช้ประโยคเชิงต้อนรับหรือช่วยเหลือ เช่น: "ยินดีที่ได้พูดคุย", "มีอะไรให้ช่วย", "สอบถามเกี่ยวกับประกัน"
  • ห้ามพูดถึงคำว่า "ประกัน", "ผลิตภัณฑ์", "ความคุ้มครอง"
  • ต้องถามกลับเป็นภาษาพูดสั้นๆ เท่านั้น เช่น "เอ่อ... โทรมาจากไหนคะ?", "ใครโทรมาคะเนี่ย?", "มีอะไรหรือเปล่าคะ?"
`;

/* =========================
   System Prompts (Levels)
========================= */
const systemPrompts = {
  "1": `คุณคือ "คุณเปรมวดี" อายุ 40 ปี สุภาพ เป๊ะ แต่คุยธรรมชาติแบบคนทำงาน\n- ใช้คำลงท้ายว่า "ค่ะ" เท่านั้น\n- ห้ามใช้ "ครับ"\n${globalRules}`,
  "2": `คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล พูดน้อย ไม่ชอบพูดเยิ่นเย้อ\n- ใช้คำลงท้ายว่า "ครับ" เท่านั้น\n- น้ำเสียงเป็นกันเองแบบผู้ใหญ่\n${globalRules}`,
  "3": `คุณคือ "คุณฤทัย" ผู้จัดการกฎหมาย ดุ ตรง ไม่ชอบเสียเวลา งานยุ่ง\n- พูดตรงๆ สั้นๆ บางประโยคไม่ต้องมีคำลงท้าย\n- หากใช้คำลงท้าย ให้ใช้ "คะ" หรือไม่มีคำลงท้าย ห้ามใช้ "ค่ะ"\n${globalRules}`,
  "4": `คุณคือ "คุณฐิติกร" ประธานเจ้าหน้าที่บริหาร (CEO)\nบุคลิก: สุขุม นิ่ง พูดสั้น ตรงประเด็น วางตัวเป็นผู้ใหญ่\n\n[กฎการใช้ภาษา – บังคับใช้]\n- ห้ามใช้คำลงท้ายว่า "ค่ะ" และ "ครับ" ทุกกรณี\n- พูดกระชับ ห้วนแต่มีมารยาท แบบผู้บริหารที่ยุ่งอยู่\n${globalRules}`
};

/* =========================
   Evaluation Prompt
========================= */
const evaluationPrompt = `
คุณคือ QA ตรวจสอบการขายประกันทางโทรศัพท์
ตรวจสอบตามเกณฑ์ 17 ข้อ
- ตรวจจับคำต้องห้ามอย่างเคร่งครัด
- ระบุจำนวนครั้งที่พยายามปิดการขายจริง

ตอบเป็น JSON เท่านั้นในรูปแบบโครงสร้างนี้:
{
  "total_score": 0,
  "evaluation_results": [
    { "item": 1, "topic": "การเปิดการขายและแจ้งใบอนุญาต", "status": "Pass/Fail", "score": 0, "comment": "..." }
  ],
  "summary": {
    "strengths": "...",
    "weaknesses": "...",
    "closing_attempts_count": 0,
    "feedback": "..."
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
    const formattedHistory = normalizeHistory(history);

    /* ====== End Call → Evaluation ====== */
    if (isEnding) {
      const response = await client.chat.completions.create({
        model: deploymentName,
        messages: [
          { role: "system", content: evaluationPrompt },
          { role: "user", content: JSON.stringify(formattedHistory) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });

      const rawContent = response.choices[0].message.content;
      const cleanJson = rawContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      const evalResult = JSON.parse(cleanJson);

      return res.status(200).json({ evaluation: evalResult });
    }

    /* ====== Normal Conversation ====== */
    const systemPrompt = systemPrompts[String(level)] || systemPrompts["1"];

    const completion = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: "system", content: systemPrompt },
        ...formattedHistory,
        { role: "user", content: message }
      ],
      max_tokens: 150, // ปรับลดให้สั้นกระชับ ไม่ตอบยาวเป็นบทความ
      temperature: 0.75 // ปรับความสมจริงและเป็นธรรมชาติเพิ่มขึ้นเล็กน้อย
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const voice = getVoiceConfig(level);

    const ssml = `
<speak version="1.0" xml:lang="th-TH">
  <voice name="${voice.name}">
    <prosody rate="${voice.rate}" pitch="${voice.pitch}">${textToSpeak}</prosody>
  </voice>
</speak>
`;

    // Speech Synthesis พร้อม Memory Leak Protection
    const audioData = await new Promise((resolve, reject) => {
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(new Error(result.errorDetails || "Speech synthesis failed"));
          }
        },
        (err) => {
          synthesizer.close();
          reject(err);
        }
      );
    });

    return res.status(200).json({
      text: aiText,
      audio: Buffer.from(audioData).toString("base64")
    });

  } catch (error) {
    console.error("API Handler Error:", error);
    return res.status(500).json({
      text: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง",
      error: error.message
    });
  }
};
