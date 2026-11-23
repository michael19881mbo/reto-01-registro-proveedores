
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

type EstadoSesion = {
  caso: string;
  documentosListos: boolean;
  formularioListo: boolean;
  listoParaFirma: boolean;
};

const estadosSesiones = new Map<string, EstadoSesion>();

const herramientas: Record<string, any> = {
  proveedor_leer_solicitud,
  proveedor_mapear_campos,
  proveedor_generar_formulario,
  proveedor_armar_paquete,
  proveedor_simular_envio,
};

const casosDisponibles = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
];

function interpretarResultado(resultado: string): any {
  try {
    return JSON.parse(resultado);
  } catch {
    return {
      ok: false,
      error: "La herramienta devolvió una respuesta inválida.",
    };
  }
}

async function ejecutarHerramienta(
  nombre: string,
  argumentos: any,
  ctx: Context,
  logs: any[]
): Promise<any> {
  const herramienta = herramientas[nombre];

  if (!herramienta) {
    throw new Error(`Herramienta desconocida: ${nombre}`);
  }

  const resultado = await herramienta.execute(argumentos, ctx);
  const datos = interpretarResultado(resultado);

  logs.push({
    herramienta: nombre,
    argumentos,
    resultado,
  });

  return datos;
}

function respuesta(
  mensaje: string,
  logs: any[] = []
) {
  return {
    respuesta: mensaje,
    historial: [],
    logs,
  };
}

export async function ejecutarAgenteLocal(
  mensaje: string,
  sessionId: string,
  directory: string
) {
  const ctx: Context = {
    directory,
    sessionId,
  };

  const texto = mensaje.toLowerCase().trim();
  const logs: any[] = [];

  try {
    // Identificar el caso mencionado.
    const caso = casosDisponibles.find((id) =>
      texto.includes(id)
    );

    // Consultar estado documental sin regenerar el registro.
    const esConsultaEstado =
      /\b(estado|consulta|consultar|verificar|revisar|checklist|documentos|soportes|vencidos|vencido|faltantes|faltante)\b/i.test(texto) ||
      texto.includes("listo para firma");

    if (esConsultaEstado && caso) {
      const paquete = await ejecutarHerramienta(
        "proveedor_armar_paquete",
        { caso },
        ctx,
        logs
      );

      if (!paquete.ok) {
        return respuesta(
          `No fue posible consultar el estado documental: ${paquete.error}`,
          logs
        );
      }

      const checklist = paquete.data.checklist ?? [];

      const vencidos = checklist.filter(
        (item: any) => item.vencido
      );

      const faltantes = checklist.filter(
        (item: any) => !item.disponible
      );

      // La consulta documental actualiza solo el estado de los soportes.
      // La validación del formulario se conserva desde el registro inicial.
      const estadoAnterior = estadosSesiones.get(sessionId);
      const mismoCaso = estadoAnterior?.caso === caso;

      const documentosListos =
        paquete.data.listo_para_firma === true;

      const formularioListo =
        mismoCaso && estadoAnterior?.formularioListo === true;

      const listoParaFirma =
        documentosListos && formularioListo;

      estadosSesiones.set(sessionId, {
        caso,
        documentosListos,
        formularioListo,
        listoParaFirma,
      });

      const lineas = [
        "ESTADO DOCUMENTAL DEL PROVEEDOR",
        "",
        ...checklist.map((item: any) => {
          const estado = !item.disponible
            ? "NO DISPONIBLE"
            : item.vencido
              ? "VENCIDO"
              : "DISPONIBLE";

          return `- ${item.soporte}: ${estado}`;
        }),
        "",
        `Documentos vencidos: ${vencidos.length}`,
        `Documentos faltantes: ${faltantes.length}`,
        `Listo para firma: ${listoParaFirma ? "Sí" : "No"}`,
        "",
        listoParaFirma
          ? "El paquete documental está listo para continuar."
          : "El registro está bloqueado para firma y envío simulado.",
        "",
        "No se ha realizado ningún envío real.",
      ];

      return respuesta(lineas.join("\n"), logs);
    }

    // Confirmación explícita de envío.
    const esConfirmacion =
      /^confirmar\s+env[ií]o\b/i.test(texto);

    if (esConfirmacion) {
      const estado = estadosSesiones.get(sessionId);

      if (!estado) {
        return respuesta(
          "No existe un registro preparado en esta sesión. " +
          "Primero debes iniciar y preparar el registro del proveedor."
        );
      }

      if (caso && caso !== estado.caso) {
        return respuesta(
          "El caso indicado no coincide con el registro preparado en esta sesión."
        );
      }

      if (!estado.listoParaFirma) {
        return respuesta(
          "No se puede simular el envío: existen soportes faltantes o vencidos, campos obligatorios pendientes o campos por validar."
        );
      }

      const envio = await ejecutarHerramienta(
        "proveedor_simular_envio",
        {
          caso: estado.caso,
          confirmado: true,
        },
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
        "La simulación del envío se completó correctamente.\n\n" +
        "No se realizó ningún envío real ni firma digital.",
        logs
      );
    }

    // Si no se identifica el caso, solicitarlo.
    if (!caso) {
      return respuesta(
        "Para iniciar el registro, indica uno de estos casos:\n\n" +
        casosDisponibles.map((id) => `- ${id}`).join("\n")
      );
    }

    // 1. Leer solicitud.
    const lectura = await ejecutarHerramienta(
      "proveedor_leer_solicitud",
      { caso },
      ctx,
      logs
    );

    if (!lectura.ok) {
      return respuesta(
        `No fue posible leer la solicitud: ${lectura.error}`,
        logs
      );
    }

    // 2. Mapear campos.
    const mapeo = await ejecutarHerramienta(
      "proveedor_mapear_campos",
      {
        caso,
        campos: lectura.data.campos,
      },
      ctx,
      logs
    );

    if (!mapeo.ok) {
      return respuesta(
        `No fue posible mapear los campos: ${mapeo.error}`,
        logs
      );
    }

    // 3. Generar formulario.
    const formulario = await ejecutarHerramienta(
      "proveedor_generar_formulario",
      {
        caso,
        mapeo: mapeo.data,
      },
      ctx,
      logs
    );

    if (!formulario.ok) {
      return respuesta(
        `No fue posible generar el formulario: ${formulario.error}`,
        logs
      );
    }

    // 4. Preparar paquete documental.
    const paquete = await ejecutarHerramienta(
      "proveedor_armar_paquete",
      { caso },
      ctx,
      logs
    );

    if (!paquete.ok) {
      return respuesta(
        `No fue posible preparar el paquete: ${paquete.error}`,
        logs
      );
    }

    // Evaluar campos del formulario.
    const camposLlenos =
      mapeo.data.llenos?.length ?? 0;

    const camposFaltantes =
      mapeo.data.faltantes?.length ?? 0;

    const camposPorValidar =
      mapeo.data.por_validar?.length ?? 0;

    const camposPendientesValidacion =
      mapeo.data.por_validar ?? [];

    // Evaluar documentación.
    const documentosListos =
      paquete.data.listo_para_firma === true;

    // El formulario no se considera listo si hay campos
    // obligatorios pendientes o cuya obligatoriedad se desconoce.
    const formularioListo =
      camposFaltantes === 0 &&
      camposPorValidar === 0;

    const listoParaFirma =
      documentosListos && formularioListo;

    // Guardar el estado de la sesión.
    estadosSesiones.set(sessionId, {
      caso,
      documentosListos,
      formularioListo,
      listoParaFirma,
    });

    const mensajeRespuesta = [
      "Registro procesado correctamente.",
      "",
      `Cliente: ${lectura.data.cliente}`,
      `País: ${lectura.data.pais}`,
      `Formato: ${lectura.data.formato}`,
      "",
      `Campos completados: ${camposLlenos}`,
      `Campos obligatorios pendientes: ${camposFaltantes}`,
      `Campos por validar: ${camposPorValidar}`,
      ...(
        camposPorValidar > 0
          ? [
              "",
              "Campos que requieren revisión humana:",
              ...camposPendientesValidacion.map(
                (item: any) => `- ${item.campo}`
              ),
            ]
          : []
      ),
      "",
      "Formulario: Generado",
      "Paquete documental: Generado",
      `Documentación lista: ${documentosListos ? "Sí" : "No"}`,
      `Listo para firma: ${listoParaFirma ? "Sí" : "No"}`,
      "",
      listoParaFirma
        ? "El registro está preparado. Para continuar, escribe: CONFIRMAR ENVIO"
        : "El registro está bloqueado. Revisa los soportes documentales y los campos pendientes o por validar.",
      "",
      "No se ha realizado ningún envío real.",
    ].join("\n");

    // Solicitudes de simulación sin confirmación.
    if (
      texto.includes("simular envio") ||
      texto.includes("simular envío")
    ) {
      return respuesta(
        listoParaFirma
          ? mensajeRespuesta
          : "No es posible solicitar el envío simulado porque el registro no está listo para firma.",
        logs
      );
    }

    return respuesta(mensajeRespuesta, logs);

  } catch (error) {
    return respuesta(
      error instanceof Error
        ? `Error en el agente local: ${error.message}`
        : "Error inesperado en el agente local.",
      logs
    );
  }
}
