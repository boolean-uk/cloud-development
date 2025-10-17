const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const uploadToBlob = require('./upload');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

const config = {
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    options: {
        encrypt: true,
        enableArithAbort: true
    }
};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const blobUrl = await uploadToBlob(req.file);
        await sql.connect(config);
        const { title } = req.body;
        await sql.query`INSERT INTO Media (Title, Url) VALUES (${title}, ${blobUrl})`;
        res.send({ message: 'Uploaded!', url: blobUrl });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.get('/media', async (req, res) => {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT * FROM Media`;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(8080, () => console.log('MediaVault running on port 8080'));
