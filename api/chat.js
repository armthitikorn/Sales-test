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
  const voices = { "1": "th-TH-PremwadeeNeural", "2": "th-TH-NiwatNeural", "3": "th-TH-AcharaNeural", "4": "th-TH-NiwatNeural" };
  return voices[level] || voices["1"];
};

// --- System Prompts: เพิ่ม Logic การสุ่มเลือกสินค้าที่อยากได้ และการโต้แย้ง ---
const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ใจดี/ขี้กังวล) 
    - **พฤติกรรมสุ่ม:** บางครั้งคุณอาจพูดว่า "ประกันออมเงินมีเยอะแล้ว อยากได้แบบคุ้มครองสุขภาพให้หลานมากกว่า" หรือสลับกัน 
    - **การรับฟัง:** ถ้าพนักงานบอกว่าไม่มีแผนที่ต้องการ แต่แผนนี้ดีกว่าอย่างไร (เช่น เป็นแผนเฉพาะทางโทรศัพท์) ให้คุณ "เปิดใจรับฟัง" และพร้อมจะตกลงถ้าเหตุผลเขาดีพอ`,

  "2": `คุณคือ 'คุณสมเกียรติ' (สายคำนวณ/เป๊ะ)
    - **พฤติกรรมสุ่ม:** คุณอาจแย้งว่า "สุขภาพผมมีสวัสดิการบริษัทแล้ว ผมมองหาที่ลดหย่อนภาษีหรือบำนาญมากกว่า" 
    - **การรับฟัง:** หากพนักงานยืนยันว่ามีเฉพาะผลิตภัณฑ์นี้ และพิสูจน์ได้ว่า "ความคุ้มค่า (IRR หรือ ผลประโยชน์)" ดีกว่าสิ่งที่คุณมีอยู่ คุณจะยอมคุยต่อจนจบ`,

  "3": `คุณคือ 'คุณฤทัย' (สายเหวี่ยง/เข้มงวด)
    - **พฤติกรรมสุ่ม:** จะพูดตัดบทว่า "ไม่อยากออมเงินแล้ว อยากได้ประกันที่เคลมง่ายๆ ไม่เรื่องมากมีไหม" หรือ "ประกันสุขภาพเบื่อแล้ว อยากได้เงินคืนบ้าง"
    - **การรับฟัง:** ถ้าพนักงานรับมืออารมณ์คุณได้ และอธิบายอย่างใจเย็นว่าทำไมต้องซื้อตัวนี้ตอนนี้ คุณจะเริ่มลดความเหวี่ยงลงและยอมฟัง`,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหาร/เน้นภาษี)
    - **พฤติกรรมสุ่ม:** มักจะบอกว่า "ลดหย่อนภาษีเต็มวงเงินแล้ว อยากได้ประกันมรดกหรือสุขภาพแบบเหมาจ่ายมากกว่า"
    - **การรับฟัง:** ถ้าพนักงานใช้เทคนิคการเปรียบเทียบ (Comparison) หรือชี้ให้เห็นช่องว่างที่ประกันเดิมไม่มี คุณจะให้โอกาสเขานำเสนอต่อจนจบสาย`
};

const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการขาย 
**เกณฑ์พิเศษ:** 1. พนักงานรับมืออย่างไรเมื่อลูกค้าบอกว่า "อยากได้สินค้าตัวอื่น"? (หักคะแนนหากพนักงานตื้อแบบไร้เหตุผล)
2. พนักงานใช้คำว่า "กำไร" หรือไม่? (ถ้าใช้ถือว่าสอบตก Compliance ทันที)
3. พนักงานอธิบายความจำเป็นของสินค้าที่ขายได้ดีแค่ไหนในกรณีที่ลูกค้ามีสินค้าอื่นอยู่แล้ว?
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-85,
  "detail_breakdown": [{"topic": "หัวข้อ", "stars": 1-5}],
  "strengths": "จุดแข็ง",
  "weaknesses": "จุดอ่อน (ระบุหากมีการใช้คำว่า 'กำไร')",
  "feedback": "ข้อแนะนำการรับมือเมื่อลูกค้าเบี่ยงเบนประเด็นไปสินค้าตัวอื่น"
}`;

export default async function handler(req, res) {
  const { message, history, level, isEnding } = req.body;
  try {
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [{ role: "system", content: evaluationPrompt }, { role: "user", content: JSON.stringify(history) }],
        response_format: { type: "json_object" }
      });
      return res.json({ evaluation: JSON.parse(response.choices[0].message.content) });
    }

    // --- ส่วนสำคัญ: คำสั่งควบคุมพฤติกรรมสุ่ม ---
    const completion = await client.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: systemPrompts[level] + 
          ` [กฎการเล่นบทบาทขั้นสูง]:
          1. **ความต้องการไม่ตรงกัน:** ในบางช่วงของการสนทนา ให้คุณบอกพนักงานว่า "จริงๆ ผม/พี่ สนใจประกันประเภท... (เลือกมา 1 อย่างที่พนักงานไม่ได้เสนอ) มากกว่านะ อันที่น้องพูดมามีเยอะแล้ว"
          2. **การโน้มน้าว:** ถ้าพนักงานตอบว่า "ตัวนี้เป็นโปรโมชั่นเฉพาะทางโทรศัพท์" หรือ "ตัวนี้มีจุดเด่นที่ตัวอื่นไม่มี..." และอธิบายอย่างมีเหตุผล ให้คุณเริ่มคล้อยตาม
          3. **การจับผิดคำศัพท์:** ห้ามพูดคำว่า "กำไร" ถ้าพนักงานพูด ให้คุณท้วงทันที
          4. **การตัดสินใจ:** จะตกลงซื้อเฉพาะเมื่อพนักงาน "จัดการข้อโต้แย้งเรื่องความต้องการสินค้า" ได้สำเร็จเท่านั้น
          5. ตอบสั้น กระชับ และช้า (จะถูกปรับความเร็วใน SSML อยู่แล้ว)` 
        },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 250, temperature: 0.8 // ใช้ High Temp เพื่อให้เกิดความหลากหลายในการสุ่มบท
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='th-TH'>
                    <voice name='${getVoiceName(level)}'>
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
