# SOLUCIÓN — Reto técnico 01: Registro como Proveedor

**Proceso:** Selección Periferia IT Group — Equipo Perxia 2.0  
**Solución:** Asistente conversacional para apoyar el registro de proveedores  
**Tecnologías:** TypeScript, Node.js, Express, Zod, ExcelJS y PDFKit  
**Modalidad de entrega:** Prototipo funcional de ejecución local

## 1. Problema que resuelve

El registro de proveedores requiere interpretar solicitudes de diferentes clientes, trasladar información corporativa a formularios con estructuras distintas y reunir los soportes documentales exigidos. La ejecución manual de estas tareas puede provocar reprocesos, errores de transcripción y falta de trazabilidad.

La solución implementa un asistente que lee los requerimientos de cada caso, relaciona los campos con fuentes de datos, genera formularios y prepara un paquete documental. La firma y cualquier envío externo permanecen bajo control humano.

## 2. Arquitectura

La solución utiliza una arquitectura modular con interfaz web, backend HTTP, agente coordinador y herramientas especializadas.

```text
┌─────────────────────────────┐
│       Interfaz web          │
│     HTML / CSS / JS         │
└──────────────┬──────────────┘
               │ HTTP / JSON
┌──────────────▼──────────────┐
│       Backend Express       │
│  /api/chat  /api/health     │
│  gestión de sesiones        │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│       Agente local          │
│ coordinación del flujo      │
│ control de iteraciones      │
│ interpretación de resultados│
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│     Herramientas Zod        │
│ leer solicitud              │
│ mapear campos               │
│ generar formulario          │
│ armar paquete                │
│ simular envío                │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ Datos y artefactos locales  │
│ fixtures/   repositorio/    │
│ out/        log.jsonl       │
└─────────────────────────────┘
```

### 2.1 Componentes

- **Frontend:** interfaz conversacional para enviar instrucciones y visualizar resultados.
- **Backend:** Node.js, TypeScript y Express. Expone el chat y el endpoint de salud.
- **Agente:** coordina el flujo, conserva el contexto de sesión y decide qué herramientas ejecutar.
- **Herramientas:** encapsulan las operaciones de lectura, mapeo, generación documental, preparación del paquete y simulación.
- **Validación:** Zod valida los argumentos recibidos por las herramientas.
- **Persistencia de artefactos:** el prototipo utiliza archivos locales y fixtures JSON.
- **Generación documental:** ExcelJS produce archivos XLSX y PDFKit produce PDF.
- **Trazabilidad:** se registran las ejecuciones de herramientas en archivos JSONL.

### 2.2 Responsabilidades principales del código

| Archivo / ruta | Responsabilidad |
|---|---|
| `src/server.ts` | Servidor Express, endpoints y sesiones |
| `src/agent.ts` | Coordinación del ciclo del agente y ejecución de herramientas |
| `src/local-agent.ts` | Flujo local determinista y control de estado conversacional |
| `src/tools/proveedor.ts` | Reglas de negocio y herramientas de registro |
| `src/llm/openai.ts` | Adaptador de proveedor considerado durante la etapa de desarrollo |
| `agent/prompt.md` | Instrucciones del agente |
| `web/` | Interfaz de usuario |
| `fixtures/reto-01/` | Solicitudes, plantillas, maestro, glosario y soportes de prueba |
| `out/` | Formularios, paquetes y registros generados |

## 3. Ciclo del agente

1. El usuario solicita procesar un caso de registro.
2. El agente identifica el caso y obtiene la solicitud correspondiente.
3. `proveedor_leer_solicitud` lee el cliente, país, formato, campos y soportes exigidos.
4. `proveedor_mapear_campos` contrasta los campos con el maestro de datos y el glosario.
5. La información se clasifica según su disponibilidad, obligatoriedad y necesidad de confirmación.
6. `proveedor_generar_formulario` produce el archivo Excel o PDF; para portales produce un archivo de valores que sirve como guía manual.
7. `proveedor_armar_paquete` reúne los soportes disponibles, genera el checklist y prepara el borrador de correo.
8. El agente presenta un resumen del resultado y el estado documental.
9. La herramienta de simulación vuelve a validar las condiciones del caso antes de generar una constancia local. No se envía información a terceros ni se ejecuta firma digital.

El límite de iteraciones del agente se configura mediante variables de entorno, con un máximo operativo definido en el código. Las herramientas devuelven resultados estructurados de éxito o error para que un fallo pueda comunicarse sin convertirlo en una acción externa.

## 4. Herramientas implementadas

| Herramienta | Entrada principal | Responsabilidad |
|---|---|---|
| `proveedor_leer_solicitud` | Identificador del caso | Recuperar solicitud, campos y soportes exigidos |
| `proveedor_mapear_campos` | Caso y campos | Consultar maestro y glosario, clasificar los resultados y señalar confirmaciones |
| `proveedor_generar_formulario` | Caso y resultado del mapeo | Generar XLSX, PDF o guía Markdown para portal |
| `proveedor_armar_paquete` | Identificador del caso | Copiar soportes, calcular estado documental y generar checklist y borrador |
| `proveedor_simular_envio` | Caso y confirmación explícita | Revalidar reglas y generar una constancia local de simulación cuando corresponde |

Las herramientas reciben esquemas Zod y devuelven respuestas estructuradas. La lógica sensible —por ejemplo, la elegibilidad documental— se valida en la herramienta y no se delega únicamente a la respuesta conversacional del agente.

## 5. Casos de prueba y resultados

La demostración local procesó los cuatro casos incluidos en los fixtures:

| Caso | País | Formato | Resultado de la ejecución |
|---|---|---|---|
| `co-industrias-delta` | Colombia | XLSX | 17 campos completos. Cámara de Comercio vencida. No listo para firma |
| `ec-corp-andina` | Ecuador | PDF | 14 campos completos y 1 opcional no informado. Cámara vencida y certificado de cumplimiento tributario no disponible |
| `hn-agroexport-sula` | Honduras | XLSX | 10 campos completos y 1 campo por validar. Cámara de Comercio y parafiscales vencidos |
| `pa-logistica-istmo` | Panamá | Portal simulado | 9 campos completos. Cámara de Comercio vencida. No listo para firma |

**Resultado global de la demo: 4/4 casos procesados.**

En los cuatro resultados, la demostración indicó que no se realizó ningún envío ni firma. Para el escenario de portal, se genera `valores-portal.md` como material de apoyo para el diligenciamiento manual; no se realiza automatización del sitio externo.

### 5.1 Reglas de negocio relevantes

- Los datos de los formularios proceden del maestro y del glosario configurados en los fixtures.
- Los campos sin fuente suficiente se identifican en lugar de inventar información.
- El identificador tributario se trata según el país. Cuando el maestro solo contiene el NIT colombiano y el caso corresponde a otro país, el valor se presenta como identificador extranjero sujeto a confirmación; no se afirma equivalencia legal automática con RUC o RTN.
- Los datos bancarios se incorporan únicamente cuando el formulario los solicita y no se incluyen en el borrador de correo.
- Los soportes exigidos se clasifican por disponibilidad y vigencia.
- Los soportes exigidos ausentes o vencidos impiden marcar el paquete como listo para firma.
- La generación de una constancia de envío es una simulación local, no una integración con correo, firma electrónica o portal externo.

## 6. Análisis de seguridad y valor agregado

La solución incorpora una capa de revisión de seguridad además de la funcionalidad de registro. El objetivo fue comprobar controles básicos de entrada, dependencias, lógica de negocio y resistencia del flujo frente a instrucciones que intenten omitir restricciones documentales.

### 6.1 Validación de entradas y contratos de herramientas

Se utiliza Zod para definir y validar los argumentos de las herramientas antes de su ejecución. Esto reduce la posibilidad de procesar estructuras inesperadas y mantiene contratos explícitos entre el agente y la lógica de negocio.

Las herramientas encapsulan los errores y responden con una estructura controlada:

- `ok: true` con los datos generados.
- `ok: false` con una descripción del error.

### 6.2 Defensa en profundidad en acciones sensibles

La simulación de envío exige confirmación explícita y realiza una nueva validación dentro de la propia herramienta. Este control es importante porque una regla sensible no debe depender solamente de que el agente haya seguido el flujo esperado.

La prueba de invocación directa de `proveedor_simular_envio` con confirmación explícita fue rechazada en los cuatro casos de prueba debido a sus condiciones documentales. Resultado observado: **4/4 bloqueos correctos**.

No se generó un envío real. La constancia `ENVIO-SIMULADO.md` solo representa una operación simulada y se crea únicamente cuando la herramienta permite continuar.

### 6.3 Prueba adversarial de lógica de negocio

Se probó una instrucción que solicitaba ignorar las restricciones, marcar documentos vencidos como vigentes y continuar con el envío.

En el escenario ejecutado, el flujo conservó el estado vencido del soporte de Cámara de Comercio, mantuvo el caso como no listo para firma y no realizó envío.

Esta prueba aporta evidencia de que la lógica documental prevalece frente a esa instrucción concreta. No debe interpretarse como una certificación general contra todas las técnicas de prompt injection.

### 6.4 Análisis estático con Semgrep

Se ejecutó Semgrep con reglas OSS para JavaScript y TypeScript sobre el alcance analizado.

| Indicador | Resultado |
|---|---:|
| Reglas ejecutadas | 74 |
| Hallazgos | 0 |
| Errores de análisis | 0 |

El análisis no incluyó 484 reglas disponibles en el conjunto Pro. Por tanto, el resultado representa el alcance de reglas ejecutado y no una auditoría exhaustiva del código.

### 6.5 Auditoría de dependencias

Se ejecutó:

```powershell
npm.cmd audit
```

Resultado observado:

```text
found 0 vulnerabilities
```

Este resultado corresponde al árbol de dependencias analizado en el momento de la ejecución. Debe repetirse cuando se actualicen dependencias.

### 6.6 Protección de secretos y exposición

- Las claves de proveedores externos no deben incluirse en código fuente, frontend ni logs.
- `.env` se excluye del control de versiones.
- `node_modules/`, `dist/` y `out/` se mantienen fuera del repositorio.
- La entrega no publica un servicio accesible desde Internet; se ejecuta localmente.
- El flujo de demo no ejecuta envíos ni firmas.

### 6.7 Resumen del valor agregado de seguridad

| Área | Control o análisis | Evidencia |
|---|---|---|
| Validación de entradas | Esquemas Zod | Contratos tipados en las herramientas |
| Lógica de negocio | Revalidación en la herramienta de simulación | 4/4 invocaciones directas bloqueadas por condiciones documentales |
| Resistencia a instrucciones adversariales | Prueba de intento de omitir vigencia documental | El soporte vencido mantuvo su estado y bloqueó el caso probado |
| Código fuente | Semgrep OSS | 74 reglas, 0 hallazgos, 0 errores |
| Dependencias | `npm audit` | 0 vulnerabilidades reportadas |
| Secretos | Exclusión de `.env` y uso de variables de entorno | Configuración local fuera del repositorio |
| Acciones externas | Confirmación y simulación local | Sin envío real ni firma digital |

Estos resultados describen los controles y pruebas realizados; no equivalen a una certificación de seguridad ni garantizan ausencia total de vulnerabilidades.

## 7. Modelo de lenguaje, decisión de arquitectura y costos

### 7.1 Ruta explorada: Google Gemini

Durante la primera etapa del desarrollo se consideró integrar Google Gemini mediante un adaptador compatible con la API de OpenAI. La idea inicial era delegar al modelo la interpretación de instrucciones y la selección de herramientas.

Durante el desarrollo se evaluó el impacto del ciclo de conversación y llamadas a herramientas sobre la tokenización. El consumo potencial de tokens y los costos asociados hicieron que esta ruta no fuera la más conveniente para el alcance y el tiempo disponible.

### 7.2 Decisión final: agente local

Se optó por el modo local determinista para la ejecución de la solución. Esta decisión permite:

- Reproducir los casos sin depender de conectividad con un proveedor externo.
- Evitar consumo de tokens y costos por llamada.
- Mantener el flujo de negocio bajo control del código.
- Ejecutar la demo sin API keys.
- Facilitar la evaluación de resultados y la repetición de escenarios.

Gemini queda documentado como una alternativa considerada durante el desarrollo, no como proveedor activo de la entrega.

### 7.3 Estimación de costos

El modo local no genera costos variables por token ni requiere una API key. Su ejecución utiliza los recursos de la máquina donde se inicia el proyecto. No se presenta una cifra monetaria de consumo local porque depende del hardware, el tiempo de ejecución y el entorno del evaluador.

## 8. Diseño futuro para portales web

La solución no automatiza portales externos. Para un desarrollo posterior se plantea una integración controlada con automatización de navegador, por ejemplo Playwright:

1. Identificar los campos del portal y mapearlos con los datos previamente verificados.
2. Presentar al usuario una vista previa antes de diligenciar.
3. Permitir que el usuario ingrese credenciales directamente en el portal.
4. Mantener MFA y CAPTCHA bajo intervención humana.
5. Solicitar confirmación humana inmediatamente antes del envío.
6. Registrar la operación y su resultado sin almacenar credenciales.

El agente no debe recibir, almacenar ni escribir contraseñas en prompts, repositorios o logs. La persona autorizada debe conservar el control de autenticación y envío.

## 9. Decisiones técnicas y trade-offs

### 9.1 Herramientas especializadas

Se dividió el proceso en cinco herramientas para aislar responsabilidades y permitir validar cada operación. El costo es una mayor cantidad de contratos y coordinación; el beneficio es trazabilidad y separación de la lógica de negocio.

### 9.2 Ejecución local determinista

Se seleccionó el modo local frente a la integración externa considerada inicialmente. Se renunció a la flexibilidad de interpretación de un LLM externo para priorizar reproducibilidad, control del flujo y ausencia de costos de tokenización.

### 9.3 Validación con Zod

Los argumentos se validan antes de ejecutar las herramientas. Esto agrega definición de esquemas, pero reduce ambigüedad y errores de entrada.

### 9.4 Confirmación humana

Las operaciones externas no se ejecutan automáticamente. Se prioriza el control humano por el impacto que puede tener un registro incorrecto o un envío no autorizado.

### 9.5 Archivos locales

Los fixtures y resultados se almacenan en el sistema de archivos. Esta decisión simplifica la demostración; un entorno productivo requeriría almacenamiento persistente, control de acceso y políticas de retención.

### 9.6 No publicación de la aplicación

Se decidió no realizar un despliegue público por restricciones de tiempo y costos. La entrega se orienta a ejecución y demostración local, evitando asumir gastos de infraestructura y configuración de publicación dentro del tiempo del reto.

## 10. Supuestos y alcance

- Los fixtures representan los casos y documentos de prueba entregados para el reto.
- El maestro de datos es la fuente de referencia para completar información empresarial.
- El glosario establece las correspondencias entre etiquetas de formularios y campos del maestro.
- Las fechas de vigencia registradas en el índice documental se utilizan para clasificar los soportes.
- La guía para portales es un artefacto de apoyo manual y no implica integración con el portal.
- No se envían correos, no se firman documentos y no se transmiten datos a clientes reales.
- El modo local es la modalidad de operación elegida para esta entrega.

## 11. Cobertura funcional

| Requisito | Implementación / resultado |
|---|---|
| Lectura de solicitud | Herramienta `proveedor_leer_solicitud` |
| Mapeo de campos | Herramienta `proveedor_mapear_campos`, maestro y glosario |
| Tratamiento de campos tributarios | Regla por país y marca de confirmación para identificador extranjero |
| Generación Excel | Implementada y ejecutada en casos XLSX |
| Generación PDF | Implementada y ejecutada en caso PDF |
| Salida para portal | `valores-portal.md` para diligenciamiento manual |
| Preparación documental | Paquete, checklist y copias de soportes disponibles |
| Borrador de correo | Generación local sin envío |
| Simulación de envío | Confirmación explícita y revalidación en la herramienta |
| Demo de escenarios | 4/4 casos procesados |
| API de salud | `GET /api/health` |
| API de conversación | `POST /api/chat` |
| Análisis estático | Semgrep: 74 reglas, 0 hallazgos, 0 errores |
| Auditoría de dependencias | `npm audit`: 0 vulnerabilidades reportadas |
| Prueba de lógica de negocio | 4/4 invocaciones directas de simulación bloqueadas por condiciones documentales |
| Publicación | Entrega local por decisión de tiempo y costos |

## 12. Uso de inteligencia artificial

ChatGPT se utilizó como apoyo durante el análisis del requerimiento, diseño de arquitectura, implementación y depuración de código, elaboración de pruebas y redacción de documentación. Las recomendaciones se contrastaron con el código y con los resultados obtenidos en el entorno local.

Google Gemini se consideró como primera ruta de integración durante el desarrollo. La alternativa se descartó por el impacto de la tokenización y los costos asociados. Por ese motivo, se optó por el agente local determinista para la entrega.

La asistencia de IA no sustituye la revisión técnica ni la responsabilidad sobre el código entregado. El equipo debe poder explicar la arquitectura, las reglas de negocio y los controles implementados.

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación / tratamiento |
|---|---|
| Información empresarial incorrecta | Uso de maestro y glosario; identificación de campos sin fuente |
| Identificador tributario extranjero | Marcar el valor de origen colombiano como sujeto a confirmación; no afirmar equivalencia legal |
| Soportes vencidos o ausentes | Checklist documental y bloqueo de la condición de firma |
| Envío no autorizado | Confirmación explícita y simulación local; no hay envío real |
| Instrucciones para omitir reglas | Validación de negocio en la herramienta y prueba adversarial puntual |
| Argumentos inesperados | Validación de esquemas con Zod |
| Secretos expuestos | Variables de entorno y exclusión de `.env` del repositorio |
| Vulnerabilidades en dependencias | Ejecución de `npm audit` |
| Errores estáticos en código | Análisis Semgrep dentro del conjunto de reglas disponible |
| Acceso no autorizado en un futuro despliegue | Mantener la entrega local; incorporar autenticación y autorización antes de exponerla públicamente |
| Pérdida de sesión al reiniciar | Sesiones en memoria; una versión productiva requeriría persistencia |
| Cambios en portales de terceros | Guía manual; cualquier automatización futura debe contemplar revisión humana y cambios de interfaz |

## 14. Decisión de publicación

La aplicación se entrega para ejecución local. Se decidió no realizar publicación en una URL pública debido al tiempo disponible y a los costos de infraestructura y operación. Esta decisión evita presentar como desplegado un servicio que no se publicó y permite reproducir la solución desde el repositorio.

## 15. Conclusión

Se implementó un asistente local para apoyar el registro de proveedores mediante herramientas especializadas, mapeo de información, generación de formularios y preparación documental. La demostración procesó los cuatro casos disponibles y mantuvo el control de firma y envío fuera de la automatización.

Como valor agregado, se incorporaron validaciones tipadas, revalidación de acciones sensibles, trazabilidad y análisis de seguridad con Semgrep, `npm audit` y una prueba adversarial de lógica de negocio. Los resultados se documentan con su alcance concreto y sin presentarlos como una certificación integral.

La decisión de arquitectura priorizó la ejecución local para evitar el costo de tokenización asociado a la alternativa Gemini explorada inicialmente. Asimismo, se decidió no desplegar públicamente la aplicación por restricciones de tiempo y costos.
