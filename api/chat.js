/**************************************************
 * chat.js (Streaming SSE)
 * AI Customer + Compliance Monitor + Fast UX
 *
 * - Conversation: streams tokens via SSE (text/event-stream)
 * - End call evaluation: returns JSON (as before)
 **************************************************/

const { AzureOpenAI } = require("openai");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

/* =========================
   Next.js API Route Config
   (Keep bodyParser on; SSE is response streaming)
========================= */
module.exports.config = {
  api: {
    bodyParser: true,
  },
};

/* =========================
   Azure OpenAI Client
========================= */
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: "2024-05-01-preview",
});

/* =========================
   Azure Speech Config
========================= */
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

const cleanTextForSpeech = (text) =>
  (text || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .trim();

const getVoiceName = (level) => {
  const voices = {
    "1": "th-TH-PremwadeeNeural",
    "2": "th-TH-NiwatNeural",
    "3": "th-TH-AcharaNeural",
    "4": "th-TH-NiwatNeural",
  };
  return voices[String(level)] || voices["1"];
};

/* =========================
   Global Rules (ย่อได้ตามต้องการ แต่คงสาระ)
========================= */
const globalRules = `
[บทบาทหลัก]
คุณคือ "ลูกค้า" ที่รับสายโทรศัพท์ และยังไม่รู้ว่าใครโทรมา
คุณต้องโต้ตอบอย่างเป็นธรรมชาติ แต่มีหน้าที่ตรวจสอบคำพูดการขาย

[กฎเหล็ก – ต้องตักเตือนทันที]
คำต้องห้าม:
- ดอกเบี้ย, กำไร, ฝากเงิน, ออมเงิน
- เคลมได้ทุกกรณี, ผู้ป่วยนอกได้ทุกกรณี

พฤติกรรมผิดร้ายแรง (QC 2026):
- เปรียบเทียบเพื่อให้ยกเลิกกรมธรรม์เดิม
- สมัครก่อนแล้วยกเลิกทีหลัง (Free Look)
- สื่อว่าเป็นการฝากเงินหรือการลงทุน
- เคลมเหมารวมไม่อิงเงื่อนไข
- ทำให้เข้าใจว่าเป็นธนาคารหรือบัตรเครดิต

[รูปแบบการตักเตือน]
⚠️ ตักเตือน: ระบุคำ/ประโยคที่ผิด → ขอให้ปรับ → กลับสู่บทบาทลูกค้า

[กฎพิเศษ – First Turn Guard (สำคัญมาก)]
- หากยังไม่พบว่าพนักงานแนะนำตัวครบ (ชื่อ–นามสกุล / ใบอนุญาต / บริษัท / ขออนุญาตบันทึกเสียง)
  ให้ถือว่าทุกคำตอบของคุณเป็น "First Turn"
- First Turn:
  • ห้ามใช้ประโยคเชิงต้อนรับ เช่น "ยินดีที่ได้พูดคุย", "มีอะไรให้ช่วย"
  • ห้ามพูดถึงคำว่า "ประกัน", "ผลิตภัณฑ์", "ความคุ้มครอง"
  • ต้องถามกลับเท่านั้น เช่น "โทรมาจากไหน", "ใครติดต่อมา", "โทรมาเรื่องอะไร"
- หากเผลอใช้คำลงท้าย/คำต้อนรับผิด ให้ถือว่าผิดบทบาทและแก้คำตอบใหม่ทันที

[Performance Constraint]
- ตอบให้สั้นที่สุดเท่าที่ถูกต้อง (ไม่อธิบายยาว ไม่บรรยายเหตุผล)
`;

/* =========================
   Persona Prompts
========================= */
const systemPrompts = {
  "1": `
คุณคือ "คุณเปรมวดี" อายุ 40 ปี สุภาพ เป๊ะ รอบคอบ
- ใช้คำลงท้าย "ค่ะ" เท่านั้น
${globalRules}
`,
  "2": `
คุณคือ "คุณสมเกียรติ" สุขุม ใช้เหตุผล พูดน้อย
- ใช้คำลงท้าย "ครับ" เท่านั้น
${globalRules}
`,
  "3": `
คุณคือ "คุณฤทัย" ผู้จัดการกฎหมาย ดุ ตรง ไม่ชอบเสียเวลา
- ไม่จำเป็นต้องใช้คำลงท้ายทุกประโยค (หลีกเลี่ยง "ค่ะ" แบบสุภาพเกินไป)
${globalRules}
`,
  "4": `
คุณคือ "คุณฐิติกร" CEO พูดสั้น ตรงประเด็น
[กฎการใช้ภาษา – บังคับใช้]
- ห้ามใช้ "ค่ะ" และ "ครับ" ทุกกรณี
- ไม่ใช้คำลงท้าย พูดสั้น กระชับ แบบผู้บริหารที่ถูกรบกวนจากสายโทรศัพท์
ตัวอย่าง: "โทรจากบริษัทอะไร", "ใครติดต่อมา", "โทรมาเรื่องอะไร"
หากเผลอใช้คำลงท้าย ให้ถือว่าผิดบทบาทและแก้คำตอบใหม่ทันที
${globalRules}
`,
};

/* =========================
   Evaluation Prompt (End Call) - JSON
========================= */
const evaluationPrompt = `
คุณคือ QA ตรวจสอบการขายประกันทางโทรศัพท์
- ตรวจจับคำต้องห้ามอย่างเคร่งครัด
- ระบุจำนวนครั้งที่พยายามปิดการขายจริง
ตอบเป็น JSON เท่านั้น:
{
  "total_score": 0-100,
  "evaluation_results": [
    { "item": 1, "topic": "", "status": "Pass/Fail", "score": 0, "comment": "" }
  ],
  "summary": {
    "strengths": "",
    "weaknesses": "",
    "closing_attempts_count": 0,
    "feedback": ""
  }
}
`;

/* =========================
   SSE Helpers
========================= */
function sseInit(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // helps on some proxies
  });
  // If available, flush headers immediately
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  if (res.socket && typeof res.socket.setNoDelay === "function") res.socket.setNoDelay(true);
}

function sseSend(res, event, dataObj) {
  // event: optional; if you prefer only "data:" lines, you can omit event
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

function safeHistory(history) {
  // Keep last 6 turns for speed (ปรับได้)
  if (!Array.isArray(history)) return [];
  return history.slice(-6);
}

/* =========================
   API Handler
========================= */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { message, history, level, isEnding } = req.body || {};
  const lvl = String(level || "1");

  try {
    /* ====== End Call → Evaluation (non-stream JSON) ====== */
    if (isEnding) {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: evaluationPrompt },
          { role: "user", content: JSON.stringify(history || []) },
        ],
        response_format: { type: "json_object" },
      });

      return res.json({
        evaluation: JSON.parse(response.choices[0].message.content),
      });
    }

    /* ====== Streaming Conversation (SSE) ====== */
    sseInit(res);
    sseSend(res, "meta", { ok: true, mode: "stream", level: lvl });

    const abortController = new AbortController();
    req.on("close", () => {
      // client disconnected
      try { abortController.abort(); } catch (_) {}
    });

    const messages = [
      { role: "system", content: systemPrompts[lvl] || systemPrompts["1"] },
      ...safeHistory(history),
      { role: "user", content: message || "" },
    ];

    // ✅ Speed tuning: ลด tokens + ลด temperature
    const stream = await client.chat.completions.create(
      {
        messages,
        max_tokens: 80,
        temperature: 0.3,
        stream: true, // streaming via SSE from SDK [1](https://www.npmjs.com/package/openai)[2](https://developers.openai.com/api/docs/guides/streaming-responses)
      },
      { signal: abortController.signal }
    );

    let fullText = "";

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (!delta) continue;
      fullText += delta;
      // ส่งทีละชิ้น
      sseSend(res, "delta", { delta });
    }

    // ===== Optional: synthesize audio AFTER stream complete =====
    // ถ้าไม่ต้องการเสียงตอนท้าย ให้คอมเมนต์ block นี้ได้เลย
    try {
      const textToSpeak = cleanTextForSpeech(fullText);
      if (textToSpeak) {
        const voiceName = getVoiceName(lvl);
        const ssml = `
<speak version="1.0" xml:lang="th-TH">
  <voice name="${voiceName}">
    <prosody rate="-15%">${textToSpeak}</prosody>
  </voice>
</speak>`;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const audioData = await new Promise((resolve, reject) => {
          synthesizer.speakSsmlAsync(
            ssml,
            (result) => {
              synthesizer.close();
              if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
              else reject(result.errorDetails);
            },
            (err) => {
              synthesizer.close();
              reject(err);
            }
          );
        });

        sseSend(res, "audio", { audio: Buffer.from(audioData).toString("base64") });
      }
    } catch (e) {
      // ถ้า TTS พลาด ไม่ต้องทำให้สตรีมพัง ส่ง error event แล้วปิด
      sseSend(res, "warn", { message: "TTS failed", detail: String(e?.message || e) });
    }

    sseSend(res, "done", { done: true });
    return res.end();
  } catch (error) {
    // ถ้าเป็น streaming แล้ว error เกิดหลังส่ง header ไปแล้ว
    try {
      if (res.headersSent) {
        sseSend(res, "error", { message: "ระบบขัดข้อง", detail: String(error?.message || error) });
        return res.end();
      }
    } catch (_) {}

    console.error("Error:", error);
    return res.status(500).json({ text: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง" });
  }
};
``
