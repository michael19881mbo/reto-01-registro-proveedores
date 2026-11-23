import {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
  proveedor_simular_envio,
} from "./tools/proveedor.js";

type Context = {
  directory: string;
  sessionId: string;
};

type ResultadoHerramienta<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type EstadoSesion = {
  caso: string;
  listoParaFirma: boolean;
  camposPorConfirmar: number;
};

type Herramienta = {
  execute: (args: Record<string, unknown>, ctx: Context) => Promise<string>;
};

type LogHerramienta = {
  herramienta: string;
  argumentos: Record<string, unknown>;
  ok: boolean;
  resumen: string;
};

const estadosSesiones = new Map<string, EstadoSesion>();

const herramientas: Record<string, Herramienta> = {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
  proveedor_simular_envio,
} as unknown as Record<string, Herramienta>;

const casosDisponibles = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
];

function interpretarResultado<T>(
  resultado: string
): ResultadoHerramienta<T> {
  try {
    const parsed: unknown = JSON.parse(resultado);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "ok" in parsed &&
      parsed.ok === true &&
      "data" in parsed
    ) {
      return parsed as ResultadoHerramienta<T>;
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "ok" in parsed &&
      parsed.ok === false
    ) {
      const error =
        "error" in parsed && typeof parsed.error === "string"
          ? parsed.error
          : "La herramienta informó un error sin descripción.";

      return { ok: false, error };
    }

    return {
      ok: false,
      error: "La herramienta devolvió una estructura de respuesta inválida.",
    };
  } catch {
    return {
      ok: false,
      error: "La herramienta devolvió una respuesta que no es JSON válido.",
    };
  }
}

async function ejecutarHerramienta<T>(
  nombre: string,
  argumentos: Record<string, unknown>,
  ctx: Context,
  logs: LogHerramienta[]
): Promise<ResultadoHerramienta<T>> {
  const herramienta = herramientas[nombre];

  if (!herramienta) {
    const error = `Herramienta desconocida: ${nombre}`;
    logs.push({ herramienta: nombre, argumentos, ok: false, resumen: error });
    return { ok: false, error };
  }

  try {
    const resultado = await herramienta.execute(argumentos, ctx);
    const datos = interpretarResultado<T>(resultado);

    logs.push({
      herramienta: nombre,
      argumentos,
      ok: datos.ok,
      resumen: datos.ok ? "Ejecución correcta" : datos.error,
    });

    return datos;
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error inesperado.";

    logs.push({
      herramienta: nombre,
      argumentos,
      ok: false,
      resumen: mensaje,
    });

    return { ok: false, error: mensaje };
  }
}

function respuesta(mensaje: string, logs: LogHerramienta[] = []) {
  return {
    respuesta: mensaje,
    historial: [],
    logs,
  };
}

function cantidad<T>(valor: T[] | undefined): number {
  return Array.isArray(valor) ? valor.length : 0;
}

export async function ejecutarAgenteLocal(
  mensaje: string,
  sessionId: string,
  directory: string
) {
  const ctx: Context = { directory, sessionId };
  const texto = mensaje.toLowerCase().trim();
  const logs: LogHerramienta[] = [];

  try {
    const caso = casosDisponibles.find((id) => texto.includes(id));
    const esConfirmacion = /^confirmar\s+env[ií]o\b/i.test(texto);

    if (esConfirmacion) {
      const estado = estadosSesiones.get(sessionId);

      if (!estado) {
        return respuesta(
          "No existe un registro preparado en esta sesión. Inicia primero el procesamiento del caso."
        );
      }

      if (caso && caso !== estado.caso) {
        return respuesta(
          "El caso indicado no coincide con el registro preparado en esta sesión."
        );
      }

      if (estado.camposPorConfirmar > 0) {
        return respuesta(
          `El envío sigue bloqueado: hay ${estado.camposPorConfirmar} campo(s) que requieren confirmación antes de continuar.`
        );
      }

      if (!estado.listoParaFirma) {
        return respuesta(
          "El envío sigue bloqueado porque el paquete documental contiene soportes faltantes, inexistentes o vencidos."
        );
      }

      const envio = await ejecutarHerramienta<{ ruta: string }>(
        "proveedor_simular_envio",
        { caso: estado.caso, confirmado: true },
        ctx,
        logs
      );

      if (!envio.ok) {
        return respuesta(
          `No fue posible simular el envío: ${envio.error}`,
          logs
        );
      }

      estadosSesiones.delete(sessionId);

      return respuesta(
        `La simulación del envío se completó correctamente.\nArchivo: ${envio.data.ruta}\n\nNo se realizó ningún envío real ni firma digital.`,
        logs
      );
    }

    if (!caso) {
      return respuesta(
        "Para iniciar el registro, indica uno de estos casos:\n\n" +
          casosDisponibles.map((id) => `- ${id}`).join("\n")
      );
    }

    const lectura = await ejecutarHerramienta<{
      pais: string;
      cliente: string;
      formato: string;
      campos: Array<Record<string, unknown>>;
    }>("proveedor_leer_solicitud", { caso }, ctx, logs);

    if (!lectura.ok) {
      return respuesta(`No fue posible leer la solicitud: ${lectura.error}`, logs);
    }

    const mapeo = await ejecutarHerramienta<{
      llenos?: unknown[];
      faltantes?: unknown[];
      requiere_confirmacion?: unknown[];
    }>(
      "proveedor_mapear_campos",
      { caso, campos: lectura.data.campos },
      ctx,
      logs
    );

    if (!mapeo.ok) {
      return respuesta(`No fue posible mapear los campos: ${mapeo.error}`, logs);
    }

    const formulario = await ejecutarHerramienta<{ ruta: string; formato: string }>(
      "proveedor_generar_formulario",
      { caso, mapeo: mapeo.data },
      ctx,
      logs
    );

    if (!formulario.ok) {
      return respuesta(
        `No fue posible generar el formulario: ${formulario.error}`,
        logs
      );
    }

    const paquete = await ejecutarHerramienta<{
      ruta: string;
      listo_para_firma: boolean;
      checklist?: unknown[];
    }>("proveedor_armar_paquete", { caso }, ctx, logs);

    if (!paquete.ok) {
      return respuesta(
        `No fue posible preparar el paquete documental: ${paquete.error}`,
        logs
      );
    }

    const camposLlenos = cantidad(mapeo.data.llenos);
    const camposFaltantes = cantidad(mapeo.data.faltantes);
    const camposPorConfirmar = cantidad(mapeo.data.requiere_confirmacion);

    const listoParaFirma =
      paquete.data.listo_para_firma === true &&
      camposFaltantes === 0 &&
      camposPorConfirmar === 0;

    estadosSesiones.set(sessionId, {
      caso,
      listoParaFirma,
      camposPorConfirmar,
    });

    const resumen = [
      "Registro procesado.",
      "",
      `Cliente: ${lectura.data.cliente}`,
      `País: ${lectura.data.pais}`,
      `Formato solicitado: ${lectura.data.formato}`,
      "",
      `Campos completados: ${camposLlenos}`,
      `Campos faltantes: ${camposFaltantes}`,
      `Campos que requieren confirmación: ${camposPorConfirmar}`,
      `Formulario generado: ${formulario.data.ruta}`,
      `Paquete documental: ${paquete.data.ruta}`,
      `Listo para firma: ${listoParaFirma ? "Sí" : "No"}`,
      "",
      listoParaFirma
        ? "El paquete cumple las validaciones registradas. Para ejecutar la simulación, escribe CONFIRMAR ENVIO."
        : "No se puede continuar a firma/envío. Revisa los campos pendientes, las confirmaciones y el checklist documental.",
      "",
      "No se ha realizado ningún envío real ni firma digital.",
    ].join("\n");

    return respuesta(resumen, logs);
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error inesperado.";

    return respuesta(`Error en el agente local: ${mensaje}`, logs);
  }
}
