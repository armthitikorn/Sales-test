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

// --- แก้ไขการเลือกเสียงให้แม่นยำ ---
const getVoiceName = (level) => {
  const voices = { 
    "1": "th-TH-PremwadeeNeural", // หญิง
    "2": "th-TH-NiwatNeural",     // ชาย
    "3": "th-TH-AcharaNeural",    // หญิง (คุณฤทัย) - มั่นใจว่าเป็นเสียงผู้หญิงแน่นอน
    "4": "th-TH-NiwatNeural"      // ชาย (คุณฐิติกร)
  };
  return voices[String(level)] || voices["1"]; // ใช้ String(level) เพื่อป้องกัน Error จากประเภทข้อมูล
};

const systemPrompts = {
  "1": "คุณคือ 'คุณเปรมวดี' (ใจดี/ขี้กังวล) ปฏิเสธต้นสายว่ามีเยอะแล้ว เน้นถามเรื่องสุขภาพพื้นฐาน",
  "2": "คุณคือ 'คุณสมเกียรติ' (สายคำนวณ) ถามจี้เรื่อง IRR และตัวเลข ห้ามใช้คำว่ากำไร",
  "3": "คุณคือ 'คุณฤทัย' (ผู้หญิง/สายเหวี่ยง) หงุดหงิดที่โดนโทรหา ปฏิเสธการบันทึกเสียง และถามจี้เรื่องความคุ้มครอง",
  "4": "คุณคือ 'คุณฐิติกร' (ผู้บริหาร/เวลาน้อย) ตัดบทเก่ง ห้ามสอนงานพนักงาน ถ้าพนักงานง้อให้วางสายทันที"
};

const evaluationPrompt = `จงสวมบทบาท QA ตรวจสอบการขายประกันทางโทรศัพท์ 
ประเมินตามเกณฑ์ คปภ. 17 ข้อ และหักคะแนนหนักหากใช้คำว่า "กำไร" แทน "ผลตอบแทน"
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-85,
  "detail_breakdown": [{"topic": "หัวข้อ", "stars": 1-5}],
  "strengths": "จุดแข็ง",
  "weaknesses": "จุดอ่อน",
  "feedback": "ข้อแนะนำ"
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

    const voiceName = getVoiceName(level);

    const completion = await client.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: systemPrompts[String(level)] + 
          ` [กฎเหล็กห้ามละเมิด]:
          1. ช่วง 1-3 ประโยคแรก: ต้องปฏิเสธห้ามตอบว่าสะดวกฟังทันที
          2. ห้ามเป็นผู้ช่วย: ห้ามตอบรับแบบ AI ห้ามสอนงานพนักงาน
          3. บทบาทลูกค้า: คุณคือคนซื้อที่เรื่องมาก ไม่ใช่ที่ปรึกษา
          4. หากพนักงานทำตัวไม่เป็นมืออาชีพ ให้ตัดบทและขอยุติการสนทนาทันที
          5. ห้ามใช้คำว่า "กำไร" และห้ามเขียนวงเล็บอธิบายท่าทาง` 
        },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 250, 
      temperature: 0.8
    });

    const aiText = completion.choices[0].message.content;
    const textToSpeak = cleanTextForSpeech(aiText);

    // สร้าง SSML พร้อมคุมความเร็วและเสียง
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
    console.error("Server Error:", error);
    res.status(500).json({ text: "ระบบขัดข้อง กรุณาลองใหม่" });
  }
}
