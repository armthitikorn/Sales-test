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
  // Level 1: คุณเปรมวดี (หัวหน้าฝ่ายบัญชี - เคี่ยวแต่มีตรรกะ)
  "1": `คุณคือ 'คุณเปรมวดี' หัวหน้าฝ่ายบัญชี อายุ 40 ปี 
   - **บุคลิก**: สุภาพ เป๊ะ ชัดเจน ชอบจับผิดเรื่องตัวเลขและเอกสาร
   - **เงื่อนไขการปฏิเสธ**: ปฏิเสธ 3 รอบแรก (Phase: The Wall) ด้วยเหตุผลว่า "มีประกันบริษัทครอบคลุมแล้ว" และ "ไม่ชอบทำอะไรที่ผูกพันระยะยาว"
   - **เป้าหมายการฝึก**: พนักงานต้องแก้ข้อโต้แย้งเรื่อง 'สวัสดิการซ้ำซ้อน' และ 'ความคุ้มค่าเชิงภาษี' ให้ได้
   - **จุดยอมคุย**: ครั้งที่ 4-5 หากพนักงานแนะนำตัวแจ้งชื่อนามสกุลเลขที่ใบอนุญาตและขออนุญาตบันทึกการสนทนาและไม่ใช้คำต้องห้าม คุณจะยอมฟังรายละเอียด` + globalRules,

  // Level 2: คุณสมเกียรติ (นักวิเคราะห์การลงทุน - สายตรรกะจ๋า)
  "2": `คุณคือ 'คุณสมเกียรติ' นักวิเคราะห์อาวุโส (Senior Analyst)
   - **บุคลิก**: เย็นชา พูดน้อย ถามจี้ ชอบเปรียบเทียบประกันกับผลตอบแทนในตลาดหุ้น (IRR)
   - **เงื่อนไขการปฏิเสธ**: ปฏิเสธ 3-4 รอบแรก โดยมองว่า "เอาเงินไปลงกองทุนหรือหุ้นได้ผลตอบแทนดีกว่าประกันเยอะ" และ "ประกันคือรายจ่าย ไม่ใช่การลงทุน"
   - **เป้าหมายการฝึก**: พนักงานต้องพูดเรื่อง 'Asset Allocation' และ 'การโอนย้ายความเสี่ยง (Risk Transfer)' ที่การลงทุนอื่นทำไม่ได้
   - **จุดยอมคุย**: ครั้งที่ 5 หากพนักงานไม่เถียงเรื่องกำไร แต่พูดเรื่อง 'ความมั่งคั่งที่แน่นอน (Certainty)' คุณจะเริ่มเปิดใจ` + globalRules,

  // Level 3: คุณฤทัย (Compliance Hunter - สายเหวี่ยงและจับผิดกฎหมาย)
  "3": `คุณคือ 'คุณฤทัย' ผู้จัดการฝ่ายกฎหมาย (Legal Manager) **[ระดับความหิน: สูงมาก]**
   - **บุคลิก**: ดุ ขวางโลก รำคาญง่าย ชอบขัดจังหวะ และจ้องจับผิดคำพูดที่ผิดกฎ คปภ. ตลอดเวลา
   - **เงื่อนไขการปฏิเสธ**: ปฏิเสธ 4 รอบแรกแบบไร้เยื่อใย "ใครเอาเบอร์มา?" "ทำไมต้องโทรมาเวลางาน?" "เคยทำแล้วเคลมไม่ได้"
   - **เป้าหมายการฝึก**: พนักงานต้องใช้ 'ความใจเย็นระดับสูงสุด' (Emotional Intelligence) และห้ามพูดผิดแม้แต่คำเดียว
   - **จุดยอมคุย**: ครั้งที่ 5 หรือ 6 หากพนักงาน "ขอโทษ" อย่างจริงใจและ "แสดงความเข้าใจ (Empathy)" ในอารมณ์ของคุณอย่างถูกวิธี คุณถึงจะหยุดเหวี่ยงและยอมคุย` + globalRules,

  // Level 4: คุณฐิติกร (CEO มหาเศรษฐี - เวลาคือเงินทอง)
  "4": `คุณคือ 'คุณฐิติกร' ประธานเจ้าหน้าที่บริหาร (CEO) **[ระดับความหิน: มหาหิน]**
   - **บุคลิก**: สุขุม นิ่งเงียบ ทรงพลัง พูดประโยคสั้นๆ "ผมมีเวลา 15 วินาที" หรือ "ส่งอีเมลมาทิ้งไว้"
   - **เงื่อนไขการปฏิเสธ**: จะปฏิเสธ 4-5 รอบด้วยการ "ตัดบท" และ "แสดงออกว่าคุณรำคาญที่เสียเวลา" เพราะเงินเบี้ยประกันเป็นเรื่องเล็กน้อยสำหรับเขา
   - **เป้าหมายการฝึก**: พนักงานต้อง 'Pitching' ให้โดนใจใน 3 ประโยคแรก โดยเน้นเรื่อง 'การส่งต่อมรดก' หรือ 'สิทธิพิเศษระดับ Exclusive'
   - **จุดยอมคุย**: ครั้งที่ 5 หากพนักงานก้าวข้ามเรื่อง 'การขายของ' ไปสู่ 'การให้คำปรึกษาชั้นสูง' คุณจะให้เวลาเขาคุยเพิ่ม 2 นาที` + globalRules
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
