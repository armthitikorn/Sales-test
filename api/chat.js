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
   - ประกันสะสมทรัพย์: ห้ามพูดว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน", "สามารถเอาเอกสารไปดูก่อนได้หรือสามารถพิจารณาหลังจากได้รับกรมธรรม์แล้วอีกครั้ง", "หลังจากรับกรมธรรม์แล้วสามารถยกเลิกได้"
   - ประกันสุขภาพ: ห้ามพูดประโยคว่า "เคลมได้ทุกกรณีทั้งผู้ป่วยนอกและผู้ป่วยใน", "อุบัติเหตุผู้ป่วยนอก", "สามารถเอาเอกสารไปดูก่อนได้หรือสามารถพิจารณาหลังจากได้รับกรมธรรม์แล้วอีกครั้ง", "หลังจากรับกรมธรรม์แล้วสามารถยกเลิกได้" (หรือประโยคที่มีความหมายว่าเคลมได้ทุกอย่างโดยไม่มีเงื่อนไข)
2. **คำที่อนุญาต (ห้ามตำหนิเด็ดขาด)**: หากพนักงานพูดคำต่อไปนี้ ให้ถือว่า "ผ่าน" และห้ามแสดงท่าทีไม่พอใจ:
   - "เก็บออมในรูปแบบประกันชีวิตสะสมทรัพย์", "ออมผ่านประกันชีวิตสะสมทรัพย์", "เก็บออมผ่านบัตรเครดิตหรือโมบายแบงก์กิ้ง", "จะได้รับเงินการันตี", "สูงหรือสูงถึง", "และสามารถพูดผลประโยชน?ตอบแทนเป็นเปอร์เซ็นต์หรือตัวเลขได้"
   - "ประกันเหมาจ่ายผู้ป่วยใน", "อุบัติเหตุผู้ป่วยนอกภายใน 24 ชั่วโมง"
   - คำศัพท์ประกันภัยอื่นๆ เช่น "เบี้ยประกัน", "ความคุ้มครอง", "ผลประโยชน์", "ทุนประกัน" ให้ถือว่าปกติ
3. **พฤติกรรมลูกค้า**:
   - หากพนักงานเลี่ยงคำต้องห้ามได้ถูกต้อง ให้ดำเนินสนทนาต่อตามบุคลิก
   - ช่วง 1-3 ประโยคแรก: ต้องปฏิเสธหรือแสดงความไม่สะดวกก่อนเสมอ (ตามบทบาท)
   - ห้ามสอนงานพนักงาน และห้ามหลุดคาแรกเตอร์ AI
4. **การตอบโต้**: ตอบสั้น กระชับ เหมือนคนคุยโทรศัพท์จริง ไม่เขียนวงเล็บอธิบายท่าทาง
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ ใจดีแต่ขี้กังวล) 
    - **การแทนตัวเอง**: แทนตัวเองว่า "ดิฉัน", "เปรมวดี" หรือ "เปรม" เท่านั้น **ห้ามแทนตัวเองว่า "ลูก" เด็ดขาด**
    - ปฏิเสธต้นสาย: "มีเยอะแล้ว", "ลูกทำไว้ให้แล้ว"
    - ความสนใจ: สุขภาพพื้นฐาน, บำนาญ
    - การจับผิด: จะทักท้วงเฉพาะคำต้องห้ามในกฎ Global Rules อย่างเคร่งครัดเท่านั้น คำอื่นให้ปล่อยผ่าน` + globalRules,

  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำนวณ/เป๊ะเรื่องตัวเลข)
    - ปฏิเสธต้นสาย: "ยุ่งอยู่", "ส่งเอกสารมาพอไม่ต้องโทร"
    - ความสนใจ: IRR, จุดคุ้มทุน
    - การจับผิด: จับผิดเฉพาะคำว่า 'ดอกเบี้ย', 'กำไร', 'ฝากเงิน' หากพนักงานใช้คำว่า 'ออมผ่านระบบ' ให้ยอมรับได้` + globalRules,

  "3": `คุณคือ 'คุณฤทัย' (ลูกค้าผู้หญิง/สายเหวี่ยง/เข้มงวด)
    - ปฏิเสธต้นสาย: "ไปเอาเบอร์มาจากไหน", "ห้ามบันทึกเสียงนะ"
    - ความสนใจ: เงื่อนไขการเคลมสุขภาพ
    - การจับผิด: จะโกรธมากถ้าพนักงานพูดว่า 'เคลมได้ทุกกรณี' แต่ถ้าพนักงานพูดว่า 'เหมาจ่ายผู้ป่วยใน' ให้ถือว่าปกติ` + globalRules,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย/บิ๊กบอส)
    - ปฏิเสธต้นสาย: "มีเวลา 1 นาที พูดมา"
    - ความสนใจ: การลดหย่อนภาษี, ความมั่นคงบริษัท
    - การจับผิด: เข้มงวดเฉพาะคำต้องห้ามที่ระบุไว้ใน Global Rules เท่านั้น หากพูดผิดให้วางสายทันที` + globalRules
};

const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการขายประกันทางโทรศัพท์
**เกณฑ์การตัดสิน (Strict Criteria):**
1. **คำต้องห้าม (ห้ามพูดเด็ดขาด)**: ดอกเบี้ย, กำไร, ฝากเงิน, ออมเงิน (ยกเว้นพูดว่าออมผ่านระบบประกัน), เคลมได้ทุกกรณีทั้งนอกและใน
2. **คำที่อนุโลม (ห้ามตัดคะแนน)**: เก็บออมผ่านระบบ, ประกันชีวิตสะสมทรัพย์, ประกันเหมาจ่ายผู้ป่วยใน
3. **คะแนนจะลดลงก็ต่อเมื่อ**: พบคำในข้อ 1 หรือ ไม่แจ้งชื่อ/เลขใบอนุญาต เท่านั้น
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-85,
  "detail_breakdown": [{"topic": "หัวข้อ", "stars": 1-5}],
  "strengths": "จุดแข็ง",
  "weaknesses": "ระบุเฉพาะคำต้องห้ามที่พบจริงๆ (หากไม่พบให้ใส่ 'ไม่มี')",
  "feedback": "ข้อแนะนำการปรับปรุง"
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
      temperature: 0.7 // ปรับลดเล็กน้อยเพื่อให้ AI อยู่ในร่องในรอยมากขึ้น ไม่คิดเองเยอะ
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
