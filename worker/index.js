const ALLOWED_ORIGINS = new Set([
  "https://mattew0205au-wq.github.io",
  "http://localhost:8788",
  "http://127.0.0.1:8788"
]);

const homeworkSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    homework: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          subject: { type: "string" },
          title: { type: "string" },
          due_date: { type: ["string", "null"] },
          estimated_minutes: { type: "integer" },
          priority: { type: "string", enum: ["高", "一般", "低"] },
          notes: { type: "string" }
        },
        required: ["subject", "title", "due_date", "estimated_minutes", "priority", "notes"]
      }
    }
  },
  required: ["homework"]
};

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
    if (request.method === "OPTIONS") {
      if (!allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-App-Password",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "homework-ai" }, 200, allowedOrigin || "*");
    }
    if (url.pathname !== "/api/analyze-homework" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, allowedOrigin || "*");
    }
    if (!allowedOrigin) return json({ error: "Origin not allowed" }, 403, "");
    if (!env.OPENAI_API_KEY || !env.APP_PASSWORD) {
      return json({ error: "後端尚未設定 API Key 或存取密碼。" }, 503, allowedOrigin);
    }
    if (request.headers.get("X-App-Password") !== env.APP_PASSWORD) {
      return json({ error: "存取密碼不正確。" }, 401, allowedOrigin);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 12_000_000) return json({ error: "檔案總量太大，請分批上載（上限約 9 MB）。" }, 413, allowedOrigin);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "無法讀取上載資料。" }, 400, allowedOrigin);
    }

    const text = String(body.text || "").slice(0, 12000);
    const files = Array.isArray(body.files) ? body.files.slice(0, 5) : [];
    const content = [{
      type: "input_text",
      text: "請用繁體中文讀取以下學生功課資料。將每項功課分開整理。只可抽取來源明確提供的截止日期；不確定就填 null，絕對不可猜日期。日期統一 YYYY-MM-DD。估算完成時間用整數分鐘，合理保守估算。不要代做功課，只整理題目、科目及安排資料。若附件與文字有衝突，請在 notes 說明。\n\n使用者文字：\n" + text
    }];

    for (const file of files) {
      if (!file || typeof file.data !== "string" || typeof file.name !== "string") continue;
      const mime = String(file.mime || "");
      const data = file.data.replace(/^data:[^,]+,/, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 5_500_000) continue;
      if (mime.startsWith("image/")) {
        content.push({ type: "input_image", image_url: "data:" + mime + ";base64," + data, detail: "auto" });
      } else if (mime === "application/pdf") {
        content.push({ type: "input_file", filename: file.name.slice(0, 120), file_data: data });
      }
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.AI_MODEL || "gpt-6.2-astra",
          store: false,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "homework_extraction",
              strict: true,
              schema: homeworkSchema
            }
          }
        })
      });
      const result = await response.json();
      if (!response.ok) {
        return json({ error: "AI 服務暫時未能處理，請稍後再試。", detail: result.error?.message || "Upstream error" }, 502, allowedOrigin);
      }
      const outputText = (result.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("");
      if (!outputText) return json({ error: "AI 沒有返回可讀取的結果。" }, 502, allowedOrigin);
      const parsed = JSON.parse(outputText);
      const cleaned = (parsed.homework || []).slice(0, 30).map(item => ({
        subject: String(item.subject || "其他").slice(0, 40),
        title: String(item.title || "").slice(0, 500),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(item.due_date || "") ? item.due_date : null,
        estimated_minutes: Math.max(10, Math.min(240, Number(item.estimated_minutes) || 30)),
        priority: ["高", "一般", "低"].includes(item.priority) ? item.priority : "一般",
        notes: String(item.notes || "").slice(0, 500)
      })).filter(item => item.title);
      return json({ ok: true, homework: cleaned }, 200, allowedOrigin);
    } catch {
      return json({ error: "連接 AI 服務失敗，請檢查後端設定。" }, 502, allowedOrigin);
    }
  }
};
