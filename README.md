# Asistente Inteligente de Registro de Proveedores

**Reto 01 — Periferia IT Group**

Aplicación conversacional para apoyar el registro de proveedores mediante lectura de solicitudes, identificación de datos corporativos, generación de formularios y preparación de paquetes documentales.

## 1. Arquitectura

- Frontend: HTML, CSS y JavaScript.
- Backend: Node.js, TypeScript y Express.
- Agente: ciclo conversacional con ejecución de herramientas.
- LLM: Google Gemini mediante endpoint compatible con OpenAI.
- Validación: Zod.
- Generación de Excel: ExcelJS.
- Generación de PDF: PDFKit.

## 2. Requisitos previos

- Node.js y npm.
- Git.
- Una API Key de Google AI Studio para ejecutar el agente conversacional.

## 3. Instalación

Clonar el repositorio:

```bash
git clone URL_DEL_REPOSITORIO
cd reto-01
```

Instalar dependencias:

```bash
npm install
```

## 4. Configuración

Crear el archivo de variables de entorno a partir de la plantilla:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Configurar las variables:

```env
PORT=3000
LLM_PROVIDER=gemini
GEMINI_API_KEY=TU_API_KEY
GEMINI_MODEL=gemini-3.8-flash
MAX_ITERATIONS=25
MAX_SESSION_TOKENS=20000
```

La clave API debe mantenerse privada. No debe subirse al repositorio ni incorporarse al frontend.

## 5. Ejecución local

Iniciar el servidor de desarrollo:

```bash
npm run dev
```

En Windows PowerShell también puede utilizarse:

```powershell
npm.cmd run dev
```

Abrir en el navegador:

http://localhost:3000

## 6. Compilación

Verificar tipos TypeScript:

```bash
npx tsc --noEmit
```

Generar la compilación:

```bash
npm run build
```

Iniciar la versión compilada:

```bash
npm start
```

## 7. Casos de prueba

Los fixtures suministrados se encuentran en:

`fixtures/reto-01/`

Casos disponibles:

| Caso | País | Formato |
|---|---|---|
| co-industrias-delta | Colombia | Excel |
| ec-corp-andina | Ecuador | PDF |
| hn-agroexport-sula | Honduras | Excel |
| pa-logistica-istmo | Panamá | Portal |

El agente debe utilizar los datos del repositorio maestro y el glosario de campos. La ausencia de una fuente verificable debe reflejarse como campo faltante.

## 8. Herramientas del agente

| Herramienta | Función |
|---|---|
| proveedor_leer_solicitud | Identifica país, cliente, formato y soportes exigidos. |
| proveedor_mapear_campos | Relaciona los campos solicitados con el maestro de datos. |
| proveedor_generar_formulario | Genera el formulario en el formato correspondiente. |
| proveedor_armar_paquete | Prepara el paquete documental y checklist. |
| proveedor_simular_envio | Genera una simulación de envío con confirmación explícita. |

## 9. Resultados

Los archivos generados se almacenan en el directorio:

`out/`

Este directorio está excluido del control de versiones.

Los paquetes pueden contener formularios, soportes disponibles, checklist documental y borrador de correo.

## 10. Seguridad y controles

- No se inventan datos empresariales.
- Los campos sin fuente se identifican como faltantes.
- Los soportes vencidos deben identificarse.
- La firma y el envío real no se ejecutan automáticamente.
- La simulación de envío requiere confirmación explícita.
- Las claves API se gestionan mediante variables de entorno.
- Los archivos `.env`, `node_modules`, `out` y `dist` no deben publicarse en Git.

## 11. Estado de la implementación

La aplicación cuenta con estructura frontend, backend, herramientas y adaptador de modelo.

La validación integral de las cinco herramientas, los cuatro casos y la generación de documentos debe realizarse antes de declarar la solución como lista para producción.

## 12. Demostración

**URL pública:** Pendiente de despliegue.

**URL local:** http://localhost:3000

La demostración pública se incorporará una vez completada la publicación y validación del servicio.
