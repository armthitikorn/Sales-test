const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: "2024-05-01-preview"
});

const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

const cleanTextForSpeech = (text) => text.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

const getVoiceName = (level) => {
  const voices = { 
    "1": "th-TH-PremwadeeNeural", 
    "2": "th-TH-NiwatNeural", 
    "3": "th-TH-AcharaNeural",
    "4": "th-TH-NiwatNeural" 
  };
  return voices[String(level)] || voices["1"];
};

// --- บัญชีคำต้องห้ามและกฎเหล็กส่วนกลาง (Compliance & Interaction Rules) ---
const globalRules = `
[กฎเหล็กด้านการตรวจสอบคำพูด - Strictly Enforcement]
1. **จับผิดเฉพาะคำที่ระบุเท่านั้น**: คุณจะตำหนิพนักงานก็ต่อเมื่อได้ยินคำเหล่านี้แบบตรงตัว (Literal) เท่านั้น:
   - ประกันสะสมทรัพย์: ห้ามพูดว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน", "สามารถเอาเอกสารไปดูก่อนได้", "สามารถพิจารณาหลังจากได้รับกรมธรรม์แล้วอีกครั้ง", "หลังจากรับกรมธรรม์แล้วสามารถยกเลิกได้"
   - ประกันสุขภาพ: ห้ามพูดประโยคว่า "เคลมได้ทุกกรณีทั้งผู้ป่วยนอกและผู้ป่วยใน", "อุบัติเหตุผู้ป่วยนอก", "สามารถเอาเอกสารไปดูก่อนได้", "หลังจากรับกรมธรรม์แล้วสามารถยกเลิกได้"
2. **คำที่อนุญาต (ห้ามตำหนิ)**: "เก็บออมในรูปแบบประกันชีวิตสะสมทรัพย์", "ออมผ่านประกันชีวิตสะสมทรัพย์", "เก็บออมผ่านบัตรเครดิตหรือโมบายแบงก์กิ้ง", "จะได้รับเงินการันตี", "ประกันเหมาจ่ายผู้ป่วยใน", "อุบัติเหตุผู้ป่วยนอกภายใน 24 ชั่วโมง"
3. **พฤติกรรมลูกค้า**:
   - คุณเปรมวดี (Level 1) ห้ามแทนตัวเองว่า "ลูก" ให้ใช้ "ดิฉัน" หรือ "เปรม" เท่านั้น
   - ช่วง 1-3 ประโยคแรก: ต้องปฏิเสธหรือแสดงความไม่สะดวกก่อนเสมอ
   - ห้ามสอนงานพนักงาน และห้ามหลุดคาแรกเตอร์ AI
4. **การตอบโต้**: ตอบสั้น กระชับ เหมือนคนคุยโทรศัพท์จริง ไม่เขียนวงเล็บอธิบายท่าทาง
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ) แทนตัวเองว่า "ดิฉัน", "เปรมวดี" หรือ "เปรม" เท่านั้น **ห้ามแทนตัวเองว่า "ลูก" เด็ดขาด**` + globalRules,
  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำนวณ)` + globalRules,
  "3": `คุณคือ 'คุณฤทัย' (สายเหวี่ยง/เข้มงวด)` + globalRules,
  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย)` + globalRules
};

// --- เกณฑ์การประเมิน 17 ข้อ ---
const evaluationPrompt = `จงสวมบทบาท QA ประเมินพนักงานขายประกันทางโทรศัพท์ตามเกณฑ์ 17 ข้อ ดังนี้:
1.แจ้งชื่อ-นามสกุล 2.แจ้งบริษัท 3.แจ้งเลขใบอนุญาต 4.แจ้งวัตถุประสงค์การโทร 5.แจ้งบันทึกเสียง(PDPA) 6.ถามความสะดวก 7.นำเสนอชื่อประกันถูกต้อง 8.ไม่พูดดอกเบี้ย/กำไร 9.ไม่พูดฝากเงิน 10.ไม่พูดออมเงิน(ยกเว้นออมผ่านระบบ) 11.ไม่พูดเคลมได้ทุกกรณี 12.แจ้งเงื่อนไข IPD ถูกต้อง 13.การรับมือข้อโต้แย้ง 14.การปิดการขาย 15.น้ำเสียงสุภาพ 16.การฟังเชิงรุก 17.สรุปประโยชน์ก่อนวางสาย

**กฎพิเศษ**: หากจบสนทนาใน 1-3 ประโยคโดยไม่พยายามโน้มน้าว คะแนนห้ามเกิน 40
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-100,
  "performance_level": "ต้องปรับปรุง/พอใช้/ดี/ดีมาก",
  "checklist_17": [
    {"id": 1, "task": "แจ้งชื่อ-นามสกุล", "status": "pass/fail"},
    {"id": 2, "task": "แจ้งบริษัท", "status": "pass/fail"},
    {"id": 3, "task": "เลขใบอนุญาต", "status": "pass/fail"},
    {"id": 4, "task": "วัตถุประสงค์", "status": "pass/fail"},
    {"id": 5, "task": "แจ้ง PDPA", "status": "pass/fail"},
    {"id": 6, "task": "ถามความสะดวก", "status": "pass/fail"},
    {"id": 7, "task": "ชื่อแบบประกัน", "status": "pass/fail"},
    {"id": 8, "task": "ไม่พูดดอกเบี้ย/กำไร", "status": "pass/fail"},
    {"id": 9, "task": "ไม่พูดฝากเงิน", "status": "pass/fail"},
    {"id": 10, "task": "ไม่พูดออมเงิน", "status": "pass/fail"},
    {"id": 11, "task": "ไม่พูดเคลมได้ทุกกรณี", "status": "pass/fail"},
    {"id": 12, "task": "ข้อมูล IPD", "status": "pass/fail"},
    {"id": 13, "task": "การรับมือข้อโต้แย้ง", "status": "pass/fail"},
    {"id": 14, "task": "การปิดการขาย", "status": "pass/fail"},
    {"id": 15, "task": "น้ำเสียงสุภาพ", "status": "pass/fail"},
    {"id": 16, "task": "การฟังเชิงรุก", "status": "pass/fail"},
    {"id": 17, "task": "สรุปก่อนวางสาย", "status": "pass/fail"}
  ],
  "strengths": "จุดเด่น",
  "weaknesses": "จุดที่ควรปรับปรุง",
  "feedback": "คำแนะนำ"
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { message, history, level, isEnding } = req.body;

  try {
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [{ role: "system", content: evaluationPrompt }, { role: "user", content: JSON.stringify(history) }],
        response_format: { type: "json_object" },
        temperature: 0.3
      });
      return res.json({ evaluation: JSON.parse(response.choices[0].message.content) });
    }

    const completion = await client.chat.completions.create({
      messages: [{ role: "system", content: systemPrompts[String(level)] }, ...history, { role: "user", content: message }],
      max_tokens: 250, 
      temperature: 0.7 
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='th-TH'><voice name='${getVoiceName(level)}'><prosody rate='-15.00%'>${textToSpeak}</prosody></voice></speak>`;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    const audioData = await new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(ssml, result => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
        else reject(result.errorDetails);
        synthesizer.close();
      }, err => { synthesizer.close(); reject(err); });
    });

    res.json({ text: aiText, audio: Buffer.from(audioData).toString('base64') });
  } catch (error) {
    res.status(500).json({ text: "ระบบขัดข้อง" });
  }
}
