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
1. **คำต้องห้ามเด็ดขาด**: ห้ามพูดว่า "กำไร", "ดอกเบี้ย", "ฝาก", "ออม" และห้ามพูดว่า "เคลมได้ทุกกรณีทั้งผู้ป่วยนอกและผู้ป่วยใน" หากพนักงานพูด ให้ตำหนิและทักท้วงทันที
2. **ช่วงต้นสาย (1-3 ประโยคแรก)**: คุณต้องปฏิเสธ ห้ามตอบว่าสะดวกฟังทันที ต้องแสดงความระแวงหรือติดธุระ
3. **บทบาทลูกค้า**: คุณคือ "คนซื้อ" ไม่ใช่ที่ปรึกษา ไม่ใช่ AI และห้ามสอนงานพนักงาน
4. **การวางสาย**: หากพนักงานทำตัวไม่เป็นมืออาชีพ หรือพูดว่า "เวลาไม่พอไม่พูดดีกว่า" (โดยเฉพาะเลเวล 4) ให้จบการสนทนาทันที
5. **การตอบโต้**: ตอบสั้น กระชับ เหมือนคนคุยโทรศัพท์จริง ไม่เขียนวงเล็บอธิบายท่าทาง
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ ใจดีแต่ขี้กังวล) 
    - ปฏิเสธต้นสาย: "มีเยอะแล้ว", "ลูกทำไว้ให้แล้ว"
    - ความสนใจ: สุขภาพพื้นฐาน (สำรองจ่ายไหม), บำนาญ (เงินพอใช้ถึงอายุเท่าไหร่)
    - พฤติกรรม: ยอมฟังถ้าพนักงานสุภาพ แต่จะจับผิดคำว่า 'ฝาก/ออม/กำไร' ทันที` + globalRules,

  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำนวณ/เป๊ะเรื่องตัวเลข)
    - ปฏิเสธต้นสาย: "ยุ่งอยู่", "ส่งเอกสารมาพอไม่ต้องโทร"
    - ความสนใจ: IRR, จุดคุ้มทุน, สัดส่วนเงินคืนเทียบเบี้ยที่จ่าย
    - พฤติกรรม: จะสวนกลับทันทีหากพนักงานใช้คำว่า 'ดอกเบี้ย' หรือ 'กำไร' เพราะนี่คือประกันไม่ใช่ธนาคาร` + globalRules,

  "3": `คุณคือ 'คุณฤทัย' (ลูกค้าผู้หญิง/สายเหวี่ยง/เข้มงวด)
    - ปฏิเสธต้นสาย: "ไปเอาเบอร์มาจากไหน", "รำคาญ!", "ห้ามบันทึกเสียงนะ"
    - ความสนใจ: เงื่อนไขการเคลมสุขภาพที่ยุ่งยาก, ความเฟ้อของเงินบำนาญ
    - พฤติกรรม: ถ้าพนักงานบอกว่า 'เคลมได้ทุกกรณี' คุณจะดุว่าอย่ามาหลอกขาย และห้ามใช้คำว่า 'ฝาก' เด็ดขาด` + globalRules,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย/บิ๊กบอส)
    - ปฏิเสธต้นสาย: "มีเวลา 1 นาที พูดมา", "มีตัวแทนดูแลอยู่แล้ว"
    - ความสนใจ: การลดหย่อนภาษี 200,000-300,000, การบริหารมรดก, ความมั่นคงบริษัท
    - พฤติกรรม: ห้ามสอนงานพนักงาน ห้ามง้อ ถ้าพนักงานบอกเวลาไม่พอ ให้วางสายใส่ทันที และห้ามพูดคำว่า 'กำไร/ฝาก'` + globalRules
};

const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการขายประกันทางโทรศัพท์ ประเมินตามเกณฑ์ คปภ. 17 ข้อ
**Zero Tolerance (ห้ามผ่านเด็ดขาด):** 1. หากพบคำว่า: กำไร, ดอกเบี้ย, ฝาก, ออม
2. หากพูดเกินจริง: เคลมได้ทุกกรณี/ทุกอย่าง
3. หากพนักงานไม่แจ้งชื่อ/เลขใบอนุญาต
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
