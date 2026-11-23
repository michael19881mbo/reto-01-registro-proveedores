import fs from "node:fs/promises";
import path from "node:path";
import {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
} from "./src/tools/proveedor.js";

type Contexto = {
  directory: string;
  sessionId: string;
};

type ResultadoHerramienta = {
  ok: boolean;
  data?: any;
  error?: string;
};

const CASOS = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
] as const;

type Caso = (typeof CASOS)[number];

function interpretarRespuesta(respuesta: string): ResultadoHerramienta {
  try {
    return JSON.parse(respuesta) as ResultadoHerramienta;
  } catch {
    throw new Error("La herramienta devolvió una respuesta que no es JSON válido.");
  }
}

async function registrarEvento(
  rutaLog: string,
  evento: Record<string, unknown>
): Promise<void> {
  await fs.appendFile(
    rutaLog,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...evento,
    })}\n`,
    "utf8"
  );
}

async function ejecutarHerramienta(
  nombre: string,
  herramienta: {
    execute: (args: any, ctx: Contexto) => Promise<string>;
  },
  args: Record<string, unknown>,
  ctx: Contexto,
  rutaLog: string
): Promise<any> {
  const inicio = Date.now();
  let eventoRegistrado = false;

  try {
    const respuesta = await herramienta.execute(args, ctx);
    const resultado = interpretarRespuesta(respuesta);

    await registrarEvento(rutaLog, {
      caso: path.basename(path.dirname(rutaLog)),
      herramienta: nombre,
      estado: resultado.ok ? "OK" : "ERROR",
      duracion_ms: Date.now() - inicio,
      error: resultado.ok ? null : resultado.error ?? "Error no especificado",
    });
    eventoRegistrado = true;

    if (!resultado.ok) {
      throw new Error(resultado.error ?? `La herramienta ${nombre} falló.`);
    }

    return resultado.data;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    if (!eventoRegistrado) {
      await registrarEvento(rutaLog, {
        caso: path.basename(path.dirname(rutaLog)),
        herramienta: nombre,
        estado: "ERROR_EJECUCION",
        duracion_ms: Date.now() - inicio,
        error: mensaje,
      });
    }

    throw new Error(`${nombre}: ${mensaje}`);
  }
}

async function procesarCaso(caso: Caso, directory: string): Promise<void> {
  const salida = path.join(directory, "out", caso);
  await fs.mkdir(salida, { recursive: true });

  const rutaLog = path.join(salida, "log.jsonl");
  const ctx: Contexto = {
    directory,
    sessionId: `demo-${caso}-${Date.now()}`,
  };

  console.log("\n========================================");
  console.log(`CASO: ${caso}`);
  console.log("========================================");

  const solicitud = await ejecutarHerramienta(
    "proveedor_leer_solicitud",
    proveedor_leer_solicitud,
    { caso },
    ctx,
    rutaLog
  );

  if (!Array.isArray(solicitud?.campos)) {
    throw new Error("La lectura de la solicitud no devolvió una lista de campos.");
  }

  const mapeo = await ejecutarHerramienta(
    "proveedor_mapear_campos",
    proveedor_mapear_campos,
    { caso, campos: solicitud.campos },
    ctx,
    rutaLog
  );

  const formulario = await ejecutarHerramienta(
    "proveedor_generar_formulario",
    proveedor_generar_formulario,
    { caso, mapeo },
    ctx,
    rutaLog
  );

  const paquete = await ejecutarHerramienta(
    "proveedor_armar_paquete",
    proveedor_armar_paquete,
    { caso },
    ctx,
    rutaLog
  );

  console.log(`Cliente: ${solicitud.cliente}`);
  console.log(`País: ${solicitud.pais}`);
  console.log(`Formato: ${solicitud.formato}`);
  console.log(`Campos completados: ${mapeo.llenos?.length ?? 0}`);
  console.log(`Campos obligatorios pendientes: ${mapeo.faltantes?.length ?? 0}`);
  console.log(`Campos por validar: ${mapeo.por_validar?.length ?? 0}`);
  console.log(`Campos opcionales no informados: ${mapeo.opcionales_no_informados?.length ?? 0}`);
  console.log(`Formulario: ${formulario.formato} generado`);
  console.log(`Paquete documental: ${paquete.ruta}`);
  console.log(`Listo para firma: ${paquete.listo_para_firma ? "Sí" : "No"}`);
  console.log(`Registro de auditoría: ${rutaLog}`);
  console.log("No se ha realizado ningún envío ni firma.");

  if (paquete.checklist?.length) {
    console.log("Estado documental:");
    for (const item of paquete.checklist) {
      const estado = !item.disponible
        ? "NO DISPONIBLE"
        : item.vencido
          ? "VENCIDO"
          : "DISPONIBLE";
      console.log(`- ${item.soporte}: ${estado}`);
    }
  }
}

async function main(): Promise<void> {
  const directory = process.cwd();
  let fallos = 0;

  console.log("DEMO DIRECTA - REGISTRO DE PROVEEDORES");
  console.log("Sin modelo LLM. Sin envío real. Confirmación humana separada.");

  for (const caso of CASOS) {
    try {
      await procesarCaso(caso, directory);
    } catch (error) {
      fallos += 1;
      console.error(
        `ERROR en ${caso}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("\n========================================");
  console.log(`RESUMEN: ${CASOS.length - fallos}/${CASOS.length} casos procesados`);
  console.log("========================================");

  if (fallos > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Error general de la demo:", error);
  process.exitCode = 1;
});
