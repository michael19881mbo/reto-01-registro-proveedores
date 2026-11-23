
import { z } from "zod";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

type Context = {
  directory: string;
  sessionId: string;
};

const casoSchema = z.string().min(1).describe("Identificador del caso");

async function leerJson(ruta: string): Promise<any> {
  return JSON.parse(await fs.readFile(ruta, "utf8"));
}

function respuesta(data: unknown) {
  return JSON.stringify({ ok: true, data });
}

function errorRespuesta(error: unknown) {
  return JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "Error inesperado",
  });
}

async function ejecutar(
  ctx: Context,
  accion: () => Promise<unknown>
): Promise<string> {
  try {
    return respuesta(await accion());
  } catch (error) {
    return errorRespuesta(error);
  }
}

async function rutasCaso(ctx: Context, caso: string) {
  const base = path.join(ctx.directory, "fixtures", "reto-01");
  const carpeta = path.join(base, "casos", caso);

  return {
    base,
    carpeta,
    solicitud: path.join(carpeta, "solicitud.json"),
    maestro: path.join(base, "repositorio", "maestro.json"),
    glosario: path.join(base, "glosario-campos.json"),
    soportes: path.join(base, "repositorio", "soportes", "index.json"),
  };
}

function obtenerValor(obj: any, ruta: string): any {
  return ruta.split(".").reduce((actual, clave) => actual?.[clave], obj);
}

function estadoCampo(mapeo: any, etiqueta: string): string {
  if (mapeo.llenos?.some((item: any) => item.campo === etiqueta)) {
    return "COMPLETADO";
  }

  if (
    mapeo.opcionales_no_informados?.some(
      (item: any) => item.campo === etiqueta
    )
  ) {
    return "NO INFORMADO (OPCIONAL)";
  }

  if (
    mapeo.por_validar?.some(
      (item: any) => item.campo === etiqueta
    )
  ) {
    return "POR VALIDAR OBLIGATORIEDAD";
  }

  if (
    mapeo.faltantes?.some(
      (item: any) => item.campo === etiqueta
    )
  ) {
    return "PENDIENTE";
  }

  return "SIN CLASIFICAR";
}

/**
 * Revalida los requisitos desde los fixtures y el sistema de archivos.
 * Esta comprobación es independiente del estado mantenido por el agente.
 */
async function validarElegibilidadEnvio(
  ctx: Context,
  caso: string
): Promise<void> {
  const r = await rutasCaso(ctx, caso);
  const solicitud = await leerJson(r.solicitud);
  const exigidos = await leerJson(
    path.join(r.carpeta, "soportes-exigidos.json")
  );
  const indice = await leerJson(r.soportes);
  const errores: string[] = [];
  const hoy = new Date();

  // Validar existencia, copia y vigencia de cada soporte exigido.
  const carpetaPaquete = path.join(
    ctx.directory,
    "out",
    caso,
    "paquete"
  );

  for (const tipo of exigidos) {
    const soporte = indice.find((item: any) => item.tipo === tipo);

    if (!soporte?.archivo) {
      errores.push(`Soporte no disponible: ${tipo}`);
      continue;
    }

    const rutaOrigen = path.join(
      r.base,
      "repositorio",
      "soportes",
      soporte.archivo
    );
    const rutaCopia = path.join(carpetaPaquete, soporte.archivo);

    try {
      await fs.access(rutaOrigen);
      await fs.access(rutaCopia);
    } catch {
      errores.push(`Archivo de soporte ausente: ${tipo}`);
      continue;
    }

    if (soporte.vigencia_hasta) {
      const fechaVigencia = new Date(`${soporte.vigencia_hasta}T23:59:59`);
      if (
        Number.isNaN(fechaVigencia.getTime()) ||
        fechaVigencia < hoy
      ) {
        errores.push(`Soporte vencido o con vigencia inválida: ${tipo}`);
      }
    }
  }

  // Reconstruir la clasificación de campos directamente desde las fuentes.
  const maestro = await leerJson(r.maestro);
  const glosario = await leerJson(r.glosario);
  const archivoCampos = path.join(
    r.carpeta,
    solicitud.formato === "xlsx"
      ? "plantilla-celdas.json"
      : "plantilla-campos.json"
  );
  const campos = await leerJson(archivoCampos);

  for (const campo of campos) {
    const etiqueta = campo.etiqueta ?? campo.nombre ?? campo.campo;
    const rutaDato = glosario[etiqueta];
    const valor = rutaDato
      ? obtenerValor(maestro, rutaDato)
      : undefined;
    const sinValor =
      valor === undefined || valor === null || valor === "";

    if (!sinValor) continue;

    if (campo.obligatorio === true) {
      errores.push(`Campo obligatorio pendiente: ${etiqueta}`);
    } else if (campo.obligatorio !== false) {
      errores.push(`Campo por validar: ${etiqueta}`);
    }
  }

  // Verificar que exista el artefacto generado para el formato del caso.
  const nombreFormulario =
    solicitud.formato === "xlsx"
      ? "formulario.xlsx"
      : solicitud.formato === "pdf"
        ? "formulario.pdf"
        : "valores-portal.md";
  const rutaFormulario = path.join(
    ctx.directory,
    "out",
    caso,
    nombreFormulario
  );

  try {
    const info = await fs.stat(rutaFormulario);
    if (!info.isFile() || info.size === 0) {
      errores.push("El formulario generado no existe o está vacío.");
    }
  } catch {
    errores.push("No existe el formulario generado para este caso.");
  }

  if (errores.length > 0) {
    throw new Error(
      "No se puede simular el envío. Validaciones incumplidas:\n- " +
      errores.join("\n- ")
    );
  }
}

export const proveedor_leer_solicitud = {
  description: "Lee la solicitud de registro y sus requisitos.",

  args: {
    caso: casoSchema,
  },

  async execute(
    args: { caso: string },
    ctx: Context
  ): Promise<string> {
    return ejecutar(ctx, async () => {
      const r = await rutasCaso(ctx, args.caso);
      const solicitud = await leerJson(r.solicitud);
      const maestro = await leerJson(r.maestro);

      const exigidos = await leerJson(
        path.join(r.carpeta, "soportes-exigidos.json")
      );

      return {
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        formato: solicitud.formato,

        campos: await leerJson(
          path.join(
            r.carpeta,
            solicitud.formato === "xlsx"
              ? "plantilla-celdas.json"
              : "plantilla-campos.json"
          )
        ),

        soportes: exigidos,
        datos_disponibles: Object.keys(maestro),
      };
    });
  },
};

export const proveedor_mapear_campos = {
  description: "Relaciona los campos solicitados con el maestro de proveedores.",

  args: {
    caso: casoSchema,
    campos: z.array(z.any()).describe("Campos extraídos de la solicitud"),
  },

  async execute(
    args: { caso: string; campos: any[] },
    ctx: Context
  ): Promise<string> {
    return ejecutar(ctx, async () => {
      const r = await rutasCaso(ctx, args.caso);

      const maestro = await leerJson(r.maestro);
      const glosario = await leerJson(r.glosario);

      const llenos: any[] = [];
      const faltantes: any[] = [];
      const opcionales_no_informados: any[] = [];
      const por_validar: any[] = [];
      const requiere_confirmacion: any[] = [];

      for (const campo of args.campos) {
        const etiqueta =
          campo.etiqueta ?? campo.nombre ?? campo.campo;

        const ruta = glosario[etiqueta];
        const valor = ruta
          ? obtenerValor(maestro, ruta)
          : undefined;

        const obligatoriedad = campo.obligatorio;

        if (
          valor === undefined ||
          valor === null ||
          valor === ""
        ) {
          const detalle = {
            campo: etiqueta,
            motivo: ruta
              ? "Sin dato en maestro"
              : "Sin correspondencia en glosario",
          };

          if (obligatoriedad === true) {
            faltantes.push(detalle);
          } else if (obligatoriedad === false) {
            opcionales_no_informados.push(detalle);
          } else {
            por_validar.push({
              ...detalle,
              motivo:
                `${detalle.motivo}. ` +
                "Obligatoriedad no definida en la plantilla",
            });
          }
        } else {
          llenos.push({
            campo: etiqueta,
            valor,
            origen: ruta,
          });
        }
      }

      return {
        llenos,
        faltantes,
        opcionales_no_informados,
        por_validar,
        requiere_confirmacion,
      };
    });
  },
};

export const proveedor_generar_formulario = {
  description: "Genera el formulario de registro en Excel o PDF.",

  args: {
    caso: casoSchema,
    mapeo: z.any().describe("Resultado del mapeo de campos"),
  },

  async execute(
    args: { caso: string; mapeo: any },
    ctx: Context
  ): Promise<string> {
    return ejecutar(ctx, async () => {
      const r = await rutasCaso(ctx, args.caso);

      const solicitud = await leerJson(r.solicitud);

      const salida = path.join(
        ctx.directory,
        "out",
        args.caso
      );

      await fs.mkdir(salida, { recursive: true });

      // GENERACIÓN EXCEL
      if (solicitud.formato === "xlsx") {
        const ExcelJS = (await import("exceljs")).default;

        const celdas = await leerJson(
          path.join(r.carpeta, "plantilla-celdas.json")
        );

        const libro = new ExcelJS.Workbook();

        const hojaNombres: string[] = [
          ...new Set<string>(
            celdas.map((c: any) => String(c.hoja))
          ),
        ];

        for (const nombre of hojaNombres) {
          libro.addWorksheet(nombre);
        }

        for (const campo of celdas) {
          const hoja = libro.getWorksheet(campo.hoja);

          if (!hoja) continue;

          hoja.getCell(campo.celda_etiqueta).value =
            campo.etiqueta;

          hoja.getCell(campo.celda_valor).value =
            estadoCampo(args.mapeo, campo.etiqueta);

          const dato = args.mapeo.llenos?.find(
            (item: any) => item.campo === campo.etiqueta
          );

          if (dato) {
            hoja.getCell(campo.celda_valor).value =
              dato.valor;
          }
        }

        const ruta = path.join(
          salida,
          "formulario.xlsx"
        );

        await libro.xlsx.writeFile(ruta);

        return {
          ruta,
          formato: "xlsx",
        };
      }

      // GENERACIÓN PDF
      if (solicitud.formato === "pdf") {
        const PDFDocument =
          (await import("pdfkit")).default;

        const campos = await leerJson(
          path.join(r.carpeta, "plantilla-campos.json")
        );

        const ruta = path.join(
          salida,
          "formulario.pdf"
        );

        await new Promise<void>((resolve, reject) => {
          const pdf = new PDFDocument();
          const stream = createWriteStream(ruta);

          pdf.pipe(stream);

          pdf
            .fontSize(18)
            .text("Formulario de registro de proveedor");

          pdf.moveDown();

          for (const campo of campos) {
            const dato = args.mapeo.llenos?.find(
              (item: any) => item.campo === campo.etiqueta
            );

            const valor = dato
              ? String(dato.valor)
              : estadoCampo(args.mapeo, campo.etiqueta);

            pdf
              .fontSize(11)
              .text(`${campo.etiqueta}: ${valor}`);
          }

          pdf.end();

          stream.on("finish", resolve);
          stream.on("error", reject);
        });

        return {
          ruta,
          formato: "pdf",
        };
      }

      // GENERACIÓN DE VALORES PARA PORTAL
      const ruta = path.join(
        salida,
        "valores-portal.md"
      );

      const lineas = [
        "# Valores para registro en portal",
        "",
        ...(args.mapeo.llenos ?? []).map(
          (item: any) =>
            `- ${item.campo}: ${item.valor}`
        ),
        "",
        "## Campos pendientes de clasificación",
        "",
        ...(args.mapeo.por_validar ?? []).map(
          (item: any) =>
            `- ${item.campo}: POR VALIDAR OBLIGATORIEDAD`
        ),
        "",
        "## Campos obligatorios pendientes",
        "",
        ...(args.mapeo.faltantes ?? []).map(
          (item: any) =>
            `- ${item.campo}: PENDIENTE`
        ),
        "",
        "## Campos opcionales no informados",
        "",
        ...(args.mapeo.opcionales_no_informados ?? []).map(
          (item: any) =>
            `- ${item.campo}: NO INFORMADO (OPCIONAL)`
        ),
      ];

      await fs.writeFile(
        ruta,
        lineas.join("\n"),
        "utf8"
      );

      return {
        ruta,
        formato: "portal",
      };
    });
  },
};

export const proveedor_armar_paquete = {
  description: "Prepara el paquete documental y su checklist.",

  args: {
    caso: casoSchema,
  },

  async execute(
    args: { caso: string },
    ctx: Context
  ): Promise<string> {
    return ejecutar(ctx, async () => {
      const r = await rutasCaso(ctx, args.caso);

      const solicitud = await leerJson(r.solicitud);

      const exigidos = await leerJson(
        path.join(r.carpeta, "soportes-exigidos.json")
      );

      const indice = await leerJson(r.soportes);

      const paquete = path.join(
        ctx.directory,
        "out",
        args.caso,
        "paquete"
      );

      await fs.mkdir(paquete, { recursive: true });

      const checklist: any[] = [];

      for (const tipo of exigidos) {
        const soporte = indice.find(
          (item: any) => item.tipo === tipo
        );

        let disponible = Boolean(soporte?.archivo);
        let vencido = Boolean(
          soporte?.vigencia_hasta &&
          new Date(soporte.vigencia_hasta) < new Date()
        );

        if (soporte?.archivo) {
          const origen = path.join(
            r.base,
            "repositorio",
            "soportes",
            soporte.archivo
          );

          try {
            await fs.copyFile(
              origen,
              path.join(paquete, soporte.archivo)
            );
          } catch {
            disponible = false;
          }
        } else {
          disponible = false;
        }

        checklist.push({
          soporte: tipo,
          disponible,
          vencido,
        });
      }

      const listo_para_firma = checklist.every(
        (item) => item.disponible && !item.vencido
      );

      await fs.writeFile(
        path.join(paquete, "checklist.md"),

        "# Checklist documental\n\n" +
          checklist
            .map(
              (item) =>
                `- ${item.soporte}: ${
                  !item.disponible
                    ? "NO DISPONIBLE"
                    : item.vencido
                    ? "VENCIDO"
                    : "DISPONIBLE"
                }`
            )
            .join("\n"),

        "utf8"
      );

      await fs.writeFile(
        path.join(paquete, "borrador-correo.md"),

        `Para: ${solicitud.de}\n` +
          `Asunto: Registro de proveedor - ${solicitud.cliente}\n\n` +
          "Adjuntamos la documentación disponible para el proceso de registro.",

        "utf8"
      );

      return {
        ruta: paquete,
        listo_para_firma,
        checklist,
      };
    });
  },
};

export const proveedor_simular_envio = {
  description: "Genera una constancia de simulación de envío tras confirmación explícita.",

  args: {
    caso: casoSchema,
    confirmado: z.boolean().describe("Confirmación explícita del usuario"),
  },

  async execute(
    args: { caso: string; confirmado: boolean },
    ctx: Context
  ): Promise<string> {
    return ejecutar(ctx, async () => {
      if (args.confirmado !== true) {
        throw new Error(
          "Se requiere confirmación explícita para simular el envío."
        );
      }

      // Defensa en profundidad: la herramienta vuelve a validar el caso,
      // aunque se invoque directamente sin pasar por local-agent.ts.
      await validarElegibilidadEnvio(ctx, args.caso);

      const ruta = path.join(
        ctx.directory,
        "out",
        args.caso,
        "ENVIO-SIMULADO.md"
      );

      await fs.mkdir(
        path.dirname(ruta),
        { recursive: true }
      );

      await fs.writeFile(
        ruta,

        `# Envío simulado\n\n` +
          `Caso: ${args.caso}\n` +
          `Fecha: ${new Date().toISOString()}\n\n` +
          "No se realizó ningún envío real ni firma digital.",

        "utf8"
      );

      return { ruta };
    });
  },
};
