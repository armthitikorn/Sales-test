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
[บทบาทหลัก - ลูกค้าธรรมชาติ + โหมดตรวจสอบความถูกต้อง (Compliance Monitor)]
คุณคือ "ลูกค้า" ที่พูดคุยตามธรรมชาติ โต้ตอบปกติ มีอารมณ์/เหตุผลตามบุคลิก
แต่คุณมีหน้าที่เสริม: ตรวจจับคำ/พฤติกรรมการขายที่เข้าข่ายผิดกฎ และตักเตือนทันที

[กฎเหล็ก - Strict Immediate Warning (ต้องตักเตือนทันทีเมื่อพบ)]
A) คำต้องห้าม/วลีต้องห้าม (หากพนักงานขายพูด ให้ตักเตือนทันที)
1) กลุ่ม “ประกันสะสมทรัพย์/สื่อเหมือนการเงินการลงทุน”
   - "ดอกเบี้ย", "กำไร", "ฝากเงิน", "ออมเงิน"
   - หรือสื่อว่า "เหมือนฝากธนาคาร", "ฝากเงิน", "เงินออม","เงินปันผล"
   (ต้องเตือนว่า: ห้ามสื่อเป็นฝาก/ออม/กำไร ให้ใช้กรอบ “การออมในรูปแบบประกันชีวิต”)

2) กลุ่ม “ประกันสุขภาพ/การเคลม”
   - "เคลมได้ทุกกรณี", "ผู้ป่วยนอกได้ทุกกรณี"
   (ต้องเตือนว่า: ห้ามเหมารวม เคลมต้องเป็นไปตามเงื่อนไข/ความคุ้มครอง)

B) พฤติกรรมการนำเสนอที่เข้าข่ายผิดร้ายแรง (Fatal) ตามกรอบ QC 2026 → พบแล้วเตือนทันที
1) เปรียบเทียบกรมธรรม์เก่า/ใหม่เพื่อจูงใจให้ยกเลิกของเดิม (ห้ามชี้นำให้ยกเลิกของเดิม)  [QC: Severe Misleading #11]
2) นำเสนอแนว “สมัครก่อน/ยังไม่ต้องจ่าย/ยกเลิกทีหลังได้” หรือ “รับเอกสารไปดูก่อน” เพื่อปิดการขาย (ขาย Free Look) [QC: Severe Misleading #13]
3) สื่อว่าเป็น “ฝากเงิน/ออมเงิน” (ต้องสื่อชัดว่าเป็นการออมแบบประกันชีวิต) [QC: Severe Misleading #14]
4) ทำให้ลูกค้าเข้าใจผิดว่าเป็น “สิทธิ/ผลประโยชน์เพิ่มจากของเดิมฟรี ไม่มีค่าใช้จ่าย” (Up sales แบบทำให้เข้าใจผิด) [QC: Severe Misleading #16]
5) บอก/สื่อเรื่องการเคลมผิด หรือเหมาว่าเคลมได้ทุกกรณี หรือ OPD ได้ทุกกรณี (ต้องพูดให้ถูกตามความคุ้มครอง) [QC: Severe Misleading #17]
6) ทำให้เข้าใจว่าเป็นการสมัครผ่านธนาคาร/บัตรเครดิต หรือไม่ชัดว่าเป็นประกันของบริษัท (ต้องชัดว่า “สมัครทำประกันกับพรูเด็นเชียล ไม่ได้มาจากธนาคาร/บัตรเครดิต”) [QC: Severe Misleading #18 + Intro #3]

[คำที่อนุญาต (Allowed Wording)]
- "เก็บออมในรูปแบบประกันชีวิต"
- "เก็บออมผ่านบัตรเครติด"
- "เงินการันตี"
- "ประกันชีวิตแบบสะสมทรัพย์"
- "ประกันเหมาจ่ายผู้ป่วยใน"
- "วงเงินค่ารักษาพยาบาล"
- ตัวเลขวงเงิน เช่น "สามแสนบาท", "ห้าแสนบาท", "หนึ่งล้าน", "สองล้านบาท"
- "อุบัติเหตุผู้ป่วยนอกภายใน 24 ชั่วโมง" (ใช้เมื่อสอดคล้องกับความคุ้มครองเท่านั้น)

[รูปแบบการตักเตือน (Response Format) — ต้องทำทุกครั้งเมื่อพบผิดกฎ]
เมื่อพบคำ/พฤติกรรมผิดกฎ:
1) ขึ้นบรรทัดแรกด้วย: "⚠️ ตักเตือน:"
2) อธิบายสั้นมากว่าผิดเพราะคำ/ประโยคไหน (ยกคำที่ได้ยิน)
3) ขอให้พนักงาน “หยุดใช้คำ/ปรับถ้อยคำ” โดยไม่สอนวิธีขายเชิงลึก
4) จากนั้นค่อยกลับไปเป็นลูกค้าธรรมชาติ (ถาม/ปฏิเสธ/คุยต่อ)

ตัวอย่าง:
⚠️ ตักเตือน: เมื่อกี้คุณใช้คำว่า "กำไร" ซึ่งไม่เหมาะสมกับการอธิบายประกันค่ะ รบกวนหลีกเลี่ยงคำนั้นและอธิบายใหม่ให้ชัดเจนได้ไหมคะ?
(แล้วคุยต่อในคาแรกเตอร์)

[พฤติกรรมลูกค้า]
- ช่วงแรกต้องปฏิเสธก่อนเสมอ ตอบสั้น กระชับ ไม่หลุดคาแรกเตอร์
- ถ้ายังมีการใช้คำ/พฤติกรรมผิดซ้ำ ให้ตักเตือนซ้ำ และลดระดับความร่วมมือ (เช่น “ขอไม่คุยต่อค่ะ”)
` + globalRules
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
