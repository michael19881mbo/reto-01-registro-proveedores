
import OpenAI from "openai";

const proveedor = (process.env.LLM_PROVIDER || "openai").toLowerCase();

const esGemini = proveedor === "gemini";

const apiKey = esGemini
  ? process.env.GEMINI_API_KEY
  : process.env.OPENAI_API_KEY;

const model = esGemini
  ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
  : process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!apiKey) {
  throw new Error(
    `Falta configurar la API Key para el proveedor ${proveedor}.`
  );
}

const client = new OpenAI({
  apiKey,
  ...(esGemini
    ? {
        baseURL:
          "https://generativelanguage.googleapis.com/v1beta/openai/",
      }
    : {}),
});

export async function enviar(
  mensajes: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  herramientas: OpenAI.Chat.Completions.ChatCompletionTool[]
) {
  const respuesta = await client.chat.completions.create({
    model,
    messages: mensajes,
    tools: herramientas,
    tool_choice: "auto",
    temperature: 0,
  });

  return respuesta.choices[0]?.message;
}
