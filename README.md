# Asistente conversacional de Registro de Proveedores

**Reto técnico 01 — Periferia IT Group**

Aplicación local para apoyar el proceso de registro de proveedores mediante lectura de solicitudes, mapeo de información corporativa, generación de formularios y preparación de paquetes documentales. La solución separa la lógica de negocio en herramientas tipadas y conserva la decisión de firma o envío bajo control humano.

## 1. Funcionalidades

- Lectura de solicitudes y requisitos por cliente, país y formato.
- Mapeo de campos contra un maestro de datos y un glosario.
- Clasificación de campos completos, faltantes, opcionales y sujetos a confirmación.
- Generación de formularios Excel y PDF.
- Preparación de valores para diligenciamiento manual en portales.
- Construcción de paquetes documentales con checklist de disponibilidad y vigencia.
- Generación de borrador de correo.
- Simulación controlada de envío, sin conexión ni envío real a terceros.
- Registro de ejecuciones y resultados de herramientas.

## 2. Arquitectura y tecnologías

| Componente | Tecnología / responsabilidad |
|---|---|
| Interfaz | HTML, CSS y JavaScript |
| Backend | Node.js, TypeScript y Express |
| Agente | Coordinación del ciclo conversacional y ejecución de herramientas |
| Modo de operación seleccionado | Agente local, determinista y sin consumo de tokens de un proveedor externo |
| Validación de argumentos | Zod |
| Formularios Excel | ExcelJS |
| Formularios PDF | PDFKit |
| Archivos y fixtures | JSON y sistema de archivos local |

La arquitectura separa la interfaz, el backend, el agente, el adaptador de modelo y las herramientas de negocio. Las herramientas son responsables de leer los datos, aplicar reglas y generar artefactos; el agente coordina el flujo y presenta el resultado.

## 3. Requisitos previos

- Windows, Linux o macOS.
- Node.js y npm.
- Git (opcional, para clonar el repositorio).

## 4. Instalación

```bash
git clone https://github.com/michael19881mbo/reto-01-registro-proveedores.git
cd reto-01-registro-proveedores
npm install
```

En Windows PowerShell, utiliza `npm.cmd` cuando la política de ejecución de PowerShell impida ejecutar `npm`.

## 5. Configuración

El modo local es la ruta seleccionada para ejecutar la solución. No requiere una API key ni consume tokens de un proveedor LLM.

Si el proyecto incluye `.env.example`, se puede crear un archivo local:

```powershell
Copy-Item .env.example .env
```

Configuración de referencia para el modo local:

```env
PORT=3000
LLM_PROVIDER=local
MAX_ITERATIONS=25
MAX_SESSION_TOKENS=20000
```

No se deben almacenar secretos en el repositorio, en el frontend ni en los registros de ejecución. El archivo `.env` debe permanecer excluido del control de versiones.

### Decisión sobre Gemini

Durante el desarrollo se exploró inicialmente una ruta de integración con Google Gemini mediante un adaptador compatible con OpenAI. Esa alternativa se descartó para la ejecución final del reto debido al consumo asociado a la tokenización y a los costos que podía generar el ciclo conversacional y de herramientas. Se seleccionó el modo local para disponer de un flujo reproducible, controlable y sin dependencia de una API externa.

La referencia a Gemini corresponde a una alternativa considerada durante el desarrollo; no es el modo operativo seleccionado para esta entrega.

## 6. Ejecución local

Iniciar el servidor de desarrollo:

```powershell
npm.cmd run dev
```

Abrir en el navegador:

`http://localhost:3000`

Endpoint de salud:

`http://localhost:3000/api/health`

Para detener el servidor, presionar `Ctrl + C` en la terminal.

## 7. Compilación y demostración

Compilar TypeScript:

```powershell
npm.cmd run build
```

Ejecutar la demostración:

```powershell
npm.cmd run demo
```

La demostración procesa los casos de prueba en modo local, sin depender de una API externa. El resultado observado fue de **4/4 casos procesados**:

| Caso | País | Formato | Resultado observado |
|---|---|---|---|
| `co-industrias-delta` | Colombia | XLSX | 17 campos completos; Cámara de Comercio vencida; no listo para firma |
| `ec-corp-andina` | Ecuador | PDF | 14 campos completos y 1 opcional no informado; Cámara vencida y certificado tributario no disponible |
| `hn-agroexport-sula` | Honduras | XLSX | 10 campos completos y 1 por validar; Cámara y parafiscales vencidos |
| `pa-logistica-istmo` | Panamá | Portal simulado | 9 campos completos; Cámara de Comercio vencida; no listo para firma |

En los cuatro casos, el resultado reportó que no se realizó ningún envío ni firma. La generación de valores para portal produce una guía Markdown para diligenciamiento manual; no automatiza un portal externo.

## 8. Herramientas del agente

| Herramienta | Responsabilidad |
|---|---|
| `proveedor_leer_solicitud` | Lee la solicitud, el país, el cliente, el formato y los soportes exigidos |
| `proveedor_mapear_campos` | Relaciona los campos solicitados con el maestro y el glosario |
| `proveedor_generar_formulario` | Genera el formulario XLSX, PDF o la guía de valores para portal |
| `proveedor_armar_paquete` | Copia soportes disponibles y prepara checklist y borrador de correo |
| `proveedor_simular_envio` | Revalida las condiciones y crea una constancia local de simulación, si procede |

Las herramientas reciben argumentos validados con Zod y responden con una estructura controlada de éxito o error. La lógica de negocio no debe depender exclusivamente de instrucciones del modelo.

## 9. Estructura de datos y salidas

Los datos de prueba se encuentran en:

`fixtures/reto-01/`

El directorio contiene solicitudes por caso, plantillas, soportes exigidos, maestro de proveedores, repositorio documental e información de glosario.

Los artefactos generados se guardan en:

`out/`

Según el caso, se generan:

- `formulario.xlsx` o `formulario.pdf`.
- `valores-portal.md` para diligenciamiento manual.
- `paquete/checklist.md`.
- Copias de los soportes disponibles.
- `paquete/borrador-correo.md`.
- Registros `log.jsonl`.

`out/`, `dist/`, `node_modules/` y `.env` deben permanecer fuera del repositorio.

## 10. Seguridad y valor agregado

Además de implementar el flujo funcional, se incorporaron controles de seguridad y se ejecutaron análisis sobre el código y sus dependencias.

### Controles de diseño

- **Validación de entradas:** esquemas Zod para los argumentos de las herramientas.
- **Control de fuentes:** los datos se obtienen del maestro y del glosario; no se deben inventar valores para completar formularios.
- **Validación documental:** comprobación de disponibilidad y vigencia de soportes exigidos.
- **Defensa en profundidad:** la herramienta de simulación vuelve a comprobar las condiciones del caso antes de generar la constancia, incluso si se invoca directamente.
- **Confirmación humana:** la simulación exige confirmación explícita; la aplicación no realiza envíos reales ni firmas.
- **Gestión de secretos:** las claves y variables sensibles se mantienen fuera del código y del frontend.
- **Trazabilidad:** las ejecuciones de herramientas se registran para facilitar revisión y auditoría.
- **Separación de responsabilidades:** el agente coordina; las herramientas aplican reglas de negocio y generan artefactos.

### Análisis de seguridad ejecutados

| Análisis | Resultado observado | Alcance |
|---|---|---|
| Semgrep | 74 reglas ejecutadas, 0 hallazgos y 0 errores | Reglas OSS de JavaScript/TypeScript sobre el alcance analizado; no incluyó 484 reglas del conjunto Pro |
| `npm audit` | `found 0 vulnerabilities` | Dependencias auditadas en el momento de la ejecución |
| Prueba adversarial de lógica de negocio | El flujo mantuvo el estado de un soporte vencido y bloqueó la simulación en el escenario probado | Prueba funcional puntual; no es una certificación general frente a todas las técnicas de prompt injection |
| Prueba directa de la herramienta de envío simulado | 4/4 casos rechazados al invocar la herramienta con confirmación, debido a las condiciones documentales de los casos | Comprueba que la validación de negocio también se aplica al invocar la herramienta directamente |
| Verificación de no envío | La demo reportó que no hubo envío ni firma en los cuatro casos | El proceso de demostración no ejecuta acciones externas |

Los resultados son evidencia del alcance concreto de los análisis realizados; no constituyen una certificación de seguridad ni garantizan ausencia total de vulnerabilidades.

## 11. Alcance operativo y decisiones de entrega

- **Ejecución:** local, para demostración y evaluación controlada.
- **Publicación:** se decidió no desplegar una URL pública por restricciones de tiempo y costos. La solución se entrega para ejecución local.
- **Gemini:** se exploró como primera alternativa durante el desarrollo, pero se descartó por el costo asociado a la tokenización; se eligió el modo local.
- **Portales externos:** no se realiza automatización ni envío a portales de terceros. Para Panamá se genera una guía de valores.
- **Firma y envío:** no se realizan operaciones reales. La intervención humana conserva el control de las acciones externas.
- **Sesiones:** el prototipo mantiene el estado conversacional en memoria del proceso.

Para un uso productivo, la solución requeriría incorporar controles organizacionales y operativos como autenticación, autorización, persistencia segura, aislamiento de sesiones, monitoreo y gestión formal de secretos.

## 12. Uso de inteligencia artificial

Se utilizó ChatGPT como apoyo durante el análisis del requerimiento, diseño de la arquitectura, implementación y depuración del código, elaboración de pruebas y documentación. Las propuestas se contrastaron con el código, la compilación y los resultados observados en la ejecución local.

Google Gemini fue considerado como primera ruta de integración durante el desarrollo. La alternativa se abandonó por el consumo de tokens y los costos asociados; la solución final prioriza el agente local.

## 13. Repositorio y entrega

Repositorio:

https://github.com/michael19881mbo/reto-01-registro-proveedores

La ejecución de referencia es local. No se publica una URL de prueba porque se tomó la decisión de no desplegar la aplicación por tiempo y costos.
