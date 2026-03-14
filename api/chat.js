const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk"); // ต้องมีบรรทัดนี้

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

const systemPrompts = {
    "1": "คุณคือ 'คุณเปรมวดี' ลูกค้าใจดี มีมารยาท พร้อมรับฟังข้อเสนอประกันชีวิต พูดจาอ่อนหวาน (คะ/ขา)",
    "2": "คุณคือ 'คุณสมเกียรติ' ลูกค้าที่เน้นเหตุผลและตัวเลข จะถามจี้เรื่องผลประโยชน์และความคุ้มค่าเท่านั้น",
    "3": "คุณคือ 'คุณฤทัย' ลูกค้าสายเหวี่ยง ขี้รำคาญ ยุ่งตลอดเวลา พยายามจะวางสายถ้าพนักงานพูดจาไม่เข้าหู",
    "4": "คุณคือ 'คุณฐิติกร' ผู้บริหารระดับสูง (บิ๊กบอส) มีเวลาน้อยมาก ต้องการสรุปที่กระชับและเป็นมืออาชีพที่สุด"
};

export default async function handler(req, res) {
    const { message, history, level, isEnding } = req.body;

    try {
        if (isEnding) { /* ... โค้ดประเมินผลเดิมของคุณถูกต้องแล้ว ... */ }

        // 1. คุยกับ GPT-4.1 Mini
        const completion = await client.chat.completions.create({
            messages: [{ role: "system", content: systemPrompts[level] || systemPrompts["1"] }, ...history, { role: "user", content: message }],
            max_tokens: 150, temperature: 0.7
        });
        const aiText = completion.choices[0].message.content;

        // 2. สร้างเสียงจากข้อความ (TTS)
        speechConfig.speechSynthesisVoiceName = (level === "1") ? "th-TH-PremwadeeNeural" : "th-TH-NiwatNeural";
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        
        const audioData = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(aiText, result => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
                else reject(result.errorDetails);
                synthesizer.close();
            }, err => { synthesizer.close(); reject(err); });
        });

        // 3. ส่งกลับทั้งข้อความและเสียง
        res.json({
            text: aiText,
            audio: Buffer.from(audioData).toString('base64') // ส่งเสียงกลับไปให้หน้าเว็บเล่น
        });

    } catch (error) {
        res.status(500).json({ text: "ระบบขัดข้อง" });
    }
}
