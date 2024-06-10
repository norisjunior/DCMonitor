// Import the axios library
const axios = require('axios');

// URL of the endpoint
const url = 'http://localhost:1026/v2/entities/b827eb00f6d0?type=Raspberry&options=keyValues';

// Headers
const headers = {
    'fiware-service': 'Fundacentro',
    'fiware-servicepath': '/'
};

// Make the request to the endpoint
axios.get(url, { headers })
    .then(response => {
        // Log the response data
        console.log(response.data);
    })
    .catch(error => {
        // Log any errors
        console.error('Error:', error.message);
    });

