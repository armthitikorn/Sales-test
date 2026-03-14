const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

// การตั้งค่า Azure OpenAI
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: "2024-05-01-preview"
});

// การตั้งค่า Azure Speech
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

// เลือกเสียงภาษาไทย (เปรมวดี คือนุ่มนวล, นิวัฒน์ คือทางการ)
const getVoiceName = (level) => {
  return level === "1" ? "th-TH-PremwadeeNeural" : "th-TH-NiwatNeural";
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { message, history, level, isEnding } = req.body;

  try {
    // 1. ส่งข้อความไปหา GPT-4.1 Mini (สมอง)
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: "คุณคือลูกค้าประกันภัยที่กำลังคุยกับพนักงานขาย ตอบสั้นๆ เป็นธรรมชาติ" },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const aiText = completion.choices[0].message.content;

    // 2. ส่งข้อความที่ได้ไปสร้างเสียง (เสียง)
    speechConfig.speechSynthesisVoiceName = getVoiceName(level);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    const audioData = await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(aiText, 
        result => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(result.errorDetails);
          }
          synthesizer.close();
        },
        err => {
          synthesizer.close();
          reject(err);
        }
      );
    });

    // 3. ส่งข้อมูลทั้ง "ข้อความ" และ "เสียง (Base64)" กลับไปที่หน้าเว็บ
    res.json({
      text: aiText,
      audio: Buffer.from(audioData).toString('base64')
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ text: "เกิดข้อผิดพลาดในการประมวลผล" });
  }
}
