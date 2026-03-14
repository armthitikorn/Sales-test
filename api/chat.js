const { AzureOpenAI } = require("openai");

// ดึงค่าจาก GitHub Secrets
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const apiVersion = "2024-05-01-preview";

const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

// --- 1. นิยามคาแรกเตอร์ลูกค้า (System Prompts) ---
const systemPrompts = {
    "1": "คุณคือ 'คุณเปรมวดี' ลูกค้าใจดี มีมารยาท พร้อมรับฟังข้อเสนอประกันชีวิต พูดจาอ่อนหวาน (คะ/ขา)",
    "2": "คุณคือ 'คุณสมเกียรติ' ลูกค้าที่เน้นเหตุผลและตัวเลข จะถามจี้เรื่องผลประโยชน์และความคุ้มค่าเท่านั้น",
    "3": "คุณคือ 'คุณฤทัย' ลูกค้าสายเหวี่ยง ขี้รำคาญ ยุ่งตลอดเวลา พยายามจะวางสายถ้าพนักงานพูดจาไม่เข้าหู",
    "4": "คุณคือ 'คุณฐิติกร' ผู้บริหารระดับสูง (บิ๊กบอส) มีเวลาน้อยมาก ต้องการสรุปที่กระชับและเป็นมืออาชีพที่สุด"
};

// --- 2. Prompt สำหรับประเมินผลตอนจบการสนทนา ---
const evaluationPrompt = `จงสวมบทบาทเป็นผู้เชี่ยวชาญการฝึกสอน Telesales ประเมินประวัติการสนทนานี้ตามเกณฑ์ 17 ข้อของการขายประกัน ให้คะแนนเต็ม 85 และตอบกลับเป็น JSON format เท่านั้น:
{
  "score": ตัวเลขคะแนน,
  "detail_breakdown": [{"topic": "หัวข้อ", "stars": 1-5}],
  "strengths": "จุดแข็ง",
  "weaknesses": "จุดที่ควรปรับปรุง"
}`;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message, history, level, isEnding } = req.body;

    try {
        // กรณีที่กด "จบการสนทนา" เพื่อประเมินผล
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

        // กรณีการสนทนาปกติ
        const messages = [
            { role: "system", content: systemPrompts[level] || systemPrompts["1"] },
            ...history,
            { role: "user", content: message }
        ];

        const completion = await client.chat.completions.create({
            messages: messages,
            max_tokens: 150,
            temperature: 0.7
        });

        const aiText = completion.choices[0].message.content;

        // ส่งคำตอบกลับไปยัง Frontend
        res.json({
            text: aiText,
            customerName: level ? undefined : undefined // สามารถปรับแต่งเพิ่มได้
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ text: "ขออภัย ระบบขัดข้องกรุณาลองใหม่" });
    }
}
