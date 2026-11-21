# SOLUCIÓN — Reto técnico 01: Registro como Proveedor

**Proceso:** Selección Periferia IT Group — Equipo Perxia 2.0  
**Solución:** Asistente inteligente para automatización del registro de proveedores  
**Lenguaje:** TypeScript / Node.js  
**Estado:** Prototipo funcional en entorno local; validación final y despliegue pendientes.

---

## 1. Problema en una frase

El proceso de registro de proveedores requiere transcribir repetidamente información corporativa a formularios de diferentes clientes y recopilar soportes documentales, lo que genera demoras, reprocesos y riesgo de errores; esta solución automatiza la lectura, el mapeo y la preparación documental, manteniendo la revisión y aprobación final bajo responsabilidad humana.

## 2. Arquitectura de la solución

La solución utiliza una arquitectura cliente-servidor con un agente conversacional y herramientas especializadas.

### Componentes

- **Frontend:** interfaz web de conversación para recibir instrucciones, presentar respuestas y mostrar el estado de procesamiento.
- **Backend:** servidor Node.js con Express y API HTTP para recibir mensajes y ejecutar el agente.
- **Agente:** componente TypeScript que administra el contexto, consulta el modelo de lenguaje y coordina las herramientas.
- **Modelo de lenguaje:** Google Gemini, mediante un adaptador compatible con la interfaz de Chat Completions del SDK de OpenAI.
- **Herramientas:** funciones especializadas para lectura de solicitudes, mapeo de campos, generación de formularios, preparación de paquetes y simulación de envío.
- **Repositorio de conocimiento:** fixtures con solicitudes, plantillas, glosario, maestro de datos y soportes documentales.
- **Salida:** directorio `out/` para almacenar formularios, paquetes y resultados generados.

### Diagrama lógico

```text
              USUARIO
                 |
                 v
       FRONTEND WEB (CHAT)
       Historial / Entrada
       Indicador de proceso
                 |
                 v
         API BACKEND EXPRESS
             /api/chat
                 |
                 v
          AGENTE CONVERSACIONAL
          agent/prompt.md
                 |
                 v
          ADAPTADOR DE MODELO
             Google Gemini
                 |
                 v
          HERRAMIENTAS ZOD
          proveedor.ts
                 |
       +---------+----------+
       |         |          |
       v         v          v
   Solicitud   Maestro   Soportes
       |         |          |
       +---------+----------+
                 |
                 v
          GENERACIÓN DE
          FORMULARIOS
          Excel / PDF
                 |
                 v
           PAQUETE PARA
              FIRMA
                 |
                 v
             out/
```

Se separan las responsabilidades de la siguiente manera:

- Comportamiento del agente: `agent/prompt.md`.
- Ejecución y herramientas: `src/tools/proveedor.ts`.
- Adaptación del modelo: `src/llm/openai.ts`.
- Coordinación del agente: `src/agent.ts`.
- Backend HTTP: `src/server.ts`.
- Interfaz: `web/index.html`.
- Datos de prueba: `fixtures/reto-01/`.

## 3. Ciclo de ejecución del agente

El flujo previsto es:

1. El usuario selecciona un caso mediante una instrucción en lenguaje natural.
2. El agente interpreta la solicitud y determina qué herramienta debe ejecutar.
3. `proveedor_leer_solicitud` consulta el correo normalizado, el país, el cliente, el formato y los documentos exigidos.
4. `proveedor_mapear_campos` cruza los campos solicitados con el repositorio maestro y el glosario.
5. Los campos se clasifican como llenos, faltantes o sujetos a confirmación.
6. `proveedor_generar_formulario` produce el documento correspondiente según el formato.
7. `proveedor_armar_paquete` recopila los soportes y prepara el checklist y el borrador de correo.
8. La acción de envío se mantiene simulada y requiere confirmación humana explícita.

Se establece un máximo configurable de 25 iteraciones por turno.

Los valores empresariales deben proceder de las herramientas y de las fuentes documentales disponibles. Los campos sin información verificable deben identificarse como faltantes y no completarse mediante inferencias del modelo.

La firma y el envío real no forman parte de la automatización.

## 4. Elección del modelo y costos

**Proveedor configurado:** Google Gemini.  
**Modelo configurado:** `gemini-3.8-flash`.  
**Integración:** SDK OpenAI con endpoint compatible de Google.

Se eligió esta alternativa por su integración mediante una interfaz conocida, disponibilidad de capacidades conversacionales y soporte de llamadas a herramientas.

La configuración se realiza mediante variables de entorno del backend. Las claves API no deben incorporarse al código fuente, frontend, repositorio ni registros.

### Estimación de costos

El costo por caso depende de:

- Tokens de entrada del prompt y del contexto.
- Tokens de salida del modelo.
- Número de iteraciones y llamadas a herramientas.
- Modelo y tarifas vigentes del proveedor.

La estimación debe calcularse con el consumo real medido durante las pruebas:

`Costo por caso = (tokens entrada × tarifa entrada) + (tokens salida × tarifa salida)`

No se declara un costo monetario validado porque aún no se dispone de una medición real de tokens por caso.

## 5. Diseño para portales web

El PRD establece que la automatización de portales web no se implementa en esta versión.

La solución propuesta para una futura fase contempla:

- Automatización mediante navegador controlado, por ejemplo Playwright.
- Lectura de los campos requeridos y preparación de valores para diligenciamiento.
- Validación de los datos antes de cualquier operación.
- Intervención humana para introducir credenciales y resolver mecanismos MFA o CAPTCHA.
- Confirmación humana obligatoria antes de pulsar el botón de envío.

Las credenciales deben mantenerse en un gestor seguro de secretos y nunca almacenarse en el repositorio, prompt o logs.

El agente prepara la información y el humano conserva el control de autenticación y envío.

## 6. Decisiones técnicas y trade-offs

### Decisión 1. Arquitectura basada en herramientas

**Elección:** separar el proceso en herramientas especializadas.

**Alternativa descartada:** realizar todo el proceso dentro de una única instrucción al modelo.

**Justificación:** las herramientas permiten controlar las fuentes de información, validar resultados y mantener trazabilidad.

### Decisión 2. Uso de Zod

**Elección:** validación de argumentos mediante esquemas tipados.

**Alternativa descartada:** aceptar parámetros libres sin validación.

**Justificación:** permite reducir errores de entrada y establecer contratos consistentes para las herramientas.

### Decisión 3. Modelo intercambiable

**Elección:** utilizar un adaptador independiente del resto del agente.

**Alternativa descartada:** acoplar la lógica del negocio directamente a un proveedor.

**Justificación:** permite cambiar de proveedor sin rediseñar las herramientas ni el frontend.

### Decisión 4. Confirmación humana

**Elección:** mantener la firma y el envío bajo control humano.

**Alternativa descartada:** automatizar directamente el cierre del proceso.

**Justificación:** se trata de acciones sensibles que requieren autorización, trazabilidad y responsabilidad humana.

### Decisión 5. Repositorio de archivos

**Elección:** utilizar fixtures y archivos locales para el prototipo.

**Alternativa descartada:** incorporar una base de datos y almacenamiento documental externo desde la primera versión.

**Justificación:** el PRD permite persistencia local y el alcance de la prueba se centra en el flujo del agente.

## 7. Supuestos

1. Los fixtures entregados representan las solicitudes y documentos disponibles para la prueba.
2. El maestro contiene la fuente de verdad para los datos corporativos.
3. Los soportes documentales son representaciones ficticias para el ejercicio.
4. Un campo sin fuente verificable debe quedar como faltante.
5. La información tributaria extranjera requiere confirmación cuando el maestro solo dispone del NIT colombiano.
6. La fecha de ejecución determina la vigencia de los soportes.
7. La firma y el envío final son responsabilidad de una persona autorizada.
8. El portal web se documenta como diseño futuro y no como funcionalidad implementada.

## 8. Cobertura de historias de usuario

| Historia | Estado declarado | Observación |
|---|---|---|
| HU-1 Leer solicitud | Parcial / pendiente de validación integral | Herramienta implementada; falta comprobar ejecución real con el modelo. |
| HU-2 Mapear campos | Parcial / pendiente de validación integral | Herramienta implementada; requiere probar los cuatro casos. |
| HU-3 Generar formulario | Parcial | Se contempla Excel y PDF; validar los archivos resultantes. |
| HU-4 Armar paquete | Parcial | Implementación desarrollada; verificar checklist, vigencias y soportes. |
| HU-5 Manejo de errores | Parcial | Se requiere validar errores del proveedor y continuidad de sesión. |

### Cobertura de formatos

- Excel: prioridad P0.
- PDF: prioridad P1.
- Portal web: no implementado, según alcance del PRD; se documenta el diseño.

### Pendientes para considerar la solución validada

- Ejecutar las cinco herramientas y verificar sus resultados.
- Probar los casos CO, EC, HN y PA.
- Verificar los archivos generados y sus contenidos.
- Confirmar la protección de la acción de envío.
- Ejecutar `demo.ts` sin clave de modelo.
- Publicar la aplicación y probarla desde una URL accesible.

## 9. Uso de inteligencia artificial

Se utilizó ChatGPT como asistente de desarrollo para:

- Interpretación del PRD y descomposición de requisitos.
- Diseño de arquitectura y separación de responsabilidades.
- Construcción y corrección de código TypeScript.
- Orientación en configuración del entorno Node.js.
- Integración del adaptador de modelo.
- Diagnóstico de errores de compilación y configuración.

Se utilizó Google Gemini como proveedor configurado para el agente conversacional.

Las propuestas se revisaron frente a los requisitos del PRD y se ajustaron para mantener el control de datos mediante herramientas, validación tipada y confirmación humana.

La integración con Gemini requiere validación funcional final antes de considerarse operativa.

## 10. Riesgos y mitigaciones para producción

| Riesgo | Mitigación |
|---|---|
| Información incorrecta o inventada por el modelo | Restringir los valores a las fuentes documentales y validar los resultados de herramientas. |
| Exposición de claves API | Variables de entorno, gestor de secretos y exclusión de `.env` del repositorio. |
| Soportes vencidos | Validación automática de `vigencia_hasta` y bloqueo del estado listo para firma. |
| Datos bancarios sensibles | Incluirlos únicamente cuando la plantilla los solicite y excluirlos del borrador de correo. |
| Acciones externas no autorizadas | Confirmación humana explícita y simulación de envío. |
| Cambios en plantillas de clientes | Validación de estructura y manejo controlado de errores. |
| CAPTCHA y MFA en portales | Intervención humana en autenticación y envío. |
| Consumo excesivo del modelo | Límites configurables de iteraciones y tokens. |
| Pérdida o alteración de documentos | Control de acceso, respaldos, integridad y trazabilidad. |
| Uso concurrente en producción | Incorporar autenticación, autorización, sesiones persistentes y controles multiusuario. |

---

**Conclusión**

La solución establece una arquitectura de agente conversacional orientada a automatizar la preparación documental del registro de proveedores, separando el razonamiento del modelo de la ejecución de operaciones mediante herramientas tipadas.

El prototipo se ha construido sobre los fixtures suministrados y cuenta con frontend, backend, herramientas y adaptador de modelo. Su aceptación funcional definitiva queda condicionada a las pruebas integrales, la ejecución de `demo.ts` y la publicación de un enlace accesible.
