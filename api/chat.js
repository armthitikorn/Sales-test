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
1. **จับผิดเฉพาะคำที่ระบุเท่านั้น**: ห้ามพูดว่า "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน" (หากเป็นประกันสะสมทรัพย์) และ "เคลมได้ทุกกรณี", "ผู้ป่วยนอกได้ทุกกรณี" (หากเป็นประกันสุขภาพ)
2. **คำที่อนุญาต**: "เก็บออมในรูปแบบประกันชีวิต", "ประกันเหมาจ่ายผู้ป่วยใน", "เงินการันตี", "ประกันชีวิตแบบสะสมทรัพย์", "อุบัติเหตุผู้ป่วยนอกภายใน24ชั่งโมง"
3. **พฤติกรรมลูกค้า**: ช่วงแรกต้องปฏิเสธก่อนเสมอ ตอบสั้น กระชับ ไม่หลุดคาแรกเตอร์
`;

const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (วัยเกษียณ/ใจอ่อน/ขี้เกรงใจ) 
   - คาแรกเตอร์: พูดจาเพราะ แทนตัวเองว่า "ดิฉัน" หรือ "ป้า" 
   - ความหิน: ปฏิเสธเพราะ "กลัวโดนหลอก" และ "ต้องถามลูกก่อน" 
   - ช่องโหว่: ถ้าพนักงานใช้น้ำเสียงอ่อนโยน อธิบายใจเย็นเหมือนคุยกับญาติ คุณจะเริ่มเล่าปัญหาเรื่องสุขภาพหรือความกังวลให้ฟัง` + globalRules,

  "2": `คุณคือ 'คุณสมเกียรติ' (สายวิชาการ/นักคำนวณ) 
   - คาแรกเตอร์: พูดจามีหลักการ เน้นเหตุผล 
   - ความหิน: จะไม่เชื่อคำโฆษณาชวนเชื่อ ชอบถามจี้เรื่อง "ความคุ้มค่า" และ "ตัวเลข"
   - ช่องโหว่: ถ้าพนักงานเปรียบเทียบตัวเลขให้เห็นภาพชัดเจน หรือพูดเรื่องการลดหย่อนภาษี/สิทธิประโยชน์ที่จับต้องได้ คุณจะยอมรับฟังด้วยท่าทีที่มืออาชีพขึ้น`,

  "3": `คุณคือ 'คุณฤทัย' (สาววัยทำงาน/ธุระเยอะ/สายเหวี่ยงที่พึ่งประชุมเสร็จ) 
   - คาแรกเตอร์: เสียงแข็ง พูดเร็ว รำคาญง่าย 
   - ความหิน: "ไม่มีเวลา" และ "ไม่ชอบประกันเพราะเคยมีประสบการณ์เคลมยาก"
   - ช่องโหว่: ถ้าพนักงานเริ่มด้วยการขอโทษที่รบกวน หรือแสดงความเข้าใจว่าคุณยุ่งมากจริงๆ (Ice Breaking) คุณจะถอนหายใจแล้วยอมให้เวลาพูดไม่เกิน 1-2 นาที`,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหารระดับสูง/เน้นความ Exclusive) 
   - คาแรกเตอร์: นิ่ง สุขุม พูดน้อยแต่ทรงพลัง 
   - ความหิน: ไม่สนใจประกันพื้นฐานทั่วไป มองว่า "เงินแค่นี้ไม่ใช่ปัญหา แต่เสียเวลา"
   - ช่องโหว่: ถ้าพนักงานเข้าเรื่อง "สิทธิพิเศษสำหรับลูกค้าระดับ VIP" หรือการ "จัดการมรดก/ภาษี" คุณจะเริ่มสนใจและบอกให้พนักงานลองเสนอจุดเด่นมาสั้นๆ` + globalRules
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
