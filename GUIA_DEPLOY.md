# PsyCalm — Guía de Deploy paso a paso

## PASO 1: Obtener credenciales de Supabase

1. Andá a https://supabase.com/dashboard
2. Abrí tu proyecto **chatbot_autonomo**
3. Mirá la URL del navegador: `https://supabase.com/dashboard/project/XXXXXXXXXXXXXXXXXXXXXXXX`
4. Esos **20 caracteres (XXXX...)** son tu `REFERENCE ID`
5. Tu URL de Supabase es: `https://XXXXXXXXXXXXXXXXXXXXXXXX.supabase.co`
6. Andá a **Settings → API**
7. Copiá la **service_role key** (empieza con `sb_secret_`)

## PASO 2: Crear tablas en Supabase (2 minutos)

1. En el dashboard de Supabase, andá a **SQL Editor**
2. Creá una **New query**
3. Copiá TODO el contenido de `database/schema.sql`
4. Click en **Run** (crea las 6 tablas)
5. Otra **New query**
6. Copiá TODO el contenido de `database/seed.sql`
7. Click en **Run** (inserta datos de prueba)
8. ✅ Listo

## PASO 3: Crear cuenta en Render (1 minuto)

1. Andá a https://render.com
2. Logueate con GitHub
3. Click **New +** → **Web Service**

## PASO 4: Subir a GitHub

```bash
# En tu computadora
git init
git add .
git commit -m "PsyCalm v1.0"
git remote add origin https://github.com/TU_USUARIO/psycalm.git
git push -u origin main
```

## PASO 5: Configurar variables de entorno en Render

En el dashboard de Render, agregá estas variables:

```
SUPABASE_URL=https://XXXXXXXXXXXXXXXXXXXXXXXX.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_... (la que me pasaste)
CALCOM_API_KEY=cal_live_30b2735ab48203abe4f6fd5b8269cad9
CALCOM_EVENT_TYPE_ID=12345678 (el de tu evento en cal.com)
CALCOM_USERNAME=Chatbot_autonomo
STRIPE_SECRET_KEY=sk_test_... (o sk_live_ cuando tengas pasarela real)
NODE_ENV=production
FRONTEND_URL=https://psycalm.onrender.com
```

## PASO 6: Deploy

1. Render detecta automáticamente el `package.json`
2. Instala dependencias
3. Corre `npm start`
4. Tu app está en: `https://psycalm.onrender.com`

## PASO 7: Probar

1. Abre el link
2. El dashboard debe mostrar datos (citas, pacientes)
3. Toca el botón naranja 💬 para probar el chatbot
4. Intenta agendar una cita

---

## Credenciales que YA TENGO configuradas

| Servicio | Dato | Valor | Estado |
|----------|------|-------|--------|
| Supabase | Service Key | `[REDACTED — configurar en Render]` | ⚠️ Variable de entorno |
| Supabase | URL | `https://TU_REFERENCE_ID.supabase.co` | ❓ Necesito el Reference ID |
| Cal.com | API Key | `cal_live_30b2735ab48203abe4f6fd5b8269cad9` | ✅ OK |
| Cal.com | Username | `Chatbot_autonomo` | ✅ OK |
| Stripe | Secret Key | Modo test (ejemplo) | ⚠️ Pendiente pasarela real |

---

## LO ÚNICO QUE NECESITO DE VOS AHORA

**El Reference ID de Supabase:**

1. Andá a https://supabase.com/dashboard
2. Abrí tu proyecto
3. Mirá la URL del navegador
4. Copiá los **20 caracteres** que aparecen después de `/project/`

Ejemplo: si la URL es `https://supabase.com/dashboard/project/abc123def456ghi789jk`
→ El Reference ID es: `abc123def456ghi789jk`

Con eso, el proyecto queda 100% funcional en 5 minutos.
