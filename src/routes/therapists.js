const express = require('express');
const { query } = require('../config/database');
const router = express.Router();

// Perfiles por defecto. Sirven como respaldo si la base de datos todavía
// no tiene la tabla `therapists`, para que el directorio nunca quede vacío.
// Reemplaza estos datos por los del equipo real (nombre, cédula, foto, bio).
const DEFAULT_THERAPISTS = [
  {
    id: 'dra-mariana-rodriguez',
    name: 'Dra. Mariana Rodríguez',
    title: 'Psicóloga clínica · Directora',
    cedula: '12345678',
    years: 12,
    modalities: ['Presencial', 'Online'],
    specialties: ['Ansiedad', 'Depresión', 'Terapia cognitivo-conductual'],
    languages: ['Español', 'Inglés'],
    approach: 'Terapia cognitivo-conductual (TCC)',
    bio: 'Fundadora del consultorio. Acompaño a adultos que atraviesan ansiedad, depresión y momentos de cambio. Trabajo desde un enfoque cálido y basado en evidencia, con objetivos claros y a tu ritmo.',
    accent: '#C8553D',
    active: true
  },
  {
    id: 'lic-daniel-ortega',
    name: 'Lic. Daniel Ortega',
    title: 'Psicólogo · Pareja y familia',
    cedula: '23456789',
    years: 8,
    modalities: ['Presencial', 'Online'],
    specialties: ['Terapia de pareja', 'Conflictos familiares', 'Comunicación'],
    languages: ['Español'],
    approach: 'Terapia sistémica',
    bio: 'Especialista en relaciones de pareja y dinámicas familiares. Creo espacios seguros donde ambas partes pueden expresarse y reconstruir la comunicación, estén o no en crisis.',
    accent: '#5A8F5E',
    active: true
  },
  {
    id: 'lic-sofia-herrera',
    name: 'Lic. Sofía Herrera',
    title: 'Psicóloga · Niños y adolescentes',
    cedula: '34567890',
    years: 6,
    modalities: ['Presencial'],
    specialties: ['Infantil', 'Adolescentes', 'Acompañamiento a padres'],
    languages: ['Español'],
    approach: 'Terapia de juego y humanista',
    bio: 'Trabajo con niñas, niños y adolescentes a partir de los 6 años, además de orientación para madres y padres. Uso terapia de juego y herramientas adaptadas a cada edad.',
    accent: '#A07CC5',
    active: true
  },
  {
    id: 'mtra-valeria-campos',
    name: 'Mtra. Valeria Campos',
    title: 'Psicóloga · Duelo y estrés',
    cedula: '45678901',
    years: 9,
    modalities: ['Online'],
    specialties: ['Duelo', 'Estrés', 'Burnout', 'Autoestima'],
    languages: ['Español', 'Inglés'],
    approach: 'Terapia centrada en la persona',
    bio: 'Acompaño procesos de duelo, estrés laboral y agotamiento emocional. Mis sesiones son 100% en línea, ideales si buscas comodidad y privacidad desde tu hogar.',
    accent: '#3B82F6',
    active: true
  }
];

function withDefaults(list) {
  // Garantiza que los campos que usa el frontend existan aunque la fila
  // venga de la base de datos con columnas faltantes.
  return list.map(t => ({
    ...t,
    specialties: Array.isArray(t.specialties)
      ? t.specialties
      : (typeof t.specialties === 'string' ? t.specialties.split(',').map(s => s.trim()).filter(Boolean) : []),
    modalities: Array.isArray(t.modalities)
      ? t.modalities
      : (typeof t.modalities === 'string' ? t.modalities.split(',').map(s => s.trim()).filter(Boolean) : [])
  }));
}

// GET /api/therapists — lista del equipo
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM therapists WHERE active = true ORDER BY name ASC');
    if (result.data && result.data.length) {
      return res.json({ success: true, data: withDefaults(result.data) });
    }
  } catch (e) {
    // Tabla inexistente u otro error: usamos los perfiles por defecto.
  }
  res.json({ success: true, data: DEFAULT_THERAPISTS });
});

// GET /api/therapists/:id — perfil individual
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query('SELECT * FROM therapists WHERE id = $1', [id]);
    if (result.data && (Array.isArray(result.data) ? result.data.length : result.data)) {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      return res.json({ success: true, data: withDefaults([row])[0] });
    }
  } catch (e) {}

  const found = DEFAULT_THERAPISTS.find(t => String(t.id) === String(id));
  if (found) return res.json({ success: true, data: found });
  res.status(404).json({ success: false, error: 'Terapeuta no encontrado' });
});

module.exports = router;
