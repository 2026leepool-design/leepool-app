# LeePool

LeePool es una biblioteca digital y un mercado P2P para registrar, descubrir y dar movimiento a los libros físicos.

La aplicación combina seguimiento de lectura, progreso por páginas, biblioteca personal, valor económico de los ejemplares y compraventa directa entre lectores mediante Nostr y Lightning.

## Última versión

**Versión:** `4.1.3`
**Estado:** última versión en preparación para publicación
**Plataformas:** web y Android

| Plataforma | Acceso | Estado |
| --- | --- | --- |
| Web | [Vercel](https://leepool.vercel.app/) · [Netlify](https://myleepool.netlify.app/) | Despliegue 4.1.3 |
| Android APK | `leepool_v4.1.3.apk` · [Descargar desde Expo](https://expo.dev/accounts/leepool/projects/LeePool/builds/cd472f02-96ab-423e-90c3-d488424c1394) | Build terminada |

> La APK `leepool_v4.1.3.apk` está terminada como distribución interna. El enlace de Expo permite instalarla o descargarla en un dispositivo Android.

## Funcionalidades principales

- Biblioteca organizada por libros comprados, leídos, en lectura, pendientes, en venta y vendidos.
- Progreso de lectura por páginas y registro temporal.
- Marcadores, notas y seguimiento del hábito lector.
- Escáner de ISBN para añadir libros rápidamente.
- Búsqueda y enriquecimiento de metadatos con Open Library, Google Books y servicios auxiliares.
- Sinopsis y análisis asistidos por IA mediante Supabase Edge Functions.
- Mercado P2P con precios en satoshis, estado y condición del ejemplar.
- Ofertas privadas y mensajería cifrada sobre Nostr.
- Pagos Lightning mediante Lightning Address y Nostr Wallet Connect.
- Identidad Nostr local con respaldo cifrado opcional.
- Estadísticas de páginas, libros y valor de biblioteca.
- Interfaz responsive para navegador y Android.

## Wallets y pagos

Los vendedores publican una Lightning Address (LUD-16) para poder recibir facturas. Los compradores pueden conectar una wallet compatible con Nostr Wallet Connect desde:

**Perfil → Nostr Wallet Connect**

La URI NWC se guarda únicamente en el dispositivo. LeePool utiliza NIP-44 cuando la wallet lo soporta y NIP-04 como compatibilidad con wallets antiguas.

## Configuración local

Requisitos:

- Node.js
- npm
- Expo SDK 54
- Una cuenta de Expo EAS para generar APKs

Instala las dependencias:

```bash
npm install
```

Copia `.env.example` a `.env` y configura las credenciales públicas de Supabase:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Inicia el proyecto:

```bash
npm run web
```

Para Android local:

```bash
npm run android
```

## Generar una APK Android

La configuración de distribución interna está en `eas.json` y usa el perfil `preview`:

```bash
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest build --platform android --profile preview
```

La build se publica en [Expo → LeePool → Builds](https://expo.dev/accounts/leepool/projects/LeePool/builds).

## Base de datos

LeePool utiliza Supabase para autenticación, biblioteca, mercado, notificaciones, funciones Edge y migraciones SQL. El proyecto de producción es:

`jwtcuhbdyabhvttjisqe`

Las migraciones se encuentran en [`supabase/migrations`](./supabase/migrations).

## Estructura

```text
app/          Pantallas y rutas Expo Router
components/   Componentes reutilizables
utils/        Supabase, Nostr, Lightning, NWC y servicios de libros
locales/      Traducciones en español, inglés y turco
supabase/     Migraciones y Edge Functions
assets/       Iconos, splash screen e imágenes
```

## Verificación

```bash
npx tsc --noEmit
npx eslint utils/nwc.ts app/profile.tsx components/P2PChatView.tsx utils/nostrProfileSync.ts
npx expo export --platform web
```

La exportación web genera el directorio `dist/`. Los tipos de las funciones Deno de Supabase y los tests que usan `bun:test` requieren sus runtimes específicos.

## Estado del producto

La base funcional actual cubre biblioteca, lectura, ISBN, mercado P2P, Nostr y pagos Lightning. Como siguientes líneas de producto quedan ebooks, libros propios/editoriales, filtros avanzados por edición/firma/subrayado y club de lectura.
