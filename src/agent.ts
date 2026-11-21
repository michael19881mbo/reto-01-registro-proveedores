
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { enviar } from "./llm/openai.js";

import {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
  proveedor_simular_envio,
} from "./tools/proveedor.js";

// Registro central de herramientas
const herramientasLocales: Record<string, any> = {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
  proveedor_simular_envio,
};

// Convierte los argumentos Zod en JSON Schema compatible con OpenAI
function zodAJsonSchema(args: Record<string, z.ZodType>): any {
  const schema = z.object(args);

  return z.toJSONSchema(schema, {
    target: "draft-7",
  });
}

// Definiciones que recibe el modelo
const definiciones: OpenAI.Chat.Completions.ChatCompletionTool[] =
  Object.entries(herramientasLocales).map(([nombre, herramienta]) => ({
    type: "function",
    function: {
      name: nombre,
      description: herramienta.description,
      parameters: zodAJsonSchema(herramienta.args),
    },
  }));

// Ciclo principal del agente
export async function ejecutarAgente(
  mensaje: string,
  sessionId: string,
  directory: string,
  historial: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
) {
  const prompt = await fs.readFile(
    path.join(process.cwd(), "agent", "prompt.md"),
    "utf8"
  );

  const mensajes: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: prompt,
    },
    ...historial,
    {
      role: "user",
      content: mensaje,
    },
  ];

  const logs: any[] = [];
  const maxIteraciones = Math.min(
    Math.max(Number(process.env.MAX_ITERATIONS || 25), 1),
    25
  );

  for (let i = 0; i < maxIteraciones; i++) {
    const respuesta = await enviar(mensajes, definiciones);

    if (!respuesta) {
      return {
        respuesta: "El modelo no devolvió una respuesta.",
        historial: mensajes,
        logs,
      };
    }

    mensajes.push(respuesta);

    // Si no hay llamadas a herramientas, termina el ciclo
    if (!respuesta.tool_calls?.length) {
      return {
        respuesta: respuesta.content ?? "",
        historial: mensajes,
        logs,
      };
    }

    // Ejecutar las herramientas solicitadas por el modelo
    for (const llamada of respuesta.tool_calls) {
      if (llamada.type !== "function") {
        continue;
      }

      const nombre = llamada.function.name;
      const herramienta = herramientasLocales[nombre];

      if (!herramienta) {
        const resultado = JSON.stringify({
          ok: false,
          error: `Herramienta desconocida: ${nombre}`,
        });

        mensajes.push({
          role: "tool",
          tool_call_id: llamada.id,
          content: resultado,
        });

        logs.push({
          herramienta: nombre,
          argumentos: {},
          resultado,
        });

        continue;
      }

      let argumentos: any;

      try {
        argumentos = JSON.parse(llamada.function.arguments || "{}");
      } catch {
        const resultado = JSON.stringify({
          ok: false,
          error: "Los argumentos enviados por el modelo no son JSON válido.",
        });

        mensajes.push({
          role: "tool",
          tool_call_id: llamada.id,
          content: resultado,
        });

        logs.push({
          herramienta: nombre,
          argumentos: llamada.function.arguments,
          resultado,
        });

        continue;
      }

      // Validación de argumentos con Zod
      const validacion = z.object(herramienta.args).safeParse(argumentos);

      let resultado: string;

      if (!validacion.success) {
        resultado = JSON.stringify({
          ok: false,
          error: "Argumentos inválidos.",
          detalles: validacion.error.issues,
        });
      } else {
        try {
          resultado = await herramienta.execute(validacion.data, {
            directory,
            sessionId,
          });
        } catch (error) {
          resultado = JSON.stringify({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Error ejecutando la herramienta.",
          });
        }
      }

      // Registrar ejecución
      logs.push({
        herramienta: nombre,
        argumentos,
        resultado,
      });

      // Devolver resultado al modelo
      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: resultado,
      });
    }
  }

  return {
    respuesta: "Se alcanzó el límite máximo de iteraciones del agente.",
    historial: mensajes,
    logs,
  };
}
