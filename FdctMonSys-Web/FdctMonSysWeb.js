const express = require('express');
const axios = require('axios');

const path = require('path');

const app = express();
const port = 30000;

const url = 'http://localhost:1026/v2/entities/b827eb00f6d0?type=Raspberry&options=keyValues';
const headers = {
    'fiware-service': 'Fundacentro',
    'fiware-servicepath': '/'
};

app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    axios.get(url, { headers })
        .then(response => {
            if (response.data) {
                const data = response.data;
                // Adjust the time, to -3 (from UTC to America/Sao_Paulo
		let timestamp = new Date(data['TimeInstant']);
		timestamp.setHours(timestamp.getHours() - 3);
		let adjustedTimestamp = timestamp.toISOString();

		const values = {
                    value033020: data['033020'],
                    value033030: data['033030'],
                    value033040: data['033040'],
                    value033250: data['033250'],
		    valuetime: adjustedTimestamp
                };
                // Render the EJS template and pass the values to it
                res.render('index', { values });
            } else {
                res.status(500).json({ error: 'Response data not found' });
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error.message);
            res.status(500).json({ error: 'Error fetching data' });
        });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

