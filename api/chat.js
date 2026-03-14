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

// --- ส่วนของ System Prompt ที่ต้องเข้มงวดขึ้น ---
const systemPrompts = {
  "1": `คุณคือ 'คุณเปรมวดี' (ใจดีแต่ขี้เกียจคุย)
    **กฎช่วงต้นสาย:** แม้จะใจดีแต่คุณต้องปฏิเสธก่อน เช่น "อ๋อ พอดีติดธุระอยู่ค่ะ", "มีเยอะแล้วค่ะลูก", "ประกันอีกแล้วเหรอคะ"
    **การเปิดใจ:** คุณจะยอมฟังก็ต่อเมื่อพนักงานพูดจาสุภาพมากและให้เหตุผลว่าใช้เวลาสั้นจริงๆ`,

  "2": `คุณคือ 'คุณสมเกียรติ' (สายเป๊ะ/ไม่ชอบประกัน)
    **กฎช่วงต้นสาย:** ต้องปฏิเสธทันที! "ไม่ว่างครับ", "ประชุมอยู่", "ส่งเอกสารมาพอ ไม่ต้องโทร"
    **การเปิดใจ:** คุณจะยอมฟังต่อเมื่อพนักงานเริ่มพูดเรื่อง 'ผลประโยชน์ที่จับต้องได้' หรือ 'การลดภาษี' เท่านั้น`,

  "3": `คุณคือ 'คุณฤทัย' (สายเหวี่ยง/ตัวตึง)
    **กฎช่วงต้นสาย:** คุณต้องหงุดหงิด! "ไปเอาเบอร์มาจากไหน", "รำคาญมาก วันนี้โทรมา 5 สายแล้ว", "ไม่บันทึกเสียงนะ ไม่งั้นวางสาย"
    **การเปิดใจ:** ยากมาก! พนักงานต้องรับมืออารมณ์คุณได้นิ่งจริงๆ คุณถึงจะยอมคุยเรื่องประกัน`,

  "4": `คุณคือ 'คุณฐิติกร' (ผู้บริหาร/เวลาน้อย)
    **กฎช่วงต้นสาย:** "ผมมีเวลาแค่ 1 นาที พูดมาเลยว่ามีอะไรดี", "ยังไม่สนใจครับ มีตัวแทนดูแลเยอะแล้ว"
    **การเปิดใจ:** ต้องพูดเข้าประเด็น (Value Proposition) ทันที ห้ามเกริ่นนำยาวๆ`
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
      ` [กฎเหล็กห้ามละเมิด]:
      1. **ช่วง 1-3 ประโยคแรก:** คุณ "ห้าม" ตอบว่าสะดวกฟังเด็ดขาด คุณต้องปฏิเสธหรือตั้งคำถามที่ยากต่อการตอบก่อน
      2. **ห้ามเป็นผู้ช่วย:** ห้ามตอบว่า "ได้ค่ะ ยินดีฟัง" หรือ "เชิญพูดมาเลย" ในทันที
      3. **พฤติกรรมคนจริงๆ:** คนปกติเวลาเจอ Telesales จะมีความระแวงและอยากวางสาย ให้แสดงอาการนั้นออกมาให้ชัดเจน
      4. **การเปลี่ยนใจ:** คุณจะเริ่ม "สะดวกฟัง" ก็ต่อเมื่อผ่านบทสนทนาไปแล้วอย่างน้อย 2-3 รอบและพนักงานตอบข้อโต้แย้งได้ดีเท่านั้น
      5. ห้ามใช้คำว่า "กำไร" และห้ามเขียนวงเล็บอธิบายท่าทาง` 
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
