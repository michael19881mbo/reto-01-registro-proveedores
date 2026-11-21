import { z } from "zod";
import fs from "node:fs/promises";
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
      const requiere_confirmacion: any[] = [];

      for (const campo of args.campos) {
        const etiqueta = campo.etiqueta ?? campo.nombre ?? campo.campo;
        const ruta = glosario[etiqueta];
        const valor = ruta ? obtenerValor(maestro, ruta) : undefined;

        if (valor === undefined || valor === null || valor === "") {
          faltantes.push({ campo: etiqueta, motivo: "Sin dato en maestro" });
        } else {
          llenos.push({ campo: etiqueta, valor, origen: ruta });
        }
      }

      return { llenos, faltantes, requiere_confirmacion };
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
      const salida = path.join(ctx.directory, "out", args.caso);

      await fs.mkdir(salida, { recursive: true });

      if (solicitud.formato === "xlsx") {
        const ExcelJS = await import("exceljs");
        const archivo = path.join(
          r.carpeta,
          "plantilla-celdas.json"
        );
        const celdas = await leerJson(archivo);
        const libro = new ExcelJS.Workbook();
        const hojaNombres: string[] = [...new Set<string>(celdas.map((c: any) => String(c.hoja)))];

        for (const nombre of hojaNombres) {
          libro.addWorksheet(nombre);
        }

        const mapeo = args.mapeo.llenos?? [];
        for (const campo of celdas) {
          const hoja = libro.getWorksheet(campo.hoja);
          if (!hoja) continue;

          hoja.getCell(campo.celda_etiqueta).value = campo.etiqueta;

          const dato = mapeo.find(
            (item: any) => item.campo === campo.etiqueta
          );
          if (dato) {
            hoja.getCell(campo.celda_valor).value = dato.valor;
          }
        }

        const ruta = path.join(salida, "formulario.xlsx");
        await libro.xlsx.writeFile(ruta);
        return { ruta, formato: "xlsx" };
      }

      if (solicitud.formato === "pdf") {
        const PDFDocument = (await import("pdfkit")).default;
        const campos = await leerJson(
          path.join(r.carpeta, "plantilla-campos.json")
        );

        const ruta = path.join(salida, "formulario.pdf");

        await new Promise<void>((resolve, reject) => {
          const pdf = new PDFDocument();
          const stream = require("node:fs").createWriteStream(ruta);
          pdf.pipe(stream);

          pdf.fontSize(18).text("Formulario de registro de proveedor");
          pdf.moveDown();

          for (const campo of campos) {
            const dato = args.mapeo.llenos?.find(
              (item: any) => item.campo === campo.etiqueta
            );
            pdf.fontSize(11).text(
              `${campo.etiqueta}: ${dato?.valor ?? "PENDIENTE"}`
            );
          }

          pdf.end();
          stream.on("finish", resolve);
          stream.on("error", reject);
        });

        return { ruta, formato: "pdf" };
      }

      const ruta = path.join(salida, "valores-portal.md");
      await fs.writeFile(
        ruta,
        "# Valores para registro en portal\n\n" +
          (args.mapeo.llenos ?? [])
            .map((item: any) => `- ${item.campo}: ${item.valor}`)
            .join("\n"),
        "utf8"
      );

      return { ruta, formato: "portal" };
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
        const soporte = indice.find((item: any) => item.tipo === tipo);
        const vencido =
          soporte?.vigencia_hasta &&
          new Date(soporte.vigencia_hasta) < new Date();

        checklist.push({
          soporte: tipo,
          disponible: Boolean(soporte),
          vencido: Boolean(vencido),
        });

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
            // Se registra la ausencia en el checklist.
          }
        }
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
            .join("\n")
      );

      await fs.writeFile(
        path.join(paquete, "borrador-correo.md"),
        `Para: ${solicitud.de}\nAsunto: Registro de proveedor - ${solicitud.cliente}\n\nAdjuntamos la documentación disponible para el proceso de registro.`
      );

      return { ruta: paquete, listo_para_firma, checklist };
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
        throw new Error("Se requiere confirmación explícita para simular el envío.");
      }

      const ruta = path.join(
        ctx.directory,
        "out",
        args.caso,
        "ENVIO-SIMULADO.md"
      );

      await fs.mkdir(path.dirname(ruta), { recursive: true });
      await fs.writeFile(
        ruta,
        `# Envío simulado\n\nCaso: ${args.caso}\nFecha: ${new Date().toISOString()}\n\nNo se realizó ningún envío real ni firma digital.`
      );

      return { ruta };
    });
  },
};