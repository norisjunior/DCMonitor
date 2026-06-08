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
            // Extract specific values from the response
            const data = response.data;
            const values = {
                value033020: data['033020'],
                value033030: data['033030'],
                value033040: data['033040'],
                value033250: data['033250']
            };
            // Send the extracted values to the client
            res.json(values);
        })
        .catch(error => {
            res.status(500).json({ error: error.message });
        });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

