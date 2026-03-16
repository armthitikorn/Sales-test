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

// --- บัญชีคำต้องห้ามและกฎเหล็กส่วนกลาง ---
const globalRules = `
[กฎเหล็กด้านการตรวจสอบคำพูด - Strictly Enforcement]
1. **จับผิดเฉพาะคำที่ระบุเท่านั้น**: ห้ามพูดว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" (หากเป็นประกันสะสมทรัพย์) และ "เคลมได้ทุกกรณี" (หากเป็นประกันสุขภาพ)
2. **คำที่อนุญาต**: "เก็บออมในรูปแบบประกันชีวิต", "ประกันเหมาจ่าย", "เงินการันตี"
3. **พฤติกรรมลูกค้า**: ช่วงแรกต้องปฏิเสธก่อนเสมอ ตอบสั้น กระชับ ไม่หลุดคาแรกเตอร์
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ ใจดีแต่ขี้กังวล) แทนตัวเองว่า "ดิฉัน" หรือ "เปรม" ปฏิเสธว่ามีเยอะแล้วในช่วงแรก` + globalRules,
  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำวณ/เป๊ะเรื่องตัวเลข) เน้นถามเรื่องผลตอบแทน IRR และจุดคุ้มทุน` + globalRules,
  "3": `คุณคือ 'คุณฤทัย' (ลูกค้าผู้หญิง/สายเหวี่ยง/เข้มงวด) ห้ามบันทึกเสียงนะ เน้นถามเงื่อนไขการเคลมให้ชัดเจน` + globalRules,
  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย) มีเวลา 1 นาที ให้สรุปมาเลยว่าคุ้มยังไง` + globalRules
};

// --- เกณฑ์การประเมิน 17 ข้อ (Updated ตามบรีฟ) ---
const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการเสนอขายประกันทางโทรศัพท์ (Telesales) โดยวิเคราะห์บทสนทนาตามเกณฑ์ 17 ข้อ ดังนี้:

1. การเปิดตัวแจ้งชื่อ-นามสกุล พนักงานถูกต้องครบถ้วน
2. การเปิดตัวแจ้ง เลขที่ใบอนุญาต และรหัสพนักงาน ถูกต้องครบถ้วน
3. การเปิดตัวแจ้ง ชื่อบริษัทต้นสังกัด ถูกต้องครบถ้วน
4. การเปิดตัวแจ้ง ถามความสะดวกในการสนทนากับลูกค้า และขออนุญาตบันทึกเทป
5. บทเปิดตัวมีการเชื่อมโยงและโน้มน้าว เพื่อนำไปสู่บทการนำเสนอ
6. บทการนำเสนอผลิตภัณฑ์ อธิบายผลประโยชน์ เงื่อนไข และข้อยกเว้น
7. บทการนำเสนอแจ้งค่าเบี้ยประกันให้ลูกค้ารับทราบ
8. บทการนำเสนออธิบายเกี่ยวกับมูลค่ากรมธรรม์ การเวนคืนได้ถูกต้อง
9. บทการนำเสนออธิบายถึงการนำเบี้ยประกันไปลดหย่อนภาษี
10. ประโยคและวิธีการตอบคำถามและข้อโต้แย้งชัดเจน ตรงประเด็น และโน้มน้าวให้ตกลงซื้อ
11. อธิบายและชี้ช่องทางการสมัคร พร้อมวิธีการชำระเบี้ยประกันชีวิต
12. ใช้ประโยคปิดการขายภายหลังจากนำเสนอ และ/หรือการตอบข้อโต้แย้ง (ต้องไม่น้อยกว่า 3 ครั้ง)
13. ประโยคสคริปต์การขายโดยรวม (ความลื่นไหลและความถูกต้อง)
14. น้ำเสียงการสนทนาโดยรวมสร้างความประทับใจให้ลูกค้า
15. การควบคุมสถานการณ์ อารมณ์ และน้ำเสียง ตั้งแต่เริ่มจนวางสาย
16. มีทักษะและไหวพริบการรับฟัง ตอบคำถาม และสร้างการสนทนาโต้ตอบกับลูกค้า
17. ศักยภาพในการฝึกฝนและพัฒนาสคริปต์การขายและทักษะการโน้มน้าว

**ข้อกำหนดการประเมิน:**
- คะแนนเต็ม 100 คะแนน
- ตรวจสอบคำต้องห้าม (ดอกเบี้ย/กำไร/ฝากเงิน) อย่างเคร่งครัดในข้อ 6 และ 13
- ในข้อ 12 ให้ระบุจำนวนครั้งที่พยายามปิดการขายที่ตรวจพบจริง

ตอบเป็น JSON เท่านั้น:
{
  "total_score": 0-100,
  "evaluation_results": [
    {"item": 1, "topic": "แจ้งชื่อ-นามสกุล", "status": "Pass/Fail/Partial", "score": 0-5, "comment": ""},
    ... (จนครบ 17 ข้อ)
  ],
  "summary": {
    "strengths": "จุดเด่นที่ทำได้ดี",
    "weaknesses": "จุดที่ควรปรับปรุง",
    "closing_attempts_count": 0,
    "feedback": "คำแนะนำเพื่อการพัฒนา"
  }
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { message, history, level, isEnding } = req.body;

  try {
    if (isEnding) {
      const response = await client.chat.completions.create({
        // ใช้ Gemini 2.5 Flash ในการประเมินเพื่อความแม่นยำและรวดเร็ว
        messages: [
          { role: "system", content: evaluationPrompt },
          { role: "user", content: `วิเคราะห์ประวัติการสนทนานี้: ${JSON.stringify(history)}` }
        ],
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
      temperature: 0.7
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
    console.error("Error details:", error);
    res.status(500).json({ text: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง" });
  }
}
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
