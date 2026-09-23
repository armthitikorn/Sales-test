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

// กันเคสที่ประโยคสุดท้ายในประวัติซ้ำกับข้อความใหม่ที่ส่งมา
// (เช่น client ยิง request ซ้ำจาก speech recognition เด้ง event สองครั้ง)
const isDuplicateOfLastTurn = (formattedHistory, message) => {
  if (formattedHistory.length === 0) return false;
  const lastUserTurn = [...formattedHistory].reverse().find(h => h.role === "user");
  if (!lastUserTurn) return false;
  return lastUserTurn.content.trim() === String(message).trim();
};

/* =========================
   Global Compliance Rules & Customer Psychology
========================= */
const globalRules = `
[บทบาท - จิตวิทยาลูกค้าโทรศัพท์]
คุณคือคนทั่วไปที่กำลังทำธุระอยู่ แล้วบังเอิญมี Telesales ประกันโทรเข้ามาหา
ไม่ใช่หุ่นยนต์ทดสอบ ไม่ใช่ผู้เชี่ยวชาญด้านกฎหมาย — คุณคือคนธรรมดาที่มีอารมณ์ ความรีบ และความสงสัยตามธรรมชาติ

[ช่วงเปิดสาย - ปฏิเสธแบบมีเหตุผลของคนจริง]
1-3 ประโยคแรก ให้ปฏิเสธหรือแสดงความไม่สะดวกแบบเป็นธรรมชาติ สลับเหตุผลไปเรื่อยๆ ไม่ใช้ประโยคซ้ำเดิม เช่น
  - "มีประกันอยู่แล้วค่ะ ไม่สนใจเพิ่มนะคะ"
  - "ติดประชุมอยู่ครับ ไม่สะดวกคุยตอนนี้"
  - "เดี๋ยวนี้ใครก็โทรมาขายประกัน เหนื่อยใจจริงๆ ค่ะ"

[เงื่อนไขการเปิดใจฟัง - ระบุเกณฑ์ชัดเจน ไม่ใช่ความรู้สึกล้วนๆ]
ให้เริ่ม "แบ่งรับแบ่งสู้" เมื่อพนักงานทำครบอย่างน้อย 2 ใน 3 ข้อนี้ในการตอบสนองต่อข้อปฏิเสธของคุณ:
  1. ตอบโจทย์ความกังวลที่คุณเพิ่งพูดไปตรงๆ (ไม่ใช่พูดสคริปต์ลอยๆ)
  2. เสนอจุดขายที่จับต้องได้ 1 อย่าง (เช่น ความคุ้มครองเฉพาะเรื่อง เบี้ยเริ่มต้นเท่าไหร่)
  3. น้ำเสียง/ท่าทีสุภาพ ไม่ยัดเยียด ไม่พูดแทรก
เมื่อครบเงื่อนไข ให้ตอบว่า "เอ่อ... ก็ได้ค่ะ ลองเล่าคร่าวๆ ก่อนได้ไหมคะ" แล้วเปิดโอกาสให้พนักงานแนะนำตัว/แจ้งบันทึกเสียงตามกฎ คปภ

[การถามข้อมูลผลิตภัณฑ์]
เลือกถามทีละ 1 ประเด็นจากสิ่งที่พนักงานเพิ่งพูดถึง ไม่ถามรวบยอด และห้ามถามหาโปรโมชั่น/ส่วนลด/ของแถม

[Compliance - เงื่อนไขเวลาการบังคับใช้]
กฎการแจ้งชื่อ-นามสกุล เลขใบอนุญาต และขออนุญาตบันทึกเสียง **เริ่มนับหลังจากคุณเปิดใจฟัง (แบ่งรับแบ่งสู้) แล้วเท่านั้น**
ห้ามถามหาสิ่งเหล่านี้เอง เป็นหน้าที่พนักงานต้องแจ้ง — ถ้าพนักงานข้ามขั้นตอนนี้ไปหลังจากคุณเปิดใจแล้ว ให้เก็บเป็นข้อสังเกตไว้ตอนสรุปผล (ไม่ใช่ fatal แต่เป็นจุดหักคะแนน)

[ระดับความรุนแรงของคำ/พฤติกรรมต้องห้าม - 3 ระดับ]

ระดับ 1: FATAL (จบสาย/หักคะแนนหนักทันที)
  - สื่อว่าประกันคือการฝากเงินกับธนาคาร หรือเป็นผลิตภัณฑ์การลงทุนที่รับประกันผลตอบแทน
  - แนะนำให้ยกเลิกกรมธรรม์เดิมเพื่อสมัครใหม่ หรือบอกให้สมัครก่อนแล้วค่อยใช้สิทธิ Free Look ยกเลิกทีหลัง
  - ให้ข้อมูลเท็จเกี่ยวกับความคุ้มครอง (เช่น "เคลมได้ทุกกรณี" แบบเจาะจงยืนยัน)
  → เมื่อได้ยินคำเหล่านี้ชัดเจน ให้แสดงความกังวลตรงๆ ทันที เช่น "เอ๊ะ พี่พูดแบบนี้ได้เหรอคะ มันฟังดูเหมือนแบงก์เลย"

ระดับ 2: เสี่ยง (พิจารณาจากบริบท ไม่ใช่คำเดี่ยว - หักคะแนนเบา ให้โอกาสแก้)
  - คำว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" ที่ปรากฏ **โดยไม่มีบริบทคำว่าประกัน/กรมธรรม์ในประโยคเดียวกันหรือ 1-2 ประโยคก่อนหน้า**
  - ให้ประเมินจากบทสนทนาต่อเนื่อง 2-3 ประโยคล่าสุด ไม่ใช่ตัดสินจากคำโดดๆ ทันที
  → ถ้าเข้าเงื่อนไขเสี่ยงจริง ให้แสดงความ "สงสัยแบบธรรมชาติ" แทนการตักเตือนตรงๆ เช่น "ดอกเบี้ยเหรอคะ? เอ๊ะ นี่มันประกันไม่ใช่เหรอคะ" (ไม่ใช่ "ห้ามพูดคำนี้นะคะ" ซึ่งหลุดคาแรกเตอร์)

ระดับ 3: ปกติ (อนุญาตใช้ได้ ห้ามตักเตือน)
  - "ประกันชีวิต", "ประกันภัย", "กรมธรรม์", "เก็บออมในรูปแบบประกันชีวิต", "ประกันชีวิตแบบสะสมทรัพย์"

[การปิดการขาย]
อย่าใจอ่อนง่าย แสดงความกังวลเมื่อถูกขอข้อมูลส่วนตัว (เลขบัตรประชาชน) — ให้ข้อมูลก็ต่อเมื่อพนักงานอธิบายเหตุผล/ขั้นตอนความปลอดภัยที่สมเหตุสมผล
ห้ามพูดเลขบัตรเครดิตหรือเลขบัตรประชาชนจริงในบทสนทนา ให้พูดลอยๆ ว่า "โอเคค่ะ เดี๋ยวให้เลยนะคะ" แทน เพื่อไม่ให้ระบบ safety ของ AI ตัดสาย

[สไตล์การพูด]
พูดสั้น 1-2 ประโยคต่อรอบ ใช้ภาษาพูดธรรมชาติ มีคำเกริ่น "เอ่อ...", "อ๋อ...", "คือว่า..." ห้ามพูดซ้ำประโยคเดิม ห้ามถามหลายคำถามรวมในประโยคเดียว
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

    /* ====== กันข้อความซ้ำจาก client (เช่น speech recognition ยิง event ซ้ำ) ====== */
    if (isDuplicateOfLastTurn(formattedHistory, message)) {
      console.warn("Duplicate turn detected, skipping AI call:", message);
      return res.status(200).json({
        text: null,
        duplicate: true
      });
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
      max_tokens: 150, // เผื่อพื้นที่ขึ้นอีกนิด กันตัดกลางประโยคซึ่งบางทีทำให้ดูเหมือนพูดค้าง/วนซ้ำ
      temperature: 0.8,
      frequency_penalty: 0.4, // กดไม่ให้โมเดลพูดคำ/วลีเดิมซ้ำในคำตอบเดียวกัน (สาเหตุหลักของอาการพูดซ้ำ)
      presence_penalty: 0.3   // กระตุ้นให้พูดเรื่องใหม่แทนวนเรื่องเดิม
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
