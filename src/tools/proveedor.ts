import { z } from "zod";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

type Context = {
  directory: string;
  sessionId: string;
};

type CampoPlantilla = {
  etiqueta?: string;
  nombre?: string;
  campo?: string;
  obligatorio?: boolean;
  hoja?: string;
  celda_etiqueta?: string;
  celda_valor?: string;
};

type DatoMaestro = Record<string, unknown>;

type MapeoCampo = {
  campo: string;
  valor?: unknown;
  valor_propuesto?: unknown;
  identificador_requerido?: string;
  origen?: string;
  motivo?: string;
  nota?: string;
};

type Mapeo = {
  llenos: MapeoCampo[];
  faltantes: MapeoCampo[];
  opcionales_no_informados: MapeoCampo[];
  por_validar: MapeoCampo[];
  requiere_confirmacion: MapeoCampo[];
};

type Soporte = {
  tipo: string;
  archivo?: string;
  vigencia_hasta?: string | null;
  descripcion?: string;
};

type ChecklistItem = {
  soporte: string;
  disponible: boolean;
  vencido: boolean;
  vigencia_hasta: string | null;
  descripcion: string;
};

const casoSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/i, "Identificador de caso inválido.")
  .min(1)
  .describe("Identificador del caso");

const campoSchema = z.record(z.string(), z.unknown());
const mapeoItemSchema = z.object({
  campo: z.string(),
  valor: z.unknown().optional(),
  valor_propuesto: z.unknown().optional(),
  origen: z.string().optional(),
  motivo: z.string().optional(),
  nota: z.string().optional(),
  identificador_requerido: z.string().optional(),
}).passthrough();

const mapeoSchema = z.object({
  llenos: z.array(mapeoItemSchema),
  faltantes: z.array(mapeoItemSchema),
  opcionales_no_informados: z.array(mapeoItemSchema),
  por_validar: z.array(mapeoItemSchema),
  requiere_confirmacion: z.array(mapeoItemSchema),
});

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

async function leerJson<T>(ruta: string): Promise<T> {
  return JSON.parse(await fs.readFile(ruta, "utf8")) as T;
}

function respuesta(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

function errorRespuesta(error: unknown): string {
  return JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "Error inesperado.",
  });
}

async function ejecutar(
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

function obtenerValor(objeto: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((actual, clave) => {
    if (!esObjeto(actual)) return undefined;
    return actual[clave];
  }, objeto);
}

function textoCampo(campo: CampoPlantilla): string {
  const etiqueta = campo.etiqueta ?? campo.nombre ?? campo.campo;
  if (typeof etiqueta !== "string" || etiqueta.trim() === "") {
    throw new Error("La plantilla contiene un campo sin etiqueta válida.");
  }
  return etiqueta;
}

function valorVacio(valor: unknown): boolean {
  return valor === undefined || valor === null || valor === "";
}

function lista(mapeo: Mapeo, clave: keyof Mapeo): MapeoCampo[] {
  const valor = mapeo[clave];
  return Array.isArray(valor) ? valor : [];
}

function estadoCampo(mapeo: Mapeo, etiqueta: string): string {
  if (lista(mapeo, "requiere_confirmacion").some((item) => item.campo === etiqueta)) {
    return "REQUIERE CONFIRMACIÓN";
  }
  if (lista(mapeo, "llenos").some((item) => item.campo === etiqueta)) {
    return "COMPLETADO";
  }
  if (lista(mapeo, "opcionales_no_informados").some((item) => item.campo === etiqueta)) {
    return "NO INFORMADO (OPCIONAL)";
  }
  if (lista(mapeo, "por_validar").some((item) => item.campo === etiqueta)) {
    return "POR VALIDAR OBLIGATORIEDAD";
  }
  if (lista(mapeo, "faltantes").some((item) => item.campo === etiqueta)) {
    return "PENDIENTE";
  }
  return "SIN CLASIFICAR";
}

function valorCampo(mapeo: Mapeo, etiqueta: string): unknown {
  return lista(mapeo, "llenos").find((item) => item.campo === etiqueta)?.valor;
}

function esCampoIdentificacionTributaria(etiqueta: string): boolean {
  return /^(nit|ruc|rtn|identificación tributaria|número de identificación fiscal)$/i.test(
    etiqueta.trim()
  );
}

function identificadorPais(pais: string): string | undefined {
  const identificadores: Record<string, string> = {
    CO: "NIT",
    EC: "RUC",
    PE: "RUC",
    PA: "RUC",
    HN: "RTN",
  };
  return identificadores[pais.toUpperCase()];
}

async function cargarPlantilla(
  carpeta: string,
  formato: string
): Promise<CampoPlantilla[]> {
  const nombre = formato === "xlsx" ? "plantilla-celdas.json" : "plantilla-campos.json";
  const campos = await leerJson<unknown>(path.join(carpeta, nombre));
  if (!Array.isArray(campos)) {
    throw new Error(`La plantilla ${nombre} no contiene una lista de campos válida.`);
  }
  return campos.map((campo) => {
    if (!esObjeto(campo)) {
      throw new Error("La plantilla contiene una definición de campo inválida.");
    }
    return campo as CampoPlantilla;
  });
}

function fechaVencida(vigencia: string | null | undefined, hoy: Date): boolean {
  if (!vigencia) return false;
  const fecha = new Date(`${vigencia}T23:59:59`);
  return Number.isNaN(fecha.getTime()) || fecha < hoy;
}

async function validarElegibilidadEnvio(ctx: Context, caso: string): Promise<void> {
  const rutas = await rutasCaso(ctx, caso);
  const solicitud = await leerJson<{ pais: string; formato: string }>(rutas.solicitud);
  const exigidos = await leerJson<string[]>(
    path.join(rutas.carpeta, "soportes-exigidos.json")
  );
  const indice = await leerJson<Soporte[]>(rutas.soportes);
  const errores: string[] = [];
  const hoy = new Date();
  const carpetaPaquete = path.join(ctx.directory, "out", caso, "paquete");

  for (const tipo of exigidos) {
    const soporte = indice.find((item) => item.tipo === tipo);
    if (!soporte?.archivo) {
      errores.push(`Soporte no disponible: ${tipo}`);
      continue;
    }

    const origen = path.join(rutas.base, "repositorio", "soportes", soporte.archivo);
    const copia = path.join(carpetaPaquete, soporte.archivo);

    try {
      await fs.access(origen);
      await fs.access(copia);
    } catch {
      errores.push(`Archivo de soporte ausente: ${tipo}`);
      continue;
    }

    if (fechaVencida(soporte.vigencia_hasta, hoy)) {
      errores.push(`Soporte vencido o con vigencia inválida: ${tipo}`);
    }
  }

  // RN1: un NIT colombiano no se considera RUC/RTN válido en otro país.
  // El valor puede proponerse, pero requiere confirmación humana antes de simular envío.
  if (solicitud.pais.toUpperCase() !== "CO") {
    const idPais = identificadorPais(solicitud.pais);
    if (idPais) {
      errores.push(
        `Identificador tributario pendiente de confirmación: el maestro solo contiene NIT colombiano y el país ${solicitud.pais} requiere ${idPais}.`
      );
    }
  }

  const nombreFormulario =
    solicitud.formato === "xlsx"
      ? "formulario.xlsx"
      : solicitud.formato === "pdf"
        ? "formulario.pdf"
        : "valores-portal.md";
  const rutaFormulario = path.join(ctx.directory, "out", caso, nombreFormulario);

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
  args: { caso: casoSchema },

  async execute(args: { caso: string }, ctx: Context): Promise<string> {
    return ejecutar(async () => {
      const rutas = await rutasCaso(ctx, args.caso);
      const solicitud = await leerJson<{
        pais: string;
        cliente: string;
        formato: string;
        de: string;
      }>(rutas.solicitud);
      const maestro = await leerJson<DatoMaestro>(rutas.maestro);
      const exigidos = await leerJson<string[]>(
        path.join(rutas.carpeta, "soportes-exigidos.json")
      );
      const campos = await cargarPlantilla(rutas.carpeta, solicitud.formato);

      return {
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        formato: solicitud.formato,
        campos,
        soportes: exigidos,
        datos_disponibles: Object.keys(maestro),
      };
    });
  },
};

export const proveedor_mapear_campos = {
  description:
    "Relaciona los campos solicitados con el maestro. Los identificadores extranjeros se proponen como NIT colombiano y requieren confirmación.",
  args: {
    caso: casoSchema,
    campos: z.array(campoSchema).describe("Campos extraídos de la solicitud"),
  },

  async execute(
    args: { caso: string; campos: Array<Record<string, unknown>> },
    ctx: Context
  ): Promise<string> {
    return ejecutar(async () => {
      const rutas = await rutasCaso(ctx, args.caso);
      const solicitud = await leerJson<{ pais: string }>(rutas.solicitud);
      const maestro = await leerJson<DatoMaestro>(rutas.maestro);
      const glosario = await leerJson<Record<string, string>>(rutas.glosario);

      const resultado: Mapeo = {
        llenos: [],
        faltantes: [],
        opcionales_no_informados: [],
        por_validar: [],
        requiere_confirmacion: [],
      };

      const pais = solicitud.pais.toUpperCase();
      const idEsperado = identificadorPais(pais);

      for (const entrada of args.campos) {
        const campo = entrada as CampoPlantilla;
        const etiqueta = textoCampo(campo);
        const ruta = glosario[etiqueta];
        const valor = ruta ? obtenerValor(maestro, ruta) : undefined;
        const obligatorio = campo.obligatorio;

        if (esCampoIdentificacionTributaria(etiqueta) && pais !== "CO" && valor !== undefined) {
          const nota =
            `El maestro solo contiene NIT colombiano (${String(valor)}). ` +
            `El país ${pais} requiere ${idEsperado ?? "un identificador tributario local"}. ` +
            "No se afirma equivalencia legal; requiere validación del usuario.";
          resultado.llenos.push({
            campo: etiqueta,
            valor,
            origen: ruta ?? "maestro.nit",
            nota,
          });
          resultado.requiere_confirmacion.push({
            campo: etiqueta,
            valor_propuesto: valor,
            identificador_requerido: idEsperado,
            motivo: "identificador extranjero",
            nota,
          });
          continue;
        }

        if (valorVacio(valor)) {
          const detalle: MapeoCampo = {
            campo: etiqueta,
            motivo: ruta ? "Sin dato en maestro" : "Sin correspondencia en glosario",
          };
          if (obligatorio === true) {
            resultado.faltantes.push(detalle);
          } else if (obligatorio === false) {
            resultado.opcionales_no_informados.push(detalle);
          } else {
            resultado.por_validar.push({
              ...detalle,
              motivo: `${detalle.motivo}. Obligatoriedad no definida en la plantilla.`,
            });
          }
          continue;
        }

        resultado.llenos.push({
          campo: etiqueta,
          valor,
          origen: ruta,
        });
      }

      return resultado;
    });
  },
};

export const proveedor_generar_formulario = {
  description: "Genera el formulario Excel o PDF, o la lista de valores para portal.",
  args: {
    caso: casoSchema,
    mapeo: mapeoSchema.describe("Resultado del mapeo de campos"),
  },

  async execute(
    args: { caso: string; mapeo: Mapeo },
    ctx: Context
  ): Promise<string> {
    return ejecutar(async () => {
      const rutas = await rutasCaso(ctx, args.caso);
      const solicitud = await leerJson<{ formato: string }>(rutas.solicitud);
      const salida = path.join(ctx.directory, "out", args.caso);
      await fs.mkdir(salida, { recursive: true });

      if (solicitud.formato === "xlsx") {
        const ExcelJS = (await import("exceljs")).default;
        const celdas = await cargarPlantilla(rutas.carpeta, "xlsx");
        const libro = new ExcelJS.Workbook();
        const hojas = [...new Set(celdas.map((campo) => campo.hoja).filter(
          (nombre): nombre is string => typeof nombre === "string" && nombre.length > 0
        ))];

        for (const nombre of hojas) libro.addWorksheet(nombre);

        for (const campo of celdas) {
          if (!campo.hoja || !campo.celda_etiqueta || !campo.celda_valor) {
            throw new Error(`Definición de celda incompleta para ${campo.etiqueta ?? "campo sin nombre"}.`);
          }
          const hoja = libro.getWorksheet(campo.hoja);
          if (!hoja) throw new Error(`No existe la hoja ${campo.hoja} en la plantilla generada.`);

          const etiqueta = textoCampo(campo);
          hoja.getCell(campo.celda_etiqueta).value = etiqueta;
          const dato = valorCampo(args.mapeo, etiqueta);
          const confirmacion = lista(args.mapeo, "requiere_confirmacion").find(
            (item) => item.campo === etiqueta
          );

          hoja.getCell(campo.celda_valor).value =
            dato === undefined ? estadoCampo(args.mapeo, etiqueta) : String(dato);

          if (confirmacion) {
            hoja.getCell(campo.celda_valor).note =
              typeof confirmacion.nota === "string"
                ? confirmacion.nota
                : "Este dato requiere confirmación antes de su uso.";
          }
        }

        const ruta = path.join(salida, "formulario.xlsx");
        await libro.xlsx.writeFile(ruta);
        return { ruta, formato: "xlsx" };
      }

      if (solicitud.formato === "pdf") {
        const PDFDocument = (await import("pdfkit")).default;
        const campos = await cargarPlantilla(rutas.carpeta, "pdf");
        const ruta = path.join(salida, "formulario.pdf");

        await new Promise<void>((resolve, reject) => {
          const pdf = new PDFDocument({ margin: 50 });
          const stream = createWriteStream(ruta);
          pdf.on("error", reject);
          stream.on("error", reject);
          stream.on("finish", resolve);
          pdf.pipe(stream);

          pdf.fontSize(18).text("Formulario de registro de proveedor");
          pdf.moveDown();

          for (const campo of campos) {
            const etiqueta = textoCampo(campo);
            const dato = valorCampo(args.mapeo, etiqueta);
            const confirmacion = lista(args.mapeo, "requiere_confirmacion").find(
              (item) => item.campo === etiqueta
            );
            const valor = dato === undefined ? estadoCampo(args.mapeo, etiqueta) : String(dato);
            pdf.fontSize(11).text(`${etiqueta}: ${valor}`);
            if (confirmacion) {
              pdf.fontSize(9).text(
                typeof confirmacion.nota === "string"
                  ? `ADVERTENCIA: ${confirmacion.nota}`
                  : "ADVERTENCIA: requiere confirmación."
              );
            }
            pdf.moveDown(0.4);
          }
          pdf.end();
        });

        return { ruta, formato: "pdf" };
      }

      const ruta = path.join(salida, "valores-portal.md");
      const lineas = [
        "# Valores para registro en portal",
        "",
        "> El portal no se automatiza. Estos valores son una guía para diligenciamiento manual.",
        "",
        "## Valores propuestos",
        ...args.mapeo.llenos.map((item) => {
          const confirmacion = lista(args.mapeo, "requiere_confirmacion").find(
            (pendiente) => pendiente.campo === item.campo
          );
          return `- **${item.campo}:** ${String(item.valor)}${
            confirmacion ? " — REQUIERE CONFIRMACIÓN" : ""
          }`;
        }),
        "",
        "## Campos que requieren confirmación",
        ...args.mapeo.requiere_confirmacion.map(
          (item) => `- ${item.campo}: ${String(item.nota ?? item.motivo ?? "Pendiente de confirmación.")}`
        ),
        "",
        "## Campos obligatorios pendientes",
        ...args.mapeo.faltantes.map((item) => `- ${item.campo}: PENDIENTE`),
        "",
        "## Campos opcionales no informados",
        ...args.mapeo.opcionales_no_informados.map(
          (item) => `- ${item.campo}: NO INFORMADO (OPCIONAL)`
        ),
        "",
        "## Campos por validar",
        ...args.mapeo.por_validar.map((item) => `- ${item.campo}: ${item.motivo ?? "Por validar"}`),
      ];

      await fs.writeFile(ruta, lineas.join("\n"), "utf8");
      return {
        ruta,
        formato: "portal",
        soportado: false,
        mensaje: "Formato portal no soportado para automatización; se generó una guía manual.",
      };
    });
  },
};

export const proveedor_armar_paquete = {
  description: "Prepara el paquete documental, checklist y borrador de correo.",
  args: { caso: casoSchema },

  async execute(args: { caso: string }, ctx: Context): Promise<string> {
    return ejecutar(async () => {
      const rutas = await rutasCaso(ctx, args.caso);
      const solicitud = await leerJson<{ de: string; cliente: string }>(rutas.solicitud);
      const exigidos = await leerJson<string[]>(
        path.join(rutas.carpeta, "soportes-exigidos.json")
      );
      const indice = await leerJson<Soporte[]>(rutas.soportes);
      const paquete = path.join(ctx.directory, "out", args.caso, "paquete");
      await fs.mkdir(paquete, { recursive: true });

      const checklist: ChecklistItem[] = [];
      const hoy = new Date();

      for (const tipo of exigidos) {
        const soporte = indice.find((item) => item.tipo === tipo);
        let disponible = false;
        let vencido = false;

        if (soporte?.archivo) {
          const origen = path.join(rutas.base, "repositorio", "soportes", soporte.archivo);
          const destino = path.join(paquete, path.basename(soporte.archivo));
          try {
            await fs.access(origen);
            await fs.copyFile(origen, destino);
            disponible = true;
          } catch {
            disponible = false;
          }
          vencido = fechaVencida(soporte.vigencia_hasta, hoy);
        }

        checklist.push({
          soporte: tipo,
          disponible,
          vencido,
          vigencia_hasta: soporte?.vigencia_hasta ?? null,
          descripcion: soporte?.descripcion ?? "Sin descripción en el índice documental.",
        });
      }

      const listoParaFirma = checklist.every((item) => item.disponible && !item.vencido);
      const lineasChecklist = checklist.map((item) => {
        const estado = !item.disponible
          ? "FALTANTE"
          : item.vencido
            ? "VENCIDO"
            : "VIGENTE";
        const vigencia = item.vigencia_hasta ? ` (vigencia: ${item.vigencia_hasta})` : "";
        return `- ${item.soporte}: ${estado}${vigencia} — ${item.descripcion}`;
      });

      await fs.writeFile(
        path.join(paquete, "checklist.md"),
        [
          "# Checklist documental",
          "",
          ...lineasChecklist,
          "",
          `**Estado documental:** ${listoParaFirma ? "Completo y vigente" : "No habilitado para firma"}`,
        ].join("\n"),
        "utf8"
      );

      // RN2: no incorporar datos bancarios en el borrador de correo.
      await fs.writeFile(
        path.join(paquete, "borrador-correo.md"),
        [
          `Para: ${solicitud.de}`,
          `Asunto: Registro de proveedor - ${solicitud.cliente}`,
          "",
          "Estimados,",
          "",
          "Adjuntamos el formulario diligenciado y los soportes documentales disponibles para continuar con el proceso de registro como proveedor.",
          "",
          "Quedamos atentos a sus comentarios.",
          "",
          "Atentamente,",
          "Periferia IT Group",
        ].join("\n"),
        "utf8"
      );

      return {
        ruta: paquete,
        listo_para_firma: listoParaFirma,
        checklist,
        resumen: {
          total: checklist.length,
          disponibles: checklist.filter((item) => item.disponible).length,
          faltantes: checklist.filter((item) => !item.disponible).length,
          vencidos: checklist.filter((item) => item.vencido).length,
        },
      };
    });
  },
};

export const proveedor_simular_envio = {
  description:
    "Genera una constancia de envío simulado. Requiere confirmación explícita y validación independiente.",
  args: {
    caso: casoSchema,
    confirmado: z.boolean().describe("Confirmación explícita del usuario"),
  },

  async execute(
    args: { caso: string; confirmado: boolean },
    ctx: Context
  ): Promise<string> {
    return ejecutar(async () => {
      if (args.confirmado !== true) {
        throw new Error("Se requiere confirmación explícita para simular el envío.");
      }

      await validarElegibilidadEnvio(ctx, args.caso);

      const ruta = path.join(ctx.directory, "out", args.caso, "ENVIO-SIMULADO.md");
      await fs.mkdir(path.dirname(ruta), { recursive: true });
      await fs.writeFile(
        ruta,
        [
          "# Envío simulado",
          "",
          `Caso: ${args.caso}`,
          `Fecha: ${new Date().toISOString()}`,
          "",
          "No se realizó ningún envío real ni firma digital.",
        ].join("\n"),
        "utf8"
      );
      return { ruta };
    });
  },
};
