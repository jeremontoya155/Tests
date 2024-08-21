require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: true
}));

// Middleware de autenticación
function checkAuth(req, res, next) {
    if (req.session.user && req.session.user === 'admin') {
        next();
    } else {
        res.redirect('/login');
    }
}

// Página de inicio con las preguntas
app.get('/', async (req, res) => {
    const preguntas = await pool.query('SELECT * FROM preguntas');
    res.render('index', { preguntas: preguntas.rows });
});

// Página de login
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await pool.query('SELECT * FROM usuarios WHERE username = $1 AND password = $2', [username, password]);

    if (user.rows.length > 0) {
        req.session.user = user.rows[0].username;
        res.redirect('/admin');
    } else {
        res.send('Usuario o contraseña incorrectos');
    }
});

// Página de administrador
app.get('/admin', checkAuth, async (req, res) => {
    const respuestas = await pool.query('SELECT * FROM respuestas ORDER BY created_at DESC');
    const preguntas = await pool.query('SELECT * FROM preguntas');
    res.render('admin', { respuestas: respuestas.rows, preguntas: preguntas.rows });
});

// Enviar respuestas
app.post('/submit', async (req, res) => {
    const { nombreempleado, email, telefono, descripcion, respuestas } = req.body;

    // Crear un objeto JSON que asocie cada pregunta con su respuesta
    const respuestasDict = {};

    for (let preguntaId in respuestas) {
        // Recuperar el texto de la pregunta desde la base de datos
        const pregunta = await pool.query('SELECT texto FROM preguntas WHERE id = $1', [preguntaId]);
        if (pregunta.rows.length > 0) {
            respuestasDict[pregunta.rows[0].texto] = respuestas[preguntaId];
        }
    }

    const respuestasJSON = JSON.stringify(respuestasDict);

    try {
        await pool.query(
            'INSERT INTO respuestas (nombreempleado, email, telefono, descripcion, respuestas) VALUES ($1, $2, $3, $4, $5::jsonb)',
            [nombreempleado, email, telefono, descripcion, respuestasJSON]
        );
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.send("Error al guardar las respuestas");
    }
});

// Agregar o eliminar preguntas (para el admin)
app.post('/admin/preguntas', checkAuth, async (req, res) => {
    const { accion, texto, id } = req.body;

    if (accion === 'agregar') {
        await pool.query('INSERT INTO preguntas (texto) VALUES ($1)', [texto]);
    } else if (accion === 'eliminar' && id) {
        await pool.query('DELETE FROM preguntas WHERE id = $1', [id]);
    }

    res.redirect('/admin');
});

// Cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send("Error al cerrar la sesión");
        }
        res.redirect('/login');
    });
});

// Iniciar el servidor en el puerto definido en el archivo .env
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
});
