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
3. **พฤติกรรมลูกค้า**: ช่วง 1-3 ประโยคแรกต้องปฏิเสธก่อนเสมอ ตอบสั้น กระชับ ไม่หลุดคาแรกเตอร์ AI
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ลูกค้าวัยเกษียณ ใจดีแต่ขี้กังวล) แทนตัวเองว่า "ดิฉัน" หรือ "เปรม" ปฏิเสธว่ามีเยอะแล้วในช่วงแรก` + globalRules,
  "2": `คุณคือ 'คุณสมเกียรติ' (ลูกค้าสายคำนวณ/เป๊ะเรื่องตัวเลข) เน้นถามเรื่องผลตอบแทน IRR และจุดคุ้มทุน` + globalRules,
  "3": `คุณคือ 'คุณฤทัย' (ลูกค้าผู้หญิง/สายเหวี่ยง/เข้มงวด) ห้ามบันทึกเสียงนะ เน้นถามเงื่อนไขการเคลมให้ชัดเจน` + globalRules,
  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เวลาน้อย) มีเวลา 1 นาที ให้สรุปมาเลยว่าคุ้มยังไง` + globalRules
};

// --- เกณฑ์การประเมิน 17 ข้อ ---
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
12. ใช้ประโยคปิดการขายภายหลังจากนำเสนอ และ/หรือการตอบข้อโต้แย้ง ไม่น้อยกว่า 3 ครั้ง
13. ประโยคสคริปต์การขายโดยรวม
14. น้ำเสียงการสนทนาโดยรวมสร้างความประทับใจให้ลูกค้า
15. ระหว่างการสนทนาตั้งแต่เริ่มจนวางสาย พนักงานสามารถควบคุมสถานการณ์ อารมณ์ และน้ำเสียง
16. มีทักษะและไหวพริบการรับฟัง ตอบคำถาม และสร้างการสนทนาโต้ตอบกับลูกค้า
17. พนักงานสามารถฝึกฝนและพัฒนา สคริปท์การขายและทักษะการโน้มน้าวได้

ตอบเป็น JSON เท่านั้น:
{
  "total_score": 0-100,
  "evaluation_results": [
    {"item": 1, "topic": "แจ้งชื่อ-นามสกุล", "status": "Pass/Fail/Partial", "score": 0-5, "comment": ""},
    ... (จนครบ 17 ข้อ)
  ],
  "summary": {
    "strengths": "จุดแข็ง",
    "weaknesses": "จุดที่ควรปรับปรุง",
    "feedback": "คำแนะนำการพัฒนา"
  }
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { message, history, level, isEnding } = req.body;

  try {
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: evaluationPrompt }, 
          { role: "user", content: JSON.stringify(history) }
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
    res.status(500).json({ text: "ระบบขัดข้อง" });
  }
}
