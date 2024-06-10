const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

const url = 'http://localhost:1026/v2/entities/b827eb00f6d0?type=Raspberry&options=keyValues';
const headers = {
    'fiware-service': 'Fundacentro',
    'fiware-servicepath': '/'
};

app.get('/', (req, res) => {
    axios.get(url, { headers })
        .then(response => {
            res.json(response.data);
        })
        .catch(error => {
            res.status(500).json({ error: error.message });
        });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

