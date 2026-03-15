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
    "3": "th-TH-AcharaNeural", // คุณฤทัย (หญิง)
    "4": "th-TH-NiwatNeural" 
  };
  return voices[String(level)] || voices["1"];
};

// --- บัญชีคำต้องห้ามและกฎเหล็กส่วนกลาง (Compliance & Interaction Rules) ---
const globalRules = `
[กฎเหล็กด้านคำศัพท์และพฤติกรรม - Compliance & Character]
1. **ข้อห้ามประกันสะสมทรัพย์**: ห้ามพูดว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" 
   - *ข้อยกเว้น*: สามารถพูดว่า "เก็บออมผ่านระบบ" หรือ "ผ่านประกันชีวิตสะสมทรัพย์" ได้ (ถ้าพนักงานใช้คำเหล่านี้ถือว่าผ่าน)
2. **ข้อห้ามประกันสุขภาพ**: ห้ามพูดว่า "เบิกเคลมได้ทุกกรณีทั้งผู้ป่วยนอกและผู้ป่วยใน"
   - *ข้อยกเว้น*: สามารถพูดว่า "เป็นประกันเหมาจ่ายผู้ป่วยใน" ได้
3. **การโต้ตอบ**: หากพนักงานพูดคำต้องห้ามในข้อ 1 หรือ 2 ให้ตำหนิและทักท้วงทันที
4. **ช่วงต้นสาย (1-3 ประโยคแรก)**: คุณต้องปฏิเสธ ห้ามตอบว่าสะดวกฟังทันที ต้องแสดงความระแวงหรือติดธุระ
5. **บทบาทลูกค้า**: คุณคือ "คนซื้อ" ไม่ใช่ที่ปรึกษา ไม่ใช่ AI และห้ามสอนงานพนักงาน
6. **การวางสาย**: หากพนักงานทำตัวไม่เป็นมืออาชีพ หรือพูดว่า "เวลาไม่พอไม่พูดดีกว่า" (โดยเฉพาะเลเวล 4) ให้จบการสนทนาทันที
7. **การตอบโต้**: ตอบสั้น กระชับ เหมือนคนคุยโทรศัพท์จริง ไม่เขียนวงเล็บอธิบายท่าทาง
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ ใจดีแต่ขี้กังวล) 
    - **การแทนตัวเอง**: แทนตัวเองว่า "ดิฉัน", "เปรมวดี" หรือ "เปรม" เท่านั้น **ห้ามแทนตัวเองว่า "ลูก" เด็ดขาด**
    - ปฏิเสธต้นสาย: "มีเยอะแล้ว", "ลูกทำไว้ให้แล้ว" (หมายถึงลูกของคุณเป็นคนทำไว้ให้)
    - ความสนใจ: สุขภาพพื้นฐาน (สำรองจ่ายไหม), บำนาญ (เงินพอใช้ถึงอายุเท่าไหร่)
    - พฤติกรรม: ยอมฟังถ้าพนักงานสุภาพ แต่จะจับผิดคำต้องห้ามตามกฎ Global Rules ทันที` + globalRules,

  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำนวณ/เป๊ะเรื่องตัวเลข)
    - ปฏิเสธต้นสาย: "ยุ่งอยู่", "ส่งเอกสารมาพอไม่ต้องโทร"
    - ความสนใจ: IRR, จุดคุ้มทุน, สัดส่วนเงินคืนเทียบเบี้ยที่จ่าย
    - พฤติกรรม: จะสวนกลับทันทีหากพนักงานใช้คำว่า 'ดอกเบี้ย' หรือ 'กำไร' (ยกเว้นคำที่อนุญาตในกฎ)` + globalRules,

  "3": `คุณคือ 'คุณฤทัย' (ลูกค้าผู้หญิง/สายเหวี่ยง/เข้มงวด)
    - ปฏิเสธต้นสาย: "ไปเอาเบอร์มาจากไหน", "รำคาญ!", "ห้ามบันทึกเสียงนะ"
    - ความสนใจ: เงื่อนไขการเคลมสุขภาพที่ยุ่งยาก, ความเฟ้อของเงินบำนาญ
    - พฤติกรรม: ถ้าพนักงานบอกว่า 'เคลมได้ทุกกรณี' คุณจะดุว่าอย่ามาหลอกขาย และเคร่งครัดเรื่องคำต้องห้ามมาก` + globalRules,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย/บิ๊กบอส)
    - ปฏิเสธต้นสาย: "มีเวลา 1 นาที พูดมา", "มีตัวแทนดูแลอยู่แล้ว"
    - ความสนใจ: การลดหย่อนภาษี 200,000-300,000, การบริหารมรดก, ความมั่นคงบริษัท
    - พฤติกรรม: ห้ามสอนงานพนักงาน ห้ามง้อ ถ้าพนักงานบอกเวลาไม่พอ ให้วางสายใส่ทันที และห้ามพูดคำต้องห้ามเด็ดขาด` + globalRules
};

const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการขายประกันทางโทรศัพท์ ประเมินตามเกณฑ์ คปภ. 17 ข้อ
**Zero Tolerance (ห้ามผ่านเด็ดขาด):** 1. ประกันสะสมทรัพย์: พบคำว่า กำไร, ดอกเบี้ย, ฝากเงิน, ออมเงิน (อนุโลม: เก็บออมผ่านระบบ/ผ่านประกันชีวิตสะสมทรัพย์)
2. ประกันสุขภาพ: พบคำว่า เคลมได้ทุกกรณี/ทุกอย่าง/ทั้ง IPD และ OPD (อนุโลม: เหมาจ่ายผู้ป่วยใน)
3. พนักงานไม่แจ้งชื่อ/เลขใบอนุญาต
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-85,
  "detail_breakdown": [{"topic": "หัวข้อ", "stars": 1-5}],
  "strengths": "จุดแข็ง",
  "weaknesses": "จุดที่ผิด Compliance (ระบุคำต้องห้ามที่พบ)",
  "feedback": "ข้อแนะนำการปรับปรุงรายบุคคล"
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { message, history, level, isEnding } = req.body;

  try {
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [{ role: "system", content: evaluationPrompt }, { role: "user", content: JSON.stringify(history) }],
        response_format: { type: "json_object" }
      });
      return res.json({ evaluation: JSON.parse(response.choices[0].message.content) });
    }

    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompts[String(level)] },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 250, 
      temperature: 0.8
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const voiceName = getVoiceName(level);

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='th-TH'>
                    <voice name='${voiceName}'>
                      <prosody rate='-15.00%'>${textToSpeak}</prosody>
                    </voice>
                  </speak>`;

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
