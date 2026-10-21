// Everything the portfolio chatbot knows about Ignacio. It is built from the
// site (index.html, smartops/index.html) and the CV in /cv. When the site or
// the CV changes, update this text too; the bot only answers from what is here.
// Files starting with "_" inside /api are not exposed as endpoints by Vercel.

export const KNOWLEDGE = `
# Ignacio Sánchez Greppi

- Rol: Full Stack Developer · AI Automation.
- Ubicación: Montevideo, Uruguay (GMT-3, horario compatible con Estados Unidos).
- Idiomas: español nativo, inglés intermedio avanzado (B2).
- Busca: un rol full-time, presencial en Montevideo o remoto (abierto a las dos opciones). También toma proyectos freelance. Está disponible ("Open to work").
- Contacto: email isanchez.workmail@gmail.com · LinkedIn https://www.linkedin.com/in/sanchezign/ · GitHub https://github.com/sanchezign · Web https://www.sanchezign.dev
- CV para descargar: https://www.sanchezign.dev/cv/ignacio-sanchez-cv-es.pdf (español) y https://www.sanchezign.dev/cv/ignacio-sanchez-cv-en.pdf (inglés).
- Experiencia: más de 3 años desarrollando para clientes (desde 2023).

## Presentación

Diseña y desarrolla sitios y aplicaciones web completos. Desde 2023 acompaña a cada cliente desde la primera idea hasta que el proyecto está online y funcionando, y construye agentes de IA que automatizan tareas de negocios reales. Trabaja con Node.js, TypeScript, React y Next.js, y elige las herramientas que mejor se adaptan a cada proyecto. Su proyecto más completo es SmartOps Agent, un agente de IA respaldado por más de 2.100 tests automatizados y CI/CD.

## Perfil profesional (del CV)

Full Stack Developer especializado en desarrollo web y automatización con IA. Desde 2023 construye sitios y aplicaciones para clientes freelance y los lleva a producción con Node.js, TypeScript, React y Next.js. Desarrolló SmartOps Agent, un agente de IA para WhatsApp con Claude y n8n respaldado por más de 2.100 tests automatizados y CI/CD, y aplicó esa experiencia en una automatización real para una empresa a través de Workana. Busca un rol estable donde sumar desarrollo full stack con foco en calidad, seguridad y resultados.

## Habilidades técnicas

- Lenguajes: JavaScript, TypeScript, SQL, HTML5, CSS3.
- Frontend: React, Next.js, Astro, Vite, Tailwind CSS, shadcn/ui, TanStack Query, SASS, Bootstrap.
- Backend: Node.js, Express, APIs REST, GraphQL, Prisma, Zod, JWT, Passport.js, Socket.io.
- IA y automatización: Claude API (Anthropic SDK), agentes de IA, n8n, salida estructurada, defensa contra prompt injection, Whisper, WhatsApp Business Cloud API, Model Context Protocol (MCP), Claude Code.
- Bases de datos: PostgreSQL, MongoDB, MySQL, Firebase.
- Testing: Vitest, Playwright, Jest, Mocha, Chai, Supertest, Postman, mutation testing, accesibilidad con axe.
- DevOps: Docker, Docker Compose, GitHub Actions (CI/CD), Git, GitHub, Vercel, Netlify, Oracle Cloud, Caddy.
- Metodologías y diseño: Scrum, Kanban, Jira, Trello, Figma, identidad de marca.

## Preguntas frecuentes (de la web)

- Tecnologías: JavaScript y TypeScript en todo el stack. Frontend con React y Next.js con Tailwind CSS; backend con Node.js y Express con PostgreSQL (Prisma) y MongoDB. En IA y automatización integra Claude API, n8n y WhatsApp Business API. Testea con Vitest, Jest y Playwright, y despliega con Docker y GitHub Actions.
- Trabajo en equipo: se adapta bien a equipos y también trabaja de forma autónoma, algo que aprendió gestionando proyectos para clientes reales. Trabajó con Scrum (sprints, revisiones periódicas y pull requests antes de mergear a producción) y con Kanban (tableros y dailies para reportar avances). Usa Git y GitHub para el control de versiones, y Trello o Jira para organizar el trabajo.
- Modalidad: busca un rol full-time, presencial en Montevideo o remoto. También toma proyectos freelance. Está en GMT-3 y trabaja en español e inglés (B2).

## Experiencia profesional

Full Stack Developer Freelance, clientes directos y Workana (2023 – actualidad), Montevideo, remoto:
- Workana (2026, AI Automation Developer): desarrolló para una empresa un proyecto de automatización con WhatsApp Business API y n8n, con un enfoque similar al de SmartOps Agent. Tecnologías: WhatsApp API, n8n, Node.js.
- Pura Vida Huertas (2025, rebranding, Full Stack Developer): rehízo la marca como sitio full stack de punta a punta: diseño, frontend, backend y deploy en producción. Catálogo de productos y contenidos sobre una base MongoDB, formulario de contacto y diseño responsive. Tecnologías: React, Node.js, MongoDB, Tailwind CSS.
- Pura Vida (2024, Full Stack Developer): lideró el sitio de la marca de jardinería y paisajismo de inicio a fin: diseño UI, maquetación, desarrollo y deploy, con foco en identidad de marca y experiencia de usuario. Tecnologías: HTML, CSS, JavaScript, Node.js.
- Golden Pets (2023, Web Developer): primer cliente real. Sitio responsive en producción con catálogo de productos e integración con redes sociales alineada a la marca. Tecnologías: HTML, CSS, JavaScript, React.
- Mantenimiento: ofrece soporte y mantenimiento post-lanzamiento a cada cliente.

Diseñador Multimedia (antes de 2023), Montevideo: diseño de logos e identidad visual para marcas. Esa base de diseño es la que hoy aplica en cada interfaz que desarrolla. Herramientas: Figma, branding.

No hay métricas de negocio publicadas de los clientes (volumen, ventas, etc.) ni testimonios.

## Proyecto destacado: SmartOps Agent (2026)

Proyecto propio, desarrollo individual, construido con el estándar de una entrega a un cliente real.
- Demo en vivo, sin registro: https://smartops-demo.duckdns.org
- Código: https://github.com/sanchezign/smartops-agent
- Caso de estudio: https://www.sanchezign.dev/smartops/

Qué es: un agente de operaciones con IA para negocios que trabajan por WhatsApp (por ejemplo distribuidoras y ferreterías chicas). Lee listas de precios de proveedores, pedidos y notas de voz en cualquier formato (texto, fotos, PDF, planillas, audios), mantiene el catálogo al día con historial de precios y le avisa al equipo solo lo que requiere acción. Incluye un panel bilingüe, pensado primero para el teléfono, con decisiones de un clic y chats marcados cuando esperan respuesta.

El problema: los proveedores mandan listas de precios como fotos de hojas impresas, PDF, planillas con su propio formato y audios. Los clientes consultan precios y hacen pedidos en los mismos chats. Alguien pasa los precios a mano a una planilla, los pedidos se pierden y nadie ve un aumento del 20% hasta que el margen ya no está.

Decisiones clave:
- El backend decide; la IA lee. Claude extrae datos estructurados validados contra un esquema (Zod). Todas las reglas (duplicados, precios atípicos, moneda, IVA, lista completa o actualización parcial) viven en código con tests, nunca en un prompt.
- Nunca adivinar. Los valores dudosos, las coincidencias inciertas, los formatos de planilla nuevos y los mensajes sospechosos pasan a revisión humana, con el mensaje original al lado. Una persona puede tomar el control del chat en cualquier momento.
- Gastar solo donde sirve. Un filtro previo determinístico deja fuera de la IA los saludos y la charla, las planillas con formato conocido se leen por código y hay topes de gasto antes de cada llamada.
- Confiable por diseño. Webhooks firmados que se guardan antes de responder, colas con reintentos y dead letters (pg-boss), transactional outbox hacia n8n y pasos idempotentes para que los reintentos nunca dupliquen datos.
- Las personas primero. La respuesta de una persona pausa las respuestas automáticas solo en ese chat, y el equipo recibe un resumen por período en lugar de una lluvia de alertas.

Arquitectura: una API en Express 5 + TypeScript se encarga del webhook de WhatsApp, las reglas de negocio y toda escritura en PostgreSQL. Un worker con colas pg-boss descarga archivos, transcribe audios y envía mensajes. n8n orquesta 3 agentes (receptor, procesador y notificador) llamando a endpoints internos de la API. El panel en Next.js 15 / React 19 se actualiza en vivo con SSE.

Stack: Node.js, TypeScript, Express 5, PostgreSQL, Prisma, pg-boss, Claude API, Zod, n8n, Next.js 15, React 19, Tailwind CSS, Vitest, Playwright, Docker, GitHub Actions, WhatsApp API.

Resultados medidos:
- Tests: 2.137 tests automatizados (más de 2.100): 1.453 unitarios y HTTP de la API, 250 contra un Postgres real, 247 unitarios del panel y 187 E2E con Playwright en Chrome de escritorio, Android (Pixel 7) e iPhone, con controles de accesibilidad en los dos idiomas. Mutation score del 80%. Pipeline CI/CD en GitHub Actions con coverage gate, escaneo de imágenes e imágenes Docker multi-arquitectura (amd64 y arm64).
- Seguridad de IA: 8 de 8 pruebas de prompt injection superadas contra el modelo real (6 ataques y 2 controles); los documentos se tratan como datos y no como instrucciones. Seguridad de aplicación: Argon2id, sesiones con rotación y detección de reuso, CSRF y roles.
- Precisión: un PDF de septiembre seguido de una foto de octubre dio exactamente los 5 cambios de precio automáticos y las 2 alertas esperadas, mandó 1 producto dudoso a revisión y no tocó un producto ausente.
- Costo: extraer una lista de precios típica cuesta entre USD 0,012 y 0,017. El gasto total en IA para construir y probar todo el proyecto fue de unos USD 0,32.
- Resiliencia: con n8n detenido y vuelto a levantar, cada mensaje se entregó una sola vez.
- Infraestructura: demo pública con Docker Compose en una VM Always Free de Oracle Cloud, a costo cero. Panel con accesibilidad WCAG 2.1 AA.

Lo difícil y lo que aprendió: Meta deshabilitó la cuenta de negocio el primer día (falso positivo), así que construyó un simulador local de WhatsApp que firma webhooks e imita la Graph API. "1.850" puede ser 1850 o 1,85: el sistema aprende el formato de planilla de cada proveedor una vez, con una persona eligiendo la columna de precio. El borde de Cloudflare retenía los streams de eventos por GET, así que el panel abre su stream con POST y, si falla, se actualiza cada 30 segundos. El uso real mostró que el panel tenía que ser más claro, y ahora ordena todo en Pendientes, Novedades y Estado del sistema.

## Otros proyectos (todos con código en GitHub)

- Feria Artesanal (Full Stack): marketplace MERN completo con catálogo de productos artesanales, autenticación JWT, carrito de compras y panel de administración. 3 roles de usuario, 7 módulos de API, contraseñas con hash. React, Node.js, Express, MongoDB, JWT. Demo: https://feria-artesanal.vercel.app/ · Código: https://github.com/sanchezign/Feria-Artesanal
- AI Automation Landing (Full Stack): landing de servicios de agentes de IA y automatización (n8n, Copilot Studio, bots de WhatsApp). Bilingüe ES/EN, validación de variables de entorno con Zod y CI en GitHub Actions en cada push. Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Zod. Demo: https://automation-landing-two.vercel.app/ · Código: https://github.com/sanchezign/automation-landing
- Account Tracker (Full Stack): app de finanzas personales con registro de ingresos y gastos, balance automático y gráfico de torta. React, Vite, Context API. Demo: https://account-tracker-tau.vercel.app · Código: https://github.com/sanchezign/Account-Tracker
- Organization App (Full Stack): app de organización con login/registro, notas, tableros personalizados, calendario integrado y modo oscuro. React, Vite, Tailwind, DaisyUI, Axios. Demo: https://organization-app-k7nm.onrender.com/ · Código: https://github.com/sanchezign/Organization-App
- Pura Vida (Frontend, cliente real en producción): sitio de jardinería y paisajismo con identidad de marca propia, hecho con Astro y Swiper. Demo: https://pura-vida-eight.vercel.app/ · Código: https://github.com/sanchezign/Pura-Vida
- Medi-Health (Frontend): web de salud con Astro, Tailwind y DaisyUI; servicios, beneficios, blog y cobertura médica. Demo: https://medi-health-ivory.vercel.app/ · Código: https://github.com/sanchezign/Medi-Health
- Law Staff (Frontend): sitio para estudio jurídico con Astro, blog en Markdown y deploy continuo en Vercel. Demo: https://law-staff.vercel.app/ · Código: https://github.com/sanchezign/law-staff
- Weather App (Frontend, académico): clima en tiempo real por ciudad con pronóstico semanal. React, Tailwind, OpenWeatherMap API. Demo: https://weather-app-pi-three-57.vercel.app · Código: https://github.com/sanchezign/Weather-App
- Calculator JS (Frontend, académico): calculadora responsive en JavaScript puro, sin librerías. Demo: https://sanchezign.github.io/CalculatorJs/ · Código: https://github.com/sanchezign/CalculatorJs
- BE3 Testing & Docker (Backend, académico): API REST con JWT, 32 tests funcionales (Mocha, Chai, Supertest), documentación Swagger e imagen Docker node:20-alpine. Código: https://github.com/sanchezign/be3-testing-docker
- Backend II, Entrega Final (Backend, académico): arquitectura en capas con Repository, DAO y DTO, 22 endpoints y recuperación de contraseña por email. Node.js, Express, MongoDB. Código: https://github.com/sanchezign/Backend2-EntregaFinal
- Backend I, Proyecto Final (Backend, académico): API con autenticación JWT, paginación, filtros y orden, MongoDB Atlas y vistas con Handlebars. Código: https://github.com/sanchezign/Backend.Proyecto.Final
- Productos Realtime WebSocket (Backend, académico): gestión de productos con actualizaciones instantáneas por Socket.IO, sin recargar la página. Código: https://github.com/sanchezign/Productos-Realtime-Con-Websocket

## Formación

- Carrera Full Stack Developer, Coderhouse (2024 – 2026), con distinción Top 10 (entre los 10 mejores estudiantes). 6 cursos: Desarrollo Web (2023, 38 h), JavaScript (2026, 20 h), React JS (2026, 16 h), Backend I: Desarrollo Avanzado (2026, 18 h), Backend II: Diseño y Arquitectura (2026, 16 h) y Backend III: Testing y Escalabilidad (2026, 16 h).
- Universidad ORT Uruguay: 2 años cursados, 1 año de Ingeniería en Sistemas y 1 año de Licenciatura en Multimedia.

## Certificaciones

- Claude Academy (Anthropic), 2026: Claude Code 101, Claude Code in Action, Model Context Protocol: Advanced Topics.
- Coderhouse, 2026: Ciclo de Desarrollo de Software y Planificación de Pruebas; Metodología Ágil: Curso Intensivo; Passport Avanzado: Autenticación de Nivel Empresarial; Workflows como Código: Git y Control de Versiones; Maestría en Migraciones y Consulta de Datos con Entity Framework.
- Agesic, 2025: Conociendo el Marco de Ciberseguridad versión 4.2 (5 h).
`;
