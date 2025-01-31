async function mapCustomOpenIdDataAzure(accessToken, customOpenIdFields) {
    const customData = {};
    const fieldsQueryURL = `https://graph.microsoft.com/v1.0/me?$select=${customOpenIdFields.join(',')}`;

    const response = await fetch(fieldsQueryURL, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        }
    });


    if (response.ok) {
        const customOpenIdFieldsResult = await response.json();

        // Extract relevant fields from the response
        customOpenIdFields.forEach(field => {
            if (customOpenIdFieldsResult[field]) {
                customData[field] = customOpenIdFieldsResult[field];
            }
        });
    }
}

// The implementation below is not tested, that's why it is commented out
// Uncomment it and test it according to your OpenID provider. Modify it if needed and 
// Make a pull reuqest 

// async function mapCustomOpenIdDataGoogle(accessToken, customOpenIdFields) {
//     const customData = {};
//     const fieldsQueryURL = 'https://openidconnect.googleapis.com/v1/userinfo';

//     const response = await fetch(fieldsQueryURL, {
//         method: 'GET',
//         headers: {
//             'Authorization': `Bearer ${accessToken}`,
//             'Content-Type': 'application/json',
//         }
//     });

//     const data = await response.json();

//     customOpenIdFields.forEach(field => {
//         customData[field] = data[field];
//     });

//     return customData;
// }

// async function mapCustomOpenIdDataAmazon(accessToken, customOpenIdFields) {
//     const customData = {};
//     const fieldsQueryURL = 'https://api.amazon.com/user/profile';

//     const response = await fetch(fieldsQueryURL, {
//         method: 'GET',
//         headers: {
//             'Authorization': `Bearer ${accessToken}`,
//         }
//     });

//     const data = await response.json();

//     customOpenIdFields.forEach(field => {
//         customData[field] = data[field];
//     });

//     return customData;
// }

// async function mapCustomOpenIdDataCanonical(accessToken, customOpenIdFields) {
//     const customData = {};
//     const fields = customOpenIdFields.join(',');

//     const fieldsQueryURL = `https://login.ubuntu.com/api/v2/users/me?fields=${fields}`;

//     const response = await fetch(fieldsQueryURL, {
//         method: 'GET',
//         headers: {
//             'Authorization': `Bearer ${accessToken}`,
//             'Accept': 'application/json',
//         }
//     });

//     const data = await response.json();

//     customOpenIdFields.forEach(field => {
//         customData[field] = data[field];
//     });

//     return customData;
// }

// async function mapCustomOpenIdDataLiveJournal(accessToken, customOpenIdFields) {
//     const customData = {};

//     const fieldsQueryURL = 'https://www.livejournal.com/interface/xmlrpc';

//     const body = {
//         method: 'LJ.XMLRPC.getusertags',
//         params: [{ auth_method: 'cookie', auth_challenge: accessToken }],
//     };

//     const response = await fetch(fieldsQueryURL, {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//         },
//         body: JSON.stringify(body),
//     });

//     const data = await response.json();

//     customOpenIdFields.forEach(field => {
//         customData[field] = data[field];
//     });

//     return customData;
// }

module.exports = {
    PROVIDER_MAPPERS: {
        microsoft: mapCustomOpenIdDataAzure,
        // google: mapCustomOpenIdDataGoogle,
        // amazon: mapCustomOpenIdDataAmazon,
        // canonica: mapCustomOpenIdDataCanonical,
        // liveJournal: mapCustomOpenIdDataLiveJournal
    }
};