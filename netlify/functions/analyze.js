import Busboy from "busboy";

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: {
        "content-type":
          event.headers["content-type"] ||
          event.headers["Content-Type"],
      },
    });

    const out = { file: null };

    bb.on("file", (_name, file, info) => {
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("end", () => {
        out.file = {
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve(out));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { file } = await parseMultipart(event);
    if (!file?.buffer) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Missing image file (multipart/form-data field 'image')",
        }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Missing ANTHROPIC_API_KEY env var",
        }),
      };
    }

    const model =
      process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

    const imageBase64 = file.buffer.toString("base64");

    const system =
      "Eres un asistente de visión especializado en jeroglíficos dentro de cartuchos. " +
      "Devuelve SOLO JSON válido.";

    const userText = `Analiza la imagen y devuelve SOLO JSON con este esquema exacto:

{
 "has_cartouche": boolean,
 "cartouche_bbox": {"x":0,"y":0,"w":0,"h":0} | null,
 "signs":[
   {"bbox":{"x":0,"y":0,"w":0,"h":0},"gardiner_id":string|null,"confidence":0.0}
 ],
 "name_candidates":[{"name":string,"confidence":0.0}],
 "transliteration":string|null,
 "overall_confidence":0.0,
 "warnings":[]
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: file.mimeType || "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Anthropic error",
          detail,
        }),
      };
    }

    const data = await resp.json();
    const text =
      data?.content?.find((c) => c.type === "text")?.text ?? "";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Server error",
        detail: String(e),
      }),
    };
  }
};
