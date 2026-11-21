import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ejecutarAgente } from "./agent.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Sesiones independientes en memoria
const sesiones = new Map<string, any[]>();

// Publicar interfaz web
app.use(express.static(path.join(process.cwd(), "web")));

// Endpoint de estado
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    servicio: "Registro de proveedores",
    estado: "activo",
  });
});

// Endpoint principal del chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        ok: false,
        error: "El mensaje es obligatorio.",
      });
    }

    const id =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId
        : randomUUID();

    const historial = sesiones.get(id) || [];

    const resultado = await ejecutarAgente(
      message.trim(),
      id,
      process.cwd(),
      historial
    );

    sesiones.set(id, resultado.historial);

    // Registrar llamadas a herramientas
    const directorioSalida = path.join(process.cwd(), "out");
    await fs.mkdir(directorioSalida, { recursive: true });

    const logPath = path.join(directorioSalida, "log.jsonl");

    for (const log of resultado.logs) {
      await fs.appendFile(
        logPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          sessionId: id,
          ...log,
        }) + "\n",
        "utf8"
      );
    }

    return res.json({
      ok: true,
      sessionId: id,
      respuesta: resultado.respuesta,
      herramientas: resultado.logs,
    });
  } catch (error) {
  console.error("ERROR REAL DEL AGENTE:", error);

  return res.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`Servidor disponible en http://localhost:${PORT}`);
});