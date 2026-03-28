import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "API key is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, payload } = await req.json();

    let prompt = "";
    let bodyContents: any[] = [];

    if (action === "generateSynopsis") {
      const { title, author } = payload;
      prompt = `Sen profesyonel bir kitap özetleyicisin. Bana ${title} - ${author} kitabı hakkında maksimum 2 cümlelik kısa ve çarpıcı bir özet ver. Rol yapma, yorum ekleme. Yanıtı SADECE şu JSON formatında ver, markdown veya backtick kullanma: {"tr": "Türkçe özet", "en": "English summary", "es": "Resumen en español"}`;
      bodyContents = [{ parts: [{ text: prompt }] }];
    } else if (action === "analyzeBookCover") {
      const { base64Image } = payload;
      prompt =
        'Analyze this book cover. Extract the title and author. Return ONLY a valid JSON object with keys "title" and "author". If you cannot find them, return empty strings. Do not use markdown formatting or backticks.';
      bodyContents = [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image.includes(",")
                  ? base64Image.split(",")[1] ?? base64Image
                  : base64Image,
              },
            },
          ],
        },
      ];
    } else if (action === "analyzeBookCoverForSearch") {
      const { base64Image } = payload;
      prompt =
        'Bu resimdeki kitabın adını ve yazarını bul. Sadece "Kitap Adı - Yazar Adı" formatında yanıt ver. Başka bir şey yazma.';
      bodyContents = [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image.includes(",")
                  ? base64Image.split(",")[1] ?? base64Image
                  : base64Image,
              },
            },
          ],
        },
      ];
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({ contents: bodyContents }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});