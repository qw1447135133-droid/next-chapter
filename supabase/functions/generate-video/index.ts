import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZHANHU_BASE_URL = "http://202.90.21.53:13003";
const VIDU_BASE_URL = "https://api.vidu.cn";

function isViduModel(model: string): boolean {
  return model.startsWith("viduq") || model.startsWith("vidu2");
}

// ====== Vidu API handlers ======

async function viduCreate(apiKey: string, body: any) {
  const { prompt, imageUrl, duration, model, aspectRatio } = body;

  const endpoint = imageUrl
    ? `${VIDU_BASE_URL}/ent/v2/img2video`
    : `${VIDU_BASE_URL}/ent/v2/text2video`;

  // Vidu API prompt limit is 5000 chars
  const truncatedPrompt = (prompt || "").length > 4900 ? (prompt || "").substring(0, 4900) : (prompt || "");

  const payload: Record<string, unknown> = {
    model: model || "viduq3-pro",
    prompt: truncatedPrompt,
    duration: Math.max(4, Math.min(16, duration || 5)),
    resolution: "1080p",
    aspect_ratio: aspectRatio || "16:9",
    audio: true,
  };

  if (imageUrl && typeof imageUrl === "string") {
    payload.images = [imageUrl]; // Vidu accepts URL or base64 in array
  }

  console.log("Vidu create:", endpoint, "model:", payload.model, "has image:", !!imageUrl);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Vidu creation error:", res.status, errText);
    throw new Error(`Vidu 视频生成任务创建失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  console.log("Vidu task created:", JSON.stringify(data));
  return { task_id: data.task_id, status: data.state || "created" };
}

async function viduStatus(apiKey: string, taskId: string) {
  const res = await fetch(`${VIDU_BASE_URL}/ent/v2/tasks/${taskId}/creations`, {
    method: "GET",
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Vidu status error:", res.status, errText);
    throw new Error(`查询 Vidu 视频状态失败 (${res.status})`);
  }

  const data = await res.json();
  // Vidu states: created, queueing, processing, success, failed
  const state = data.state;

  // Map Vidu states to our normalized states
  let status: string;
  if (state === "success") {
    status = "succeeded";
  } else if (state === "failed") {
    status = "failed";
  } else {
    status = "processing";
  }

  // Extract video URL from creations array
  let videoUrl: string | undefined;
  if (state === "success" && data.creations?.length > 0) {
    videoUrl = data.creations[0]?.url;
  }

  return { status, video_url: videoUrl, state };
}

// ====== Seedance (ZhanHu) API handlers ======

async function seedanceCreate(apiKey: string, body: any) {
  const { prompt, imageUrl, duration, model, aspectRatio } = body;

  const formData = new FormData();
  formData.append("model", model || "doubao-seedance-1-5-pro_1080p");
  formData.append("prompt", prompt);
  const validDuration = String(Math.max(4, Math.min(15, Number(duration) || 5)));
  formData.append("seconds", validDuration);
  formData.append("size", aspectRatio || "16:9");

  if (imageUrl && typeof imageUrl === "string") {
    if (imageUrl.startsWith("data:")) {
      const [header, b64] = imageUrl.split(",");
      const mime = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([binary], { type: mime });
      formData.append("first_frame_image", blob, "frame.jpg");
    } else {
      formData.append("first_frame_image", imageUrl);
    }
  }

  console.log("Seedance create, model:", model, "prompt length:", prompt.length, "has image:", !!imageUrl);

  const res = await fetch(`${ZHANHU_BASE_URL}/v1/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Seedance creation error:", res.status, errText);
    throw new Error(`视频生成任务创建失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  console.log("Seedance task created:", JSON.stringify(data));
  return { task_id: data.id, status: data.status, progress: data.progress };
}

async function seedanceStatus(apiKey: string, taskId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${ZHANHU_BASE_URL}/v1/videos/${taskId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        console.error("Seedance status error:", res.status, errText);
        throw new Error(`查询视频状态失败 (${res.status})`);
      }
      return await res.json();
    } catch (fetchErr) {
      console.error(`Status check attempt ${attempt + 1} failed:`, fetchErr);
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return { status: "processing", error_hint: "AI 服务连接超时，将自动重试" };
    }
  }
}

// ====== Main handler ======

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, model } = body;
    const useVidu = isViduModel(model || "");

    // Resolve API key based on provider
    let apiKey: string | undefined;
    if (useVidu) {
      apiKey = Deno.env.get("VIDU_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "Vidu API Key 未配置" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      apiKey = Deno.env.get("JIMENG_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "Seedance API Key (JIMENG) 未配置" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ===== Action: status =====
    if (action === "status") {
      const { taskId, provider } = body;
      if (!taskId) {
        return new Response(JSON.stringify({ error: "缺少 taskId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Use provider hint to determine which API to poll
      const isViduTask = provider === "vidu";

      let statusData;
      if (isViduTask) {
        const viduKey = Deno.env.get("VIDU_API_KEY");
        if (!viduKey) throw new Error("Vidu API Key 未配置");
        statusData = await viduStatus(viduKey, taskId);
      } else {
        const seedKey = Deno.env.get("JIMENG_API_KEY");
        if (!seedKey) throw new Error("Seedance API Key (JIMENG) 未配置");
        statusData = await seedanceStatus(seedKey, taskId);
      }

      return new Response(JSON.stringify(statusData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== Action: models =====
    if (action === "models") {
      const modelsRes = await fetch(`${ZHANHU_BASE_URL}/v1/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!modelsRes.ok) {
        const errText = await modelsRes.text();
        return new Response(JSON.stringify({ error: `查询模型列表失败 (${modelsRes.status}): ${errText}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const modelsData = await modelsRes.json();
      return new Response(JSON.stringify(modelsData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== Action: create =====
    if (!body.prompt) {
      return new Response(JSON.stringify({ error: "缺少视频描述 (prompt)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let result;
    if (useVidu) {
      result = await viduCreate(apiKey, body);
      result.provider = "vidu";
    } else {
      result = await seedanceCreate(apiKey, body);
      result.provider = "seedance";
    }

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-video error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
