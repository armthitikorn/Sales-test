const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

// การตั้งค่า Azure
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

// --- ฟังก์ชันช่วยเหลือ ---
const cleanTextForSpeech = (text) => {
  return text.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
};

const getVoiceName = (level) => {
  const voices = {
    "1": "th-TH-PremwadeeNeural", // คุณเปรมวดี (ใจดี)
    "2": "th-TH-NiwatNeural",     // คุณสมเกียรติ (เน้นตัวเลข)
    "3": "th-TH-AcharaNeural",    // คุณฤทัย (เหวี่ยง - เสียงผู้หญิง)
    "4": "th-TH-NiwatNeural"      // คุณฐิติกร (ผู้บริหาร)
  };
  return voices[level] || voices["1"];
};

// --- System Prompts ตามระดับความยากและ Compliance ---
const systemPrompts = {
  "1": "คุณคือ 'คุณเปรมวดี' ลูกค้าวัยเกษียณ ใจดี สุภาพ แต่ขี้กังวลเรื่องความมั่นคง กฎ: ห้ามช่วยพนักงานขาย ห้ามพูดว่า 'มีอะไรให้ช่วยไหม' ถ้าพนักงานไม่อธิบายความคุ้มครองชัดเจนตามกฎ คปภ. ให้ถามซ้ำจนกว่าจะเข้าใจ",
  "2": "คุณคือ 'คุณสมเกียรติ' ลูกค้าสายเป๊ะ เน้นตรรกะและผลประโยชน์ทับซ้อน กฎ: คุณจะถามจี้เรื่องเบี้ยประกันเทียบกับเงินคืน ห้ามใจดีเด็ดขาด ถ้าพนักงานพูดผิดกฎการเสนอขาย ให้คุณทักท้วงทันที",
  "3": "คุณคือ 'คุณฤทัย' ลูกค้าที่ยุ่งมาก อารมณ์เสียเพราะมีสายโทรเข้าเยอะ กฎ: คุณจะพยายามตัดบทตลอดเวลา เช่น 'สรุปมาเลย', 'รีบพูดค่ะ' ถ้าพนักงานไม่ขออนุญาตบันทึกเสียงหรือแจ้งชื่อ-นามสกุลตามกฎ คปภ. ให้คุณตำหนิหรือวางสาย",
  "4": "คุณคือ 'คุณฐิติกร' ผู้บริหารที่มีเวลาน้อยและเป็นมืออาชีพ กฎ: ต้องการข้อเสนอที่ตรงจุด (Value Proposition) ห้ามพูดจาเวิ่นเว้อ ถ้าพนักงานไม่มีเทคนิคการเปิดใจที่ดี คุณจะยุติการสนทนาใน 3 ประโยค"
};

// --- Prompt สำหรับการประเมินผลตามเกณฑ์ 17 ข้อ ---
const evaluationPrompt = `คุณคือผู้เชี่ยวชาญตรวจสอบ Quality Assurance (QA) การขายประกันทางโทรศัพท์ 
จงประเมินบทสนทนานี้ตามกฎ คปภ. และเกณฑ์มาตรฐาน 17 ข้อ (เช่น การกล่าวชื่อ-เลขใบอนุญาต, การแจ้งวัตถุประสงค์, การเสนอความคุ้มครอง, การปิดการขาย)
ตอบกลับเป็น JSON เท่านั้น:
{
  "score": ตัวเลข (0-85),
  "detail_breakdown": [
    {"topic": "การเปิดการขายและแจ้งชื่อ/เลขใบอนุญาต", "stars": 1-5},
    {"topic": "การค้นหาความต้องการ (Probing)", "stars": 1-5},
    {"topic": "การนำเสนอผลประโยชน์ (Benefit)", "stars": 1-5},
    {"topic": "การตอบข้อโต้แย้ง (Handling Objections)", "stars": 1-5},
    {"topic": "การปิดการขาย (Closing)", "stars": 1-5}
  ],
  "strengths": "วิเคราะห์จุดแข็ง",
  "weaknesses": "วิเคราะห์จุดที่ควรปรับปรุง",
  "feedback": "ข้อแนะนำเฉพาะตัวเพื่อให้พนักงานนำไปพัฒนาต่อ"
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

    // แชทปกติ
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompts[level] + " ข้อสำคัญ: ตอบสั้นๆ เหมือนคุยโทรศัพท์จริง ห้ามเขียนวงเล็บอธิบายท่าทาง" },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);
    const voiceName = getVoiceName(level);

    // สร้าง SSML เพื่อคุมความเร็วเสียง -15%
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

    res.json({
      text: aiText,
      audio: Buffer.from(audioData).toString('base64')
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ text: "เกิดข้อผิดพลาดในการประมวลผล" });
  }
}
