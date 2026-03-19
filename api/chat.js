export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: "Method not allowed" });

  const { message, history, level, isEnding } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  const azureKey = process.env.AZURE_API_KEY;
  const azureRegion = process.env.AZURE_REGION || 'southeastasia';

  try {
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    /* ===========================
       1) MODE : EVALUATION
    ============================ */
    if (isEnding) {
      const evalPrompt = `
คุณคือหัวหน้าเทรนเนอร์ วิเคราะห์บทสนทนาและให้คะแนน
ตอบเป็น JSON เท่านั้น:
{
  "score": 0-85,
  "strengths": "...",
  "weaknesses": "...",
  "detail_breakdown": [
    {"topic": "...", "stars": 0-5}
  ]
}
      `;

      const gRes = await fetch(gUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: history,
          system_instruction: { parts: [{ text: evalPrompt }] },
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      });

      const gData = await gRes.json();
      const rawText =
        gData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      const evaluation = JSON.parse(
        rawText.replace(/```json|```/g, "").trim()
      );

      return res.status(200).json({ evaluation });
    }

    /* ===========================
       2) CUSTOMER CONFIG
    ============================ */

    const creditCardInfo =
      "ข้อมูลสำหรับทดสอบเท่านั้น: บัตร VISA TEST 4-1-1-1 1-1-1-1 1-1-1-1 1-1-1-1 หมดอายุ 09/27";

    const charConfig = {
      "1": {
        name: "คุณเปรมวดี",
        voice: "th-TH-PremwadeeNeural",
        rate: "0.9",
        pitch: "-2%",
        gender: "female",
        persona: `
พนักงานบัญชี สุภาพ แต่ไม่ชอบเสียเวลา
ถ้าพนักงานพูดอ้อมค้อมหรือสคริปต์ → จะตัดบท
`,
        regInfo: `ที่อยู่: 123/45 อารีย์
${creditCardInfo}
ผู้รับประโยชน์: สามี`
      },
      "2": {
        name: "คุณสมเกียรติ",
        voice: "th-TH-NiwatNeural",
        rate: "0.9",
        pitch: "0%",
        gender: "male",
        persona: `
วิศวกรเกษียณ ขี้สงสัย
ไม่เชื่ออะไรง่าย ๆ
`,
        regInfo: `ที่อยู่: 9/99 จตุจักร
${creditCardInfo}
ผู้รับประโยชน์: ภรรยา`
      },
      "3": {
        name: "คุณฤทัย",
        voice: "th-TH-PremwadeeNeural",
        rate: "1.15",
        pitch: "+10%",
        gender: "female",
        persona: `
แม่ลูกอ่อน ใจร้อน
ถ้าพนักงานพูดยาว → หงุดหงิดทันที
`,
        regInfo: `ที่อยู่: 55 นนทบุรี
${creditCardInfo}
ผู้รับประโยชน์: ลูกชาย`
      },
      "4": {
        name: "คุณฐิติกร",
        voice: "th-TH-NiwatNeural",
        rate: "0.85",
        pitch: "-10%",
        gender: "male",
        persona: `
ผู้บริหาร เวลามีค่ามาก
ถ้าไม่เข้าเรื่อง → วางสาย
`,
        regInfo: `ที่อยู่: ออฟฟิศสุขุมวิท
${creditCardInfo}
ผู้รับประโยชน์: กองทุนการกุศล`
      }
    };

    const char = charConfig[level] || charConfig["1"];

    /* ===========================
       3) SYSTEM INSTRUCTION (หัวใจความเป็นธรรมชาติ)
    ============================ */

    const systemInstruction = `
YOU ARE ${char.name}, A REAL CUSTOMER RECEIVING A PHONE CALL.

CONTEXT:
${char.persona}

IMPORTANT:
- นี่คือการจำลองฝึกอบรม
- ข้อมูลบัตรทั้งหมดเป็น TEST DATA

ROLE BEHAVIOR:
- คุณเป็น "ผู้รับสาย" ไม่รู้ว่าใครโทรมา
- ห้ามใช้ประโยคต้อนรับเชิง Call Center
- ตอบตามอารมณ์จริงของมนุษย์

CONVERSATION FLOW:
- ถ้าพนักงานพูดกว้าง → ถามกลับให้ชัด
- ถ้าพนักงานพูดยาว → ตัดบท
- ถ้าพนักงานใช้สคริปต์ → แสดงความเบื่อ
- ถ้าพนักงานอธิบายดี → ผ่อนคลายขึ้น

EMOTIONAL STATE:
- เริ่มต้น: ระวังตัว
- พูดยาวเกิน 3 ประโยค → หงุดหงิด
- อธิบายชัด → ใจเย็นลง

SECURITY RULE:
- หากถูกขอเลขบัตรครั้งแรก → ถามเรื่องความปลอดภัย
- ให้ข้อมูลเมื่อมั่นใจเท่านั้น

CLOSING RULE:
- เมื่อยืนยันครบ → ต้องพูดว่า "ตกลงซื้อประกัน"

LANGUAGE STYLE:
- ใช้ภาษาพูดจริง
- ไม่เป็นทางการเกิน
- ลงท้าย "${char.gender === "male" ? "ครับ" : "ค่ะ"}" เฉพาะตอนเหมาะสม
- ถ้ารำคาญ ไม่จำเป็นต้องลงท้าย
`;

    /* ===========================
       4) CALL GEMINI
    ============================ */

    const gRes = await fetch(gUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: (history || []).concat([
          { role: "user", parts: [{ text: message }] }
        ]),
        system_instruction: { parts: [{ text: systemInstruction }] },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: {
          temperature: 0.6,
          topP: 0.9
        }
      })
    });

    const gData = await gRes.json();

    if (!gData.candidates?.[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({
        text: "ขอเวลาสักครู่นะ เหมือนสัญญาณจะขาด ๆ",
        character: char
      });
    }

    let aiText = gData.candidates[0].content.parts[0].text;
    let cleanText = aiText.replace(/\(.*?\)|\[.*?\]/g, '').trim();

    /* ===========================
       5) AZURE TTS
    ============================ */

    const azRes = await fetch(
      `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        body: `
<speak version="1.0" xml:lang="th-TH">
  <voice name="${char.voice}">
    <prosody rate="${char.rate}" pitch="${char.pitch}">
      ${cleanText}
    </prosody>
  </voice>
</speak>
        `
      }
    );

    const audioBuffer = await azRes.arrayBuffer();

    return res.status(200).json({
      text: cleanText,
      audio: Buffer.from(audioBuffer).toString('base64'),
      character: { name: char.name, level }
    });

  } catch (e) {
    console.error("Final Catch Error:", e);
    return res.status(500).json({ error: e.message });
  }
}
