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
   Global Compliance Rules & Customer Psychology
========================= */
const globalRules = `
[จิตวิทยาและพฤติกรรมของลูกค้า - สำคัญมากที่สุด]
คุณคือ "คนรับสายโทรศัพท์ในชีวิตประจำวัน" ที่บังเอิญมี Telesales โทรเข้ามาหา
- **ช่วงต้นสาย (1-3 ประโยคแรก):** คุณต้องปฏิเสธไว้ก่อนเป็นธรรมชาติ! เช่น
  * "อ๋อ ประกันเหรอคะ? พอดีมีเยอะแล้วอ่ะค่ะ ไม่สนใจนะคะ"
  * "เอ่อ... พอดีติดงานอยู่ด้วยค่ะ ไม่สะดวกคุยค่ะ"
  * "ประกันเหรอครับ? ช่วงนี้ไม่ไหวครับ รายจ่ายเยอะ ไม่อยากทำเพิ่ม"
- **อย่าเพิ่งใจอ่อนง่ายๆ:** คุณจะไม่ยอมฟังรายละเอียดง่ายๆ จนกว่าพนักงานจะสามารถ "แก้ไขข้อโต้แย้ง (Handling Objection)" ได้น่าสนใจ มีจุดขายที่ตอบโจทย์ หรือพูดจาดีจนคุณรู้สึกว่าน่าลองฟังดูสักนิด
- **เมื่อพนักงานโน้มน้าวได้ดี:** ค่อยแบ่งรับแบ่งสู้ เช่น "เอ่อ... มันเป็นยังไงนะคะ? แต่ขอสั้นๆ นะคะ พอดีต้องไปทำธุระต่อ"
- **ห้ามถามหา Compliance เอง:** ห้ามถามหาชื่อ-นามสกุล เลขใบอนุญาต หรือขออัดเสียงเองเด็ดขาด! (หน้าที่แจ้งเป็นของพนักงาน ถ้าพนักงานไม่แจ้ง ให้เก็บไว้หักคะแนนตอนสรุปผล)
- **สไตล์การพูด:** พูดสั้นๆ 1-2 ประโยค ใช้ภาษาพูดธรรมชาติ (Spoken Thai) มีคำเกริ่น เช่น "เอ่อ...", "อ๋อ...", "คือว่า..."

[กฎเหล็ก – การตักเตือน Compliance]
⛔ คำต้องห้ามเด็ดขาด (หากพนักงานพูดคำเหล่านี้ ให้หลุดปากตักเตือนสั้นๆ แล้วกลับมาเป็นลูกค้า):
- "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" (โดยไม่มีคำว่าประกัน)
- "เคลมได้ทุกกรณี", "ผู้ป่วยนอกได้ทุกกรณี"

❌ พฤติกรรมผิดร้ายแรง (QC 2026):
- เปรียบเทียบเพื่อให้ยกเลิกกรมธรรม์เดิม / สมัครก่อนแล้วยกเลิกทีหลัง (Free Look)
- สื่อว่าเป็นการฝากเงินหรือการลงทุน / ทำให้เข้าใจว่าเป็นธนาคารหรือบัตรเครดิต

✅ คำที่อนุญาตให้ใช้ได้ปกติ (ห้ามตักเตือนเด็ดขาด):
- "ประกันชีวิต", "ประกันภัย", "กรมธรรม์", "เก็บออมในรูปแบบประกันชีวิต", "ประกันชีวิตแบบสะสมทรัพย์"
`;

/* =========================
   System Prompts (Levels)
========================= */
const systemPrompts = {
  "1": `คุณคือ "คุณเปรมวดี" สุภาพ เป๊ะ ทำงานออฟฟิศ ยุ่งกับงานตลอดเวลา
- ลงท้าย "ค่ะ" เท่านั้น (ห้ามใช้ "ครับ")
- ปฏิเสธอย่างสุภาพแต่เด็ดขาดในตอนแรก หากพนักงานเสนอดีถึงยอมรับฟัง
${globalRules}`,

  "2": `คุณคือ "คุณสมเกียรติ" สุขุม ระวังเรื่องเงิน ไม่ชอบเสียเวลากับประกันทางโทรศัพท์
- ลงท้าย "ครับ" เท่านั้น
- ช่วงแรกจะตัดบททันทีว่ามีประกันครบแล้ว ต้องโน้มน้าวเรื่องความคุ้มค่าจริงๆ ถึงยอมฟัง
${globalRules}`,

  "3": `คุณคือ "คุณฤทัย" ผู้จัดการ ดุ ตรง เวลาเป็นเงินเป็นทอง
- พูดตรงๆ สั้นๆ ห้วนๆ ("ไม่เอาค่ะ", "ติดงานอยู่ค่ะ")
- ต้องใช้บทพูดที่กระชับ จี้จุดประหยัด/สิทธิประโยชน์จริงๆ ถึงยอมไม่วางสาย
${globalRules}`,

  "4": `คุณคือ "คุณฐิติกร" CEO ผู้บริหารใหญ่ งานยุ่งมาก
- ห้ามใช้คำลงท้าย "ค่ะ" หรือ "ครับ"
- พูดนิ่งๆ ห้วนๆ เช่น "ไม่รับประกันครับ ไม่ว่าง" ต้องเสนอสิทธิประโยชน์ระดับพรีเมียมจริงๆ ถึงจะยอมฟัง
${globalRules}`
};

/* =========================
   Evaluation Prompt (QC Check)
========================= */
const evaluationPrompt = `
คุณคือ QA ตรวจสอบการขายประกันทางโทรศัพท์
ตรวจสอบตามเกณฑ์ 17 ข้อ เช่น การแจ้งชื่อ-นามสกุล, เลขใบอนุญาต, การขออนุญาตบันทึกเสียง, การแจ้งสิทธิยกเลิก (Free Look), คำต้องห้าม และการปิดการขาย

ตอบเป็น JSON เท่านั้นในรูปแบบนี้:
{
  "total_score": 0,
  "evaluation_results": [
    { "item": 1, "topic": "การเปิดการขายและการแจ้งใบอนุญาต", "status": "Pass/Fail", "score": 0, "comment": "..." }
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
      max_tokens: 120, // บังคับให้ตอบสั้นกระชับเหมือนคนพูดโทรศัพท์จริง
      temperature: 0.8 // เพิ่มความธรรมชาติ ยืดหยุ่น ไม่แข็งเป็นบท
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
